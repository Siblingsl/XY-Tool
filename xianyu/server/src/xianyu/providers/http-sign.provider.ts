import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { ISignProvider, SignInput, SignOutput } from '../interfaces';

/**
 * HTTP 签名提供者。
 *
 * 对接市面上的第三方 mtop 签名 API 服务。
 * 这类服务通常以 HTTP 接口形式提供：把 SignInput 发过去，返回 SignOutput。
 *
 * 配置项（环境变量）：
 *  - SIGN_HTTP_URL:   第三方签名服务地址
 *  - SIGN_HTTP_TOKEN: 鉴权 token（按调用计费的服务通常需要）
 *
 * 对接约定（第三方服务的常见格式）：
 *   POST {SIGN_HTTP_URL}/sign
 *   Header: Authorization: Bearer {token}
 *   Body:   SignInput
 *   返回:   { code:0, data: SignOutput }
 *
 * 如果你的签名服务商接口格式不同，修改此文件即可，不影响业务层。
 */
@Injectable()
export class HttpSignProvider implements ISignProvider {
  private readonly logger = new Logger(HttpSignProvider.name);
  private readonly http: AxiosInstance;
  readonly name = 'http';

  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {
    this.http = axios.create({
      baseURL: url.replace(/\/$/, ''),
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  }

  async sign(input: SignInput): Promise<SignOutput> {
    if (!this.url) {
      throw new Error('HTTP 签名服务未配置 (SIGN_HTTP_URL)');
    }
    const { data } = await this.http.post('/sign', input);
    // 兼容 { code, data } 包装 与 裸 SignOutput 两种格式
    const payload = (data as { code?: number; data?: SignOutput })?.data ?? data;
    if (
      !payload ||
      typeof payload.xSign !== 'string' ||
      typeof payload.xMiniWua !== 'string' ||
      typeof payload.xSgext !== 'string'
    ) {
      throw new Error('签名服务返回格式异常');
    }
    return payload as SignOutput;
  }

  async health(): Promise<boolean> {
    try {
      const { data } = await this.http.get('/health');
      return data?.status === 'ok' || data?.code === 0;
    } catch {
      return false;
    }
  }
}
