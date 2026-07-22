import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * 租户级公共 AI 接入配置（OpenAI 兼容）。
 * 全系统 AI 调用（自动回复、爆款仿写等）统一走此配置。
 */
@Entity('ai_config')
@Index('idx_ai_config_tenant', ['tenantId'], { unique: true })
export class AiConfigEntity extends BaseEntity {
  @Column({ type: 'bigint', name: 'tenant_id', comment: '租户ID' })
  tenantId: number;

  @Column({
    name: 'enabled',
    type: 'boolean',
    default: true,
    comment: '是否启用公共 AI',
  })
  enabled: boolean;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'base_url',
    default: 'https://api.openai.com/v1',
    comment: 'OpenAI 兼容 Base URL（含 /v1）',
  })
  baseUrl: string;

  @Column({
    type: 'text',
    name: 'api_key_encrypted',
    nullable: true,
    comment: 'API Key（加密）',
  })
  apiKeyEncrypted: string | null;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'default_model',
    default: 'gpt-4o-mini',
    comment: '默认模型',
  })
  defaultModel: string;

  @Column({
    type: 'float',
    name: 'default_temperature',
    default: 0.7,
    comment: '默认温度',
  })
  defaultTemperature: number;
}
