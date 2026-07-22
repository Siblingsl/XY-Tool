import { Column, Entity, Index } from 'typeorm';
import { ResearchBaseEntity } from './research-base.entity';

/**
 * 证据表。
 * 由「真伪验证 Agent」联网检索后写入。
 * 硬约束：无 URL / 无抓取结果不得写入具体数字事实；找不到则不写入。
 */
@Entity('research_evidences')
@Index('idx_research_evidences_project', ['projectId'])
export class ResearchEvidenceEntity extends ResearchBaseEntity {
  @Column({
    name: 'project_id',
    type: 'uuid',
    comment: '所属项目 ID（FK → research_projects.id）',
  })
  projectId: string;

  @Column({
    type: 'varchar',
    length: 50,
    comment: '证据来源: github / producthunt / google / reddit / hackernews / g2 / capterra / trustpilot / crunchbase / linkedin / youtube / twitter / google_trends',
  })
  source: string;

  @Column({ type: 'text', comment: '证据 URL' })
  url: string;

  @Column({
    type: 'varchar',
    length: 100,
    comment: '声称类型（如 stars, revenue, users, ranking, funding）',
  })
  claim: string;

  @Column({ type: 'text', comment: '声称值（如 1280, $50k MRR）' })
  value: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: '来源摘要片段',
  })
  snippet: string | null;

  @Column({
    name: 'fetched_at',
    type: 'timestamptz',
    comment: '抓取时间',
  })
  fetchedAt: Date;
}
