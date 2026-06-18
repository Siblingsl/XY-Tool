import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * 订单状态机：
 * PENDING     已下单，待处理（刚拉到）
 * ASSIGNED    已分配发货内容（如已取到卡密）
 * DELIVERING  发货中（调用闲鱼接口发送）
 * DELIVERED   已发货（消息已发送给买家）
 * FAILED      发货失败（达到最大重试次数）
 * IGNORED     忽略（无匹配商品规则，或手动跳过）
 * REFUNDING   买家申请退款中（被动感知，不自动处置）
 * REFUNDED    退款已完成（钱款已退，状态归档）
 *
 * 退款相关状态由 IM 消息 / mtop inRefund 字段被动识别，
 * 系统不会主动同意或拒绝退款（闲鱼无开放处置 API）。
 */
export type OrderStatus =
  | 'PENDING'
  | 'ASSIGNED'
  | 'DELIVERING'
  | 'DELIVERED'
  | 'FAILED'
  | 'IGNORED'
  | 'REFUNDING'
  | 'REFUNDED';

/**
 * 订单表。
 * 镜像闲鱼订单的关键信息，用于发货决策和审计。
 * 一个订单只处理一次（通过 bizOrderId 幂等）。
 */
@Entity('orders')
@Index('idx_orders_tenant_status', ['tenantId', 'status'])
@Index('idx_orders_biz_order', ['bizOrderId'])
export class OrderEntity extends BaseEntity {
  @Index()
  @Column({ name: 'tenant_id', type: 'bigint', comment: '所属租户' })
  tenantId: number;

  /** 关联的闲鱼账号 */
  @Index()
  @Column({ name: 'account_id', type: 'bigint', comment: '闲鱼账号ID' })
  accountId: number;

  /** 闲鱼业务订单号（幂等键，全局唯一） */
  @Column({ length: 64, name: 'biz_order_id', comment: '闲鱼订单号' })
  bizOrderId: string;

  /** 闲鱼商品ID（用于匹配 product 发货规则） */
  @Column({ length: 64, name: 'item_id', comment: '商品ID' })
  itemId: string;

  @Column({ length: 200, name: 'item_title', comment: '商品标题' })
  itemTitle: string;

  /** 买家闲鱼昵称 */
  @Column({ length: 100, type: 'varchar', name: 'buyer_nick', nullable: true, comment: '买家昵称' })
  buyerNick: string | null;

  /** 买家用户ID（用于发送消息） */
  @Column({ length: 64, type: 'varchar', name: 'buyer_id', nullable: true, comment: '买家UID' })
  buyerId: string | null;

  /** IM 会话 ID（cid，不含 @goofish 后缀） */
  @Column({
    length: 64,
    type: 'varchar',
    name: 'conversation_id',
    nullable: true,
    comment: 'IM会话ID',
  })
  conversationId: string | null;

  /** 订单金额（分） */
  @Column({ type: 'bigint', name: 'amount', default: 0, comment: '订单金额(分)' })
  amount: number;

  /** 订单状态 */
  @Column({ length: 20, default: 'PENDING', comment: '订单状态' })
  status: OrderStatus;

  /** 匹配到的发货规则（商品ID），IGNORED 时为空 */
  @Column({ name: 'product_id', type: 'bigint', nullable: true, comment: '匹配的商品规则' })
  productId: number | null;

  /** 已重试次数 */
  @Column({ name: 'retry_count', type: 'int', default: 0, comment: '重试次数' })
  retryCount: number;

  /** 下次重试时间（指数退避） */
  @Column({
    name: 'next_retry_at',
    type: 'timestamp',
    nullable: true,
    comment: '下次重试时间',
  })
  nextRetryAt: Date | null;

  /** 订单创建时间（来自闲鱼） */
  @Column({
    name: 'order_created_at',
    type: 'timestamp',
    nullable: true,
    comment: '闲鱼订单时间',
  })
  orderCreatedAt: Date | null;

  /** 失败原因（最后一次失败的信息） */
  @Column({ type: 'text', nullable: true, name: 'fail_reason', comment: '失败原因' })
  failReason: string | null;
}
