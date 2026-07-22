import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { google, gmail_v1 } from 'googleapis';
import { ResearchGmailAccountEntity } from '../entities/gmail-account.entity';
import { ResearchEmailEntity } from '../entities/email.entity';

/**
 * Gmail OAuth 授权 + 增量邮件同步服务。
 * 文档 3.2 节：提取 subject, bodyText, from, links[], attachments[],
 * githubUrls[], youtubeUrls[], productUrls[], redditUrls[], twitterUrls[]。
 */
@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(ResearchGmailAccountEntity)
    private readonly gmailAccountRepo: Repository<ResearchGmailAccountEntity>,
    @InjectRepository(ResearchEmailEntity)
    private readonly emailRepo: Repository<ResearchEmailEntity>,
  ) {}

  /**
   * 生成 Gmail OAuth 授权 URL。
   * API: GET /gmail/auth-url → { url }
   * state 中编码 tenantId，回调时用于关联租户。
   */
  getAuthUrl(tenantId: number): string {
    const oauth2Client = this.createOAuthClient();
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      state: tenantId.toString(),
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
      ],
    });
  }

  /**
   * OAuth 回调：用 code 换取 token，写入 research_gmail_accounts。
   * API: GET /gmail/callback?code=
   */
  async handleCallback(code: string, tenantId: number): Promise<void> {
    const oauth2Client = this.createOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      throw new Error('未能获取 refresh_token，请重新授权（需勾选离线访问）');
    }

    // 获取邮箱地址
    oauth2Client.setCredentials(tokens);
    const gmail = this.buildGmailClient(oauth2Client);
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const email = profile.data.emailAddress || '';

    // 获取当前 historyId 作为初始同步游标
    const historyId = profile.data.historyId?.toString() || null;

    // 查找是否已有该租户的 Gmail 账号记录
    let account = await this.gmailAccountRepo.findOne({
      where: { tenantId },
    });

    if (account) {
      account.email = email;
      account.refreshTokenEnc = tokens.refresh_token;
      account.syncCursor = historyId;
      account.status = 'active';
    } else {
      account = this.gmailAccountRepo.create({
        tenantId,
        email,
        refreshTokenEnc: tokens.refresh_token,
        syncCursor: historyId,
        status: 'active',
      });
    }

    await this.gmailAccountRepo.save(account);
    this.logger.log(`Gmail 账号已保存: ${email} (tenant=${tenantId})`);
  }

  /**
   * 查询 Gmail 连接状态。
   * API: GET /gmail/status → { connected, email, lastSyncAt }
   */
  async getStatus(tenantId: number): Promise<{
    connected: boolean;
    email: string | null;
    lastSyncAt: string | null;
  }> {
    const account = await this.gmailAccountRepo.findOne({
      where: { tenantId, status: 'active' },
    });

    if (!account) {
      return { connected: false, email: null, lastSyncAt: null };
    }

    // 查最近一次同步时间（emails 表最新 created_at）
    const lastEmail = await this.emailRepo.findOne({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      select: ['createdAt'],
    });

    return {
      connected: true,
      email: account.email,
      lastSyncAt: lastEmail?.createdAt?.toISOString() || null,
    };
  }

  /**
   * 增量同步邮件。
   * 使用 Gmail API 拉取新邮件，解析后存入 research_emails。
   * 返回本次同步拉取的邮件数。
   */
  async syncEmails(tenantId: number): Promise<{ synced: number }> {
    const account = await this.gmailAccountRepo.findOne({
      where: { tenantId, status: 'active' },
    });

    if (!account) {
      throw new Error('Gmail 未授权，请先完成 OAuth 授权');
    }

    const gmail = await this.createGmailClient(account.refreshTokenEnc);
    let synced = 0;

    try {
      // 查询最近 1 天的邮件（增量：使用 after: 参数）
      const oneDayAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
      const listRes = await gmail.users.messages.list({
        userId: 'me',
        q: `after:${oneDayAgo}`,
        maxResults: 50,
      });

      const messages = listRes.data.messages || [];
      this.logger.log(`Gmail 拉取到 ${messages.length} 封邮件 (tenant=${tenantId})`);

      for (const msg of messages) {
        if (!msg.id) continue;

        // 检查是否已存在（去重）
        const existing = await this.emailRepo.findOne({
          where: { gmailMessageId: msg.id },
        });
        if (existing) continue;

        try {
          const fullMsg = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'full',
          });

          const emailEntity = this.parseGmailMessage(fullMsg.data, tenantId);
          if (emailEntity) {
            await this.emailRepo.save(emailEntity);
            synced++;
          }
        } catch (err) {
          this.logger.warn(`解析邮件 ${msg.id} 失败: ${err.message}`);
        }
      }

      // 更新同步游标（使用最新 historyId）
      const profile = await gmail.users.getProfile({ userId: 'me' });
      if (profile.data.historyId) {
        account.syncCursor = profile.data.historyId.toString();
        await this.gmailAccountRepo.save(account);
      }
    } catch (err) {
      // Token 过期检测
      if (err.code === 401 || err.message?.includes('invalid_grant')) {
        account.status = 'revoked';
        await this.gmailAccountRepo.save(account);
        // 标记相关邮件为 auth_required
        throw new Error('auth_required');
      }
      throw err;
    }

    this.logger.log(`同步完成: 新增 ${synced} 封邮件 (tenant=${tenantId})`);
    return { synced };
  }

  /**
   * 解析 Gmail 消息为 ResearchEmailEntity。
   * 提取文档 3.2 节要求的所有字段。
   */
  private parseGmailMessage(
    msg: gmail_v1.Schema$Message,
    tenantId: number,
  ): ResearchEmailEntity | null {
    const headers = msg.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

    const subject = getHeader('Subject');
    const fromAddr = getHeader('From');
    const receivedAt = new Date(parseInt(msg.internalDate || '0'));

    // 提取正文
    const { bodyText, links, attachments } = this.extractBody(msg.payload);

    // 无正文且无链接 → skipped (empty_content)
    if (!bodyText && links.length === 0) {
      const entity = this.emailRepo.create({
        tenantId,
        gmailMessageId: msg.id!,
        subject: subject || '(无标题)',
        fromAddr,
        receivedAt,
        bodyText: null,
        extractedJson: null,
        categories: null,
        status: 'skipped',
        filterReason: 'empty_content',
      });
      return entity;
    }

    // 分类链接
    const githubUrls = links.filter((l) => /github\.com/i.test(l));
    const youtubeUrls = links.filter((l) => /youtube\.com|youtu\.be/i.test(l));
    const productUrls = links.filter((l) => /producthunt\.com/i.test(l));
    const redditUrls = links.filter((l) => /reddit\.com/i.test(l));
    const twitterUrls = links.filter((l) => /twitter\.com|x\.com/i.test(l));

    const extractedJson = {
      links,
      attachments,
      githubUrls,
      youtubeUrls,
      productUrls,
      redditUrls,
      twitterUrls,
    };

    return this.emailRepo.create({
      tenantId,
      gmailMessageId: msg.id!,
      subject: subject || '(无标题)',
      fromAddr,
      receivedAt,
      bodyText,
      extractedJson,
      categories: null, // 分类在 P0-2 营销过滤阶段填充
      status: 'pending',
      filterReason: null,
    });
  }

  /**
   * 递归提取邮件正文和链接。
   */
  private extractBody(payload: gmail_v1.Schema$MessagePart | undefined): {
    bodyText: string;
    links: string[];
    attachments: string[];
  } {
    let bodyText = '';
    const links: string[] = [];
    const attachments: string[] = [];

    if (!payload) return { bodyText, links, attachments };

    // 纯文本正文
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      bodyText = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }

    // HTML 正文（提取文本和链接）
    if (payload.mimeType === 'text/html' && payload.body?.data) {
      const html = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      if (!bodyText) {
        // 简单去标签提取文本
        bodyText = html
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+/g, ' ')
          .trim();
      }
      // 提取所有 href
      const hrefRegex = /href=["']([^"']+)["']/gi;
      let match: RegExpExecArray | null;
      while ((match = hrefRegex.exec(html)) !== null) {
        if (match[1].startsWith('http')) {
          links.push(match[1]);
        }
      }
    }

    // 附件
    if (payload.filename && payload.filename.length > 0) {
      attachments.push(payload.filename);
    }

    // 递归处理 multipart
    if (payload.parts) {
      for (const part of payload.parts) {
        const sub = this.extractBody(part);
        if (sub.bodyText && !bodyText) bodyText = sub.bodyText;
        links.push(...sub.links);
        attachments.push(...sub.attachments);
      }
    }

    // 去重链接
    const uniqueLinks = [...new Set(links)];
    return { bodyText, links: uniqueLinks, attachments };
  }

  /**
   * 创建 OAuth2 客户端。
   * 若配置了 research.google.proxyUrl（国内服务器无法直连 Google），
   * 则把换 token / 自动刷新的端点改走代理 Worker，并注入 x-proxy-key 头。
   */
  private createOAuthClient() {
    const proxyUrl = this.configService.get<string>('research.google.proxyUrl');
    const proxyKey = this.configService.get<string>('research.google.proxyKey');

    const clientId = this.configService.get<string>('research.google.clientId');
    const clientSecret = this.configService.get<string>('research.google.clientSecret');
    const redirectUri = this.configService.get<string>('research.google.redirectUri');

    // 配置了代理：换 token / 自动刷新改走代理 Worker，并注入 x-proxy-key 头。
    // 注意：不显式标注 OAuth2ClientOptions 类型，避免 node_modules 中两份
    // google-auth-library 的 Gaxios 类型互相冲突，让字面量直接流入构造器。
    if (proxyUrl) {
      return new google.auth.OAuth2({
        clientId,
        clientSecret,
        redirectUri,
        endpoints: {
          oauth2TokenUrl: `${proxyUrl}/oauth2.googleapis.com/token`,
        },
        ...(proxyKey
          ? { transporterOptions: { headers: { 'x-proxy-key': proxyKey } } }
          : {}),
      });
    }

    return new google.auth.OAuth2({ clientId, clientSecret, redirectUri });
  }

  /**
   * 用已授权的 OAuth 客户端创建 Gmail 客户端。
   * 配置了代理时，把 Gmail API 的 rootUrl 改走代理 Worker 并注入 x-proxy-key 头。
   */
  private buildGmailClient(
    oauth2Client: InstanceType<typeof google.auth.OAuth2>,
  ) {
    const proxyUrl = this.configService.get<string>('research.google.proxyUrl');
    const proxyKey = this.configService.get<string>('research.google.proxyKey');

    const options: gmail_v1.Options = { version: 'v1', auth: oauth2Client };
    if (proxyUrl) {
      options.rootUrl = `${proxyUrl}/gmail.googleapis.com`;
      if (proxyKey) {
        options.headers = { 'x-proxy-key': proxyKey };
      }
    }
    return google.gmail(options);
  }

  /** 用 refresh_token 创建已授权的 Gmail 客户端 */
  private async createGmailClient(refreshToken: string) {
    const oauth2Client = this.createOAuthClient();
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    return this.buildGmailClient(oauth2Client);
  }
}
