import { Controller, Get, Logger } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';

/**
 * 健康检查接口（公开，无 JWT，不限流）。
 *
 * 供 docker-compose healthcheck、负载均衡探针、监控系统调用。
 * 返回各依赖连通性 + 进程 uptime。
 */
@ApiTags('健康检查')
@Controller('health')
@SkipThrottle()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @ApiOperation({ summary: '健康检查', description: '检查 DB / Redis 连通性 + 进程 uptime（无鉴权）' })
  async check(): Promise<{
    status: 'ok' | 'degraded';
    db: boolean;
    redis: boolean;
    uptime: number;
    timestamp: string;
  }> {
    const [db, redis] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
    ]);

    const status = db && redis ? 'ok' : 'degraded';
    return {
      status,
      db,
      redis,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDb(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch (err) {
      this.logger.debug(`健康检查 DB 失败: ${(err as Error).message}`);
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      // 临时连接探测，避免污染 Bull 的连接池
      const host = process.env.REDIS_HOST || 'localhost';
      const port = parseInt(process.env.REDIS_PORT || '6379', 10);
      const password = process.env.REDIS_PASSWORD || undefined;
      const client = new Redis({ host, port, password, lazyConnect: true });
      await client.connect();
      const pong = await client.ping();
      client.disconnect();
      return pong === 'PONG';
    } catch (err) {
      this.logger.debug(`健康检查 Redis 失败: ${(err as Error).message}`);
      return false;
    }
  }
}
