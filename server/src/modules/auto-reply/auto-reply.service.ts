import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ReplyKeywordEntity,
  ReplyConfigEntity,
  ReplyHandoffEntity,
} from './entities/reply.entities';
import { ChatMessageEvent, ReplyResult } from './types';
import { ImWebSocketService } from '../../goofish/im-websocket.service';
import { AccountsService } from '../accounts/accounts.service';
import { RedisService, ChatTurn } from '../redis/redis.service';
import { encrypt } from '../../common/utils/crypto.util';
import { globalRiskGuard, sleep, randomInt } from '../../common/utils/risk-control.util';
import { AiService } from '../ai/ai.service';

/**
 * 自动回复引擎。
 *
 * 优先级：转人工 > 冷却 > 商品专属关键词 > 通用关键词 > AI议价 > AI普通 > 默认回复
 * 风控：账号级串行 + 随机延迟 + 冷却
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
    private readonly config: ConfigService,
    private readonly imWs: ImWebSocketService,
    private readonly accountsService: AccountsService,
    private readonly redis: RedisService,
    private readonly ai: AiService,
  ) {}

  async handle(
    accountId: number,
    tenantId: number,
    msg: ChatMessageEvent,
    cookie: string,
  ): Promise<ReplyResult> {
    try {
      const cfg = await this.getConfig(accountId, tenantId);
      if (!cfg) {
        return { replied: false, source: 'none' };
      }

      // 1. 转人工
      if (this.hitTransferKeyword(msg.content, cfg.transferKeywords)) {
        await this.redis.markHandoff(accountId, msg.buyerId);
        await this.recordHandoff(accountId, tenantId, msg);
        this.logger.log(
          `[账号${accountId}] 买家 ${msg.buyerId} 触发转人工，停止自动回复`,
        );
        return { replied: false, source: 'handoff', handedOff: true };
      }

      // 2. 已转人工
      if (await this.redis.isHandedOff(accountId, msg.buyerId)) {
        return { replied: false, source: 'handoff' };
      }

      // 3. 冷却
      const canReply = await this.redis.checkAndSetCooldown(
        accountId,
        msg.buyerId,
        cfg.cooldownSeconds,
      );
      if (!canReply) {
        return { replied: false, source: 'cooldown' };
      }

      // 4. 关键词（商品专属优先）
      const keywordReply = await this.matchKeyword(
        tenantId,
        accountId,
        msg.content,
        msg.itemId,
      );
      if (keywordReply) {
        await this.sendReply(accountId, cookie, msg, keywordReply);
        return { replied: true, source: 'keyword', content: keywordReply };
      }

      const aiReady =
        cfg.aiEnabled &&
        (await this.ai.isReady(tenantId, {
          baseUrl: cfg.aiBaseUrl,
          apiKeyEncrypted: cfg.aiApiKeyEncrypted,
          model: cfg.aiModel,
          temperature: cfg.aiTemperature,
        }));

      // 5. AI 议价（命中议价词且开启）
      if (
        aiReady &&
        cfg.aiBargainEnabled &&
        this.hitBargainKeyword(msg.content, cfg.bargainKeywords)
      ) {
        const bargainReply = await this.callAiBargain(
          accountId,
          tenantId,
          cfg,
          msg,
        );
        if (bargainReply) {
          await this.sendReply(accountId, cookie, msg, bargainReply);
          return { replied: true, source: 'ai', content: bargainReply };
        }
      }

      // 6. 普通 AI
      if (aiReady) {
        const aiReply = await this.callAi(accountId, tenantId, cfg, msg);
        if (aiReply) {
          await this.sendReply(accountId, cookie, msg, aiReply);
          return { replied: true, source: 'ai', content: aiReply };
        }
      }

      // 7. 默认回复
      if (cfg.defaultReplyEnabled && cfg.defaultReplyContent) {
        await this.sendReply(accountId, cookie, msg, cfg.defaultReplyContent);
        return {
          replied: true,
          source: 'default',
          content: cfg.defaultReplyContent,
        };
      }

      return { replied: false, source: 'none' };
    } catch (err) {
      this.logger.error(
        `[账号${accountId}] 自动回复异常: ${(err as Error).message}`,
      );
      return { replied: false, source: 'none' };
    }
  }

  /**
   * 关键词匹配：
   * - 先匹配商品专属规则（itemId 相同）
   * - 再匹配无 itemId 的通用规则
   * - 精确优先于包含
   */
  private async matchKeyword(
    tenantId: number,
    accountId: number,
    content: string,
    itemId?: string,
  ): Promise<string | null> {
    const rules = await this.keywordRepo.find({
      where: [
        { tenantId, accountId, enabled: true },
        { tenantId, accountId: null as any, enabled: true },
      ],
      order: { sortOrder: 'ASC', id: 'ASC' },
    });

    const text = content.trim();
    const pick = (list: ReplyKeywordEntity[]): string | null => {
      const exact = list.find(
        (r) => r.matchType === 'exact' && r.keyword === text,
      );
      if (exact) return exact.replyContent;
      const contains = list.find(
        (r) => r.matchType === 'contains' && content.includes(r.keyword),
      );
      if (contains) return contains.replyContent;
      return null;
    };

    if (itemId) {
      const itemRules = rules.filter((r) => r.itemId && r.itemId === itemId);
      const hit = pick(itemRules);
      if (hit) return hit;
    }

    // 通用：无 itemId 绑定
    const general = rules.filter((r) => !r.itemId);
    return pick(general);
  }

  private hitBargainKeyword(content: string, keywords: string): boolean {
    if (!keywords) return false;
    const words = keywords
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return words.some((w) => content.includes(w));
  }

  private async getBargainCount(
    accountId: number,
    buyerId: string,
  ): Promise<number> {
    const history = await this.redis.getChatHistory(accountId, buyerId);
    // 粗略：用户消息中带议价意图的次数
    return history.filter(
      (h) =>
        h.role === 'user' &&
        /便宜|刀|优惠|少点|砍价|议价|降价|能少|再少/.test(h.content),
    ).length;
  }

  private async callAiBargain(
    accountId: number,
    tenantId: number,
    cfg: ReplyConfigEntity,
    msg: ChatMessageEvent,
  ): Promise<string | null> {
    const bargainCount = await this.getBargainCount(accountId, msg.buyerId);
    if (bargainCount >= (cfg.maxBargainRounds || 3)) {
      return '亲，已经给到最大优惠啦，实在没法再少了，质量和服务都有保障，考虑下下单吧～';
    }

    const bargainSystem = `你是一位经验丰富的闲鱼销售，擅长礼貌议价。
议价策略：
1. 根据议价次数递减优惠：第1次小幅优惠，第2次中等优惠，第3次接近底线
2. 接近最大轮数时坚持底线，强调商品价值，不要无限让价
3. 回复简洁友好，100字以内，不要使用markdown

议价设置：
- 当前议价次数：${bargainCount + 1}
- 最大议价轮数：${cfg.maxBargainRounds || 3}
- 最大优惠百分比：${cfg.maxDiscountPercent || 10}%
- 最大优惠金额：${cfg.maxDiscountAmount || 100}元
- 商品ID：${msg.itemId || '未知'}

请结合对话历史给出合适回复。`;

    const patched = {
      ...cfg,
      aiSystemPrompt: bargainSystem,
      aiTemperature: Math.min(cfg.aiTemperature ?? 0.7, 0.8),
    };
    return this.callAi(accountId, tenantId, patched, msg);
  }

  private async callAi(
    accountId: number,
    tenantId: number,
    cfg: ReplyConfigEntity,
    msg: ChatMessageEvent,
  ): Promise<string | null> {
    try {
      const systemPrompt =
        cfg.aiSystemPrompt ||
        '你是一个友善的闲鱼客服助手，负责回答买家关于虚拟商品的咨询。回答要简洁、有礼貌，尽量在 100 字以内。';
      const history = await this.redis.getChatHistory(accountId, msg.buyerId);

      const messages: ChatTurn[] = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: msg.content },
      ];

      const reply = await this.ai.chatCompletion(tenantId, messages, {
        temperature: cfg.aiTemperature ?? 0.7,
        maxTokens: 300,
        timeoutMs: 30_000,
        accountFallback: {
          baseUrl: cfg.aiBaseUrl,
          apiKeyEncrypted: cfg.aiApiKeyEncrypted,
          model: cfg.aiModel,
          temperature: cfg.aiTemperature,
        },
      });

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

  async testAi(
    baseUrl: string,
    apiKey: string,
    model: string,
  ): Promise<{ ok: boolean; reply?: string; error?: string }> {
    return this.ai.testConnection(baseUrl, apiKey, model);
  }

  private async sendReply(
    accountId: number,
    cookie: string,
    msg: ChatMessageEvent,
    text: string,
  ): Promise<void> {
    // 模拟人工打字延迟
    await sleep(randomInt(500, 1500));
    await globalRiskGuard.withAccountLock(accountId, async () => {
      await this.imWs.sendTextMessage({
        cookie,
        accountKey: String(accountId),
        toUserId: msg.buyerId,
        text,
        conversationId: msg.conversationId,
        itemId: msg.itemId,
        onCookieUpdate: async (newCookie) => {
          await this.accountsService.updateCookieIfChanged(accountId, newCookie);
        },
      });
    });
    this.logger.log(
      `[账号${accountId}] 自动回复买家 ${msg.buyerId}: ${text.slice(0, 40)}`,
    );
  }

  private hitTransferKeyword(content: string, transferKeywords: string): boolean {
    if (!transferKeywords) return false;
    const words = transferKeywords
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return words.some((w) => content.includes(w));
  }

  private async recordHandoff(
    accountId: number,
    tenantId: number,
    msg: ChatMessageEvent,
  ): Promise<void> {
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

  async getConfig(
    accountId: number,
    tenantId: number,
  ): Promise<ReplyConfigEntity | null> {
    return this.configRepo.findOne({ where: { accountId, tenantId } });
  }

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
        aiBargainEnabled: false,
        maxDiscountPercent: 10,
        maxDiscountAmount: 100,
        maxBargainRounds: 3,
        bargainKeywords: '便宜,刀,优惠,少点,砍价,议价',
        transferKeywords: '人工,客服',
        cooldownSeconds: 3,
      });
    }

    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) {
        (cfg as any)[k] = v;
      }
    }
    if (aiApiKey !== undefined && aiApiKey !== '') {
      cfg.aiApiKeyEncrypted = encrypt(aiApiKey, encKey);
    }

    return this.configRepo.save(cfg);
  }

  async listKeywords(tenantId: number): Promise<ReplyKeywordEntity[]> {
    return this.keywordRepo.find({
      where: { tenantId },
      order: { sortOrder: 'ASC', id: 'DESC' },
    });
  }

  /** 导出关键词 CSV */
  async exportKeywordsCsv(tenantId: number): Promise<string> {
    const list = await this.listKeywords(tenantId);
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const headers = [
      'keyword',
      'matchType',
      'replyContent',
      'itemId',
      'accountId',
      'enabled',
      'sortOrder',
    ];
    const lines = [headers.join(',')];
    for (const k of list) {
      lines.push(
        [
          k.keyword,
          k.matchType,
          k.replyContent,
          k.itemId ?? '',
          k.accountId ?? '',
          k.enabled ? '1' : '0',
          k.sortOrder ?? 0,
        ]
          .map(escape)
          .join(','),
      );
    }
    return '\uFEFF' + lines.join('\n');
  }

  /** 从 CSV/文本批量导入关键词（每行: keyword,matchType,replyContent[,itemId]） */
  async importKeywordsCsv(
    tenantId: number,
    text: string,
    accountId?: number | null,
  ): Promise<{ imported: number; skipped: number }> {
    const lines = text
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return { imported: 0, skipped: 0 };

    let start = 0;
    if (/keyword/i.test(lines[0]) && /reply/i.test(lines[0])) {
      start = 1;
    }

    let imported = 0;
    let skipped = 0;
    for (let i = start; i < lines.length; i++) {
      const cols = this.parseCsvLine(lines[i]);
      const keyword = (cols[0] || '').trim();
      const matchType = ((cols[1] || 'contains').trim() || 'contains') as string;
      const replyContent = (cols[2] || '').trim();
      const itemId = (cols[3] || '').trim() || null;
      if (!keyword || !replyContent) {
        skipped++;
        continue;
      }
      if (matchType !== 'exact' && matchType !== 'contains') {
        skipped++;
        continue;
      }
      await this.createKeyword({
        tenantId,
        accountId: accountId ?? null,
        keyword,
        matchType,
        replyContent,
        itemId,
        enabled: true,
        sortOrder: 0,
      });
      imported++;
    }
    return { imported, skipped };
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    result.push(cur);
    return result;
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

  async listHandoffs(tenantId: number): Promise<ReplyHandoffEntity[]> {
    return this.handoffRepo.find({
      where: { tenantId, handedOff: true },
      order: { handedOffAt: 'DESC' },
    });
  }
}
