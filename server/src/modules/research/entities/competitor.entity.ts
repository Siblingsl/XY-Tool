import { Column, Entity, Index } from 'typeorm';
import { ResearchBaseEntity } from './research-base.entity';

/**
 * 竞争者表。
 * 由「真伪验证 Agent」衍生竞争分析输出，一行一条竞争者。
 */
@Entity('research_competitors')
@Index('idx_research_competitors_project', ['projectId'])
export class ResearchCompetitorEntity extends ResearchBaseEntity {
  @Column({
    name: 'project_id',
    type: 'uuid',
    comment: '所属项目 ID（FK → research_projects.id）',
  })
  projectId: string;

  @Column({
    type: 'varchar',
    length: 255,
    comment: '竞争者名称（如 Gamma, Beautiful.ai, Canva）',
  })
  name: string;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '竞争者网站',
  })
  url: string | null;

  @Column({
    type: 'text',
    nullable: true,
    comment: '备注/描述',
  })
  notes: string | null;
}
