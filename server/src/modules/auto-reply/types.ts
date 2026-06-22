/**
 * 普通聊天消息事件（买家发来的非付款/非退款消息）。
 * 由 im-websocket.service 的 processParsedChatMessage 第3分支构造，
 * 通过 onChatMessage 回调传给 AutoReplyService.handle。
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

/** AutoReplyService.handle 处理结果 */
export interface ReplyResult {
  /** 是否产生了回复 */
  replied: boolean;
  /** 回复来源：keyword / default / ai / none / handoff / cooldown */
  source: 'keyword' | 'default' | 'ai' | 'none' | 'handoff' | 'cooldown';
  /** 实际发送的回复内容（未回复时为空） */
  content?: string;
  /** 是否触发了转人工 */
  handedOff?: boolean;
}
