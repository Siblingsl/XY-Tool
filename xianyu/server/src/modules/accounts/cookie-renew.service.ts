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
const SILENT_HAS_LOGIN_URL =
  'https://passport.goofish.com/newlogin/silentHasLogin.do';
const SET_LOGIN_SETTINGS_URL =
  'https://passport.goofish.com/ac/account/setLoginSettings.do';
const REQUEST_TIMEOUT = 20_000;

export interface RenewResult {
  success: boolean;
  message: string;
  renewedAt?: Date;
}

type ApiCallResult = {
  setCookieHeaders: string[];
  apiMessage: string;
  responseText?: string;
};

type RenewOnceResult = {
  cookie: string;
  updatedFields: string[];
  longLoginHasCookies: boolean;
  apiMessage: string;
  responseText: string;
};

/**
 * Cookie 长登录保活服务。
 *
 * 对齐 xianyu-auto-reply 的 cookie_renew_api_service.py：
 * 依次调用 hasLogin.do → silentHasLogin.do → setLoginSettings.do，
 * 以 setLoginSettings 是否返回有效 Set-Cookie 判定续期成功（非 hasLogin 单独判定）。
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
    const result = await this.renewViaApiChain(oldCookie, `账号 ${accountId}`);

    if (result.updatedFields.length > 0 && result.cookie !== oldCookie) {
      await this.accounts.updateCookieIfChanged(accountId, result.cookie);
    }

    if (result.longLoginHasCookies) {
      this.logger.log(
        `账号 ${accountId} Cookie 续期成功，更新字段: ${result.updatedFields.join(',') || '-'}`,
      );
    }

    const success = result.longLoginHasCookies;
    const message = success
      ? `续期成功，更新 ${result.updatedFields.length} 个字段`
      : result.apiMessage || '长登录续期失败，请重新扫码登录';

    if (!success && tenantId == null) {
      await this.alertService.send({
        title: 'Cookie 续期失败',
        text: [
          `**账号**: ${account.nickname}（ID: ${accountId}）`,
          `**原因**: ${message}`,
          `**建议**: 请尽快重新扫码登录，否则账号将无法自动发货`,
        ].join('\n\n'),
        severity: 'warn',
        tenantId: account.tenantId,
      });
    }

    return {
      success,
      message,
      renewedAt: success ? new Date() : undefined,
    };
  }

  private async renewViaApiChain(
    cookie: string,
    logPrefix: string,
  ): Promise<RenewOnceResult> {
    let result = await this.doRenewOnce(cookie, logPrefix);
    if (!result.longLoginHasCookies) {
      this.logger.log(`${logPrefix} setLoginSettings 未返回 Set-Cookie，2 秒后重试...`);
      await this.sleep(2000);
      result = await this.doRenewOnce(result.cookie, `${logPrefix}[重试]`);
    }
    return result;
  }

  /**
   * 一次完整接口续期：hasLogin → silentHasLogin → setLoginSettings。
   * 参考 cookie_renew_api_service._do_renew_once。
   */
  private async doRenewOnce(
    cookie: string,
    logPrefix: string,
  ): Promise<RenewOnceResult> {
    const originalJar = parseCookies(cookie);
    const allSetCookies: string[] = [];
    let currentCookie = cookie;
    let lastApiMessage = '';
    let responseText = '';

    // 1. hasLogin.do（无 Set-Cookie 不视为失败，继续后续步骤）
    const hasLogin = await this.callHasLoginWeb(currentCookie, logPrefix);
    if (hasLogin.setCookieHeaders.length > 0) {
      allSetCookies.push(...hasLogin.setCookieHeaders);
      currentCookie = this.mergeCookies(currentCookie, hasLogin.setCookieHeaders);
      this.logger.log(
        `${logPrefix} hasLogin.do 收到 ${hasLogin.setCookieHeaders.length} 个 Set-Cookie`,
      );
    } else {
      this.logger.warn(
        `${logPrefix} hasLogin.do 未返回 Set-Cookie（继续 silentHasLogin / setLoginSettings）`,
      );
    }
    lastApiMessage = hasLogin.apiMessage;

    // 2. silentHasLogin.do
    const silentLogin = await this.callSilentHasLogin(currentCookie, logPrefix);
    responseText = silentLogin.responseText || responseText;
    if (silentLogin.setCookieHeaders.length > 0) {
      allSetCookies.push(...silentLogin.setCookieHeaders);
      currentCookie = this.mergeCookies(currentCookie, silentLogin.setCookieHeaders);
      this.logger.log(
        `${logPrefix} silentHasLogin 收到 ${silentLogin.setCookieHeaders.length} 个 Set-Cookie`,
      );
    }
    if (silentLogin.apiMessage) {
      lastApiMessage = silentLogin.apiMessage;
    }

    // 3. setLoginSettings.do（长登录续期，成功判定依据）
    const longLoginCookies = await this.callSetLoginSettings(currentCookie, logPrefix);
    const longLoginHasCookies = longLoginCookies.length > 0;
    if (longLoginCookies.length > 0) {
      allSetCookies.push(...longLoginCookies);
      this.logger.log(
        `${logPrefix} setLoginSettings 长登录续期成功，${longLoginCookies.length} 个 Set-Cookie`,
      );
      lastApiMessage = '长登录续期成功';
    } else {
      lastApiMessage =
        'setLoginSettings 未返回 Set-Cookie，登录态可能已失效，请重新扫码';
      this.logger.warn(`${logPrefix} ${lastApiMessage}`);
    }

    const finalCookie = this.mergeCookies(cookie, allSetCookies);
    const updatedFields = this.diffCookieFields(originalJar, parseCookies(finalCookie));

    return {
      cookie: finalCookie,
      updatedFields,
      longLoginHasCookies,
      apiMessage: lastApiMessage,
      responseText,
    };
  }

  private async callHasLoginWeb(
    cookie: string,
    logPrefix: string,
  ): Promise<ApiCallResult> {
    const jar = parseCookies(cookie);
    const hid = jar.unb || '';
    const hsiz = jar.cookie2 || '';
    const xsrfToken = jar['XSRF-TOKEN'] || '';
    const csrfToken = jar._tb_token_ || '';
    const umidToken = jar._uab_collina || jar.cna || '';

    if (!hid) {
      return {
        setCookieHeaders: [],
        apiMessage: 'Cookie 缺少 unb 字段，跳过 hasLogin.do',
      };
    }

    const nowMs = Date.now();
    const randSuffix = Math.floor(100000 + Math.random() * 900000);
    const pageTraceId = `21504${nowMs}${randSuffix}`;
    const rndValue = Math.random();

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

    try {
      const resp = await this.postNoRedirect(HAS_LOGIN_URL, formData.toString(), {
        params: { appName: 'xianyu', fromSite: '77' },
        headers,
      });

      const setCookieHeaders = this.extractSetCookies(resp);
      if (![200, 302, 303].includes(resp.status)) {
        return {
          setCookieHeaders,
          apiMessage: `hasLogin.do HTTP 状态异常: ${resp.status}`,
        };
      }

      let apiMessage = 'hasLogin.do 调用完成';
      try {
        const body = resp.data;
        if (body && typeof body === 'object') {
          const content = (body as Record<string, unknown>).content;
          if (content && typeof content === 'object') {
            const ok = (content as Record<string, unknown>).success === true;
            apiMessage = ok ? 'hasLogin.do 业务成功' : 'hasLogin.do 业务返回失败';
          }
        }
      } catch {
        // ignore
      }

      return { setCookieHeaders, apiMessage };
    } catch (err) {
      return {
        setCookieHeaders: [],
        apiMessage: `hasLogin.do 请求异常: ${(err as Error).message}`,
      };
    }
  }

  private async callSilentHasLogin(
    cookie: string,
    logPrefix: string,
  ): Promise<ApiCallResult & { responseText: string }> {
    const headers: Record<string, string> = {
      accept: '*/*',
      'accept-language': 'en,zh-CN;q=0.9,zh;q=0.8',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      referer: 'https://www.goofish.com/',
      'user-agent': GOOFISH_UA,
      cookie: cookie.replace(/[\r\n]/g, ''),
    };

    try {
      const resp = await this.postNoRedirect(SILENT_HAS_LOGIN_URL, null, {
        params: {
          documentReferer: 'https://www.goofish.com/',
          appName: 'xianyu',
          appEntrance: 'xianyu_sdkSilent',
          fromSite: '0',
          ltl: 'true',
        },
        headers,
      });

      const setCookieHeaders = this.extractSetCookies(resp);
      const responseText =
        typeof resp.data === 'string'
          ? resp.data
          : JSON.stringify(resp.data ?? '');

      if (![200, 302, 303].includes(resp.status)) {
        return {
          setCookieHeaders,
          apiMessage: `silentHasLogin HTTP 状态异常: ${resp.status}`,
          responseText,
        };
      }

      let apiMessage = 'silentHasLogin 调用完成';
      try {
        const body =
          typeof resp.data === 'object' && resp.data != null
            ? resp.data
            : JSON.parse(responseText || '{}');
        const content = (body as Record<string, unknown>).content;
        if (content && typeof content === 'object') {
          const ok = (content as Record<string, unknown>).success === true;
          apiMessage = ok ? 'silentHasLogin 业务成功' : 'silentHasLogin 业务返回失败';
        }
      } catch {
        apiMessage = 'silentHasLogin 返回非 JSON';
      }

      return { setCookieHeaders, apiMessage, responseText };
    } catch (err) {
      return {
        setCookieHeaders: [],
        apiMessage: `silentHasLogin 请求异常: ${(err as Error).message}`,
        responseText: '',
      };
    }
  }

  private async callSetLoginSettings(
    cookie: string,
    logPrefix: string,
  ): Promise<string[]> {
    const headers: Record<string, string> = {
      accept: 'application/json, text/plain, */*',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'content-type': 'application/x-www-form-urlencoded',
      referer: 'https://www.goofish.com/',
      'user-agent': GOOFISH_UA,
      cookie: cookie.replace(/[\r\n]/g, ''),
    };

    try {
      const resp = await this.postNoRedirect(
        SET_LOGIN_SETTINGS_URL,
        'status=0',
        {
          params: { fromSite: '77', appName: 'xianyu', bizEntrance: 'web' },
          headers,
        },
      );

      const setCookies = this.extractSetCookies(resp).filter(
        (sc) => !sc.includes('Max-Age=0') && !sc.includes('1970'),
      );
      return setCookies;
    } catch (err) {
      this.logger.warn(
        `${logPrefix} setLoginSettings 异常: ${(err as Error).message}`,
      );
      return [];
    }
  }

  private async postNoRedirect(
    url: string,
    data: string | null,
    config: {
      params?: Record<string, string>;
      headers: Record<string, string>;
    },
  ): Promise<AxiosResponse> {
    return axios.post(url, data ?? undefined, {
      params: config.params,
      headers: config.headers,
      timeout: REQUEST_TIMEOUT,
      validateStatus: () => true,
      maxRedirects: 0,
    });
  }

  /** axios 对 set-cookie 会返回 string[]，兼容单字符串 */
  private extractSetCookies(resp: AxiosResponse): string[] {
    const raw = resp.headers['set-cookie'];
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [raw];
  }

  private mergeCookies(cookie: string, setCookies: string[]): string {
    if (setCookies.length === 0) return cookie;
    const jar = parseCookies(cookie);
    const merged = mergeSetCookie(jar, setCookies);
    return cookiesToString(merged);
  }

  private diffCookieFields(
    before: Record<string, string>,
    after: Record<string, string>,
  ): string[] {
    const names = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...names].filter((k) => before[k] !== after[k]);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
