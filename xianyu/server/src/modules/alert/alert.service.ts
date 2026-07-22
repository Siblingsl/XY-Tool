import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';

export interface AlertPayload {
  title: string;
  text: string;
  severity: 'info' | 'warn' | 'error';
  tenantId?: number;
}

/**
 * 告警推送服务。
 *
 * 支持通道：
 * - 钉钉群机器人（Webhook + 可选加签）
 * - 企业微信群机器人
 *
 * 示例用法：
 * ```ts
 * this.alertService.send({ title: '发货失败', text: '订单 xxx 重试 3 次后失败', severity: 'error' });
 * ```
 */
@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  private readonly enabled: boolean;
  private readonly dingtalkWebhook: string;
  private readonly dingtalkSecret: string;
  private readonly wechatWebhook: string;

  constructor(private readonly config: ConfigService) {
    this.enabled = this.config.get<boolean>('alert.enabled', true);
    this.dingtalkWebhook = this.config.get<string>('alert.dingtalk.webhook', '');
    this.dingtalkSecret = this.config.get<string>('alert.dingtalk.secret', '');
    this.wechatWebhook = this.config.get<string>('alert.wechat.webhook', '');
  }

  async send(payload: AlertPayload): Promise<void> {
    if (!this.enabled) return;
    if (!this.dingtalkWebhook && !this.wechatWebhook) {
      this.logger.debug('告警通道未配置，跳过推送');
      return;
    }

    const promises: Promise<void>[] = [];

    if (this.dingtalkWebhook) {
      promises.push(this.sendDingTalk(payload));
    }
    if (this.wechatWebhook) {
      promises.push(this.sendWeChat(payload));
    }

    await Promise.allSettled(promises);
  }

  // ============ 钉钉 ============

  private async sendDingTalk(payload: AlertPayload): Promise<void> {
    try {
      const url = this.dingtalkSecret
        ? await this.signDingTalkUrl(this.dingtalkWebhook, this.dingtalkSecret)
        : this.dingtalkWebhook;

      const emoji =
        payload.severity === 'error'
          ? '❌'
          : payload.severity === 'warn'
            ? '⚠️'
            : 'ℹ️';

      const markdown = `## ${emoji} ${payload.title}\n\n${payload.text}`;

      await axios.post(url, {
        msgtype: 'markdown',
        markdown: { title: payload.title, text: markdown },
      });
    } catch (err) {
      this.logger.error(
        `钉钉告警推送失败: ${(err as Error).message}`,
      );
    }
  }

  private async signDingTalkUrl(
    webhook: string,
    secret: string,
  ): Promise<string> {
    const timestamp = Date.now();
    const stringToSign = `${timestamp}\n${secret}`;
    const sign = crypto
      .createHmac('sha256', secret)
      .update(stringToSign)
      .digest('base64');
    return `${webhook}&timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
  }

  // ============ 企业微信 ============

  private async sendWeChat(payload: AlertPayload): Promise<void> {
    try {
      const emoji =
        payload.severity === 'error'
          ? '<font color="red">❌</font>'
          : payload.severity === 'warn'
            ? '<font color="orange">⚠️</font>'
            : 'ℹ️';

      const content = `${emoji} **${payload.title}**\n\n${payload.text}`;

      await axios.post(this.wechatWebhook, {
        msgtype: 'markdown',
        markdown: { content },
      });
    } catch (err) {
      this.logger.error(
        `企业微信告警推送失败: ${(err as Error).message}`,
      );
    }
  }
}
