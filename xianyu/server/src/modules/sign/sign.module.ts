import { Module } from '@nestjs/common';
import { XianyuModule } from '../../xianyu/xianyu.module';
import { SignService } from './sign.service';
import { SignController } from './sign.controller';

@Module({
  // XianyuModule 提供 ISignProvider（通过 SIGN_PROVIDER token）
  imports: [XianyuModule],
  providers: [SignService],
  controllers: [SignController],
  exports: [SignService],
})
export class SignModule {}
