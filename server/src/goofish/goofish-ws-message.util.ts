import { decryptGoofishMessage, decryptGoofishObject } from './goofish-crypto.util';
import { loadGoofishSdk } from './goofish-sdk.loader';

/** 付款后待发货的系统消息（xianyu-auto-reply 同款） */
export const PAID_ORDER_MESSAGES = new Set([
  '[我已付款，等待你发货]',
  '[买家已付款]',
  '[付款完成]',
  '[已付款，待发货]',
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
  if (!PAID_ORDER_MESSAGES.has(parsed.content)) return null;
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
