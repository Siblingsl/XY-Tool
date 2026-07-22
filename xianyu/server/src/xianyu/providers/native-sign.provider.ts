import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ISignProvider, SignInput, SignOutput } from '../interfaces';

/**
 * Native 签名提供者（自研 so 库的接入点）。
 *
 * 适用场景：你已经逆向出闲鱼的签名算法（封装在 .so / .dll / 可执行程序里），
 * 并在本地或内网部署了一个签名服务（例如用 unidbg 跑 so，暴露 HTTP 接口）。
 *
 * 这是"最硬核"的方案，技术要求高，但成本可控（不依赖第三方计费）。
 *
 * 对接约定（自研签名服务的常见形态）：
 *   POST http://127.0.0.1:9090/sign
 *   Body: SignInput
 *   返回: SignOutput
 *
 * 若你的签名服务在本地以 Node addon（.node）形式直接加载，
 * 可在此 require addon 并直接调用，无需走 HTTP。
 */
@Injectable()
export class NativeSignProvider implements ISignProvider {
  private readonly logger = new Logger(NativeSignProvider.name);
  readonly name = 'native';

  constructor(
    private readonly endpoint: string = 'http://127.0.0.1:9090',
  ) {}

  async sign(input: SignInput): Promise<SignOutput> {
    const { data } = await axios.post(`${this.endpoint}/sign`, input, {
      timeout: 3000,
    });
    return data as SignOutput;
  }

  async health(): Promise<boolean> {
    try {
      const { data } = await axios.get(`${this.endpoint}/health`, { timeout: 2000 });
      return data?.status === 'ok';
    } catch {
      return false;
    }
  }
}
