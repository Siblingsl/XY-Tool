import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * 用户表。
 * 商业产品采用"共享数据库多租户"，每个用户即一个租户（tenant），
 * 所有业务表通过 tenant_id 关联回此表，实现数据隔离。
 *
 * 注意：tenantId 这里等于 user.id 本身（单用户=单租户的简化模型）。
 * 后续若支持"团队/工作室"（一个账号下多个子用户），可拆出 tenants 表。
 */
@Entity('users')
export class UserEntity extends BaseEntity {
  @Column({ length: 50, unique: true, comment: '登录用户名/邮箱' })
  username: string;

  @Column({ length: 100, select: false, comment: 'bcrypt 哈希密码' })
  password: string;

  @Column({ length: 50, default: 'active', comment: '状态: active/disabled' })
  status: string;

  @Column({ length: 100, type: 'varchar', nullable: true, comment: '展示昵称' })
  nickname: string | null;

  /** 租户标识。当前等于自身 id；多用户共享一个 tenant 时可指向其他 user */
  @Index()
  @Column({ name: 'tenant_id', type: 'bigint', comment: '所属租户ID' })
  tenantId: number;

  /** 角色：admin 普通租户管理员 / system 系统管理员（预留） */
  @Column({ length: 20, default: 'admin', comment: '角色' })
  role: string;

  /**
   * Refresh Token 的 bcrypt 哈希（select:false 默认不返回）。
   * 存哈希而非明文，可在服务端吊销（登出/改密时置空）。
   * 为空表示当前无有效 refresh token。
   */
  @Column({
    length: 100,
    type: 'varchar',
    name: 'refresh_token_hash',
    nullable: true,
    select: false,
    comment: 'Refresh Token 哈希',
  })
  refreshTokenHash: string | null;
}
