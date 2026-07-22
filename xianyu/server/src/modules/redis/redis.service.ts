import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

/** 单条对话记录（OpenAI messages 格式） */
export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Redis 服务。
 *
 * 当前用途：
 * 1. AI 回复的对话上下文窗口（最近 N 条，TTL 2h）
 * 2. 人工接管标记（命中转人工关键词后，停止自动回复直到重置）
 * 3. 回复冷却标记（同 buyerId 短时间内不重复回复）
 *
 * 全局单例，各业务模块注入即可。
 */
@Injectable()
export class RedisService implements OnModuleInit {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  /** 对话上下文最大保留条数（不含 system） */
  private static readonly HISTORY_MAX = 10;
  /** 对话上下文 TTL（2 小时） */
  private static readonly HISTORY_TTL = 2 * 60 * 60;
  /** 人工接管标记 TTL（24 小时后自动恢复自动回复） */
  private static readonly HANDOFF_TTL = 24 * 60 * 60;

  onModuleInit(): void {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    const password = process.env.REDIS_PASSWORD || undefined;
    const db = parseInt(process.env.REDIS_DB || '0', 10);

    this.client = new Redis({ host, port, password, db, lazyConnect: false });
    this.client.on('error', (err) =>
      this.logger.error(`Redis 连接异常: ${err.message}`),
    );
    this.client.on('connect', () => this.logger.log('Redis 已连接'));
  }

  // ============ AI 对话上下文 ============

  private historyKey(accountId: number, buyerId: string): string {
    return `reply:chat:${accountId}:${buyerId}`;
  }

  /** 读取对话历史（不含 system，system 由配置注入） */
  async getChatHistory(accountId: number, buyerId: string): Promise<ChatTurn[]> {
    const raw = await this.client.lrange(
      this.historyKey(accountId, buyerId),
      0,
      RedisService.HISTORY_MAX - 1,
    );
    return raw
      .map((s) => {
        try {
          return JSON.parse(s) as ChatTurn;
        } catch {
          return null;
        }
      })
      .filter((t): t is ChatTurn => t != null);
  }

  /** 追加一条对话并修剪窗口 + 续期 */
  async pushChat(
    accountId: number,
    buyerId: string,
    turn: ChatTurn,
  ): Promise<void> {
    const key = this.historyKey(accountId, buyerId);
    await this.client.rpush(key, JSON.stringify(turn));
    await this.client.ltrim(key, -RedisService.HISTORY_MAX, -1);
    await this.client.expire(key, RedisService.HISTORY_TTL);
  }

  /** 清空某买家对话上下文（重置会话时用） */
  async clearChat(accountId: number, buyerId: string): Promise<void> {
    await this.client.del(this.historyKey(accountId, buyerId));
  }

  // ============ 人工接管标记 ============

  private handoffKey(accountId: number, buyerId: string): string {
    return `reply:handoff:${accountId}:${buyerId}`;
  }

  async isHandedOff(accountId: number, buyerId: string): Promise<boolean> {
    const v = await this.client.get(this.handoffKey(accountId, buyerId));
    return v === '1';
  }

  /** 标记转人工（停止自动回复），24h 后自动恢复 */
  async markHandoff(accountId: number, buyerId: string): Promise<void> {
    await this.client.set(
      this.handoffKey(accountId, buyerId),
      '1',
      'EX',
      RedisService.HANDOFF_TTL,
    );
  }

  /** 重置人工接管（恢复自动回复） */
  async clearHandoff(accountId: number, buyerId: string): Promise<void> {
    await this.client.del(this.handoffKey(accountId, buyerId));
  }

  // ============ 回复冷却 ============

  private cooldownKey(accountId: number, buyerId: string): string {
    return `reply:cooldown:${accountId}:${buyerId}`;
  }

  /**
   * 检查并设置冷却。
   * @returns true 表示可回复（已设置冷却），false 表示冷却中（跳过）
   */
  async checkAndSetCooldown(
    accountId: number,
    buyerId: string,
    cooldownSeconds: number,
  ): Promise<boolean> {
    if (cooldownSeconds <= 0) return true;
    const key = this.cooldownKey(accountId, buyerId);
    // SET NX：只有不存在时才设置成功
    const ok = await this.client.set(key, '1', 'EX', cooldownSeconds, 'NX');
    return ok === 'OK';
  }

  // ============ 原始客户端（兜底） ============

  getClient(): Redis {
    return this.client;
  }
}
