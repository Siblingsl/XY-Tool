import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { KamiPoolEntity, KamiItemEntity } from './kami-pool.entity';

/**
 * 卡密池管理服务。
 * 负责卡密池和卡密条目的 CRUD，
 * 以及最关键的"取卡密"操作（事务内锁库存，防止超发）。
 */
@Injectable()
export class KamiPoolService {
  private readonly logger = new Logger(KamiPoolService.name);

  constructor(
    @InjectRepository(KamiPoolEntity)
    private readonly poolRepo: Repository<KamiPoolEntity>,
    @InjectRepository(KamiItemEntity)
    private readonly itemRepo: Repository<KamiItemEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // ============ 卡密池 CRUD ============

  async listPools(tenantId: number) {
    return this.poolRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async createPool(tenantId: number, name: string, remark?: string) {
    const entity = this.poolRepo.create({ tenantId, name, remark });
    return this.poolRepo.save(entity);
  }

  async removePool(id: number, tenantId: number) {
    await this.poolRepo.delete({ id, tenantId });
  }

  // ============ 卡密条目 CRUD ============

  async listItems(poolId: number, tenantId: number) {
    return this.itemRepo.find({
      where: { poolId, tenantId },
      order: { createdAt: 'ASC' },
    });
  }

  /** 批量添加卡密（支持换行分隔的批量输入） */
  async addItems(poolId: number, tenantId: number, contents: string[]) {
    const entities = contents.map((content) =>
      this.itemRepo.create({
        poolId,
        tenantId,
        content: content.trim(),
        status: 'unused',
      }),
    );
    return this.itemRepo.save(entities);
  }

  async removeItem(id: number, tenantId: number) {
    await this.itemRepo.delete({ id, tenantId });
  }

  /**
   * 获取池中可用库存数（需租户校验）。
   */
  async getStockCount(poolId: number, tenantId: number): Promise<number> {
    const pool = await this.poolRepo.findOne({ where: { id: poolId, tenantId } });
    if (!pool) return 0;
    return this.itemRepo.count({
      where: { poolId, status: 'unused' },
    });
  }

  /**
   * 🔑 核心方法：从卡密池中取一条未使用的卡密。
   *
   * 使用 SELECT ... FOR UPDATE（悲观锁）在事务内锁定一条未用卡密，
   * 防止并发发货时同一条卡密被分配给多个订单（超发）。
   *
   * 流程：
   *  1. 校验 poolId 属于该租户
   *  2. 事务内 SELECT unused 卡密 FOR UPDATE
   *  3. 标记为 locked + 设置超时时间
   *  4. 返回卡密内容
   *  5. 发货成功后外部调用 confirmItem() 标记为 used
   *  6. 发货失败或超时后，定时任务释放 locked → unused
   */
  async acquireItem(
    poolId: number,
    orderId: number,
    tenantId: number,
    lockTimeoutMinutes = 5,
  ): Promise<KamiItemEntity | null> {
    // 校验卡密池归属
    const pool = await this.poolRepo.findOne({ where: { id: poolId, tenantId } });
    if (!pool) {
      this.logger.warn(`卡密池 ${poolId} 不存在或不属于租户 ${tenantId}`);
      return null;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const item = await queryRunner.manager
        .createQueryBuilder(KamiItemEntity, 'item')
        .setLock('pessimistic_write')
        .where('item.poolId = :poolId AND item.status = :status', {
          poolId,
          status: 'unused',
        })
        .orderBy('item.id', 'ASC')
        .limit(1)
        .getOne();

      if (!item) {
        await queryRunner.commitTransaction();
        return null;
      }

      // 锁定该条卡密
      item.status = 'locked';
      item.orderId = orderId;
      item.lockedUntil = new Date(
        Date.now() + lockTimeoutMinutes * 60 * 1000,
      );
      await queryRunner.manager.save(item);

      await queryRunner.commitTransaction();
      return item;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /** 确认卡密已发放（发货成功后调用） */
  async confirmItem(id: number): Promise<void> {
    await this.itemRepo.update(id, { status: 'used', lockedUntil: null });
  }

  /** 释放锁定的卡密（发货失败或超时后调用） */
  async releaseItem(id: number): Promise<void> {
    await this.itemRepo.update(id, {
      status: 'unused',
      orderId: null,
      lockedUntil: null,
    });
  }

  /** 释放某订单锁定的所有卡密（DELIVERING 卡住恢复时用） */
  async releaseByOrderId(orderId: number): Promise<number> {
    const result = await this.itemRepo.update(
      { orderId, status: 'locked' },
      { status: 'unused', orderId: null, lockedUntil: null },
    );
    return Number(result.affected) || 0;
  }

  /**
   * 批量释放超时的锁定卡密（定时任务调用）。
   * 找到所有 locked 且 lockedUntil < now 的条目，释放回 unused。
   */
  async releaseExpiredLocks(): Promise<number> {
    const result = await this.itemRepo
      .createQueryBuilder()
      .update(KamiItemEntity)
      .set({ status: 'unused', orderId: null, lockedUntil: null })
      .where('status = :status AND lockedUntil < :now', {
        status: 'locked',
        now: new Date(),
      })
      .execute();

    const count = Number(result.affected) || 0;
    if (count > 0) {
      this.logger.log(`释放超时锁定的卡密: ${count} 条`);
    }
    return count;
  }

  /**
   * 检查低库存预警。
   * 返回低于阈值的卡密池列表。
   */
  async checkLowStock(tenantId: number): Promise<{ pool: KamiPoolEntity; stock: number; threshold: number }[]> {
    const pools = await this.poolRepo.find({ where: { tenantId } });
    const results: { pool: KamiPoolEntity; stock: number; threshold: number }[] = [];
    for (const pool of pools) {
      const stock = await this.getStockCount(pool.id, tenantId);
      if (stock <= pool.lowStockThreshold) {
        results.push({ pool, stock, threshold: pool.lowStockThreshold });
      }
    }
    return results;
  }
}
