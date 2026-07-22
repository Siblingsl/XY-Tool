import { Column, Entity, Index } from 'typeorm';
import { ResearchBaseEntity } from './research-base.entity';

/**
 * 聚类表。
 * 名称/描述语义相近的项目归入同一簇（如 AI PPT / AI Slides / Presentation AI）。
 * 日报只计「真正新方向」数量（去重聚类后）。
 */
@Entity('research_clusters')
@Index('idx_research_clusters_tenant', ['tenantId'])
@Index('idx_research_clusters_key', ['tenantId', 'key'], { unique: true })
export class ResearchClusterEntity extends ResearchBaseEntity {
  @Column({
    type: 'varchar',
    length: 100,
    comment: '归一化方向键（如 ai_ppt）',
  })
  key: string;

  @Column({
    type: 'varchar',
    length: 255,
    comment: '聚类显示标签（如 AI PPT）',
  })
  label: string;

  @Column({
    name: 'project_ids',
    type: 'uuid',
    array: true,
    nullable: true,
    comment: '归属本簇的项目 ID 列表',
  })
  projectIds: string[] | null;
}
