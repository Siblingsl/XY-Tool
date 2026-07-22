import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * 从请求中提取已登录用户信息。
 * 用法: @CurrentUser() user: JwtPayload
 *
 * 依赖 JwtStrategy 解析后将 payload 挂到 request.user。
 */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: JwtPayload = request.user;
    return data ? user?.[data] : user;
  },
);
