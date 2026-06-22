import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import axios, { AxiosResponse } from 'axios';
import { AccountsService } from './accounts.service';
import { AlertService } from '../alert/alert.service';
import {
  parseCookies,
  cookiesToString,
  mergeSetCookie,
} from '../../goofish/goofish-cookie.util';
import { GOOFISH_UA } from '../../goofish/goofish.constants';

const HAS_LOGIN_URL = 'https://passport.goofish.com/newlogin/hasLogin.do';
const REQUEST_TIMEOUT = 15_000;

export interface RenewResult {
  success: boolean;
  message: string;
  renewedAt?: Date;
}

/**
 * Cookie 长登录保活服务。
 *
 * 解决扫码登录「一天就过期」问题：定时调用闲鱼 hasLogin.do 接口，
 * 刷新核心登录态（cookie2 / sgcookie / unb 等），把有效期从 ~24h 延长到 7-30 天。
 *
 * 原理：闲鱼扫码默认是「短登录」，核心 cookie 约 24h 过期。
 * hasLogin.do 会返回新的 Set-Cookie，续期核心登录态。
 * （参考 xianyu-auto-reply 的 cookie_renew_api_service.py）
 *
 * 与现有 refreshToken() 的区别：
 * - refreshToken() 每 10 分钟刷 _m_h5_tk（短签名 token），无法延长核心登录态
 * - 本服务每 6 小时刷核心登录态（cookie2/sgcookie），实现长登录保活
 */
@Injectable()
export class CookieRenewService {
  private readonly logger = new Logger(CookieRenewService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly accounts: AccountsService,
    private readonly alertService: AlertService,
  ) {}

  private get enabled(): boolean {
    if (this.config.get<string>('sign.provider') !== 'goofish') return false;
    return this.config.get<boolean>('cookieRenew.enabled', true);
  }

  /**
   * 定时保活：每 6 小时对所有启用账号续期。
   * 仅 goofish 签名模式 + 未显式关闭时执行。
   */
  @Cron('0 */6 * * *')
  async renewAllAccounts(): Promise<void> {
    if (!this.enabled) return;

    const list = await this.accounts.listAllEnabled();
    if (list.length === 0) return;

    this.logger.log(`Cookie 定时保活开始: ${list.length} 个账号`);
    for (const account of list) {
      try {
        await this.renewOne(account.id, account.tenantId);
      } catch (err) {
        this.logger.error(
          `账号 ${account.id} 保活异常: ${(err as Error).message}`,
        );
      }
    }
    this.logger.log('Cookie 定时保活完成');
  }

  /**
   * 续期单个账号（手动接口 + 定时任务共用）。
   * @param accountId 账号ID
   * @param tenantId 租户ID（手动接口传，用于校验归属）
   */
  async renewOne(
    accountId: number,
    tenantId?: number,
  ): Promise<RenewResult> {
    const account =
      tenantId != null
        ? await this.accounts.findById(accountId, tenantId)
        : await this.accounts.findByIdUnsafe(accountId);

    if (!account) {
      return { success: false, message: '账号不存在' };
    }

    const oldCookie = this.accounts.decryptCookie(account);
    const result = await this.renewViaHasLogin(oldCookie);

    if (result.success && result.cookie && result.cookie !== oldCookie) {
      // 回写新 cookie
      await this.accounts.updateCookieIfChanged(accountId, result.cookie);
      this.logger.log(
        `账号 ${accountId} Cookie 续期成功，更新字段: ${result.updatedFields || '-'}`,
      );
    }

    // 失败时告警（仅定时任务触发的会告警，手动调用由接口返回错误）
    if (!result.success && tenantId == null) {
      const tId = account.tenantId;
      await this.alertService.send({
        title: 'Cookie 续期失败',
        text: [
          `**账号**: ${account.nickname}（ID: ${accountId}）`,
          `**原因**: ${result.message}`,
          `**建议**: 请尽快重新扫码登录，否则账号将无法自动发货`,
        ].join('\n\n'),
        severity: 'warn',
        tenantId: tId,
      });
    }

    return {
      success: result.success,
      message: result.message,
      renewedAt: result.success ? new Date() : undefined,
    };
  }

  /**
   * 调用 hasLogin.do 接口续期。
   * 移植自 xianyu-auto-reply 的 _call_has_login_web_api。
   */
  private async renewViaHasLogin(cookie: string): Promise<{
    success: boolean;
    message: string;
    cookie?: string;
    updatedFields?: string;
  }> {
    try {
      const jar = parseCookies(cookie);
      const hid = jar.unb || '';
      const hsiz = jar.cookie2 || '';
      const xsrfToken = jar['XSRF-TOKEN'] || '';
      const csrfToken = jar._tb_token_ || '';
      const umidToken = jar._uab_collina || jar.cna || '';

      if (!hid) {
        return { success: false, message: 'Cookie 缺少 unb 字段，无法续期' };
      }

      // 构造 pageTraceId（参考项目格式：前缀 + 毫秒时间戳 + 随机后缀）
      const nowMs = Date.now();
      const randSuffix = Math.floor(100000 + Math.random() * 900000);
      const pageTraceId = `21504${nowMs}${randSuffix}`;
      const rndValue = Math.random();

      // POST body（application/x-www-form-urlencoded）
      const formData = new URLSearchParams();
      formData.append('hid', hid);
      formData.append('ltl', 'true');
      formData.append('appName', 'xianyu');
      formData.append('appEntrance', 'web');
      formData.append('_csrf_token', csrfToken);
      formData.append('umidToken', umidToken);
      formData.append('hsiz', hsiz);
      formData.append(
        'bizParams',
        'taobaoBizLoginFrom=web&renderRefer=https%3A%2F%2Fwww.goofish.com%2F',
      );
      formData.append('mainPage', 'false');
      formData.append('isMobile', 'false');
      formData.append('lang', 'zh_CN');
      formData.append('returnUrl', '');
      formData.append('fromSite', '77');
      formData.append('isIframe', 'true');
      formData.append('documentReferer', 'https%3A%2F%2Fwww.goofish.com%2F');
      formData.append('defaultView', 'hasLogin');
      formData.append('umidTag', 'SERVER');
      formData.append('deviceId', '');
      formData.append('pageTraceId', pageTraceId);

      const headers: Record<string, string> = {
        accept: 'application/json, text/plain, */*',
        'accept-language': 'zh-CN',
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': GOOFISH_UA,
        referer: `https://passport.goofish.com/mini_login.htm?lang=zh_cn&appName=xianyu&appEntrance=web&styleType=vertical&bizParams=&notLoadSsoView=false&notKeepLogin=false&isMobile=false&qrCodeFirst=false&stie=77&rnd=${rndValue}`,
        cookie: cookie.replace(/[\r\n]/g, ''),
      };
      if (xsrfToken) {
        headers['x-xsrf-token'] = xsrfToken;
      }

      const resp: AxiosResponse = await axios.post(HAS_LOGIN_URL, formData.toString(), {
        params: { appName: 'xianyu', fromSite: '77' },
        headers,
        timeout: REQUEST_TIMEOUT,
        validateStatus: () => true,
        maxRedirects: 0,
      });

      // HTTP 状态校验
      if (![200, 302, 303].includes(resp.status)) {
        return {
          success: false,
          message: `hasLogin.do HTTP 状态异常: ${resp.status}`,
        };
      }

      // 合并 Set-Cookie
      const setCookies = resp.headers['set-cookie'];
      if (!setCookies || (Array.isArray(setCookies) && setCookies.length === 0)) {
        return {
          success: false,
          message: 'hasLogin.do 未返回 Set-Cookie，登录态可能已失效',
        };
      }

      const beforeKeys = new Set(Object.keys(jar));
      const newJar = mergeSetCookie(jar, setCookies as string | string[]);
      const updatedKeys = Object.keys(newJar).filter((k) => !beforeKeys.has(k) || newJar[k] !== jar[k]);

      if (updatedKeys.length === 0) {
        return {
          success: false,
          message: 'hasLogin.do Set-Cookie 无更新字段，登录态可能已失效',
        };
      }

      // 业务层成功校验（content.success）
      let bizSuccess = true;
      try {
        const body = resp.data;
        if (body && typeof body === 'object') {
          const content = (body as Record<string, unknown>).content;
          if (content && typeof content === 'object') {
            bizSuccess = (content as Record<string, unknown>).success !== false;
          }
        }
      } catch {
        // 非 JSON 响应，但有 Set-Cookie 更新，仍视为成功
      }

      return {
        success: bizSuccess,
        message: bizSuccess
          ? `续期成功，更新 ${updatedKeys.length} 个字段`
          : 'hasLogin.do 业务返回失败（Set-Cookie 已更新但 content.success=false）',
        cookie: cookiesToString(newJar),
        updatedFields: updatedKeys.join(','),
      };
    } catch (err) {
      return {
        success: false,
        message: `hasLogin.do 请求异常: ${(err as Error).message}`,
      };
    }
  }
}
