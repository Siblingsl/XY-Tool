import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { ISignProvider, SignInput, SignOutput } from '../interfaces';

/**
 * Mock 签名提供者（开发用）。
 *
 * 不调用任何真实签名服务，而是用简单的 hash 生成"看起来像签名"的字符串。
 * 用途：在拿到真实签名实现/服务之前，让整个系统的流程能跑通（监听→匹配→发货）。
 *
 * ⚠️ 这些假签名发给真实闲鱼服务器一定会被拒绝（ret 返回 FAIL_SYS_ILLEGAL_ACCESS）。
 *    切换到真实环境时，把 SIGN_PROVIDER 改成 http 或 native 即可。
 */
@Injectable()
export class MockSignProvider implements ISignProvider {
  private readonly logger = new Logger(MockSignProvider.name);
  readonly name = 'mock';

  async sign(input: SignInput): Promise<SignOutput> {
    // 用输入字段拼一个确定性 hash，方便调试观察
    const seed = [
      input.apiName,
      input.version,
      input.timestamp,
      input.appKey,
      input.token,
      JSON.stringify(input.data),
    ].join('|');

    const h = (suffix: string) =>
      'mock_' + createHash('md5').update(seed + suffix).digest('hex').toUpperCase();

    return {
      xSign: h('sign'),
      xMiniWua: h('wua'),
      xSgext: Buffer.from(h('sgext')).toString('base64'),
      xSignMethod: 'mock-v0',
    };
  }

  async health(): Promise<boolean> {
    this.logger.warn('使用 Mock 签名服务 —— 真实环境下请切换 SIGN_PROVIDER');
    return true;
  }
}
