import { decryptGoofishMessage, decryptGoofishObject } from './goofish-crypto.util';
import { loadGoofishSdk } from './goofish-sdk.loader';

/** 付款后待发货的系统消息（参考 xianyu-auto-reply / super-butler） */
export const PAID_ORDER_MESSAGES = new Set([
  '[我已付款，等待你发货]',
  '[买家已付款]',
  '[付款完成]',
  '[已付款，待发货]',
  '[记得及时发货]',
  '我已付款，等待你发货',
  '已付款，待发货',
  '买家已付款',
]);

/** 宽松命中：content 包含任一关键字即视为付款触发 */
export function isPaidOrderMessage(content: string): boolean {
  if (!content) return false;
  if (PAID_ORDER_MESSAGES.has(content)) return true;
  for (const k of PAID_ORDER_MESSAGES) {
    if (content.includes(k.replace(/^\[|\]$/g, '')) || content.includes(k)) {
      return true;
    }
  }
  // 兜底语义
  if (content.includes('已付款') && (content.includes('发货') || content.includes('待发货'))) {
    return true;
  }
  return false;
}

/**
 * 退款相关系统消息（xianyu-auto-reply 同款模板）。
 * 用于被动感知退款事件：买家申请退款 / 卖家同意 / 退款成功。
 * 仅识别 + 记录状态，无法主动处置退款（闲鱼无开放 API）。
 */
export const REFUND_MESSAGES = new Set([
  '[买家申请退款]',
  '[卖家同意退款]',
  '[退款成功，钱款已原路退返]',
  '[退款成功，钱款已原路退回]',
]);

/** 退款成功的终态消息（触发 REFUNDED） */
export const REFUND_DONE_MESSAGES = new Set([
  '[退款成功，钱款已原路退返]',
  '[退款成功，钱款已原路退回]',
]);

export interface ParsedImChatMessage {
  sendUserId: string;
  sendUserName: string;
  content: string;
  conversationId: string;
  itemId: string;
  rawMessage: Record<string, unknown>;
}

export interface PaymentMessageEvent {
  bizOrderId: string;
  buyerId: string;
  buyerNick?: string;
  itemId: string;
  conversationId: string;
  content: string;
  rawMessage: Record<string, unknown>;
}

/**
 * 退款事件。done=true 表示退款已成功（REFUNDED），
 * false 表示退款流程进行中（REFUNDING）。
 */
export interface RefundMessageEvent {
  bizOrderId: string;
  buyerId: string;
  buyerNick?: string;
  itemId: string;
  conversationId: string;
  content: string;
  done: boolean;
  rawMessage: Record<string, unknown>;
}

/**
 * 普通聊天消息事件（买家发来的非付款/非退款消息）。
 * 用于自动回复：关键词匹配 / 默认回复 / AI 回复。
 */
export interface ChatMessageEvent {
  /** 买家用户ID（发送者） */
  buyerId: string;
  /** 买家昵称 */
  buyerNick?: string;
  /** 消息文本内容 */
  content: string;
  /** IM 会话ID（cid，用于回复） */
  conversationId: string;
  /** 商品ID（可能为空） */
  itemId?: string;
}

export function isSyncPackage(msg: Record<string, unknown>): boolean {
  const body = msg.body as Record<string, unknown> | undefined;
  if (!body?.syncPushPackage) return false;
  const pkg = body.syncPushPackage as Record<string, unknown>;
  return Array.isArray(pkg.data) && pkg.data.length > 0;
}

export function decryptSyncData(
  syncData: Record<string, unknown>,
): Record<string, unknown> | null {
  const raw = syncData.data;
  if (raw == null) return null;

  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }

  const str = String(raw);
  try {
    const decoded = Buffer.from(str, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    if (parsed.chatType != null) return null;
    return parsed;
  } catch {
    try {
      const decrypted = decryptGoofishMessage(str);
      return JSON.parse(decrypted) as Record<string, unknown>;
    } catch {
      try {
        return decryptGoofishObject(str);
      } catch {
        return null;
      }
    }
  }
}

/** 使用 goofish-sdk parseWsPushMessage 快速解析推送 */
export function parsePushFromSdkBody(
  wsBody: unknown,
): ParsedImChatMessage | null {
  const parsed = loadGoofishSdk().parseWsPushMessage(wsBody);
  if (!parsed?.content) return null;
  return {
    sendUserId: parsed.senderUserId,
    sendUserName: parsed.senderUserName,
    content: parsed.content,
    conversationId: parsed.cid,
    itemId: '',
    rawMessage: (parsed.raw as Record<string, unknown>) || {},
  };
}

export function extractInnerMessages(
  wsMessage: Record<string, unknown>,
): Record<string, unknown>[] {
  if (isSyncPackage(wsMessage)) {
    const body = wsMessage.body as Record<string, unknown>;
    const list = (body.syncPushPackage as Record<string, unknown>).data as unknown[];
    const out: Record<string, unknown>[] = [];
    for (const item of list) {
      if (item && typeof item === 'object') {
        const inner = decryptSyncData(item as Record<string, unknown>);
        if (inner) out.push(inner);
      }
    }
    return out;
  }
  return [wsMessage];
}

function stripCid(raw: unknown): string {
  const s = String(raw ?? '');
  return s.includes('@') ? s.split('@')[0] : s;
}

function extractItemIdFromExt(ext: Record<string, unknown>): string {
  const url = String(ext.reminderUrl ?? '');
  if (url.includes('itemId=')) {
    return url.split('itemId=')[1]?.split('&')[0] ?? '';
  }
  for (const key of ['extJson', 'bizTag']) {
    const val = ext[key];
    if (!val) continue;
    try {
      const obj = typeof val === 'string' ? JSON.parse(val) : val;
      if (obj && typeof obj === 'object' && (obj as Record<string, unknown>).itemId) {
        return String((obj as Record<string, unknown>).itemId);
      }
    } catch {
      /* ignore */
    }
  }
  return '';
}

export function parseChatMessage(
  message: Record<string, unknown>,
): ParsedImChatMessage | null {
  if (typeof message['1'] === 'string') {
    return parseCardUpdateMessage(message);
  }

  const m1 = (message['1'] as Record<string, unknown>) || {};
  const m10 = (m1['10'] as Record<string, unknown>) || {};
  const conversationId = stripCid(m1['2']);

  let sendUserId = 'unknown';
  let sendUserName = '系统';
  let content = '';

  if (m10.reminderContent) {
    sendUserId = String(m10.senderUserId ?? 'unknown');
    sendUserName = String(m10.senderNick || m10.reminderTitle || '系统');
    content = String(m10.reminderContent);
  } else {
    const m1Inner = (m1['1'] as Record<string, unknown>) || {};
    if (typeof m1Inner === 'object') {
      sendUserId = stripCid(m1Inner['1']);
    }
    const m6 = (m1['6'] as Record<string, unknown>) || {};
    const m63 = (m6['3'] as Record<string, unknown>) || {};
    content = String(m63['2'] ?? '');
  }

  const itemId = extractItemIdFromExt(m10) || extractItemIdFromCard(message);
  if (!content) return null;

  return {
    sendUserId,
    sendUserName,
    content,
    conversationId,
    itemId,
    rawMessage: message,
  };
}

function parseCardUpdateMessage(
  message: Record<string, unknown>,
): ParsedImChatMessage | null {
  const m4 = (message['4'] as Record<string, unknown>) || {};
  const content = String(m4.reminderContent ?? '');
  if (!content) return null;

  return {
    sendUserId: String(m4.senderUserId ?? 'unknown'),
    sendUserName: String(m4.reminderTitle ?? '系统'),
    content,
    conversationId: stripCid(message['2']),
    itemId: extractItemIdFromExt(m4),
    rawMessage: message,
  };
}

function extractItemIdFromCard(message: Record<string, unknown>): string {
  try {
    const m1 = (message['1'] as Record<string, unknown>) || {};
    const m6 = (m1['6'] as Record<string, unknown>) || {};
    const m63 = (m6['3'] as Record<string, unknown>) || {};
    const cardJson = m63['5'];
    if (!cardJson) return '';
    const card =
      typeof cardJson === 'string'
        ? (JSON.parse(cardJson) as Record<string, unknown>)
        : (cardJson as Record<string, unknown>);
    const jumpUrl = (
      (((card.dxCard as Record<string, unknown>)?.item as Record<string, unknown>)
        ?.main as Record<string, unknown>)?.exContent as Record<string, unknown>
    )?.button as Record<string, unknown>;
    const page = (jumpUrl?.intent as Record<string, unknown>)?.page as Record<string, unknown>;
    const url = String(page?.jumpUrl ?? '');
    if (url.includes('itemId=')) {
      return url.split('itemId=')[1]?.split('&')[0] ?? '';
    }
  } catch {
    /* ignore */
  }
  return '';
}

export function extractOrderId(message: Record<string, unknown>): string {
  try {
    const m1 = (message['1'] as Record<string, unknown>) || {};
    const m16 = (m1['6'] as Record<string, unknown>) || {};
    const m163 = (m16['3'] as Record<string, unknown>) || {};
    const contentJsonStr = m163['5'];
    if (contentJsonStr && typeof contentJsonStr === 'string') {
      const contentData = JSON.parse(contentJsonStr) as Record<string, unknown>;
      const dx = contentData.dxCard as Record<string, unknown> | undefined;
      const item = dx?.item as Record<string, unknown> | undefined;
      const main = item?.main as Record<string, unknown> | undefined;
      const ex = main?.exContent as Record<string, unknown> | undefined;
      const button = ex?.button as Record<string, unknown> | undefined;
      const targetUrl = String(button?.targetUrl ?? '');
      const m1Match = targetUrl.match(/orderId=(\d+)/);
      if (m1Match) return m1Match[1];
      const mainUrl = String(main?.targetUrl ?? '');
      const m2Match = mainUrl.match(/order_detail\?id=(\d+)/);
      if (m2Match) return m2Match[1];
    }
  } catch {
    /* fall through */
  }

  const str = JSON.stringify(message);
  const patterns = [
    /orderId[=:](\d{10,})/,
    /order_detail\?id=(\d{10,})/,
    /"id"\s*:\s*"?(\d{10,})"?/,
    /bizOrderId[=:](\d{10,})/,
  ];
  for (const p of patterns) {
    const m = str.match(p);
    if (m) return m[1];
  }
  return '';
}

export function extractMessageId(message: Record<string, unknown>): string {
  try {
    const m1 = (message['1'] as Record<string, unknown>) || {};
    const m10 = (m1['10'] as Record<string, unknown>) || {};
    const id = m10.messageId || m10.msgId || m1['3'];
    if (id) return String(id);
  } catch {
    /* ignore */
  }
  return `${extractOrderId(message)}_${JSON.stringify(message).slice(0, 80)}`;
}

export function tryParsePaymentEvent(
  parsed: ParsedImChatMessage,
  sellerUserId: string,
): PaymentMessageEvent | null {
  if (!isPaidOrderMessage(parsed.content)) return null;
  if (parsed.sendUserId === sellerUserId) return null;

  const bizOrderId = extractOrderId(parsed.rawMessage);
  if (!bizOrderId) return null;

  return {
    bizOrderId,
    buyerId: parsed.sendUserId,
    buyerNick: parsed.sendUserName,
    itemId: parsed.itemId,
    conversationId: parsed.conversationId,
    content: parsed.content,
    rawMessage: parsed.rawMessage,
  };
}

/**
 * 解析退款事件。
 * - content 命中 REFUND_MESSAGES 且来自买家 → 返回事件
 * - done=true 表示退款已成功（REFUND_DONE_MESSAGES），false 表示退款中
 */
export function tryParseRefundEvent(
  parsed: ParsedImChatMessage,
  sellerUserId: string,
): RefundMessageEvent | null {
  if (!REFUND_MESSAGES.has(parsed.content)) return null;
  // 系统消息 sendUserId 可能是买家或系统，此处不严格过滤 seller
  // （退款消息也可能是卖家自己触发，但 bizOrderId 才是关键）
  const bizOrderId = extractOrderId(parsed.rawMessage);
  if (!bizOrderId) return null;

  return {
    bizOrderId,
    buyerId: parsed.sendUserId,
    buyerNick: parsed.sendUserName,
    itemId: parsed.itemId,
    conversationId: parsed.conversationId,
    content: parsed.content,
    done: REFUND_DONE_MESSAGES.has(parsed.content),
    rawMessage: parsed.rawMessage,
  };
}

/**
 * 解析普通聊天消息（买家发来的、非付款/非退款的文本消息）。
 *
 * 过滤规则：
 * 1. 排除卖家自己发的（sendUserId === sellerUserId）
 * 2. 排除空内容
 * 3. 排除付款/退款系统消息（由对应 try 函数处理）
 * 4. 必须有 conversationId（否则无法回复）
 *
 * 用于自动回复链路。
 */
export function tryParseChatMessage(
  parsed: ParsedImChatMessage,
  sellerUserId: string,
): ChatMessageEvent | null {
  // 排除卖家自己发的
  if (!parsed.sendUserId || parsed.sendUserId === sellerUserId) return null;
  // 排除空内容
  const content = (parsed.content || '').trim();
  if (!content) return null;
  // 排除付款/退款消息（交给专门的处理函数）
  if (isPaidOrderMessage(parsed.content)) return null;
  if (REFUND_MESSAGES.has(parsed.content)) return null;
  // 必须有会话ID才能回复
  if (!parsed.conversationId) return null;

  return {
    buyerId: parsed.sendUserId,
    buyerNick: parsed.sendUserName,
    content,
    conversationId: parsed.conversationId,
    itemId: parsed.itemId || undefined,
  };
}
