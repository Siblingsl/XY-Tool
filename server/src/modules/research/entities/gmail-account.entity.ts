import { Column, Entity, Index } from 'typeorm';
import { ResearchBaseEntity } from './research-base.entity';

/**
 * Gmail 授权账号表。
 * 存储 OAuth refresh_token（加密）及增量同步游标。
 */
@Entity('research_gmail_accounts')
@Index('idx_research_gmail_tenant', ['tenantId'])
export class ResearchGmailAccountEntity extends ResearchBaseEntity {
  @Column({ type: 'varchar', length: 255, comment: 'Gmail 邮箱地址' })
  email: string;

  @Column({
    name: 'refresh_token_enc',
    type: 'text',
    comment: 'OAuth Refresh Token（加密存储）',
  })
  refreshTokenEnc: string;

  @Column({
    name: 'sync_cursor',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '增量同步游标（Gmail HistoryId / 页标记）',
  })
  syncCursor: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'active',
    comment: '状态: active / revoked',
  })
  status: string;
}
