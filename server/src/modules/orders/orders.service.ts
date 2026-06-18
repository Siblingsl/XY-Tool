import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan } from 'typeorm';
import { OrderEntity, OrderStatus } from './order.entity';
import { RealtimeService } from '../realtime/realtime.service';

/**
 * 订单管理服务。
 * 负责订单的存储、状态流转、幂等检查。
 * 订单数据来源有两种：
 *  1. 真实环境：从闲鱼 mtop 接口拉取（由 OrderPollingService 调用）
 *  2. Mock 模式：由 MockOrderGenerator 生成假订单
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(OrderEntity)
    private readonly repo: Repository<OrderEntity>,
    private readonly realtime: RealtimeService,
  ) {}

  /** 按闲鱼订单号查询（幂等检查用） */
  async findByBizOrderId(bizOrderId: string): Promise<OrderEntity | null> {
    return this.repo.findOne({ where: { bizOrderId } });
  }

  /** 创建订单（如果不存在）。返回 true 表示新建，false 表示已存在 */
  async createIfNotExists(input: {
    tenantId: number;
    accountId: number;
    bizOrderId: string;
    itemId: string;
    itemTitle: string;
    buyerNick?: string;
    buyerId?: string;
    conversationId?: string;
    amount?: number;
    orderCreatedAt?: Date;
  }): Promise<{ created: boolean; order: OrderEntity }> {
    const existing = await this.findByBizOrderId(input.bizOrderId);
    if (existing) {
      if (input.conversationId && !existing.conversationId) {
        await this.patchConversationId(input.bizOrderId, input.conversationId);
        existing.conversationId = input.conversationId;
      }
      return { created: false, order: existing };
    }

    const entity = this.repo.create({
      ...input,
      status: 'PENDING',
      retryCount: 0,
    });
    const saved = await this.repo.save(entity);
    this.logger.log(`新订单: ${saved.bizOrderId} (${saved.itemTitle})`);
    this.realtime.pushOrderCreated(saved.tenantId, {
      bizOrderId: saved.bizOrderId,
      itemTitle: saved.itemTitle,
    });
    return { created: true, order: saved };
  }

  /** 补写 IM 会话 ID（轮询建单后 WS 消息可补充） */
  async patchConversationId(
    bizOrderId: string,
    conversationId?: string | null,
  ): Promise<void> {
    if (!conversationId) return;
    await this.repo.update(
      { bizOrderId },
      { conversationId },
    );
  }

  /** 更新订单状态 */
  async updateStatus(id: number, status: OrderStatus, extra?: Partial<OrderEntity>): Promise<void> {
    await this.repo.update(id, { status, ...extra });
  }

  /** 标记为已分配（匹配到商品规则+取到卡密后） */
  async markAssigned(id: number, productId: number): Promise<void> {
    await this.updateStatus(id, 'ASSIGNED', { productId });
  }

  /** 标记发货成功 */
  async markDelivered(id: number): Promise<void> {
    const order = await this.repo.findOne({ where: { id } });
    if (order) {
      await this.repo.update(id, { status: 'DELIVERED' });
      this.logger.log(`订单已发货: ${id}`);
      this.realtime.pushOrderStatus(order.tenantId, {
        bizOrderId: order.bizOrderId,
        status: 'DELIVERED',
      });
    }
  }

  /** 标记发货失败 */
  async markFailed(id: number, reason: string): Promise<void> {
    const order = await this.repo.findOne({ where: { id } });
    if (order) {
      await this.repo.update(id, { status: 'FAILED', failReason: reason });
      this.logger.warn(`订单发货失败: ${id} - ${reason}`);
      this.realtime.pushOrderStatus(order.tenantId, {
        bizOrderId: order.bizOrderId,
        status: 'FAILED',
      });
    }
  }

  /** 标记忽略（无匹配规则等） */
  async markIgnored(id: number, reason?: string): Promise<void> {
    await this.updateStatus(id, 'IGNORED', { failReason: reason });
  }

  /**
   * 标记订单退款中（买家申请退款）。
   * 仅被动感知记录，不主动处置退款。已发放的卡密不回收（避免重复使用）。
   */
  async markRefunding(id: number, reason?: string): Promise<void> {
    const order = await this.repo.findOne({ where: { id } });
    if (!order) return;
    // 已退款终态不回退
    if (order.status === 'REFUNDED') return;
    await this.repo.update(id, {
      status: 'REFUNDING',
      failReason: reason ?? '买家申请退款',
    });
    this.logger.warn(`订单进入退款中: ${order.bizOrderId}`);
    this.realtime.pushOrderStatus(order.tenantId, {
      bizOrderId: order.bizOrderId,
      status: 'REFUNDING',
    });
  }

  /** 标记订单已退款（退款成功，状态归档） */
  async markRefunded(id: number): Promise<void> {
    const order = await this.repo.findOne({ where: { id } });
    if (!order) return;
    await this.repo.update(id, {
      status: 'REFUNDED',
      failReason: '退款已完成，钱款已原路退回',
    });
    this.logger.warn(`订单已退款: ${order.bizOrderId}`);
    this.realtime.pushOrderStatus(order.tenantId, {
      bizOrderId: order.bizOrderId,
      status: 'REFUNDED',
    });
  }

  /** 记录重试 */
  async incrementRetry(id: number, nextRetryAt: Date): Promise<void> {
    const order = await this.repo.findOne({ where: { id } });
    if (!order) return;
    await this.repo.update(id, {
      retryCount: order.retryCount + 1,
      nextRetryAt,
      status: 'PENDING',
    });
  }

  /** 列出租户下所有订单（分页） */
  async listByTenant(tenantId: number, page = 1, size = 20) {
    const [list, total] = await this.repo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    return { list, total, page, size };
  }

  /** 获取待重试的订单（nextRetryAt 已过且 status=PENDING 且 retryCount < 3） */
  async getRetryableOrders(): Promise<OrderEntity[]> {
    return this.repo.find({
      where: {
        status: 'PENDING',
        retryCount: LessThan(3),
        nextRetryAt: LessThan(new Date()),
      },
    });
  }

  /** 获取新订单（PENDING + retryCount=0，即刚拉取尚未处理） */
  async getNewOrders(limit = 5): Promise<OrderEntity[]> {
    return this.repo.find({
      where: { status: 'PENDING', retryCount: 0 },
      order: { createdAt: 'ASC' },
      take: limit,
    });
  }

  /** 获取所有待处理订单（新订单 + 待重试订单），供调度器使用 */
  async getProcessableOrders(limit = 5): Promise<OrderEntity[]> {
    const fresh = await this.getNewOrders(limit);
    const retry = await this.getRetryableOrders();
    const seen = new Set(fresh.map((o) => o.id));
    const merged = [...fresh, ...retry.filter((o) => !seen.has(o.id))];
    return merged.slice(0, limit);
  }

  async findByIdForTenant(id: number, tenantId: number): Promise<OrderEntity | null> {
    return this.repo.findOne({ where: { id, tenantId } });
  }

  /** 手动重试：重置为 PENDING 并清零重试计数 */
  async retryOrder(id: number, tenantId: number): Promise<OrderEntity> {
    const order = await this.findByIdForTenant(id, tenantId);
    if (!order) {
      throw new NotFoundException('订单不存在');
    }
    const retriable = ['FAILED', 'PENDING', 'IGNORED'];
    if (!retriable.includes(order.status)) {
      throw new BadRequestException(
        `状态 ${order.status} 不可重试，仅支持 FAILED/PENDING/IGNORED`,
      );
    }
    await this.repo.update(id, {
      status: 'PENDING',
      retryCount: 0,
      nextRetryAt: null,
      failReason: null,
    });
    return this.repo.findOneOrFail({ where: { id } });
  }

  /** 补写买家信息（订单详情 API 回填） */
  async patchBuyerInfo(
    id: number,
    buyerId: string,
    buyerNick?: string,
  ): Promise<void> {
    const patch: Partial<OrderEntity> = { buyerId };
    if (buyerNick) patch.buyerNick = buyerNick;
    await this.repo.update(id, patch);
  }

  /** 卡在 DELIVERING 超过阈值的订单（进程崩溃等） */
  async getStuckDeliveringOrders(
    staleMinutes = 2,
    limit = 10,
  ): Promise<OrderEntity[]> {
    const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000);
    return this.repo
      .createQueryBuilder('o')
      .where('o.status = :status', { status: 'DELIVERING' })
      .andWhere('o.updated_at < :cutoff', { cutoff })
      .orderBy('o.updated_at', 'ASC')
      .take(limit)
      .getMany();
  }

  /** 将卡住的 DELIVERING 重置为 PENDING，供调度器重试 */
  async resetDeliveringToPending(id: number): Promise<void> {
    await this.repo.update(id, { status: 'PENDING' });
  }

  /** 统计：各状态的订单数量 */
  async getStatusCounts(tenantId: number): Promise<Record<string, number>> {
    const raw = await this.repo
      .createQueryBuilder('o')
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('o.tenant_id = :tenantId', { tenantId })
      .groupBy('o.status')
      .getRawMany();
    const result: Record<string, number> = {};
    for (const row of raw) {
      result[row.status] = Number(row.count);
    }
    return result;
  }
}
