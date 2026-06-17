import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * 发货日志表。
 * 记录每一次发货动作（含成功/失败/重试），用于审计与排查。
 * 一个订单可能有多条日志（重试场景）。
 */
@Entity('delivery_logs')
@Index('idx_order', ['orderId'])
export class DeliveryLogEntity extends BaseEntity {
  @Index()
  @Column({ name: 'tenant_id', type: 'bigint', comment: '所属租户' })
  tenantId: number;

  @Column({ name: 'order_id', type: 'bigint', comment: '订单ID' })
  orderId: number;

  /** 本次发送的内容类型: kami / link / text */
  @Column({ length: 20, name: 'delivery_type', comment: '发货类型' })
  deliveryType: string;

  /** 实际发送给买家的消息内容（卡密可能脱敏） */
  @Column({ type: 'text', nullable: true, name: 'payload', comment: '发送的内容' })
  payload: string | null;

  /** 关联的卡密条目ID（deliveryType=kami 时） */
  @Column({ name: 'kami_item_id', type: 'bigint', nullable: true, comment: '卡密条目' })
  kamiItemId: number | null;

  /** 结果: success / failed */
  @Column({ length: 20, name: 'result', comment: '结果' })
  result: string;

  /** 失败时的错误信息 */
  @Column({ type: 'text', nullable: true, name: 'error', comment: '错误信息' })
  error: string | null;

  /** 耗时（毫秒） */
  @Column({ type: 'int', name: 'duration_ms', default: 0, comment: '耗时(ms)' })
  durationMs: number;
}
