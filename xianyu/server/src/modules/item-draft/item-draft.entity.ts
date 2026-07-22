import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export type ItemDraftStatus =
  | 'local' // 仅本地素材
  | 'pushing' // 正在推送到闲鱼草稿
  | 'xy_draft' // 已在闲鱼草稿箱
  | 'failed'; // 推送失败

/**
 * 商品草稿/素材。
 * - 本地可无限编辑
 * - 可选推送到闲鱼草稿箱（不上架），用户在 App 内手动发布
 */
@Entity('item_drafts')
@Index('idx_item_drafts_tenant_status', ['tenantId', 'status'])
export class ItemDraftEntity extends BaseEntity {
  @Index()
  @Column({ name: 'tenant_id', type: 'bigint', comment: '租户' })
  tenantId: number;

  /** 推送时使用的闲鱼账号 */
  @Column({ name: 'account_id', type: 'bigint', nullable: true, comment: '闲鱼账号ID' })
  accountId: number | null;

  @Column({ type: 'varchar', length: 200, comment: '标题' })
  title: string;

  @Column({ type: 'text', comment: '描述' })
  description: string;

  /** 售价（元） */
  @Column({
    name: 'price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    comment: '售价(元)',
  })
  price: number;

  /** 原价（元，可选） */
  @Column({
    name: 'original_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    comment: '原价(元)',
  })
  originalPrice: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true, comment: '分类' })
  category: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, comment: '成色' })
  condition: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: '品牌' })
  brand: string | null;

  /**
   * 图片列表 JSON：
   * [{ localPath?, url?, width?, height? }]
   */
  @Column({ type: 'jsonb', name: 'images', default: () => "'[]'", comment: '图片列表' })
  images: Array<{
    localPath?: string;
    url?: string;
    width?: number;
    height?: number;
  }>;

  /** 运费方式：无需邮寄 / 包邮 / 一口价 / 按距离计费 */
  @Column({
    name: 'delivery_choice',
    type: 'varchar',
    length: 30,
    default: '无需邮寄',
    comment: '运费方式',
  })
  deliveryChoice: string;

  @Column({
    name: 'post_price',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '一口价邮费(元)',
  })
  postPrice: number | null;

  @Column({ type: 'varchar', length: 200, nullable: true, comment: '地址文案' })
  address: string | null;

  @Column({ type: 'text', nullable: true, comment: '内部备注' })
  remark: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'local',
    comment: '状态 local/pushing/xy_draft/failed',
  })
  status: ItemDraftStatus;

  /** 闲鱼草稿 ID（若接口返回） */
  @Column({
    type: 'varchar',
    length: 64,
    name: 'xy_draft_id',
    nullable: true,
    comment: '闲鱼草稿ID',
  })
  xyDraftId: string | null;

  /** 闲鱼商品 ID（部分草稿接口会回传） */
  @Column({
    type: 'varchar',
    length: 64,
    name: 'xy_item_id',
    nullable: true,
    comment: '闲鱼商品ID',
  })
  xyItemId: string | null;

  @Column({ type: 'text', name: 'last_error', nullable: true, comment: '最近一次推送错误' })
  lastError: string | null;

  @Column({
    name: 'pushed_at',
    type: 'timestamp',
    nullable: true,
    comment: '推送到闲鱼草稿时间',
  })
  pushedAt: Date | null;
}
