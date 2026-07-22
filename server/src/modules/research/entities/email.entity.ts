import { Column, Entity, Index } from 'typeorm';
import { ResearchBaseEntity } from './research-base.entity';

/**
 * 邮件表。
 * 存储从 Gmail 拉取的原始邮件及解析结果。
 * status 状态机：pending → parsing → identifying → verifying → scoring → done
 *                         ↘ filtered (营销垃圾)
 *                         ↘ failed (可重试)
 *                         ↘ skipped (重复聚类并入已有簇 / empty_content)
 *                         ↘ no_project (无法识别项目)
 *                         ↘ auth_required (token 过期)
 */
@Entity('research_emails')
@Index('idx_research_emails_tenant', ['tenantId'])
@Index('idx_research_emails_status', ['status'])
@Index('idx_research_emails_gmail_msg', ['gmailMessageId'], { unique: true })
export class ResearchEmailEntity extends ResearchBaseEntity {
  @Column({
    name: 'gmail_message_id',
    type: 'varchar',
    length: 255,
    comment: 'Gmail Message ID（唯一）',
  })
  gmailMessageId: string;

  @Column({ type: 'text', comment: '邮件标题' })
  subject: string;

  @Column({
    name: 'from_addr',
    type: 'varchar',
    length: 500,
    comment: '发件人地址',
  })
  fromAddr: string;

  @Column({
    name: 'received_at',
    type: 'timestamptz',
    comment: '邮件接收时间',
  })
  receivedAt: Date;

  @Column({
    name: 'body_text',
    type: 'text',
    nullable: true,
    comment: '正文纯文本',
  })
  bodyText: string | null;

  @Column({
    name: 'extracted_json',
    type: 'jsonb',
    nullable: true,
    comment: '提取的结构化数据（links, githubUrls, youtubeUrls, productUrls, redditUrls, twitterUrls, attachments 等）',
  })
  extractedJson: Record<string, any> | null;

  @Column({
    type: 'text',
    array: true,
    nullable: true,
    comment: '分类标签（多选）: AI_SaaS, SideHustle, Startup, GitHub, OpenSource, Tool, ProductHunt, YC, Investment, Funding, SEO, Affiliate, Newsletter, Other',
  })
  categories: string[] | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: 'pending',
    comment: '处理状态: pending/parsing/identifying/verifying/scoring/done/filtered/failed/skipped/no_project/auth_required',
  })
  status: string;

  @Column({
    name: 'filter_reason',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '过滤原因（命中营销关键词时记录）',
  })
  filterReason: string | null;
}
