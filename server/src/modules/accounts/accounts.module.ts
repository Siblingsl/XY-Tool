import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoofishModule } from '../../goofish/goofish.module';
import { AlertModule } from '../alert/alert.module';
import { XianyuAccountEntity } from './account.entity';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';
import { QrLoginService } from './qr-login.service';
import { CookieHealthService } from './cookie-health.service';
import { CookieRenewService } from './cookie-renew.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([XianyuAccountEntity]),
    GoofishModule,
    AlertModule,
    RealtimeModule,
  ],
  providers: [AccountsService, QrLoginService, CookieHealthService, CookieRenewService],
  controllers: [AccountsController],
  exports: [AccountsService, CookieHealthService, CookieRenewService],
})
export class AccountsModule {}
