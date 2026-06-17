import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * 发货规则类型：
 * - kami:   发卡密（从卡密池取一条）
 * - link:   发网盘链接（固定内容，可重复发送）
 * - text:   发固定文本（如使用说明、感谢语）
 */
export type DeliveryType = 'kami' | 'link' | 'text';

/**
 * 商品配置表。
 * 把闲鱼商品（itemId）与发货规则关联起来。
 * 一个闲鱼账号下有 N 个商品，每个商品对应一种发货方式。
 */
@Entity('products')
@Index('idx_tenant_item', ['tenantId', 'itemId'])
export class ProductEntity extends BaseEntity {
  @Index()
  @Column({ name: 'tenant_id', type: 'bigint', comment: '所属租户' })
  tenantId: number;

  /** 关联的闲鱼账号ID（外键 xianyu_accounts.id） */
  @Index()
  @Column({ name: 'account_id', type: 'bigint', comment: '关联闲鱼账号' })
  accountId: number;

  /** 闲鱼商品ID（用于匹配订单中的商品） */
  @Column({ length: 64, name: 'item_id', comment: '闲鱼商品ID' })
  itemId: string;

  @Column({ length: 200, comment: '商品标题（展示用，同步自闲鱼）' })
  title: string;

  /** 发货方式 */
  @Column({
    length: 20,
    type: 'varchar',
    comment: '发货方式: kami/link/text',
  })
  deliveryType: DeliveryType;

  /**
   * 卡密池ID（仅 deliveryType=kami 时使用）。
   * 关联 kami_pools.id，发货时从此池取一条。
   */
  @Column({ name: 'kami_pool_id', type: 'bigint', nullable: true, comment: '卡密池ID' })
  kamiPoolId: number | null;

  /**
   * 固定发货内容（deliveryType=link/text 时使用）。
   * 例如网盘链接、固定文本说明等。
   */
  @Column({ type: 'text', nullable: true, name: 'fixed_content', comment: '固定发货内容' })
  fixedContent: string | null;

  /** 发货时附带的备注消息（可选，如"如有问题联系客服"） */
  @Column({ type: 'text', nullable: true, name: 'remark', comment: '发货附言' })
  remark: string | null;

  @Column({ name: 'enabled', type: 'boolean', default: true, comment: '是否启用自动发货' })
  enabled: boolean;
}
