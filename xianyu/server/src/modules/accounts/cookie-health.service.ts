import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { AccountsService } from './accounts.service';
import { GoofishMtopService } from '../../goofish/goofish-mtop.service';
import { ImWebSocketService } from '../../goofish/im-websocket.service';
import { AlertService } from '../alert/alert.service';
import {
  handleAccountAuthError,
  registerAccountExpiredHandler,
} from './account-auth.util';

/**
 * Cookie 健康检查：主动探测 + 过期自动 markExpired + 停止 WS。
 */
@Injectable()
export class CookieHealthService implements OnModuleInit {
  private readonly logger = new Logger(CookieHealthService.name);
  private lastCheckAt = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly accounts: AccountsService,
    private readonly goofishMtop: GoofishMtopService,
    private readonly imWs: ImWebSocketService,
    private readonly alertService: AlertService,
  ) {}

  onModuleInit(): void {
    registerAccountExpiredHandler(async (accountId) => {
      this.imWs.stopPaymentListener(String(accountId));
    });

    if (this.enabled) {
      setTimeout(() => void this.checkAllAccounts(), 15_000);
    }
  }

  private get enabled(): boolean {
    return (
      this.config.get<string>('sign.provider') === 'goofish' &&
      this.config.get<boolean>('cookieHealth.enabled', true)
    );
  }

  private get intervalMs(): number {
    return this.config.get<number>('cookieHealth.intervalMs', 5 * 60 * 1000);
  }

  @Interval(30_000)
  async tick(): Promise<void> {
    if (!this.enabled) return;
    const now = Date.now();
    if (now - this.lastCheckAt < this.intervalMs) return;
    this.lastCheckAt = now;
    await this.checkAllAccounts();
  }

  async checkAllAccounts(): Promise<void> {
    const list = await this.accounts.listAllEnabled();
    if (list.length === 0) return;

    this.logger.debug(`Cookie 健康检查: ${list.length} 个账号`);
    for (const account of list) {
      await this.checkOne(account.id);
    }
  }

  async checkOne(accountId: number): Promise<{ ok: boolean; reason?: string }> {
    const result = await this.accounts.validateSession(accountId, async (cookie) => {
      const { token, cookie: updatedCookie } =
        await this.goofishMtop.getImAccessToken(cookie);
      if (!token) {
        throw new Error('FAIL_SYS_SESSION_EXPIRED::无法获取 accessToken');
      }
      return { cookie: updatedCookie };
    });

    if (!result.ok && result.reason?.includes('过期')) {
      await handleAccountAuthError(
        this.accounts,
        accountId,
        new Error('FAIL_SYS_SESSION_EXPIRED'),
      );

      if (this.config.get<boolean>('alert.onAccountExpired', true)) {
        const account = await this.accounts.findByIdUnsafe(accountId);
        this.alertService.send({
          title: '闲鱼账号 Cookie 过期',
          text: [
            `**账号 ID**: ${accountId}`,
            `**状态**: 已过期并自动禁用`,
            `**时间**: ${new Date().toLocaleString('zh-CN')}`,
          ].join('\n\n'),
          severity: 'error',
          tenantId: account?.tenantId,
        });
      }
    }

    if (!result.ok) {
      this.logger.debug(`账号 ${accountId} 健康检查未通过: ${result.reason}`);
    }

    return result;
  }
}
