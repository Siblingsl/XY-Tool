import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * 统一成功响应格式：
 * {
 *   code: 0,           // 0 = 成功，非 0 = 业务错误
 *   message: 'success',
 *   data: <任意>       // 实际业务数据
 * }
 *
 * 对已经按此格式返回的（如带 code 字段的对象）不二次包装。
 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T> | T>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T> | T> {
    return next.handle().pipe(
      map((data) => {
        // 已是标准格式，直接返回
        if (
          data &&
          typeof data === 'object' &&
          'code' in data &&
          'message' in data
        ) {
          return data;
        }
        return {
          code: 0,
          message: 'success',
          data,
        };
      }),
    );
  }
}
