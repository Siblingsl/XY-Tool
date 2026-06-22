import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  ReplyKeywordEntity,
  ReplyConfigEntity,
  ReplyHandoffEntity,
} from './entities/reply.entities';
import { ChatMessageEvent, ReplyResult } from './types';
import { RedisService, ChatTurn } from '../redis/redis.service';
import { ImWebSocketService } from '../../goofish/im-websocket.service';
import { AccountsService } from '../accounts/accounts.service';
import { encrypt, decrypt } from '../../common/utils/crypto.util';

/**
 * 自动回复核心引擎。
 *
 * 处理买家普通聊天消息，按分层优先级匹配并自动回复：
 *   转人工检查 → 关键词精确 → 关键词包含 → AI 回复 → 默认回复 → 静默
 *
 * 设计为无状态（状态全在 Redis），由 im-payment-listener 的 onChatMessage 调用。
 */
@Injectable()
export class AutoReplyService {
  private readonly logger = new Logger(AutoReplyService.name);

  constructor(
    @InjectRepository(ReplyKeywordEntity)
    private readonly keywordRepo: Repository<ReplyKeywordEntity>,
    @InjectRepository(ReplyConfigEntity)
    private readonly configRepo: Repository<ReplyConfigEntity>,
    @InjectRepository(ReplyHandoffEntity)
    private readonly handoffRepo: Repository<ReplyHandoffEntity>,
    private readonly redis: RedisService,
    private readonly imWs: ImWebSocketService,
    private readonly accountsService: AccountsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * 处理一条买家消息（核心入口）。
   * @param accountId 闲鱼账号ID
   * @param tenantId 租户ID
   * @param cookie 当前账号 cookie（用于发回复）
   */
  async handle(
    accountId: number,
    tenantId: number,
    msg: ChatMessageEvent,
    cookie: string,
  ): Promise<ReplyResult> {
    try {
      // 1. 加载账号回复配置（无配置则跳过）
      const cfg = await this.getConfig(accountId, tenantId);
      if (!cfg) {
        return { replied: false, source: 'none' };
      }

      // 2. 转人工检查：命中则标记并停止自动回复
      if (this.hitTransferKeyword(msg.content, cfg.transferKeywords)) {
        await this.redis.markHandoff(accountId, msg.buyerId);
        await this.recordHandoff(accountId, tenantId, msg);
        this.logger.log(
          `[账号${accountId}] 买家 ${msg.buyerId} 触发转人工，停止自动回复`,
        );
        return { replied: false, source: 'handoff', handedOff: true };
      }

      // 3. 已转人工的买家，跳过自动回复
      if (await this.redis.isHandedOff(accountId, msg.buyerId)) {
        return { replied: false, source: 'handoff' };
      }

      // 4. 冷却检查（防刷屏）
      const canReply = await this.redis.checkAndSetCooldown(
        accountId,
        msg.buyerId,
        cfg.cooldownSeconds,
      );
      if (!canReply) {
        return { replied: false, source: 'cooldown' };
      }

      // 5. 关键词匹配（先精确后包含）
      const keywordReply = await this.matchKeyword(tenantId, accountId, msg.content);
      if (keywordReply) {
        await this.sendReply(accountId, cookie, msg, keywordReply);
        return { replied: true, source: 'keyword', content: keywordReply };
      }

      // 6. AI 回复
      if (cfg.aiEnabled && cfg.aiApiKeyEncrypted) {
        const aiReply = await this.callAi(accountId, cfg, msg);
        if (aiReply) {
          await this.sendReply(accountId, cookie, msg, aiReply);
          return { replied: true, source: 'ai', content: aiReply };
        }
      }

      // 7. 默认回复
      if (cfg.defaultReplyEnabled && cfg.defaultReplyContent) {
        await this.sendReply(accountId, cookie, msg, cfg.defaultReplyContent);
        return { replied: true, source: 'default', content: cfg.defaultReplyContent };
      }

      return { replied: false, source: 'none' };
    } catch (err) {
      this.logger.error(
        `[账号${accountId}] 自动回复异常: ${(err as Error).message}`,
      );
      return { replied: false, source: 'none' };
    }
  }

  // ============ 关键词匹配 ============

  /** 先精确匹配，后包含匹配，命中第一个即返回 */
  private async matchKeyword(
    tenantId: number,
    accountId: number,
    content: string,
  ): Promise<string | null> {
    // 查启用的规则：本账号 + 全局（accountId 为 null）
    const rules = await this.keywordRepo.find({
      where: [
        { tenantId, accountId, enabled: true },
        { tenantId, accountId: null as any, enabled: true },
      ],
      order: { sortOrder: 'ASC', id: 'ASC' },
    });

    // 精确匹配优先
    const exact = rules.find(
      (r) => r.matchType === 'exact' && r.keyword === content.trim(),
    );
    if (exact) return exact.replyContent;

    // 包含匹配（按 sortOrder 顺序）
    const contains = rules.find(
      (r) => r.matchType === 'contains' && content.includes(r.keyword),
    );
    if (contains) return contains.replyContent;

    return null;
  }

  // ============ AI 回复 ============

  /** 调 OpenAI 兼容接口，带 Redis 上下文 */
  private async callAi(
    accountId: number,
    cfg: ReplyConfigEntity,
    msg: ChatMessageEvent,
  ): Promise<string | null> {
    try {
      const apiKey = this.decryptApiKey(cfg.aiApiKeyEncrypted);
      if (!apiKey) return null;

      // 组装上下文：system + 历史 + 当前消息
      const systemPrompt =
        cfg.aiSystemPrompt ||
        '你是一个友善的闲鱼客服助手，负责回答买家关于虚拟商品的咨询。回答要简洁、有礼貌，尽量在 100 字以内。';
      const history = await this.redis.getChatHistory(accountId, msg.buyerId);

      const messages: ChatTurn[] = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: msg.content },
      ];

      const baseUrl = (cfg.aiBaseUrl || '').replace(/\/$/, '');
      const resp = await axios.post(
        `${baseUrl}/chat/completions`,
        {
          model: cfg.aiModel || 'gpt-4o-mini',
          messages,
          temperature: cfg.aiTemperature ?? 0.7,
          max_tokens: 300,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30_000,
        },
      );

      const reply: string | undefined =
        resp.data?.choices?.[0]?.message?.content?.trim();
      if (!reply) return null;

      // 记录上下文到 Redis（用户消息 + AI 回复）
      await this.redis.pushChat(accountId, msg.buyerId, {
        role: 'user',
        content: msg.content,
      });
      await this.redis.pushChat(accountId, msg.buyerId, {
        role: 'assistant',
        content: reply,
      });

      return reply;
    } catch (err) {
      this.logger.warn(
        `[账号${accountId}] AI 回复失败: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /** 测试 AI 连通性（controller 调用） */
  async testAi(
    baseUrl: string,
    apiKey: string,
    model: string,
  ): Promise<{ ok: boolean; reply?: string; error?: string }> {
    try {
      const url = (baseUrl || '').replace(/\/$/, '');
      const resp = await axios.post(
        `${url}/chat/completions`,
        {
          model: model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: '你好，请回复"连接成功"' }],
          max_tokens: 50,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 15_000,
        },
      );
      const reply = resp.data?.choices?.[0]?.message?.content?.trim();
      return { ok: true, reply };
    } catch (err) {
      return {
        ok: false,
        error: (err as Error).message,
      };
    }
  }

  // ============ 发送回复 ============

  private async sendReply(
    accountId: number,
    cookie: string,
    msg: ChatMessageEvent,
    text: string,
  ): Promise<void> {
    await this.imWs.sendTextMessage({
      cookie,
      accountKey: String(accountId),
      toUserId: msg.buyerId,
      text,
      conversationId: msg.conversationId,
      onCookieUpdate: async (newCookie) => {
        await this.accountsService.updateCookieIfChanged(accountId, newCookie);
      },
    });
    this.logger.log(
      `[账号${accountId}] 自动回复买家 ${msg.buyerId}: ${text.slice(0, 40)}`,
    );
  }

  // ============ 转人工 ============

  /** 检查是否命中转人工关键词 */
  private hitTransferKeyword(content: string, transferKeywords: string): boolean {
    if (!transferKeywords) return false;
    const words = transferKeywords
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return words.some((w) => content.includes(w));
  }

  /** 记录转人工到 DB（审计/展示） */
  private async recordHandoff(
    accountId: number,
    tenantId: number,
    msg: ChatMessageEvent,
  ): Promise<void> {
    // 同一 buyer 已存在记录则更新时间，否则新建
    let record = await this.handoffRepo.findOne({
      where: { tenantId, accountId, buyerId: msg.buyerId },
    });
    if (record) {
      record.handedOff = true;
      record.handedOffAt = new Date();
      record.triggerContent = msg.content;
      await this.handoffRepo.save(record);
    } else {
      record = this.handoffRepo.create({
        tenantId,
        accountId,
        buyerId: msg.buyerId,
        buyerNick: msg.buyerNick,
        handedOff: true,
        handedOffAt: new Date(),
        triggerContent: msg.content,
      });
      await this.handoffRepo.save(record);
    }
  }

  /** 重置人工接管（controller 调用） */
  async resetHandoff(
    accountId: number,
    tenantId: number,
    buyerId: string,
  ): Promise<void> {
    await this.redis.clearHandoff(accountId, buyerId);
    await this.redis.clearChat(accountId, buyerId);
    await this.handoffRepo.update(
      { tenantId, accountId, buyerId },
      { handedOff: false },
    );
  }

  // ============ 配置读写 ============

  /** 获取账号配置，不存在则返回 null（不自动创建） */
  async getConfig(
    accountId: number,
    tenantId: number,
  ): Promise<ReplyConfigEntity | null> {
    return this.configRepo.findOne({ where: { accountId, tenantId } });
  }

  /** 获取配置并解密 API Key（controller 返回时脱敏） */
  async getConfigWithMaskedKey(
    accountId: number,
    tenantId: number,
  ): Promise<(Partial<ReplyConfigEntity> & { aiApiKeyConfigured: boolean }) | null> {
    const cfg = await this.getConfig(accountId, tenantId);
    if (!cfg) return null;
    const { aiApiKeyEncrypted, ...rest } = cfg;
    return {
      ...rest,
      aiApiKeyConfigured: !!aiApiKeyEncrypted,
    };
  }

  /** 创建或更新配置（加密 API Key） */
  async upsertConfig(
    accountId: number,
    tenantId: number,
    patch: Partial<ReplyConfigEntity> & { aiApiKey?: string },
  ): Promise<ReplyConfigEntity> {
    const { aiApiKey, ...rest } = patch;
    const encKey = this.config.get<string>('cookieEncryptionKey') || '';

    let cfg = await this.getConfig(accountId, tenantId);
    if (!cfg) {
      cfg = this.configRepo.create({
        tenantId,
        accountId,
        defaultReplyEnabled: false,
        aiEnabled: false,
        aiBaseUrl: 'https://api.openai.com/v1',
        aiModel: 'gpt-4o-mini',
        aiTemperature: 0.7,
        transferKeywords: '人工,客服',
        cooldownSeconds: 3,
      });
    }

    // 合并非 undefined 字段
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) {
        (cfg as any)[k] = v;
      }
    }
    // API Key 单独处理（只有显式传入才更新，避免覆盖已有 key）
    if (aiApiKey !== undefined && aiApiKey !== '') {
      cfg.aiApiKeyEncrypted = encrypt(aiApiKey, encKey);
    }

    return this.configRepo.save(cfg);
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

  // ============ 关键词 CRUD（controller 用） ============

  async listKeywords(tenantId: number): Promise<ReplyKeywordEntity[]> {
    return this.keywordRepo.find({
      where: { tenantId },
      order: { sortOrder: 'ASC', id: 'DESC' },
    });
  }

  async createKeyword(
    input: Partial<ReplyKeywordEntity> & { tenantId: number },
  ): Promise<ReplyKeywordEntity> {
    const entity = this.keywordRepo.create(input);
    return this.keywordRepo.save(entity);
  }

  async updateKeyword(
    id: number,
    tenantId: number,
    patch: Partial<ReplyKeywordEntity>,
  ): Promise<void> {
    await this.keywordRepo.update({ id, tenantId }, patch);
  }

  async deleteKeyword(id: number, tenantId: number): Promise<void> {
    await this.keywordRepo.delete({ id, tenantId });
  }

  // ============ 人工接管列表（controller 用） ============

  async listHandoffs(
    tenantId: number,
  ): Promise<ReplyHandoffEntity[]> {
    return this.handoffRepo.find({
      where: { tenantId, handedOff: true },
      order: { handedOffAt: 'DESC' },
    });
  }
}
