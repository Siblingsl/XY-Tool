import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ISignProvider, SIGN_PROVIDER } from './interfaces';
import { MtopClient } from './mtop-client';
import { OrderApi } from './apis/order.api';
import { MessageApi } from './apis/message.api';
import { DeliveryApi } from './apis/delivery.api';
import { MockSignProvider } from './providers/mock-sign.provider';
import { HttpSignProvider } from './providers/http-sign.provider';
import { NativeSignProvider } from './providers/native-sign.provider';
import { GoofishSignProvider } from './providers/goofish-sign.provider';
import { GoofishModule } from '../goofish/goofish.module';
import { GoofishSdkService } from '../goofish/goofish-sdk.service';

@Module({
  imports: [ConfigModule, GoofishModule],
  providers: [
    {
      provide: SIGN_PROVIDER,
      inject: [ConfigService, GoofishSdkService],
      useFactory: (config: ConfigService, sdk: GoofishSdkService): ISignProvider => {
        const logger = new Logger('SignProviderFactory');
        const provider = config.get<string>('sign.provider') || 'mock';
        switch (provider) {
          case 'goofish':
            logger.log('启用 goofish-sdk.js 签名');
            return new GoofishSignProvider(sdk);
          case 'http':
            logger.log('启用 HTTP 第三方签名服务');
            return new HttpSignProvider(
              config.get<string>('sign.httpUrl') || '',
              config.get<string>('sign.httpToken') || '',
            );
          case 'native':
            logger.log('启用 Native 自研签名服务');
            return new NativeSignProvider(
              config.get<string>('sign.nativeEndpoint') || 'http://127.0.0.1:9090',
            );
          case 'mock':
          default:
            logger.warn('启用 Mock 签名服务（仅供开发，真实环境请切换 goofish）');
            return new MockSignProvider();
        }
      },
    },
    MtopClient,
    OrderApi,
    MessageApi,
    DeliveryApi,
  ],
  exports: [OrderApi, MessageApi, DeliveryApi, MtopClient, SIGN_PROVIDER],
})
export class XianyuModule {}
