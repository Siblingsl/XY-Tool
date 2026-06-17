import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoofishModule } from '../../goofish/goofish.module';
import { XianyuAccountEntity } from './account.entity';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';
import { QrLoginService } from './qr-login.service';
import { CookieHealthService } from './cookie-health.service';

@Module({
  imports: [TypeOrmModule.forFeature([XianyuAccountEntity]), GoofishModule],
  providers: [AccountsService, QrLoginService, CookieHealthService],
  controllers: [AccountsController],
  exports: [AccountsService, CookieHealthService],
})
export class AccountsModule {}
