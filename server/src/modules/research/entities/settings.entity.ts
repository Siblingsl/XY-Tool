import { Column, Entity, Index } from 'typeorm';
import { ResearchBaseEntity } from './research-base.entity';

/**
 * 研究系统设置表（每租户一行）。
 * 存储营销关键词、报告时间、验证源开关等可配置项。
 * API 契约见文档附录 A.7。
 */
@Entity('research_settings')
@Index('idx_research_settings_tenant', ['tenantId'], { unique: true })
export class ResearchSettingsEntity extends ResearchBaseEntity {
  @Column({
    name: 'marketing_keywords',
    type: 'text',
    array: true,
    nullable: true,
    comment: '营销过滤关键词列表',
  })
  marketingKeywords: string[] | null;

  @Column({
    name: 'report_cron_local',
    type: 'varchar',
    length: 10,
    default: '21:00',
    comment: '报告生成时间（本地时间 HH:mm）',
  })
  reportCronLocal: string;

  @Column({
    name: 'enabled_verify_sources',
    type: 'text',
    array: true,
    nullable: true,
    comment: '启用的验证源列表',
  })
  enabledVerifySources: string[] | null;
}
