import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { isMtopSuccess, loadGoofishSdk } from './goofish-sdk.loader';
import { isGoofishCaptchaFromRet } from './goofish-error.util';
import type {
  GoofishClientInstance,
  GoofishMtopRawResponse,
  GoofishSdkModule,
} from './goofish-sdk.types';

/**
 * NestJS 对 goofish-sdk.js 的统一封装。
 * 业务层通过本 Service 创建 GoofishClient、调用签名/解密/WS 协议构造。
 */
@Injectable()
export class GoofishSdkService implements OnModuleInit {
  private readonly logger = new Logger(GoofishSdkService.name);
  private sdk!: GoofishSdkModule;

  onModuleInit(): void {
    this.sdk = loadGoofishSdk();
    this.logger.log('goofish-sdk.js 已加载');
  }

  get module(): GoofishSdkModule {
    if (!this.sdk) this.sdk = loadGoofishSdk();
    return this.sdk;
  }

  createClient(cookie: string): GoofishClientInstance {
    return new this.module.GoofishClient(cookie);
  }

  assertMtopSuccess<T>(res: GoofishMtopRawResponse<T>, api: string): T {
    if (!isMtopSuccess(res)) {
      const code = res.ret?.[0] || 'UNKNOWN';
      // 仅提醒，不改错误形态、不触发冷静期
      if (isGoofishCaptchaFromRet(res.ret)) {
        this.logger.warn(`mtop ${api} 风控响应: ${code}`);
      }
      throw new Error(`goofish mtop ${api} 失败: ${code}`);
    }
    return res.data as T;
  }

  /** 调用 mtop 并校验 SUCCESS，返回 data + 最新 cookie */
  async mtop<T>(
    cookie: string,
    api: string,
    data: Record<string, unknown> | string,
    extraParams: Record<string, unknown> = {},
  ): Promise<{ data: T; cookie: string; raw: GoofishMtopRawResponse<T> }> {
    const client = this.createClient(cookie);
    const raw = (await client.mtopPost(api, data, extraParams)) as GoofishMtopRawResponse<T>;
    const result = this.assertMtopSuccess(raw, api);
    return { data: result, cookie: client.getCookieString(), raw };
  }
}
