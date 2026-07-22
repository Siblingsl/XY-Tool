import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan, In } from 'typeorm';
import { OrderEntity, OrderStatus } from './order.entity';
import { RealtimeService } from '../realtime/realtime.service';

/**
 * 订单管理服务。
 * 负责订单的存储、状态流转、幂等检查。
 * 订单数据来源有两种：
 *  1. 真实环境：从闲鱼 mtop 接口拉取（由 OrderPollingService 调用）
 *  2. Mock 模式：由 MockOrderGenerator 生成假订单
 *  3. IM 付款消息即时建单（ImPaymentListenerService）
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
    quantity?: number;
    specName?: string;
    specValue?: string;
    receiverName?: string;
    receiverPhone?: string;
    receiverAddress?: string;
    xyStatus?: string;
    orderCreatedAt?: Date;
  }): Promise<{ created: boolean; order: OrderEntity }> {
    const existing = await this.findByBizOrderId(input.bizOrderId);
    if (existing) {
      const patch: Partial<OrderEntity> = {};
      if (input.conversationId && !existing.conversationId) {
        patch.conversationId = input.conversationId;
      }
      if (input.buyerId && !existing.buyerId) {
        patch.buyerId = input.buyerId;
        if (input.buyerNick) patch.buyerNick = input.buyerNick;
      }
      if (input.quantity && input.quantity > (existing.quantity || 1)) {
        patch.quantity = input.quantity;
      }
      if (input.specName && !existing.specName) patch.specName = input.specName;
      if (input.specValue && !existing.specValue) patch.specValue = input.specValue;
      if (input.itemId && (!existing.itemId || existing.itemId === 'unknown')) {
        patch.itemId = input.itemId;
      }
      if (input.itemTitle && existing.itemTitle === '闲鱼商品') {
        patch.itemTitle = input.itemTitle;
      }
      if (input.xyStatus) patch.xyStatus = input.xyStatus;
      if (Object.keys(patch).length > 0) {
        await this.repo.update(existing.id, patch);
        Object.assign(existing, patch);
      }
      return { created: false, order: existing };
    }

    const entity = this.repo.create({
      ...input,
      quantity: input.quantity && input.quantity > 0 ? input.quantity : 1,
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

  /** 分配发货规则 */
  async markAssigned(id: number, productId: number): Promise<void> {
    await this.updateStatus(id, 'ASSIGNED', { productId });
  }

  /** 标记已发货 */
  async markDelivered(id: number): Promise<void> {
    const order = await this.repo.findOne({ where: { id } });
    if (!order) return;
    await this.repo.update(id, { status: 'DELIVERED' });
    this.realtime.pushOrderStatus(order.tenantId, {
      bizOrderId: order.bizOrderId,
      status: 'DELIVERED',
    });
  }

  /** 标记失败 */
  async markFailed(id: number, reason: string): Promise<void> {
    const order = await this.repo.findOne({ where: { id } });
    if (!order) return;
    await this.repo.update(id, { status: 'FAILED', failReason: reason });
    this.realtime.pushOrderStatus(order.tenantId, {
      bizOrderId: order.bizOrderId,
      status: 'FAILED',
    });
  }

  /** 标记忽略 */
  async markIgnored(id: number, reason?: string): Promise<void> {
    await this.updateStatus(id, 'IGNORED', { failReason: reason });
  }

  /** 标记退款中 */
  async markRefunding(id: number, reason?: string): Promise<void> {
    const order = await this.repo.findOne({ where: { id } });
    if (!order) return;
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

  /** 列出租户下所有订单（分页 + 可选状态筛选） */
  async listByTenant(
    tenantId: number,
    page = 1,
    size = 20,
    status?: string,
  ) {
    const where: Record<string, unknown> = { tenantId };
    if (status && status !== 'all') {
      where.status = status;
    }
    const [list, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    return { list, total, page, size };
  }

  /**
   * 获取待重试的订单。
   * retryCount 在 [1, MAX_RETRIES) 内可再入队；最终失败由 processOrder 标 FAILED。
   */
  async getRetryableOrders(): Promise<OrderEntity[]> {
    const now = new Date();
    return this.repo
      .createQueryBuilder('o')
      .where('o.status = :status', { status: 'PENDING' })
      .andWhere('o.retry_count > 0')
      .andWhere('o.retry_count < 3')
      .andWhere('(o.next_retry_at IS NULL OR o.next_retry_at <= :now)', { now })
      .orderBy('o.next_retry_at', 'ASC', 'NULLS FIRST')
      .take(20)
      .getMany();
  }

  /**
   * 获取新订单（PENDING + retryCount=0）。
   * 尊重 nextRetryAt：延时发货 / 冷却等待期间不重复捞取。
   */
  async getNewOrders(limit = 5): Promise<OrderEntity[]> {
    const now = new Date();
    return this.repo
      .createQueryBuilder('o')
      .where('o.status = :status', { status: 'PENDING' })
      .andWhere('o.retry_count = 0')
      .andWhere('(o.next_retry_at IS NULL OR o.next_retry_at <= :now)', { now })
      .orderBy('o.created_at', 'ASC')
      .take(limit)
      .getMany();
  }

  /** 获取所有待处理订单（新订单 + 待重试订单），供调度器使用 */
  async getProcessableOrders(limit = 5): Promise<OrderEntity[]> {
    const fresh = await this.getNewOrders(limit);
    const retry = await this.getRetryableOrders();
    const seen = new Set(fresh.map((o) => o.id));
    const merged = [...fresh, ...retry.filter((o) => !seen.has(o.id))];
    return merged.slice(0, limit);
  }

  /**
   * 延后处理（不增加 retryCount）：延时发货、订单冷却等。
   * 订单保持 PENDING，调度器在 nextRetryAt 之后再捞。
   */
  async deferUntil(id: number, nextRetryAt: Date, reason?: string): Promise<void> {
    const patch: Partial<OrderEntity> = { nextRetryAt, status: 'PENDING' };
    if (reason) patch.failReason = reason;
    await this.repo.update(id, patch);
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

  /** 手动完整发货：允许已发货订单强制重置（补发） */
  async forceResetForManualShip(id: number): Promise<void> {
    await this.repo.update(id, {
      status: 'PENDING',
      retryCount: 0,
      nextRetryAt: null,
      failReason: null,
    });
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

  /** 通用字段补丁（详情同步 / 规格数量等） */
  async patchOrderFields(
    id: number,
    patch: Partial<OrderEntity>,
  ): Promise<void> {
    if (!patch || Object.keys(patch).length === 0) return;
    // 禁止通过此接口改租户/订单号
    const {
      id: _id,
      tenantId: _t,
      bizOrderId: _b,
      createdAt: _c,
      updatedAt: _u,
      ...safe
    } = patch as OrderEntity & Record<string, unknown>;
    await this.repo.update(id, safe as Partial<OrderEntity>);
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

  /** 批量按 ID 查询（刷新用） */
  async findByIdsForTenant(
    ids: number[],
    tenantId: number,
  ): Promise<OrderEntity[]> {
    if (!ids.length) return [];
    return this.repo.find({
      where: { id: In(ids), tenantId },
    });
  }

  /** 删除订单（仅租户内） */
  async remove(id: number, tenantId: number): Promise<void> {
    await this.repo.delete({ id, tenantId });
  }

  /** 导出订单为 CSV（Excel 可直接打开） */
  async exportCsv(tenantId: number, status?: string): Promise<string> {
    const where: Record<string, unknown> = { tenantId };
    if (status && status !== 'all') where.status = status;
    const list = await this.repo.find({
      where,
      order: { createdAt: 'DESC' },
      take: 5000,
    });

    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const headers = [
      'id',
      'bizOrderId',
      'itemId',
      'itemTitle',
      'buyerNick',
      'buyerId',
      'amount',
      'quantity',
      'specName',
      'specValue',
      'status',
      'receiverName',
      'receiverPhone',
      'receiverAddress',
      'failReason',
      'createdAt',
    ];
    const lines = [headers.join(',')];
    for (const o of list) {
      lines.push(
        [
          o.id,
          o.bizOrderId,
          o.itemId,
          o.itemTitle,
          o.buyerNick,
          o.buyerId,
          o.amount,
          o.quantity,
          o.specName,
          o.specValue,
          o.status,
          o.receiverName,
          o.receiverPhone,
          o.receiverAddress,
          o.failReason,
          o.createdAt?.toISOString?.() ?? o.createdAt,
        ]
          .map(escape)
          .join(','),
      );
    }
    return '\uFEFF' + lines.join('\n');
  }
}
