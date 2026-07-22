import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * 闲鱼账号表。
 * 存储用户绑定的闲鱼卖家账号的登录态。
 *
 * ⚠️ 安全设计：cookieEncrypted 字段存储 AES-256-GCM 加密后的密文，
 *    主密钥保存在环境变量（COOKIE_ENCRYPTION_KEY），不入库。
 *    字段名为 cookieEncrypted 以强调它存的是密文而非明文。
 */
@Entity('xianyu_accounts')
@Index('idx_xianyu_accounts_tenant_status', ['tenantId', 'status'])
export class XianyuAccountEntity extends BaseEntity {
  @Index()
  @Column({ name: 'tenant_id', type: 'bigint', comment: '所属租户' })
  tenantId: number;

  /** 闲鱼用户昵称（来自登录态），用于展示 */
  @Column({ length: 100, comment: '闲鱼昵称' })
  nickname: string;

  /** 闲鱼用户ID（用于唯一标识账号） */
  @Column({ length: 64, name: 'xianyu_uid', comment: '闲鱼UID' })
  xianyuUid: string;

  /**
   * 加密后的完整 Cookie 字符串（含 _m_h5_tk / cookie2 / sgcookie 等）。
   * 格式: base64(iv):base64(authTag):base64(ciphertext)
   */
  @Column({ type: 'text', name: 'cookie_encrypted', comment: '加密后的Cookie' })
  cookieEncrypted: string;

  /** 状态: active 正常 / expired 登录过期 / banned 封号 / disabled 手动停用 */
  @Column({ length: 20, default: 'active', comment: '账号状态' })
  status: string;

  /** 最后一次校验登录态有效性的时间 */
  @Column({
    name: 'last_checked_at',
    type: 'timestamp',
    nullable: true,
    comment: '上次校验时间',
  })
  lastCheckedAt: Date | null;

  /** 启用开关：false 时跳过该账号的订单监听与发货 */
  @Column({ name: 'enabled', type: 'boolean', default: true, comment: '是否启用' })
  enabled: boolean;

  /**
   * 是否在 IM 发卡密后调用闲鱼「确认发货」API。
   * 也可通过全局 CONFIRM_DELIVERY_ENABLED 开启；账号级优先于全局关闭时的单独开启。
   */
  @Column({
    name: 'auto_confirm',
    type: 'boolean',
    default: false,
    comment: 'IM发货后是否自动确认闲鱼发货状态',
  })
  autoConfirm: boolean;
}
