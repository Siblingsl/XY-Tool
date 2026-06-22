import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * 全局 Redis 模块。
 * 提供对话上下文、人工接管标记、回复冷却能力。
 * 任何模块注入 RedisService 即可使用，无需各自 import。
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
