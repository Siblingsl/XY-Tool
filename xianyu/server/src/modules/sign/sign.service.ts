import { Inject, Injectable, Logger } from '@nestjs/common';
import { ISignProvider, SIGN_PROVIDER } from '../../xianyu/interfaces';

/**
 * 签名服务门面。
 *
 * 业务层通常不需要直接调用签名（mtop-client 内部已调用）。
 * 此 Service 主要用于：
 * 1. 健康检查接口（前端展示当前签名服务状态）
 * 2. 启动时自检（签名服务挂了就提前告警）
 */
@Injectable()
export class SignService {
  private readonly logger = new Logger(SignService.name);

  constructor(@Inject(SIGN_PROVIDER) private readonly provider: ISignProvider) {}

  /** 当前签名提供者名称 */
  get providerName(): string {
    return this.provider.name;
  }

  /** 健康检查 */
  async checkHealth(): Promise<{ provider: string; healthy: boolean }> {
    try {
      const healthy = await this.provider.health();
      return { provider: this.provider.name, healthy };
    } catch (e) {
      this.logger.error(`签名服务健康检查异常: ${(e as Error).message}`);
      return { provider: this.provider.name, healthy: false };
    }
  }
}
