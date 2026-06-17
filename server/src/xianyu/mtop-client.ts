import { Inject, Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import {
  ISignProvider,
  MtopRequestContext,
  MtopResponse,
  SIGN_PROVIDER,
  isMtopSuccess,
} from './interfaces';

/**
 * mtop 网关客户端。
 *
 * mtop 是阿里系 App（淘宝/天猫/闲鱼）统一使用的移动端 API 网关。
 * 一次完整的 mtop 请求流程：
 *   1. 准备业务参数 data
 *   2. 调用 ISignProvider 计算签名（x-sign/x-mini-wua/x-sgext）
 *   3. 把签名 + cookie + 参数组装成 HTTP 请求（POST JSON）
 *   4. 发往 mtop 网关 https://h5api.m.goofish.com/h5/{api}/1.0/
 *   5. 解析响应，检查 ret 字段是否以 SUCCESS:: 开头
 *
 * 注意：闲鱼网页域名为 goofish.com（原 idle.fish），mtop 网关沿用 h5api.m.goofish.com。
 */
@Injectable()
export class MtopClient {
  private readonly logger = new Logger(MtopClient.name);
  private readonly http: AxiosInstance;

  /** mtop H5 网关地址 */
  private readonly MTOP_GATEWAY = 'https://h5api.m.goofish.com/h5';

  /** App 端 appKey（mock/http/native 模式） */
  private readonly DEFAULT_APPKEY = '12574478';
  /** PC goofish.com appKey */
  private readonly GOOFISH_APPKEY = '34839810';

  constructor(@Inject(SIGN_PROVIDER) private readonly signer: ISignProvider) {
    this.http = axios.create({
      timeout: 10000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // 模拟闲鱼 H5 的 UA，避免被基础风控拦截
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      },
    });
  }

  /** 获取当前签名提供者名称（监控用） */
  get providerName(): string {
    return this.signer.name;
  }

  /**
   * 发起一次 mtop 请求。
   *
   * @param apiName   接口名，如 mtop.taobao.idle.trade.order.list
   * @param version   协议版本，默认 1.0
   * @param data      业务参数对象
   * @param ctx       账号上下文（cookie / appKey / UA）
   * @returns         mtop 响应数据
   * @throws          签名失败、网络错误、或 mtop 返回 FAIL_* 时抛出
   */
  async invoke<T = unknown>(
    apiName: string,
    data: Record<string, unknown>,
    ctx: MtopRequestContext,
    version = '1.0',
  ): Promise<T> {
    const isGoofish = this.signer.name === 'goofish';
    const appKey = isGoofish
      ? this.GOOFISH_APPKEY
      : ctx.appKey || this.DEFAULT_APPKEY;
    const timestamp = Date.now();
    const token = this.extractToken(ctx.cookie);

    // 1. 签名
    const sign = await this.signer.sign({
      apiName,
      version,
      timestamp,
      appKey,
      token,
      data,
      userAgent: ctx.userAgent,
    });

    // 2. 组装 mtop 请求（POST 表单）
    const url = `${this.MTOP_GATEWAY}/${apiName}/${version}/`;
    const form = new URLSearchParams();
    form.append('jsv', '2.7.2');
    form.append('appKey', appKey);
    form.append('t', String(timestamp));
    form.append('sign', sign.xSign);
    form.append('api', apiName);
    form.append('v', version);
    form.append('type', 'originaljson');
    form.append('dataType', 'json');
    form.append('data', JSON.stringify(data));
    if (isGoofish) {
      form.append('accountSite', 'xianyu');
      form.append('sessionOption', 'AutoLoginOnly');
    }

    // 3. 发请求
    const headers: Record<string, string> = {
      Cookie: ctx.cookie,
      'User-Agent': ctx.userAgent,
    };
    if (sign.xMiniWua) headers['x-mini-wua'] = sign.xMiniWua;
    if (sign.xSgext) headers['x-sgext'] = sign.xSgext;
    if (sign.xSign) headers['x-sign'] = sign.xSign;
    if (sign.xSignMethod) headers['x-sign-method'] = sign.xSignMethod;

    const { data: raw } = await this.http.post(url, form.toString(), { headers });

    const res = raw as MtopResponse<T>;

    // 4. 校验结果
    if (!isMtopSuccess(res)) {
      const errCode = res.ret?.[0] || 'UNKNOWN';
      this.logger.warn(`mtop 调用失败 ${apiName}: ${errCode}`);
      throw new MtopApiError(apiName, errCode, res.data);
    }

    return res.data;
  }

  /**
   * 从 cookie 字符串中提取 _m_h5_tk 的前半段作为 token。
   * _m_h5_tk 格式: "token_hex_timestamp"，取第一段。
   * 没有 token 时返回空串（部分匿名接口允许）。
   */
  private extractToken(cookie: string): string {
    const match = cookie.match(/_m_h5_tk=([^;]+)/);
    if (!match) return '';
    return decodeURIComponent(match[1]).split('_')[0];
  }
}

/** mtop 业务错误（ret 非 SUCCESS） */
export class MtopApiError extends Error {
  constructor(
    public readonly api: string,
    public readonly code: string,
    public readonly detail: unknown,
  ) {
    super(`mtop ${api} 失败: ${code}`);
    this.name = 'MtopApiError';
  }
}
