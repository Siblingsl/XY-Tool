import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import {
  LicenseTypeEntity,
  LicenseBatchEntity,
  LicenseCodeEntity,
  LicenseStatus,
  LicenseSource,
} from './entities/license.entities';

/** 验证结果（对外 API 返回） */
export interface VerifyResult {
  valid: boolean;
  /** 失败原因（valid=false 时） */
  reason?: string;
  /** 类型编码（valid=true 时） */
  type?: string;
  /** 类型名称 */
  typeName?: string;
  /** 过期时间（null=永久） */
  expiresAt?: Date | null;
  /** 剩余可用次数（本次消费后） */
  remainingUses?: number;
}

/**
 * 激活码中台核心服务。
 *
 * 核心能力：
 * - generateCodes：批量生成（手动 / 付款触发 / 外部申请）
 * - requestForDelivery：发货触发，按类型编码生成1个码
 * - verify：验证并消费（外部工具调用）
 * - revoke：作废
 *
 * 激活码格式：前缀 + 分段随机字符，如 SWA-A3F2-9KX1-MN7P
 */
@Injectable()
export class LicenseService {
  private readonly logger = new Logger(LicenseService.name);

  constructor(
    @InjectRepository(LicenseTypeEntity)
    private readonly typeRepo: Repository<LicenseTypeEntity>,
    @InjectRepository(LicenseBatchEntity)
    private readonly batchRepo: Repository<LicenseBatchEntity>,
    @InjectRepository(LicenseCodeEntity)
    private readonly codeRepo: Repository<LicenseCodeEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // ============ 类型管理 ============

  async listTypes(tenantId: number): Promise<(LicenseTypeEntity & { unusedStock: number })[]> {
    const types = await this.typeRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
    const result: (LicenseTypeEntity & { unusedStock: number })[] = [];
    for (const t of types) {
      const unusedStock = await this.countUnused(t.id, tenantId);
      result.push({ ...t, unusedStock });
    }
    return result;
  }

  async createType(input: Partial<LicenseTypeEntity> & { tenantId: number }): Promise<LicenseTypeEntity> {
    // 校验编码唯一
    const exists = await this.typeRepo.findOne({
      where: { tenantId: input.tenantId, code: input.code },
    });
    if (exists) {
      throw new BadRequestException(`类型编码 ${input.code} 已存在`);
    }
    const entity = this.typeRepo.create({
      name: input.name,
      code: input.code,
      durationDays: input.durationDays ?? null,
      maxUses: input.maxUses ?? 1,
      codePrefix: input.codePrefix ?? '',
      codeLength: input.codeLength ?? 16,
      enabled: input.enabled ?? true,
      tenantId: input.tenantId,
    });
    return this.typeRepo.save(entity);
  }

  async updateType(id: number, tenantId: number, patch: Partial<LicenseTypeEntity>): Promise<void> {
    // code 不允许改（关联发货规则）
    const { code, ...rest } = patch;
    await this.typeRepo.update({ id, tenantId }, rest);
  }

  async deleteType(id: number, tenantId: number): Promise<void> {
    // 有未使用码则禁止删除
    const count = await this.codeRepo.count({ where: { tenantId, typeId: id } });
    if (count > 0) {
      throw new BadRequestException(`该类型下有 ${count} 个激活码，无法删除（请先作废或清理）`);
    }
    await this.typeRepo.delete({ id, tenantId });
  }

  // ============ 生成 ============

  /**
   * 批量生成激活码。
   * @param typeId 类型ID
   * @param count 数量
   * @param source 来源
   * @param orderId 关联订单（source=delivery 时）
   * @returns 生成的激活码明文数组
   */
  async generateCodes(
    typeId: number,
    count: number,
    tenantId: number,
    source: LicenseSource = 'manual',
    orderId?: number,
  ): Promise<{ codes: string[]; batchId: number }> {
    const type = await this.typeRepo.findOne({ where: { id: typeId, tenantId } });
    if (!type) throw new NotFoundException('激活码类型不存在');
    if (!type.enabled) throw new BadRequestException('该类型已禁用');
    if (count <= 0 || count > 1000) throw new BadRequestException('数量须在 1-1000 之间');

    // 创建批次
    const batch = this.batchRepo.create({ tenantId, typeId, count, source, orderId: orderId ?? null });
    const savedBatch = await this.batchRepo.save(batch);

    // 批量生成码（去重）
    const codes: string[] = [];
    const codeSet = new Set<string>();
    let attempts = 0;
    const maxAttempts = count * 5; // 防止碰撞死循环
    while (codes.length < count && attempts < maxAttempts) {
      attempts++;
      const code = this.generateOneCode(type);
      if (codeSet.has(code)) continue;
      codeSet.add(code);
      codes.push(code);
    }
    if (codes.length < count) {
      throw new BadRequestException('激活码生成失败（碰撞过多，请增大码长）');
    }

    // 批量插入
    const entities = codes.map((code) =>
      this.codeRepo.create({
        tenantId,
        typeId,
        batchId: savedBatch.id,
        code,
        status: 'unused' as LicenseStatus,
        usedCount: 0,
        orderId: orderId ?? null,
      }),
    );
    await this.codeRepo.save(entities);

    this.logger.log(
      `生成激活码 ${codes.length} 个（类型=${type.code}, 批次=${savedBatch.id}, 来源=${source}）`,
    );
    return { codes, batchId: savedBatch.id };
  }

  /**
   * 发货触发：优先从库存领取未使用码；库存不足时自动生成一条再发放。
   * 绝不发放已激活(active)/已作废/已过期码。
   */
  async requestForDelivery(
    typeCode: string,
    tenantId: number,
    orderId: number,
  ): Promise<string | null> {
    try {
      const type = await this.typeRepo.findOne({ where: { tenantId, code: typeCode } });
      if (!type || !type.enabled) {
        this.logger.warn(`发货领取激活码失败：类型 ${typeCode} 不存在或已禁用`);
        return null;
      }

      // 发货重试：复用已绑定本订单、仍未激活的码
      const existing = await this.codeRepo.findOne({
        where: {
          tenantId,
          typeId: type.id,
          orderId,
          status: 'unused',
        },
      });
      if (existing) {
        return existing.code;
      }

      const fromStock = await this.allocateUnusedCode(type.id, tenantId, orderId);
      if (fromStock) {
        return fromStock;
      }

      // 保底：库存耗尽时现场生成一条（来源 delivery，绑定订单）
      this.logger.log(`类型 ${typeCode} 库存不足，自动生成激活码（订单=${orderId}）`);
      const { codes } = await this.generateCodes(type.id, 1, tenantId, 'delivery', orderId);
      return codes[0] ?? null;
    } catch (err) {
      this.logger.error(`发货领取激活码异常: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * 从库存领取一条未使用激活码（事务 + 悲观锁，防并发超发）。
   * 仅 status=unused 且尚未绑定订单的码可被领取。
   */
  async allocateUnusedCode(
    typeId: number,
    tenantId: number,
    orderId: number,
  ): Promise<string | null> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const row = await queryRunner.manager
        .createQueryBuilder(LicenseCodeEntity, 'lc')
        .setLock('pessimistic_write')
        .where('lc.typeId = :typeId', { typeId })
        .andWhere('lc.tenantId = :tenantId', { tenantId })
        .andWhere('lc.status = :status', { status: 'unused' })
        .andWhere('lc.orderId IS NULL')
        .orderBy('lc.id', 'ASC')
        .limit(1)
        .getOne();

      if (!row) {
        await queryRunner.commitTransaction();
        return null;
      }

      row.orderId = orderId;
      await queryRunner.manager.save(row);
      await queryRunner.commitTransaction();

      this.logger.log(
        `发货领取激活码: ${row.code.slice(0, 8)}*** 类型ID=${typeId} 订单=${orderId}`,
      );
      return row.code;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /** 某类型可发放库存（未使用且未绑定订单） */
  async countUnused(typeId: number, tenantId: number): Promise<number> {
    return this.codeRepo.count({
      where: { typeId, tenantId, status: 'unused', orderId: IsNull() },
    });
  }

  // ============ 验证（对外 API） ============

  /**
   * 验证并消费激活码。
   * - unused/active：校验有效性，首次激活设过期时间，used_count+1
   * - revoked/expired/超次数：返回 invalid
   * @param code 激活码明文
   * @param activatedBy 激活方标识（外部工具传，审计）
   */
  async verify(code: string, activatedBy?: string): Promise<VerifyResult> {
    const lc = await this.codeRepo.findOne({ where: { code } });
    if (!lc) {
      return { valid: false, reason: '激活码不存在' };
    }

    // 加载类型
    const type = await this.typeRepo.findOne({ where: { id: lc.typeId } });
    if (!type) {
      return { valid: false, reason: '激活码类型不存在' };
    }

    // 状态校验
    if (lc.status === 'revoked') {
      return { valid: false, reason: '激活码已作废', type: type.code, typeName: type.name };
    }
    if (lc.status === 'expired') {
      return { valid: false, reason: '激活码已过期', type: type.code, typeName: type.name };
    }

    // 已激活态：检查是否过期
    if (lc.status === 'active' && lc.expiresAt) {
      if (new Date() > lc.expiresAt) {
        await this.codeRepo.update(lc.id, { status: 'expired' as LicenseStatus });
        return { valid: false, reason: '激活码已过期', type: type.code, typeName: type.name };
      }
    }

    // 使用次数校验
    if (lc.usedCount >= type.maxUses) {
      return {
        valid: false,
        reason: '已达最大使用次数',
        type: type.code,
        typeName: type.name,
      };
    }

    // 计算过期时间（仅首次激活）
    let expiresAt = lc.expiresAt;
    const now = new Date();
    const isFirstUse = lc.usedCount === 0;
    if (isFirstUse && type.durationDays) {
      expiresAt = new Date(now.getTime() + type.durationDays * 24 * 60 * 60 * 1000);
    }

    // 消费：used_count+1，首次激活设 activated_at
    const newUsedCount = lc.usedCount + 1;
    await this.codeRepo.update(lc.id, {
      status: 'active' as LicenseStatus,
      usedCount: newUsedCount,
      activatedAt: lc.activatedAt ?? now,
      expiresAt,
      activatedBy: activatedBy ?? lc.activatedBy,
    });

    const remainingUses = Math.max(0, type.maxUses - newUsedCount);
    this.logger.log(
      `激活码验证通过: ${code.slice(0, 8)}*** 类型=${type.code} 剩余=${remainingUses}`,
    );

    return {
      valid: true,
      type: type.code,
      typeName: type.name,
      expiresAt,
      remainingUses,
    };
  }

  // ============ 作废 ============

  async revoke(id: number, tenantId: number): Promise<void> {
    const lc = await this.codeRepo.findOne({ where: { id, tenantId } });
    if (!lc) throw new NotFoundException('激活码不存在');
    if (lc.status === 'revoked') return;
    await this.codeRepo.update(id, { status: 'revoked' as LicenseStatus });
    this.logger.log(`激活码已作废: ${lc.code.slice(0, 8)}***`);
  }

  async revokeByCode(code: string, tenantId: number): Promise<void> {
    const lc = await this.codeRepo.findOne({ where: { code, tenantId } });
    if (!lc) throw new NotFoundException('激活码不存在');
    await this.revoke(lc.id, tenantId);
  }

  // ============ 列表查询 ============

  async listCodes(
    tenantId: number,
    filter: { typeId?: number; status?: LicenseStatus; page?: number; size?: number },
  ): Promise<{ list: LicenseCodeEntity[]; total: number; page: number; size: number }> {
    const page = filter.page ?? 1;
    const size = Math.min(filter.size ?? 20, 100);
    const where: Record<string, unknown> = { tenantId };
    if (filter.typeId) where.typeId = filter.typeId;
    if (filter.status) where.status = filter.status;

    const [list, total] = await this.codeRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    return { list, total, page, size };
  }

  // ============ 统计 ============

  async getStats(tenantId: number): Promise<{
    types: { typeId: number; typeName: string; typeCode: string; total: number; active: number; unused: number; revoked: number }[];
  }> {
    const types = await this.typeRepo.find({ where: { tenantId } });
    const result: any[] = [];
    for (const t of types) {
      const total = await this.codeRepo.count({ where: { tenantId, typeId: t.id } });
      const active = await this.codeRepo.count({ where: { tenantId, typeId: t.id, status: 'active' } });
      const unused = await this.codeRepo.count({
        where: { tenantId, typeId: t.id, status: 'unused', orderId: IsNull() },
      });
      const revoked = await this.codeRepo.count({ where: { tenantId, typeId: t.id, status: 'revoked' } });
      result.push({ typeId: t.id, typeName: t.name, typeCode: t.code, total, active, unused, revoked });
    }
    return { types: result };
  }

  // ============ 工具：生成单个激活码 ============

  /**
   * 生成单个激活码：前缀 + 分段随机字符。
   * 字符集排除易混淆字符（0/O/1/I/L）。
   * 格式：每4位一段用 - 分隔，如 SWA-A3F2-9KX1-MN7P
   */
  private generateOneCode(type: LicenseTypeEntity): string {
    // 安全字符集（无 0/O/1/I/L）
    const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const segLen = Math.max(4, type.codeLength);
    const segments: string[] = [];

    // 前缀作为第一段
    if (type.codePrefix) {
      segments.push(type.codePrefix.replace(/-$/, ''));
    }

    // 生成随机段（每段4字符，凑满 segLen 总字符）
    const segCount = Math.ceil(segLen / 4);
    for (let s = 0; s < segCount; s++) {
      const bytes = randomBytes(4);
      let seg = '';
      for (let i = 0; i < 4; i++) {
        seg += CHARS[bytes[i] % CHARS.length];
      }
      segments.push(seg);
    }
    return segments.join('-');
  }
}
