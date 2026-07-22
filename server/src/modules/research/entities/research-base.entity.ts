import {
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Column,
} from 'typeorm';

/**
 * 研究域实体基类。
 * 文档第五章要求研究域表使用 uuid 主键，与闲鱼域 bigint 自增隔离。
 * 均含 tenant_id、created_at、updated_at。
 */
export abstract class ResearchBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'bigint', comment: '所属租户ID' })
  tenantId: number;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
    comment: '创建时间',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
    comment: '更新时间',
  })
  updatedAt: Date;
}
