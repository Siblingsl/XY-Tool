import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * 卡密池表（kami_pools）。
 * 一组同类卡密的集合，例如"某游戏CDK池"、"某会员激活码池"。
 * 商品（product）关联到某个池，发货时从池中取一条未使用的卡密。
 */
@Entity('kami_pools')
export class KamiPoolEntity extends BaseEntity {
  @Index()
  @Column({ name: 'tenant_id', type: 'bigint', comment: '所属租户' })
  tenantId: number;

  @Column({ length: 100, comment: '卡密池名称' })
  name: string;

  @Column({ type: 'text', nullable: true, comment: '备注说明' })
  remark: string | null;

  /** 库存预警阈值：剩余可用卡密低于此值时触发告警 */
  @Column({
    name: 'low_stock_threshold',
    type: 'int',
    default: 10,
    comment: '低库存阈值',
  })
  lowStockThreshold: number;
}

/**
 * 卡密条目表（kami_items）。
 * 池中每一条具体的卡密。
 *
 * ⚠️ 关键安全设计：
 * - status: unused 未使用 / used 已发放 / locked 分配中（防超发）
 * - orderId: 发出后记录对应的订单，便于追溯
 * - 通过乐观锁/悲观锁保证不超发（见 DeliveryService）
 */
@Entity('kami_items')
@Index('idx_pool_status', ['poolId', 'status'])
export class KamiItemEntity extends BaseEntity {
  @Index()
  @Column({ name: 'tenant_id', type: 'bigint', comment: '所属租户' })
  tenantId: number;

  @Index()
  @Column({ name: 'pool_id', type: 'bigint', comment: '所属卡密池' })
  poolId: number;

  /** 卡密明文内容（激活码/CDK/账号密码等）。敏感但需明文发送，故直接存。 */
  @Column({ type: 'text', name: 'content', comment: '卡密内容' })
  content: string;

  /** 状态: unused 未用 / locked 锁定中 / used 已发放 */
  @Column({ length: 20, default: 'unused', comment: '状态' })
  status: string;

  /** 发放后对应的订单ID（关联 orders.id） */
  @Column({ name: 'order_id', type: 'bigint', nullable: true, comment: '发放订单ID' })
  orderId: number | null;

  /** 锁定的超时时间（status=locked 时，超时自动释放回 unused） */
  @Column({
    name: 'locked_until',
    type: 'timestamp',
    nullable: true,
    comment: '锁定截止时间',
  })
  lockedUntil: Date | null;
}
