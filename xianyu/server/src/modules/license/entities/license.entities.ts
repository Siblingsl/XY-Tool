import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * 激活码中台数据模型。
 *
 * 三张表：
 * 1. license_types  —— 激活码类型/规格（月卡/年卡/永久 等）
 * 2. license_batches —— 生成批次（审计追溯）
 * 3. license_codes   —— 激活码条目（验证/作废/有效期）
 */

export type LicenseStatus = 'unused' | 'active' | 'revoked' | 'expired';
export type LicenseSource = 'manual' | 'delivery' | 'api';

/**
 * 激活码类型。
 * 定义一种激活码的规格：有效期、最大使用次数、码格式。
 */
@Entity('license_types')
@Index('idx_license_types_tenant_code', ['tenantId', 'code'], { unique: true })
export class LicenseTypeEntity extends BaseEntity {
  @Index()
  @Column({ name: 'tenant_id', type: 'bigint', comment: '租户' })
  tenantId: number;

  @Column({ type: 'varchar', length: 100, comment: '类型名称' })
  name: string;

  /** 类型编码（唯一，申请码时指定，如 monthly/yearly/software_a） */
  @Column({ type: 'varchar', length: 50, comment: '类型编码' })
  code: string;

  /** 有效天数（激活后计时，null=永久） */
  @Column({ name: 'duration_days', type: 'int', nullable: true, comment: '有效天数(null=永久)' })
  durationDays: number | null;

  /** 单码最大使用次数（默认1；>1 一码多用，如团队版） */
  @Column({ name: 'max_uses', type: 'int', default: 1, comment: '最大使用次数' })
  maxUses: number;

  /** 激活码前缀（如 SWA-，生成时拼接） */
  @Column({ type: 'varchar', length: 20, name: 'code_prefix', default: '', comment: '码前缀' })
  codePrefix: string;

  /** 码段长度（总字符数，不含前缀和分隔符，如 16 → XXXX-XXXX-XXXX-XXXX） */
  @Column({ name: 'code_length', type: 'int', default: 16, comment: '码段长度' })
  codeLength: number;

  @Column({ type: 'boolean', default: true, comment: '启用' })
  enabled: boolean;
}

/**
 * 生成批次（审计追溯）。
 */
@Entity('license_batches')
@Index('idx_license_batches_tenant_type', ['tenantId', 'typeId'])
export class LicenseBatchEntity extends BaseEntity {
  @Index()
  @Column({ name: 'tenant_id', type: 'bigint', comment: '租户' })
  tenantId: number;

  @Index()
  @Column({ name: 'type_id', type: 'bigint', comment: '类型ID' })
  typeId: number;

  @Column({ type: 'int', comment: '本批次生成数量' })
  count: number;

  /** 来源：manual 手动 / delivery 付款触发 / api 外部申请 */
  @Column({ type: 'varchar', length: 20, default: 'manual', comment: '来源' })
  source: LicenseSource;

  /** 付款触发时关联订单（source=delivery） */
  @Column({ name: 'order_id', type: 'bigint', nullable: true, comment: '关联订单' })
  orderId: number | null;
}

/**
 * 激活码条目。
 */
@Entity('license_codes')
@Index('idx_license_codes_tenant_status', ['tenantId', 'status'])
@Index('idx_license_codes_tenant_type', ['tenantId', 'typeId'])
export class LicenseCodeEntity extends BaseEntity {
  @Index()
  @Column({ name: 'tenant_id', type: 'bigint', comment: '租户' })
  tenantId: number;

  @Index()
  @Column({ name: 'type_id', type: 'bigint', comment: '类型ID' })
  typeId: number;

  @Index()
  @Column({ name: 'batch_id', type: 'bigint', nullable: true, comment: '批次ID' })
  batchId: number | null;

  /** 激活码明文（全局唯一） */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100, comment: '激活码' })
  code: string;

  /** 状态: unused 未用 / active 已激活 / revoked 已作废 / expired 已过期 */
  @Column({ type: 'varchar', length: 20, default: 'unused', comment: '状态' })
  status: LicenseStatus;

  /** 已使用次数 */
  @Column({ name: 'used_count', type: 'int', default: 0, comment: '已使用次数' })
  usedCount: number;

  /** 首次激活时间 */
  @Column({ name: 'activated_at', type: 'timestamp', nullable: true, comment: '激活时间' })
  activatedAt: Date | null;

  /** 过期时间（激活时按 durationDays 计算；null=永久） */
  @Column({ name: 'expires_at', type: 'timestamp', nullable: true, comment: '过期时间' })
  expiresAt: Date | null;

  /** 发放订单（付款触发时回填） */
  @Column({ name: 'order_id', type: 'bigint', nullable: true, comment: '发放订单' })
  orderId: number | null;

  /** 激活方标识（外部工具传，如设备ID/用户ID，审计） */
  @Column({ type: 'varchar', length: 200, name: 'activated_by', nullable: true, comment: '激活方标识' })
  activatedBy: string | null;
}
