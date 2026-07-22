import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * 角色守卫。
 *
 * 配合 @Roles(...) 装饰器使用，校验当前登录用户的 role 是否满足要求。
 * 必须在 JwtAuthGuard 之后执行（依赖 request.user 已被填充）。
 *
 * 无 @Roles 元数据时直接放行（向后兼容）。
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 未标注 @Roles 的接口不做角色限制
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: JwtPayload | undefined = request.user;

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('权限不足，需要角色：' + requiredRoles.join('/'));
    }

    return true;
  }
}
