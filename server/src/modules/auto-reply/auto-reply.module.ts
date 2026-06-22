import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ReplyKeywordEntity,
  ReplyConfigEntity,
  ReplyHandoffEntity,
} from './entities/reply.entities';
import { AutoReplyService } from './auto-reply.service';
import { AutoReplyController } from './auto-reply.controller';
import { GoofishModule } from '../../goofish/goofish.module';
import { AccountsModule } from '../accounts/accounts.module';

/**
 * 自动回复模块。
 *
 * 依赖：
 * - GoofishModule（ImWebSocketService 发送回复）
 * - AccountsModule（AccountsService 更新 cookie）
 * - RedisService（全局，无需 import）
 *
 * 被 OrdersModule import，由 ImPaymentListener 的 onChatMessage 调用。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReplyKeywordEntity,
      ReplyConfigEntity,
      ReplyHandoffEntity,
    ]),
    GoofishModule,
    AccountsModule,
  ],
  providers: [AutoReplyService],
  controllers: [AutoReplyController],
  exports: [AutoReplyService],
})
export class AutoReplyModule {}
