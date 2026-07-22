import { Column, Entity, Index } from 'typeorm';
import { ResearchBaseEntity } from './research-base.entity';

/**
 * 项目卡片表。
 * 由「项目识别 Agent」从邮件中提取生成。
 * card_json 存储完整 Project Card 字段（name, type, price, audience, model, openSource, competitorsMentioned, market, launchYear, author, website, clusterKey）。
 */
@Entity('research_projects')
@Index('idx_research_projects_tenant', ['tenantId'])
@Index('idx_research_projects_verdict', ['verdict'])
@Index('idx_research_projects_cluster', ['clusterId'])
export class ResearchProjectEntity extends ResearchBaseEntity {
  @Column({
    name: 'email_id',
    type: 'uuid',
    comment: '来源邮件 ID（FK → research_emails.id）',
  })
  emailId: string;

  @Column({
    name: 'cluster_id',
    type: 'uuid',
    nullable: true,
    comment: '所属聚类 ID（FK → research_clusters.id）',
  })
  clusterId: string | null;

  @Column({
    name: 'card_json',
    type: 'jsonb',
    nullable: true,
    comment: 'Project Card 完整字段',
  })
  cardJson: Record<string, any> | null;

  @Column({
    name: 'verify_status',
    type: 'varchar',
    length: 30,
    default: 'pending',
    comment: '验证状态: pending/verifying/verified/unverified/degraded',
  })
  verifyStatus: string;

  @Column({
    name: 'feasibility_index',
    type: 'int',
    nullable: true,
    comment: '可落地指数 0-100',
  })
  feasibilityIndex: number | null;

  @Column({
    type: 'varchar',
    length: 10,
    nullable: true,
    comment: '建议: do / watch / skip',
  })
  verdict: string | null;

  @Column({
    name: 'authenticity_stars',
    type: 'int',
    nullable: true,
    comment: '真实性星级 1-5',
  })
  authenticityStars: number | null;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: '生命周期: emerging / growing / saturated / declining',
  })
  lifecycle: string | null;

  @Column({
    name: 'mvp_plan_json',
    type: 'jsonb',
    nullable: true,
    comment: 'MVP 周计划（按周拆解）',
  })
  mvpPlanJson: Record<string, any>[] | null;

  @Column({
    name: 'score_json',
    type: 'jsonb',
    nullable: true,
    comment: '评分维度详情（devDifficulty, capitalNeeded, teamRequired 等 11 维度）',
  })
  scoreJson: Record<string, any> | null;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '评分摘要（如：适合一个人/3个月/启动资金3000/可MVP）',
  })
  summary: string | null;

  @Column({
    type: 'int',
    nullable: true,
    comment: '星级评分 1-5（评分 Agent 输出）',
  })
  stars: number | null;
}
