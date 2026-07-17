import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { AiConfigEntity } from './ai-config.entity';
import { encrypt, decrypt } from '../../common/utils/crypto.util';

export type AiChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type AiChatOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

export type AiCredentials = {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  source: 'global' | 'account';
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @InjectRepository(AiConfigEntity)
    private readonly repo: Repository<AiConfigEntity>,
    private readonly config: ConfigService,
  ) {}

  async getConfig(tenantId: number): Promise<AiConfigEntity | null> {
    return this.repo.findOne({ where: { tenantId } });
  }

  async getConfigPublic(tenantId: number): Promise<{
    enabled: boolean;
    baseUrl: string;
    defaultModel: string;
    defaultTemperature: number;
    apiKeyConfigured: boolean;
  }> {
    const cfg = await this.getConfig(tenantId);
    if (!cfg) {
      return {
        enabled: true,
        baseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o-mini',
        defaultTemperature: 0.7,
        apiKeyConfigured: false,
      };
    }
    return {
      enabled: cfg.enabled,
      baseUrl: cfg.baseUrl,
      defaultModel: cfg.defaultModel,
      defaultTemperature: cfg.defaultTemperature,
      apiKeyConfigured: !!cfg.apiKeyEncrypted,
    };
  }

  async upsertConfig(
    tenantId: number,
    patch: {
      enabled?: boolean;
      baseUrl?: string;
      apiKey?: string;
      defaultModel?: string;
      defaultTemperature?: number;
    },
  ): Promise<ReturnType<AiService['getConfigPublic']>> {
    const encKey = this.config.get<string>('cookieEncryptionKey') || '';
    let cfg = await this.getConfig(tenantId);
    if (!cfg) {
      cfg = this.repo.create({
        tenantId,
        enabled: true,
        baseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o-mini',
        defaultTemperature: 0.7,
        apiKeyEncrypted: null,
      });
    }

    if (patch.enabled !== undefined) cfg.enabled = patch.enabled;
    if (patch.baseUrl !== undefined && patch.baseUrl !== '') {
      cfg.baseUrl = patch.baseUrl.replace(/\/$/, '');
    }
    if (patch.defaultModel !== undefined && patch.defaultModel !== '') {
      cfg.defaultModel = patch.defaultModel;
    }
    if (patch.defaultTemperature !== undefined) {
      cfg.defaultTemperature = Number(patch.defaultTemperature);
    }
    if (patch.apiKey !== undefined && patch.apiKey !== '') {
      cfg.apiKeyEncrypted = encrypt(patch.apiKey, encKey);
    }

    await this.repo.save(cfg);
    return this.getConfigPublic(tenantId);
  }

  /**
   * 解析可用凭据：优先租户公共配置，其次账号级 reply_config 回退。
   */
  async resolveCredentials(
    tenantId: number,
    accountFallback?: {
      baseUrl?: string | null;
      apiKeyEncrypted?: string | null;
      model?: string | null;
      temperature?: number | null;
    },
  ): Promise<AiCredentials | null> {
    const global = await this.getConfig(tenantId);
    if (global?.enabled) {
      const apiKey = this.decryptApiKey(global.apiKeyEncrypted);
      if (apiKey) {
        return {
          baseUrl: (global.baseUrl || 'https://api.openai.com/v1').replace(
            /\/$/,
            '',
          ),
          apiKey,
          model: global.defaultModel || 'gpt-4o-mini',
          temperature: global.defaultTemperature ?? 0.7,
          source: 'global',
        };
      }
    }

    if (accountFallback) {
      const apiKey = this.decryptApiKey(accountFallback.apiKeyEncrypted || null);
      if (apiKey) {
        return {
          baseUrl: (accountFallback.baseUrl || 'https://api.openai.com/v1').replace(
            /\/$/,
            '',
          ),
          apiKey,
          model: accountFallback.model || 'gpt-4o-mini',
          temperature: accountFallback.temperature ?? 0.7,
          source: 'account',
        };
      }
    }

    return null;
  }

  async isReady(
    tenantId: number,
    accountFallback?: {
      baseUrl?: string | null;
      apiKeyEncrypted?: string | null;
      model?: string | null;
      temperature?: number | null;
    },
  ): Promise<boolean> {
    return !!(await this.resolveCredentials(tenantId, accountFallback));
  }

  /**
   * 全系统统一的 OpenAI 兼容 chat/completions。
   */
  async chatCompletion(
    tenantId: number,
    messages: AiChatMessage[],
    opts?: AiChatOptions & {
      accountFallback?: {
        baseUrl?: string | null;
        apiKeyEncrypted?: string | null;
        model?: string | null;
        temperature?: number | null;
      };
    },
  ): Promise<string> {
    const creds = await this.resolveCredentials(tenantId, opts?.accountFallback);
    if (!creds) {
      throw new Error(
        '请先在「AI 接入」中配置公共 AI（Base URL / API Key / 模型）',
      );
    }

    return this.requestChat(creds, messages, opts);
  }

  async testConnection(
    baseUrl: string,
    apiKey: string,
    model: string,
  ): Promise<{ ok: boolean; reply?: string; error?: string }> {
    try {
      const reply = await this.requestChat(
        {
          baseUrl: (baseUrl || '').replace(/\/$/, ''),
          apiKey,
          model: model || 'gpt-4o-mini',
          temperature: 0.3,
          source: 'global',
        },
        [{ role: 'user', content: '你好，请回复"连接成功"' }],
        { maxTokens: 50, timeoutMs: 15_000 },
      );
      return { ok: true, reply };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async testSaved(
    tenantId: number,
  ): Promise<{ ok: boolean; reply?: string; error?: string; source?: string }> {
    try {
      const creds = await this.resolveCredentials(tenantId);
      if (!creds) {
        return {
          ok: false,
          error: '尚未配置公共 AI，请填写 Base URL 与 API Key 并保存',
        };
      }
      const reply = await this.requestChat(
        creds,
        [{ role: 'user', content: '你好，请回复"连接成功"' }],
        { maxTokens: 50, timeoutMs: 15_000 },
      );
      return { ok: true, reply, source: creds.source };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  private async requestChat(
    creds: AiCredentials,
    messages: AiChatMessage[],
    opts?: AiChatOptions,
  ): Promise<string> {
    const baseUrl = creds.baseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/chat/completions`;
    try {
      const resp = await axios.post(
        url,
        {
          model: opts?.model || creds.model || 'gpt-4o-mini',
          messages,
          temperature: opts?.temperature ?? creds.temperature ?? 0.7,
          max_tokens: opts?.maxTokens ?? 1000,
        },
        {
          headers: {
            Authorization: `Bearer ${creds.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: opts?.timeoutMs ?? 60_000,
        },
      );
      const reply: string | undefined =
        resp.data?.choices?.[0]?.message?.content?.trim();
      if (!reply) throw new Error('AI 返回空内容');
      return reply;
    } catch (err) {
      const ax = err as {
        response?: { status?: number; data?: { error?: { message?: string } } };
        message?: string;
      };
      const detail =
        ax.response?.data?.error?.message ||
        ax.message ||
        'AI 请求失败';
      this.logger.warn(`AI 调用失败 (${url}): ${detail}`);
      throw new Error(detail);
    }
  }

  private decryptApiKey(encrypted: string | null): string | null {
    if (!encrypted) return null;
    try {
      const encKey = this.config.get<string>('cookieEncryptionKey') || '';
      return decrypt(encrypted, encKey);
    } catch {
      return null;
    }
  }
}
