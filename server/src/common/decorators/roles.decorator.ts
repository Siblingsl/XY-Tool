import { SetMetadata } from '@nestjs/common';

/**
 * 角色装饰器：标记接口所需的最低角色。
 * 用法：
 *   @Roles('system')
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *
 * RolesGuard 会校验 request.user.role 是否在允许列表中。
 */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
