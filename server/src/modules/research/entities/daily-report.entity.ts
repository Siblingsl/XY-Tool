import { Column, Entity, Index } from 'typeorm';
import { ResearchBaseEntity } from './research-base.entity';

/**
 * 每日投资报告表。
 * 每天定时（默认 21:00 Asia/Shanghai）生成，汇总当日分析结果。
 */
@Entity('research_daily_reports')
@Index('idx_research_reports_tenant', ['tenantId'])
@Index('idx_research_reports_date', ['tenantId', 'reportDate'], { unique: true })
export class ResearchDailyReportEntity extends ResearchBaseEntity {
  @Column({
    name: 'report_date',
    type: 'date',
    comment: '报告日期（每租户唯一）',
  })
  reportDate: string;

  @Column({
    name: 'summary_json',
    type: 'jsonb',
    nullable: true,
    comment: '汇总指标（今日分析数、值得研究/建议放弃/继续观察数、新增真正新方向数）',
  })
  summaryJson: Record<string, any> | null;

  @Column({
    name: 'body_md',
    type: 'text',
    nullable: true,
    comment: '报告正文（Markdown 格式）',
  })
  bodyMd: string | null;

  @Column({
    name: 'project_ids',
    type: 'uuid',
    array: true,
    nullable: true,
    comment: '入选项目 ID 列表',
  })
  projectIds: string[] | null;
}
