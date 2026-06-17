import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WsAdapter } from '@nestjs/platform-ws';
import { types } from 'pg';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

// PostgreSQL 默认把 bigint(int8) 与 numeric 解析为字符串。
// 实体中 id/tenantId/amount 等字段声明为 number，这里统一解析回 number。
// 注意：值若超过 Number.MAX_SAFE_INTEGER(2^53) 会丢失精度，
// 本项目自增主键不可能达到该量级，故可安全使用。
types.setTypeParser(types.builtins.INT8, (val: string) => Number(val));
types.setTypeParser(types.builtins.NUMERIC, (val: string) => Number(val));

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  app.setGlobalPrefix('api');
  // WebSocket 使用原生 ws 适配器（RealtimeGateway）
  app.useWebSocketAdapter(new WsAdapter(app));

  const config = app.get(ConfigService);

  // 1. 启动后校验关键配置是否就位
  const encKey = config.get<string>('cookieEncryptionKey');
  if (!encKey || encKey.length < 64) {
    logger.error('COOKIE_ENCRYPTION_KEY 未配置或长度不足 64 字符');
    process.exit(1);
  }

  // 2. CORS
  app.enableCors({
    origin: config.get<string>('cors.origin'),
    credentials: true,
  });

  // 3. 全局管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 4. 全局过滤器 + 拦截器
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const port = config.get<number>('port') || 3000;
  await app.listen(port);
  logger.log(`🚀 后端服务已启动: http://localhost:${port}`);
  logger.log(
    `签名服务: ${config.get<string>('sign.provider')} | 订单Mock: ${config.get<boolean>('order.mockMode')}`,
  );
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('启动失败:', err);
  process.exit(1);
});
