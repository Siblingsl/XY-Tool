import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../users/user.entity';
import { XianyuAccountEntity } from '../accounts/account.entity';
import { OrderEntity } from '../orders/order.entity';
import { KamiItemEntity } from '../kami-pool/kami-pool.entity';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

/**
 * 运营后台模块。
 * 跨租户查询 users/accounts/orders/kami，供 system 角色使用。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      XianyuAccountEntity,
      OrderEntity,
      KamiItemEntity,
    ]),
  ],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
