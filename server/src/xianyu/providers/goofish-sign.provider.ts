import { Injectable, Logger } from '@nestjs/common';
import { ISignProvider, SignInput, SignOutput } from '../interfaces';
import { GoofishSdkService } from '../../goofish/goofish-sdk.service';

/**
 * Goofish PC H5 签名 — 直接使用 goofish-sdk.js 的 generateSign。
 */
@Injectable()
export class GoofishSignProvider implements ISignProvider {
  private readonly logger = new Logger(GoofishSignProvider.name);
  readonly name = 'goofish';

  constructor(private readonly sdkService: GoofishSdkService) {}

  async sign(input: SignInput): Promise<SignOutput> {
    const dataStr = JSON.stringify(input.data);
    const xSign = this.sdkService.module.generateSign(
      String(input.timestamp),
      input.token,
      dataStr,
    );
    return {
      xSign,
      xMiniWua: '',
      xSgext: '',
      xSignMethod: 'goofish-sdk-md5',
    };
  }

  async health(): Promise<boolean> {
    this.logger.log('goofish-sdk.js 签名已启用');
    return true;
  }
}
