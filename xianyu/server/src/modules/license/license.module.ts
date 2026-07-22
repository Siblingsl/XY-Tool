import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  LicenseTypeEntity,
  LicenseBatchEntity,
  LicenseCodeEntity,
} from './entities/license.entities';
import { LicenseService } from './license.service';
import { LicenseController } from './license.controller';
import { LicensePublicController } from './license-public.controller';

/**
 * 激活码中台模块。
 *
 * 两个 controller：
 * - LicenseController：内部管理（/api/license/manage/*，JWT 鉴权）
 * - LicensePublicController：对外验证（/api/license/verify，ApiKeyGuard 鉴权）
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      LicenseTypeEntity,
      LicenseBatchEntity,
      LicenseCodeEntity,
    ]),
  ],
  providers: [LicenseService],
  controllers: [LicenseController, LicensePublicController],
  exports: [LicenseService],
})
export class LicenseModule {}
