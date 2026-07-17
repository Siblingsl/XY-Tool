import { Module } from '@nestjs/common';
import { GoofishModule } from '../../goofish/goofish.module';
import { AccountsModule } from '../accounts/accounts.module';
import { ListingRewriteController } from './listing-rewrite.controller';
import { ListingRewriteService } from './listing-rewrite.service';

@Module({
  imports: [AccountsModule, GoofishModule],
  controllers: [ListingRewriteController],
  providers: [ListingRewriteService],
})
export class ListingRewriteModule {}
