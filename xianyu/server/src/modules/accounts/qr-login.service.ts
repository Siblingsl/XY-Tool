import {
  BadRequestException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import { randomUUID } from 'crypto';
import { GoofishSdkService } from '../../goofish/goofish-sdk.service';
import { cookiesToString } from '../../goofish/goofish-cookie.util';
import {
  GOOFISH_MTOP_HEADERS,
  GOOFISH_UA,
} from '../../goofish/goofish.constants';
import { AccountsService } from './accounts.service';

const PASSPORT_HEADERS: Record<string, string> = {
  'User-Agent': GOOFISH_UA,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en,zh-CN;q=0.9,zh;q=0.8,zh-TW;q=0.7,ja;q=0.6',
  'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  priority: 'u=1, i',
};

export type QrLoginStatus =
  | 'PENDING'
  | 'NEW'
  | 'SCANNED'
  | 'SCANED'
  | 'CONFIRMED'
  | 'EXPIRED'
  | 'CANCELED'
  | 'ERROR';

interface QrLoginSession {
  id: string;
  tenantId: number;
  accountId?: number;
  createdAt: number;
  expiresAt: number;
  cookies: Record<string, string>;
  csrfToken: string;
  cookie2: string;
  cna: string;
  qrT: string;
  qrCk: string;
  qrContent: string;
  queryBase: Record<string, string>;
  status: QrLoginStatus;
  nickname?: string;
  xianyuUid?: string;
  cookieString?: string;
  savedAccountId?: number;
  message?: string;
  finalized: boolean;
}

@Injectable()
export class QrLoginService {
  private readonly logger = new Logger(QrLoginService.name);
  private readonly sessions = new Map<string, QrLoginSession>();
  private readonly sessionTtlMs = 3 * 60 * 1000;

  constructor(
    private readonly sdk: GoofishSdkService,
    private readonly accounts: AccountsService,
  ) {
    setInterval(() => this.cleanupSessions(), 60_000);
  }

  /** 发起扫码登录，返回 sessionId 与二维码内容 */
  async start(tenantId: number, accountId?: number): Promise<{
    sessionId: string;
    qrContent: string;
    expiresAt: string;
  }> {
    this.cleanupSessions();

    // 获取闲鱼未登录态初始 cookie（cna / cookie2 等）。
    // 这一步调用闲鱼公开接口，可能因网络/风控失败，必须 try/catch
    // 否则异常会冒泡成 500（前端只看到 "Request failed with status code 500"）。
    let cookies: Record<string, string>;
    try {
      const risk = new this.sdk.module.GoofishRiskControl();
      cookies = await risk.buildInitialCookies();
    } catch (e) {
      const msg = (e as Error).message;
      this.logger.error(`获取初始 Cookie 失败: ${msg}`);
      throw new BadRequestException(
        `获取闲鱼初始 Cookie 失败：${msg}。可能原因：网络异常、闲鱼风控、fetch 不可用。请稍后重试或改用浏览器手动复制 Cookie。`,
      );
    }

    const jar = { ...cookies };
    const cna = jar.cna || '';
    const cookie2 = jar.cookie2 || '';

    let miniResp;
    try {
      miniResp = await axios.get(
        'https://passport.goofish.com/mini_login.htm',
        {
          params: {
            lang: 'zh_cn',
            appName: 'xianyu',
            appEntrance: 'web',
            styleType: 'vertical',
            bizParams: '',
            notLoadSsoView: 'false',
            notKeepLogin: 'false',
            isMobile: 'false',
            qrCodeFirst: 'false',
            stie: '77',
            rnd: Math.random(),
          },
          headers: {
            ...PASSPORT_HEADERS,
            Referer: 'https://www.goofish.com/',
            'sec-fetch-site': 'same-site',
            'sec-fetch-dest': 'iframe',
            'sec-fetch-mode': 'navigate',
            Cookie: cookiesToString(jar),
          },
          timeout: 15_000,
          validateStatus: () => true,
        },
      );
    } catch (e) {
      const msg = (e as Error).message;
      this.logger.error(`请求 mini_login.htm 失败: ${msg}`);
      throw new BadRequestException(`请求闲鱼登录页失败：${msg}（网络异常或被墙）`);
    }
    this.mergeSetCookie(jar, miniResp);

    const csrfToken = jar['XSRF-TOKEN'] || '';
    const bizParams =
      'taobaoBizLoginFrom=web&renderRefer=' +
      encodeURIComponent('https://www.goofish.com/');

    const genParams = {
      appName: 'xianyu',
      fromSite: '77',
      appEntrance: 'web',
      _csrf_token: csrfToken,
      umidToken: '',
      hsiz: cookie2,
      bizParams,
      mainPage: 'false',
      isMobile: 'false',
      lang: 'zh_CN',
      returnUrl: '',
      umidTag: 'SERVER',
    };

    let genResp;
    try {
      genResp = await axios.get(
        'https://passport.goofish.com/newlogin/qrcode/generate.do',
        {
          params: genParams,
          headers: {
            ...PASSPORT_HEADERS,
            Referer: 'https://passport.goofish.com/mini_login.htm',
            Cookie: cookiesToString(jar),
          },
          timeout: 10_000,
          validateStatus: () => true,
        },
      );
    } catch (e) {
      const msg = (e as Error).message;
      this.logger.error(`请求 generate.do 失败: ${msg}`);
      throw new BadRequestException(`生成二维码请求失败：${msg}（网络异常或被风控）`);
    }
    this.mergeSetCookie(jar, genResp);

    const genJson = genResp.data as {
      content?: { success?: boolean; data?: { codeContent?: string; t?: string; ck?: string } };
    };
    const genData = genJson.content?.data;
    if (!genJson.content?.success || !genData?.codeContent) {
      this.logger.error(`二维码生成失败: ${JSON.stringify(genResp.data).slice(0, 300)}`);
      throw new BadRequestException('二维码生成失败，请稍后重试');
    }

    const queryBase: Record<string, string> = {
      appName: 'xianyu',
      fromSite: '77',
      appEntrance: 'web',
      _csrf_token: csrfToken,
      umidToken: '',
      hsiz: cookie2,
      bizParams,
      mainPage: 'false',
      isMobile: 'false',
      lang: 'zh_CN',
      returnUrl: '',
      umidTag: 'SERVER',
      navlanguage: 'en',
      navUserAgent: GOOFISH_UA,
      navPlatform: 'Win32',
      isIframe: 'true',
      documentReferer: 'https://www.goofish.com/',
      defaultView: 'sms',
      deviceId: cna,
    };

    const sessionId = randomUUID();
    const now = Date.now();
    const session: QrLoginSession = {
      id: sessionId,
      tenantId,
      accountId,
      createdAt: now,
      expiresAt: now + this.sessionTtlMs,
      cookies: jar,
      csrfToken,
      cookie2,
      cna,
      qrT: String(genData.t),
      qrCk: String(genData.ck),
      qrContent: genData.codeContent,
      queryBase,
      status: 'PENDING',
      finalized: false,
    };
    this.sessions.set(sessionId, session);

    this.logger.log(`扫码登录 session 已创建: ${sessionId}`);
    return {
      sessionId,
      qrContent: session.qrContent,
      expiresAt: new Date(session.expiresAt).toISOString(),
    };
  }

  /** 轮询扫码状态；确认后自动保存账号 Cookie */
  async pollStatus(
    sessionId: string,
    tenantId: number,
  ): Promise<{
    status: QrLoginStatus;
    message?: string;
    nickname?: string;
    xianyuUid?: string;
    accountId?: number;
  }> {
    const session = this.getSession(sessionId, tenantId);

    if (session.status === 'CONFIRMED' && session.savedAccountId) {
      return {
        status: 'CONFIRMED',
        message: '登录成功',
        nickname: session.nickname,
        xianyuUid: session.xianyuUid,
        accountId: session.savedAccountId,
      };
    }

    if (['EXPIRED', 'CANCELED', 'ERROR'].includes(session.status)) {
      return {
        status: session.status,
        message: session.message,
      };
    }

    const body = {
      ...session.queryBase,
      t: session.qrT,
      ck: session.qrCk,
    };

    const pollResp = await axios.post(
      'https://passport.goofish.com/newlogin/qrcode/query.do?appName=xianyu&fromSite=77',
      new URLSearchParams(body).toString(),
      {
        headers: {
          ...PASSPORT_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'https://passport.goofish.com',
          Referer: 'https://passport.goofish.com/mini_login.htm',
          Cookie: cookiesToString(session.cookies),
        },
        timeout: 10_000,
        validateStatus: () => true,
      },
    );
    this.mergeSetCookie(session.cookies, pollResp);

    const qdata = (pollResp.data as { content?: { data?: Record<string, unknown> } })
      .content?.data;

    if (qdata?.iframeRedirect) {
      session.status = 'ERROR';
      session.message = '触发风控验证，请改用浏览器手动登录后粘贴 Cookie';
      return { status: 'ERROR', message: session.message };
    }

    const rawStatus = String(qdata?.qrCodeStatus || 'UNKNOWN').toUpperCase();
    const status = this.normalizeStatus(rawStatus);
    session.status = status;

    if (status === 'NEW') {
      return { status, message: '请使用闲鱼 App 扫描二维码' };
    }
    if (status === 'SCANNED' || status === 'SCANED') {
      return { status, message: '已扫码，请在手机上确认登录' };
    }
    if (status === 'EXPIRED') {
      session.message = '二维码已过期，请重新获取';
      return { status, message: session.message };
    }
    if (status === 'CANCELED') {
      session.message = '已在手机端取消登录';
      return { status, message: session.message };
    }

    if (status === 'CONFIRMED') {
      await this.finalizeLogin(session, qdata || {});
      const accountId = await this.saveAccount(session);
      return {
        status: 'CONFIRMED',
        message: '登录成功',
        nickname: session.nickname,
        xianyuUid: session.xianyuUid,
        accountId,
      };
    }

    return { status, message: `未知状态: ${rawStatus}` };
  }

  private async finalizeLogin(
    session: QrLoginSession,
    qdata: Record<string, unknown>,
  ): Promise<void> {
    if (session.finalized) return;

    const loginToken =
      (qdata.token as string) || (qdata.lgToken as string) || '';

    if (loginToken) {
      const loginResp = await axios.post(
        'https://passport.goofish.com/login_token/login.do',
        new URLSearchParams({ deviceId: session.cna }).toString(),
        {
          params: {
            token: loginToken,
            subFlow: 'DIALOG_CHECK_LOGIN_RPC',
            nextCode: '0018',
            bizScene: 'qrcode',
            confirm: 'true',
          },
          headers: {
            ...PASSPORT_HEADERS,
            'Content-Type': 'application/x-www-form-urlencoded',
            Origin: 'https://passport.goofish.com',
            Referer: 'https://passport.goofish.com/mini_login.htm',
            Cookie: cookiesToString(session.cookies),
          },
          timeout: 10_000,
          validateStatus: () => true,
        },
      );
      this.mergeSetCookie(session.cookies, loginResp);
    }

    const mtopResp = await axios.post(
      'https://h5api.m.goofish.com/h5/mtop.idle.web.user.page.nav/1.0/',
      'data=%7B%7D',
      {
        params: {
          jsv: '2.7.2',
          appKey: '34839810',
          t: String(Date.now()),
          sign: '',
          v: '1.0',
          type: 'originaljson',
          dataType: 'json',
          timeout: '20000',
          api: 'mtop.idle.web.user.page.nav',
          sessionOption: 'AutoLoginOnly',
          spm_cnt: 'a21ybx.home.0.0',
        },
        headers: {
          ...GOOFISH_MTOP_HEADERS,
          Cookie: cookiesToString(session.cookies),
        },
        timeout: 10_000,
        validateStatus: () => true,
      },
    );
    this.mergeSetCookie(session.cookies, mtopResp);

    const unb = session.cookies.unb || '';
    if (!unb) {
      session.status = 'ERROR';
      session.message = '登录未完成，未获取到用户 Cookie';
      throw new BadRequestException(session.message);
    }

    let tracknick = session.cookies.tracknick || '';
    try {
      tracknick = decodeURIComponent(tracknick);
    } catch {
      /* keep raw */
    }

    session.xianyuUid = unb;
    session.nickname = tracknick || `闲鱼用户${unb.slice(-4)}`;
    session.cookieString = cookiesToString(session.cookies);
    session.finalized = true;
    this.logger.log(`扫码登录成功: ${session.nickname} (unb=${unb})`);
  }

  private async saveAccount(session: QrLoginSession): Promise<number> {
    if (session.savedAccountId) return session.savedAccountId;
    if (!session.cookieString || !session.xianyuUid) {
      throw new BadRequestException('Cookie 尚未就绪');
    }

    if (session.accountId) {
      await this.accounts.updateCookie(
        session.accountId,
        session.tenantId,
        session.cookieString,
      );
      session.savedAccountId = session.accountId;
      this.logger.log(`扫码更新 Cookie: account=${session.accountId}`);
      return session.accountId;
    }

    const account = await this.accounts.create({
      tenantId: session.tenantId,
      nickname: session.nickname || session.xianyuUid,
      xianyuUid: session.xianyuUid,
      cookie: session.cookieString,
    });
    session.savedAccountId = account.id;
    return account.id;
  }

  private getSession(sessionId: string, tenantId: number): QrLoginSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException('扫码会话不存在或已过期');
    }
    if (session.tenantId !== tenantId) {
      throw new NotFoundException('扫码会话不存在');
    }
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      throw new GoneException('二维码已过期，请重新获取');
    }
    return session;
  }

  private normalizeStatus(raw: string): QrLoginStatus {
    if (raw === 'SCANED') return 'SCANED';
    if (raw === 'SCANNED') return 'SCANNED';
    if (
      raw === 'NEW' ||
      raw === 'CONFIRMED' ||
      raw === 'EXPIRED' ||
      raw === 'CANCELED'
    ) {
      return raw;
    }
    return 'ERROR';
  }

  private mergeSetCookie(
    jar: Record<string, string>,
    resp: AxiosResponse,
  ): void {
    const headers = resp.headers['set-cookie'];
    if (!headers) return;
    const list = Array.isArray(headers) ? headers : [headers];
    for (const line of list) {
      const part = line.split(';')[0]?.trim();
      if (!part || !part.includes('=')) continue;
      const eq = part.indexOf('=');
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (name) jar[name] = value;
    }
  }

  private cleanupSessions(): void {
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (now > s.expiresAt + 60_000) {
        this.sessions.delete(id);
      }
    }
  }
}
