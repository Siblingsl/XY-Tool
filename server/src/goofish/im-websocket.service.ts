import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import WebSocket from 'ws';
import {
  generateDeviceId,
  generateMid,
  parseCookies,
} from './goofish-cookie.util';
import {
  extractInnerMessages,
  extractMessageId,
  parseChatMessage,
  parsePushFromSdkBody,
  PaymentMessageEvent,
  RefundMessageEvent,
  ChatMessageEvent,
  tryParsePaymentEvent,
  tryParseRefundEvent,
  tryParseChatMessage,
} from './goofish-ws-message.util';
import { GoofishMtopService } from './goofish-mtop.service';
import { GoofishSdkService } from './goofish-sdk.service';
import { isGoofishSessionExpired } from './goofish-error.util';

interface PendingMid {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export interface ImListenerOptions {
  accountKey: string;
  cookie: string;
  onCookieUpdate?: (cookie: string) => Promise<void>;
  onPaymentMessage?: (event: PaymentMessageEvent) => Promise<void>;
  /** 退款消息回调（买家申请退款 / 退款成功） */
  onRefundMessage?: (event: RefundMessageEvent) => Promise<void>;
  /** 普通聊天消息回调（用于自动回复：关键词/默认/AI） */
  onChatMessage?: (event: ChatMessageEvent) => Promise<void>;
  /** Cookie 会话失效时回调（应 markExpired + 停止监听） */
  onAuthError?: (error: unknown) => Promise<void>;
}

export interface SendImTextInput {
  cookie: string;
  accountKey: string;
  toUserId: string;
  text: string;
  conversationId?: string | null;
  itemId?: string;
  onCookieUpdate?: (cookie: string) => Promise<void>;
}

interface AccountImConnection {
  accountKey: string;
  cookie: string;
  myUserId: string;
  deviceId: string;
  accessToken: string;
  ws: WebSocket | null;
  connecting: Promise<void> | null;
  heartbeatTimer: NodeJS.Timeout | null;
  tokenRefreshTimer: NodeJS.Timeout | null;
  reconnectTimer: NodeJS.Timeout | null;
  pendingMid: Map<string, PendingMid>;
  listenerMode: boolean;
  onCookieUpdate?: (cookie: string) => Promise<void>;
  onPaymentMessage?: (event: PaymentMessageEvent) => Promise<void>;
  onRefundMessage?: (event: RefundMessageEvent) => Promise<void>;
  onChatMessage?: (event: ChatMessageEvent) => Promise<void>;
  onAuthError?: (error: unknown) => Promise<void>;
  processedMessageIds: Map<string, number>;
  stopped: boolean;
}

const MESSAGE_DEDUP_TTL_MS = 60 * 60 * 1000;
const RECONNECT_DELAY_MS = 5000;
const TOKEN_REFRESH_MS = 10 * 60 * 1000;

@Injectable()
export class ImWebSocketService implements OnModuleDestroy {
  private readonly logger = new Logger(ImWebSocketService.name);
  private readonly connections = new Map<string, AccountImConnection>();

  constructor(
    private readonly mtop: GoofishMtopService,
    private readonly sdkService: GoofishSdkService,
  ) {}

  onModuleDestroy(): void {
    for (const conn of this.connections.values()) {
      conn.stopped = true;
      this.closeConnection(conn);
    }
    this.connections.clear();
  }

  /** 启动常驻 WS 监听（付款消息） */
  async startPaymentListener(options: ImListenerOptions): Promise<void> {
    const key = options.accountKey;
    this.stopPaymentListener(key);

    const cookies = parseCookies(options.cookie);
    if (!cookies.unb) {
      throw new Error(`[${key}] Cookie 缺少 unb，无法启动 WS 监听`);
    }

    const conn: AccountImConnection = {
      accountKey: key,
      cookie: options.cookie,
      myUserId: cookies.unb,
      deviceId: generateDeviceId(cookies.unb),
      accessToken: '',
      ws: null,
      connecting: null,
      heartbeatTimer: null,
      tokenRefreshTimer: null,
      reconnectTimer: null,
      pendingMid: new Map(),
      listenerMode: true,
      onCookieUpdate: options.onCookieUpdate,
      onPaymentMessage: options.onPaymentMessage,
      onRefundMessage: options.onRefundMessage,
      onChatMessage: options.onChatMessage,
      onAuthError: options.onAuthError,
      processedMessageIds: new Map(),
      stopped: false,
    };

    this.connections.set(key, conn);
    await this.connectConnection(conn);
    this.logger.log(`[${key}] WS 付款监听已启动`);
  }

  stopPaymentListener(accountKey: string): void {
    const conn = this.connections.get(accountKey);
    if (!conn) return;
    const wasLive = conn.ws?.readyState === WebSocket.OPEN;
    conn.stopped = true;
    this.closeConnection(conn);
    this.connections.delete(accountKey);
    if (wasLive) {
      this.logger.log(`[${accountKey}] WS 付款监听已停止`);
    }
  }

  isListenerActive(accountKey: string): boolean {
    const conn = this.connections.get(accountKey);
    return !!conn?.listenerMode && conn.ws?.readyState === WebSocket.OPEN;
  }

  async sendTextMessage(input: SendImTextInput): Promise<{ messageId: string }> {
    const conn = await this.ensureSendConnected(input);
    let cid = input.conversationId?.trim() || '';

    if (!cid && input.itemId && input.toUserId) {
      cid = await this.createChatConversation(conn, input.toUserId, input.itemId);
    }

    if (!cid) {
      throw new Error('缺少 conversationId，且无法通过 itemId 创建会话');
    }

    const msg = this.sdkService.module.buildSendMessage({
      cid,
      toUserId: input.toUserId,
      myUserId: conn.myUserId,
      text: input.text,
    });
    const mid = String((msg.headers as { mid?: string })?.mid ?? '');

    await this.sendJson(conn, msg);
    this.logger.log(
      `[${input.accountKey}] IM 消息已发送 cid=${cid} to=${input.toUserId}`,
    );
    return { messageId: mid };
  }

  private async ensureSendConnected(input: SendImTextInput): Promise<AccountImConnection> {
    const key = input.accountKey;
    let conn = this.connections.get(key);

    if (
      conn &&
      conn.ws?.readyState === WebSocket.OPEN &&
      conn.cookie === input.cookie
    ) {
      return conn;
    }

    if (conn?.listenerMode) {
      if (input.cookie !== conn.cookie) {
        conn.cookie = input.cookie;
      }
      if (conn.ws?.readyState === WebSocket.OPEN) return conn;
      await this.connectConnection(conn);
      return conn;
    }

    if (conn) {
      this.closeConnection(conn);
      this.connections.delete(key);
    }

    const cookies = parseCookies(input.cookie);
    if (!cookies.unb) {
      throw new Error('Cookie 缺少 unb 字段，请使用 PC 端 goofish.com 登录 Cookie');
    }

    const { token, cookie: updatedCookie } = await this.mtop.getImAccessToken(
      input.cookie,
    );
    if (input.onCookieUpdate && updatedCookie !== input.cookie) {
      await input.onCookieUpdate(updatedCookie);
    }

    conn = {
      accountKey: key,
      cookie: updatedCookie,
      myUserId: cookies.unb,
      deviceId: generateDeviceId(cookies.unb),
      accessToken: token,
      ws: null,
      connecting: null,
      heartbeatTimer: null,
      tokenRefreshTimer: null,
      reconnectTimer: null,
      pendingMid: new Map(),
      listenerMode: false,
      onCookieUpdate: input.onCookieUpdate,
      processedMessageIds: new Map(),
      stopped: false,
    };

    this.connections.set(key, conn);
    await this.connectConnection(conn);
    return conn;
  }

  private async connectConnection(conn: AccountImConnection): Promise<void> {
    if (conn.connecting) {
      await conn.connecting;
      return;
    }

    try {
      const { token, cookie } = await this.mtop.getImAccessToken(conn.cookie);
      conn.accessToken = token;
      conn.cookie = cookie;
      if (conn.onCookieUpdate) {
        await conn.onCookieUpdate(cookie);
      }

      conn.connecting = this.openWebSocket(conn);
      await conn.connecting;
      conn.connecting = null;

      this.startTokenRefresh(conn);
    } catch (e) {
      conn.connecting = null;
      if (await this.failOnAuthError(conn, e)) return;
      throw e;
    }
  }

  /** Session 失效：停止重连并通知上层 */
  private async failOnAuthError(
    conn: AccountImConnection,
    error: unknown,
  ): Promise<boolean> {
    if (!isGoofishSessionExpired(error)) return false;

    conn.stopped = true;
    if (conn.reconnectTimer) {
      clearTimeout(conn.reconnectTimer);
      conn.reconnectTimer = null;
    }

    this.logger.warn(
      `[${conn.accountKey}] Cookie 会话失效，停止 WS: ${(error as Error).message}`,
    );

    if (conn.onAuthError) {
      await conn.onAuthError(error);
    }

    this.closeConnection(conn);
    this.connections.delete(conn.accountKey);
    return true;
  }

  private scheduleReconnect(conn: AccountImConnection): void {
    if (!conn.listenerMode || conn.stopped || conn.reconnectTimer) return;
    conn.reconnectTimer = setTimeout(() => {
      conn.reconnectTimer = null;
      if (conn.stopped) return;
      this.logger.warn(`[${conn.accountKey}] WS 断线，${RECONNECT_DELAY_MS / 1000}s 后重连...`);
      void this.connectConnection(conn).catch(async (err) => {
        if (await this.failOnAuthError(conn, err)) return;
        this.logger.error(
          `[${conn.accountKey}] WS 重连失败: ${(err as Error).message}`,
        );
        this.scheduleReconnect(conn);
      });
    }, RECONNECT_DELAY_MS);
  }

  private startTokenRefresh(conn: AccountImConnection): void {
    if (conn.tokenRefreshTimer) clearInterval(conn.tokenRefreshTimer);
    if (!conn.listenerMode) return;

    conn.tokenRefreshTimer = setInterval(() => {
      void (async () => {
        try {
          const updated = await this.mtop.refreshLogin(conn.cookie);
          conn.cookie = updated;
          if (conn.onCookieUpdate) await conn.onCookieUpdate(updated);
          this.logger.debug(`[${conn.accountKey}] 登录态已刷新`);
        } catch (e) {
          if (await this.failOnAuthError(conn, e)) return;
          this.logger.warn(
            `[${conn.accountKey}] 登录态刷新失败: ${(e as Error).message}`,
          );
        }
      })();
    }, TOKEN_REFRESH_MS);
  }

  private async openWebSocket(conn: AccountImConnection): Promise<void> {
    return new Promise((resolve, reject) => {
      if (conn.ws) {
        try {
          conn.ws.close();
        } catch {
          /* ignore */
        }
        conn.ws = null;
      }

      const ws = new WebSocket(this.sdkService.module.WS_URL, {
        headers: {
          Cookie: conn.cookie,
          Host: 'wss-goofish.dingtalk.com',
          Origin: 'https://www.goofish.com',
          'User-Agent': this.sdkService.module.UA,
        },
      });

      conn.ws = ws;

      ws.on('open', async () => {
        try {
          await this.sendReg(conn);
          await this.sendSyncAck(conn);
          this.startHeartbeat(conn);
          resolve();
        } catch (e) {
          reject(e as Error);
        }
      });

      ws.on('message', (raw) => {
        void this.handleIncoming(conn, raw.toString());
      });

      ws.on('error', (err) => {
        this.logger.error(`[${conn.accountKey}] WS 错误: ${err.message}`);
        if (conn.connecting) reject(err);
      });

      ws.on('close', () => {
        this.logger.warn(`[${conn.accountKey}] WS 已断开`);
        this.stopHeartbeat(conn);
        if (conn.listenerMode && !conn.stopped) {
          this.scheduleReconnect(conn);
        }
      });
    });
  }

  private async handleIncoming(conn: AccountImConnection, raw: string): Promise<void> {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    await this.sendAck(conn, message);

    const headers = (message.headers as Record<string, unknown>) || {};
    const mid = headers.mid ? String(headers.mid) : '';
    if (mid && conn.pendingMid.has(mid)) {
      const pending = conn.pendingMid.get(mid)!;
      clearTimeout(pending.timer);
      conn.pendingMid.delete(mid);
      pending.resolve(message);
    }

    if (!conn.listenerMode || !conn.onPaymentMessage) return;

    try {
      const body = message.body as Record<string, unknown> | undefined;
      if (body) {
        const sdkParsed = parsePushFromSdkBody(body);
        if (sdkParsed) {
          await this.processParsedChatMessage(conn, sdkParsed);
        }
      }

      const inners = extractInnerMessages(message);
      for (const inner of inners) {
        await this.processPaymentInnerMessage(conn, inner);
      }
    } catch (e) {
      this.logger.debug(
        `[${conn.accountKey}] 消息处理异常: ${(e as Error).message}`,
      );
    }
  }

  private async processPaymentInnerMessage(
    conn: AccountImConnection,
    inner: Record<string, unknown>,
  ): Promise<void> {
    const parsed = parseChatMessage(inner);
    if (parsed) {
      await this.processParsedChatMessage(conn, parsed);
    }
  }

  private async processParsedChatMessage(
    conn: AccountImConnection,
    parsed: import('./goofish-ws-message.util').ParsedImChatMessage,
  ): Promise<void> {
    const msgId = extractMessageId(parsed.rawMessage);
    this.pruneMessageDedup(conn);
    if (conn.processedMessageIds.has(msgId)) return;
    conn.processedMessageIds.set(msgId, Date.now());

    // 1. 付款消息
    const payEvent = tryParsePaymentEvent(parsed, conn.myUserId);
    if (payEvent) {
      this.logger.log(
        `[${conn.accountKey}] 检测到付款消息: order=${payEvent.bizOrderId} item=${payEvent.itemId} buyer=${payEvent.buyerId}`,
      );
      if (conn.onPaymentMessage) {
        await conn.onPaymentMessage(payEvent);
      }
      return;
    }

    // 2. 退款消息（被动感知，不主动处置）
    if (conn.onRefundMessage) {
      const refundEvent = tryParseRefundEvent(parsed, conn.myUserId);
      if (refundEvent) {
        this.logger.log(
          `[${conn.accountKey}] 检测到退款消息: order=${refundEvent.bizOrderId} done=${refundEvent.done} content=${refundEvent.content}`,
        );
        await conn.onRefundMessage(refundEvent);
        return;
      }
    }

    // 3. 普通聊天消息（自动回复：关键词/默认/AI）
    if (conn.onChatMessage) {
      const chatEvent = tryParseChatMessage(parsed, conn.myUserId);
      if (chatEvent) {
        this.logger.debug(
          `[${conn.accountKey}] 收到聊天消息: buyer=${chatEvent.buyerId} content=${chatEvent.content.slice(0, 30)}`,
        );
        await conn.onChatMessage(chatEvent);
      }
    }
  }

  private pruneMessageDedup(conn: AccountImConnection): void {
    const now = Date.now();
    for (const [id, ts] of conn.processedMessageIds) {
      if (now - ts > MESSAGE_DEDUP_TTL_MS) {
        conn.processedMessageIds.delete(id);
      }
    }
  }

  private async sendReg(conn: AccountImConnection): Promise<void> {
    const msg = this.sdkService.module.buildWsReg(
      conn.accessToken,
      conn.deviceId,
    );
    await this.sendJson(conn, msg);
  }

  private async sendSyncAck(conn: AccountImConnection): Promise<void> {
    const msg = this.sdkService.module.buildSyncAck();
    await this.sendJson(conn, msg);
  }

  private startHeartbeat(conn: AccountImConnection): void {
    this.stopHeartbeat(conn);
    conn.heartbeatTimer = setInterval(() => {
      if (conn.ws?.readyState === WebSocket.OPEN) {
        const msg = this.sdkService.module.buildWsHeartbeat();
        void this.sendJson(conn, msg).catch(() => undefined);
      }
    }, 15000);
  }

  private stopHeartbeat(conn: AccountImConnection): void {
    if (conn.heartbeatTimer) {
      clearInterval(conn.heartbeatTimer);
      conn.heartbeatTimer = null;
    }
  }

  private async sendAck(
    conn: AccountImConnection,
    incoming: Record<string, unknown>,
  ): Promise<void> {
    const ack = this.sdkService.module.buildWsAck(
      incoming as { headers?: Record<string, unknown> },
    );
    try {
      await this.sendJson(conn, ack);
    } catch {
      /* 连接已关闭时忽略 ACK 失败 */
    }
  }

  private async createChatConversation(
    conn: AccountImConnection,
    toUserId: string,
    itemId: string,
  ): Promise<string> {
    const mid = generateMid();
    const msg = {
      lwp: '/r/SingleChatConversation/create',
      headers: { mid },
      body: [
        {
          pairFirst: `${toUserId}@goofish`,
          pairSecond: `${conn.myUserId}@goofish`,
          bizType: '1',
          extension: { itemId: String(itemId) },
          ctx: { appVersion: '1.0', platform: 'web' },
        },
      ],
    };

    const response = await this.requestWithMid(conn, mid, msg, 15000);
    const cid = this.extractCidFromCreateResponse(response);
    if (!cid) {
      throw new Error('创建 IM 会话失败：响应中无 cid');
    }
    return cid;
  }

  private extractCidFromCreateResponse(response: unknown): string | null {
    if (!response || typeof response !== 'object') return null;
    const body = (response as Record<string, unknown>).body;
    const candidates: unknown[] = Array.isArray(body) ? body : [body];

    for (const item of candidates) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      const paths = [
        obj.cid,
        (obj.singleChatConversation as Record<string, unknown>)?.cid,
        (
          (obj.singleChatUserConversation as Record<string, unknown>)
            ?.singleChatConversation as Record<string, unknown>
        )?.cid,
        ((obj.data as Record<string, unknown>)?.singleChatConversation as Record<string, unknown>)
          ?.cid,
      ];
      for (const p of paths) {
        if (p) {
          const s = String(p);
          return s.includes('@') ? s.split('@')[0] : s;
        }
      }
    }
    return null;
  }

  private requestWithMid(
    conn: AccountImConnection,
    mid: string,
    msg: unknown,
    timeoutMs: number,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        conn.pendingMid.delete(mid);
        reject(new Error(`WS 请求超时 mid=${mid}`));
      }, timeoutMs);

      conn.pendingMid.set(mid, { resolve, reject, timer });

      void this.sendJson(conn, msg).catch((err) => {
        clearTimeout(timer);
        conn.pendingMid.delete(mid);
        reject(err);
      });
    });
  }

  private async sendJson(conn: AccountImConnection, msg: unknown): Promise<void> {
    if (!conn.ws || conn.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket 未连接');
    }
    conn.ws.send(JSON.stringify(msg));
  }

  private closeConnection(conn: AccountImConnection): void {
    if (conn.reconnectTimer) {
      clearTimeout(conn.reconnectTimer);
      conn.reconnectTimer = null;
    }
    if (conn.tokenRefreshTimer) {
      clearInterval(conn.tokenRefreshTimer);
      conn.tokenRefreshTimer = null;
    }
    this.stopHeartbeat(conn);
    for (const [, pending] of conn.pendingMid) {
      clearTimeout(pending.timer);
      pending.reject(new Error('连接已关闭'));
    }
    conn.pendingMid.clear();
    if (conn.ws) {
      try {
        conn.ws.close();
      } catch {
        /* ignore */
      }
      conn.ws = null;
    }
  }
}
