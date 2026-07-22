import { Column, Entity, Index } from 'typeorm';
import { ResearchBaseEntity } from './research-base.entity';

/**
 * 热度数据点表。
 * 按 project_id + date + metric 存储，供热度图表使用。
 * 综合 Trends / Star / Reddit / PH / X / YouTube 等指标。
 */
@Entity('research_heat_points')
@Index('idx_research_heat_project', ['projectId'])
@Index('idx_research_heat_project_date_metric', ['projectId', 'date', 'metric'])
export class ResearchHeatPointEntity extends ResearchBaseEntity {
  @Column({
    name: 'project_id',
    type: 'uuid',
    comment: '所属项目 ID（FK → research_projects.id）',
  })
  projectId: string;

  @Column({
    type: 'date',
    comment: '数据日期',
  })
  date: string;

  @Column({
    type: 'varchar',
    length: 50,
    comment: '指标类型（如 trends, github_stars, reddit_mentions, ph_upvotes, x_mentions, youtube_views）',
  })
  metric: string;

  @Column({
    type: 'float',
    comment: '指标值',
  })
  value: number;
}
