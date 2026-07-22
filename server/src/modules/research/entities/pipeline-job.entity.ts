import { Column, Entity, Index } from 'typeorm';
import { ResearchBaseEntity } from './research-base.entity';

/**
 * 流水线任务表。
 * 记录每封邮件/每个项目在五层 Agent 流水线中的执行状态。
 * stage: parse → identify → verify → score → report
 * status: queued → running → done / failed / skipped
 */
@Entity('research_pipeline_jobs')
@Index('idx_research_jobs_tenant', ['tenantId'])
@Index('idx_research_jobs_status', ['status'])
@Index('idx_research_jobs_stage', ['stage'])
@Index('idx_research_jobs_email', ['emailId'])
@Index('idx_research_jobs_project', ['projectId'])
export class ResearchPipelineJobEntity extends ResearchBaseEntity {
  @Column({
    name: 'email_id',
    type: 'uuid',
    nullable: true,
    comment: '关联邮件 ID（FK → research_emails.id）',
  })
  emailId: string | null;

  @Column({
    name: 'project_id',
    type: 'uuid',
    nullable: true,
    comment: '关联项目 ID（FK → research_projects.id）',
  })
  projectId: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    comment: '阶段: parse / identify / verify / score / report',
  })
  stage: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'queued',
    comment: '状态: queued / running / done / failed / skipped',
  })
  status: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: '错误信息（失败时记录）',
  })
  error: string | null;

  @Column({
    name: 'started_at',
    type: 'timestamptz',
    nullable: true,
    comment: '开始执行时间',
  })
  startedAt: Date | null;

  @Column({
    name: 'finished_at',
    type: 'timestamptz',
    nullable: true,
    comment: '执行完成时间',
  })
  finishedAt: Date | null;
}
