import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImWebSocketService } from '../../goofish/im-websocket.service';
import { MtopClient } from '../mtop-client';
import { MtopRequestContext } from '../interfaces';

export interface SendTextMessageOptions {
  conversationId?: string | null;
  itemId?: string;
  accountKey?: string;
  onCookieUpdate?: (cookie: string) => Promise<void>;
}

@Injectable()
export class MessageApi {
  constructor(
    private readonly client: MtopClient,
    private readonly imWs: ImWebSocketService,
    private readonly config: ConfigService,
  ) {}

  private get useGoofish(): boolean {
    return this.config.get<string>('sign.provider') === 'goofish';
  }

  /**
   * 向买家发送文本消息。
   * goofish 模式走 WebSocket IM（xianyu-auto-reply / goofish-sdk 同款协议）。
   */
  async sendTextMessage(
    ctx: MtopRequestContext,
    toUserId: string,
    bizOrderId: string,
    text: string,
    options: SendTextMessageOptions = {},
  ): Promise<{ messageId: string }> {
    if (this.useGoofish) {
      if (!toUserId) {
        throw new Error('缺少买家 UID，无法发送 IM 消息');
      }
      return this.imWs.sendTextMessage({
        cookie: ctx.cookie,
        accountKey: options.accountKey || bizOrderId,
        toUserId,
        text,
        conversationId: options.conversationId,
        itemId: options.itemId,
        onCookieUpdate: options.onCookieUpdate,
      });
    }

    const data = await this.client.invoke<{ messageId?: string; msgId?: string }>(
      'mtop.taobao.idle.im.message.send',
      {
        toUserId,
        bizOrderId,
        messageType: 'text',
        content: JSON.stringify({ text }),
        uuid: `${bizOrderId}-${Date.now()}`,
      },
      ctx,
      '1.0',
    );

    return { messageId: String(data.messageId ?? data.msgId ?? '') };
  }
}
