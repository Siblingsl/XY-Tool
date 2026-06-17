import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * 全局异常过滤器：统一错误响应格式
 * {
 *   code: <HTTP 状态码或业务码>,
 *   message: <人类可读的错误信息>,
 *   data: null,
 *   path: <请求路径>,
 *   timestamp: <ISO 时间>
 * }
 *
 * 捕获所有未处理异常，避免向客户端泄露堆栈。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误';
    let code = 500;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = status;
      const res = exception.getResponse();
      message =
        typeof res === 'string'
          ? res
          : (res as Record<string, unknown>).message?.toString() ||
            exception.message;
    } else {
      // 非业务异常（如 DB 连接失败、网络错误），记录完整堆栈
      this.logger.error(
        `未处理异常: ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // 开发环境下附带错误详情，便于排查
    const isDev = process.env.NODE_ENV !== 'production';

    response.status(status).json({
      code,
      message,
      data: null,
      path: request.url,
      timestamp: new Date().toISOString(),
      ...(isDev && exception instanceof Error && !(exception instanceof HttpException)
        ? { detail: exception.message }
        : {}),
    });
  }
}
