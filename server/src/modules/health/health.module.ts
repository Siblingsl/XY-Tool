import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * 健康检查模块。
 * 不依赖业务模块，直接用全局 DataSource + 临时 Redis 连接探测。
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
