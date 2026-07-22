import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * 自动回复相关实体。
 *
 * 三张表：
 * 1. reply_keywords —— 关键词回复规则（一对多，可绑定商品）
 * 2. reply_config   —— 账号回复配置（一对一，含 AI 议价）
 * 3. reply_handoff  —— 人工接管记录（用于审计/展示，实际标记在 Redis）
 */

export type KeywordMatchType = 'exact' | 'contains';

/**
 * 关键词回复规则。
 * 一个关键词对应一条回复。accountId 为 null 表示全局生效（所有账号）。
 * itemId 非空时为商品专属回复，优先于无商品绑定的规则。
 */
@Entity('reply_keywords')
@Index('idx_reply_kw_tenant_account', ['tenantId', 'accountId'])
export class ReplyKeywordEntity extends BaseEntity {
  @Index()
  @Column({ name: 'tenant_id', type: 'bigint', comment: '租户' })
  tenantId: number;

  /** 关联账号（null=全局生效） */
  @Column({ name: 'account_id', type: 'bigint', nullable: true, comment: '账号ID（null=全局）' })
  accountId: number | null;

  /** 商品专属：非空时仅该商品会话命中 */
  @Column({ type: 'varchar', length: 64, name: 'item_id', nullable: true, comment: '商品ID（商品专属）' })
  itemId: string | null;

  @Column({ type: 'varchar', length: 100, name: 'keyword', comment: '关键词' })
  keyword: string;

  /** 匹配模式：exact 精确 / contains 包含 */
  @Column({ type: 'varchar', length: 20, name: 'match_type', default: 'contains', comment: '匹配模式' })
  matchType: KeywordMatchType;

  @Column({ type: 'text', name: 'reply_content', comment: '回复内容' })
  replyContent: string;

  @Column({ name: 'enabled', type: 'boolean', default: true, comment: '启用' })
  enabled: boolean;

  /** 优先级（同模式内升序，小优先） */
  @Column({ name: 'sort_order', type: 'int', default: 0, comment: '优先级' })
  sortOrder: number;
}

/**
 * 账号回复配置（一对一）。
 * 包含默认回复、AI 回复、AI 议价、转人工、冷却等设置。
 * ai_api_key 加密存储。
 */
@Entity('reply_config')
@Index('idx_reply_cfg_tenant_account', ['tenantId', 'accountId'], { unique: true })
export class ReplyConfigEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', comment: '租户' })
  tenantId: number;

  @Column({ name: 'account_id', type: 'bigint', comment: '账号ID' })
  accountId: number;

  // ============ 默认回复 ============
  @Column({ name: 'default_reply_enabled', type: 'boolean', default: false, comment: '默认回复开关' })
  defaultReplyEnabled: boolean;

  @Column({ type: 'text', name: 'default_reply_content', nullable: true, comment: '默认回复内容' })
  defaultReplyContent: string | null;

  // ============ AI 回复 ============
  @Column({ name: 'ai_enabled', type: 'boolean', default: false, comment: 'AI回复开关' })
  aiEnabled: boolean;

  @Column({ type: 'varchar', length: 255, name: 'ai_base_url', default: 'https://api.openai.com/v1', comment: 'OpenAI兼容地址' })
  aiBaseUrl: string;

  /** API Key（AES-256-GCM 加密存储） */
  @Column({ type: 'text', name: 'ai_api_key_encrypted', nullable: true, comment: 'AI API Key（加密）' })
  aiApiKeyEncrypted: string | null;

  @Column({ type: 'varchar', length: 100, name: 'ai_model', default: 'gpt-4o-mini', comment: '模型名' })
  aiModel: string;

  @Column({ type: 'text', name: 'ai_system_prompt', nullable: true, comment: '系统提示词' })
  aiSystemPrompt: string | null;

  @Column({ type: 'float', name: 'ai_temperature', default: 0.7, comment: '温度' })
  aiTemperature: number;

  // ============ AI 议价 ============
  @Column({ name: 'ai_bargain_enabled', type: 'boolean', default: false, comment: 'AI议价开关' })
  aiBargainEnabled: boolean;

  /** 最大优惠百分比（如 10 表示最多打九折） */
  @Column({ name: 'max_discount_percent', type: 'int', default: 10, comment: '最大优惠百分比' })
  maxDiscountPercent: number;

  /** 最大优惠金额（元） */
  @Column({ name: 'max_discount_amount', type: 'int', default: 100, comment: '最大优惠金额(元)' })
  maxDiscountAmount: number;

  /** 同一会话最大议价轮数 */
  @Column({ name: 'max_bargain_rounds', type: 'int', default: 3, comment: '最大议价轮数' })
  maxBargainRounds: number;

  /** 触发议价意图的关键词，逗号分隔 */
  @Column({
    type: 'varchar',
    length: 200,
    name: 'bargain_keywords',
    default: '便宜,刀,优惠,少点,砍价,议价',
    comment: '议价关键词',
  })
  bargainKeywords: string;

  // ============ 转人工 / 冷却 ============
  /** 触发转人工的关键词，逗号分隔（如 "人工,客服,转人工"） */
  @Column({ type: 'varchar', length: 200, name: 'transfer_keywords', default: '人工,客服', comment: '转人工关键词(逗号分隔)' })
  transferKeywords: string;

  /** 同买家冷却秒数（防止刷屏） */
  @Column({ name: 'cooldown_seconds', type: 'int', default: 3, comment: '冷却秒数' })
  cooldownSeconds: number;
}

/**
 * 人工接管记录（审计/展示用）。
 * 实际是否接管以 Redis 标记为准（TTL），此表用于历史查询和前端展示。
 */
@Entity('reply_handoff')
@Index('idx_reply_handoff_tenant_account_buyer', ['tenantId', 'accountId', 'buyerId'])
export class ReplyHandoffEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', comment: '租户' })
  tenantId: number;

  @Column({ name: 'account_id', type: 'bigint', comment: '账号ID' })
  accountId: number;

  @Column({ type: 'varchar', length: 64, name: 'buyer_id', comment: '买家ID' })
  buyerId: string;

  @Column({ type: 'varchar', length: 100, name: 'buyer_nick', nullable: true, comment: '买家昵称' })
  buyerNick: string | null;

  @Column({ name: 'handed_off', type: 'boolean', default: true, comment: '是否转人工' })
  handedOff: boolean;

  @Column({ name: 'handed_off_at', type: 'timestamp', default: () => 'now()', comment: '转人工时间' })
  handedOffAt: Date;

  /** 触发转人工的消息内容 */
  @Column({ type: 'text', name: 'trigger_content', nullable: true, comment: '触发内容' })
  triggerContent: string | null;
}
