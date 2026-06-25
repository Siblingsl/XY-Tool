import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * API Key 鉴权守卫。
 *
 * 用于对外公开接口（如激活码验证 API），外部工具通过 `X-API-Key` 请求头鉴权。
 * 不走 JWT，独立鉴权链，避免外部工具依赖闲鱼用户登录态。
 *
 * 用法：
 *   @UseGuards(ApiKeyGuard)
 *   @SkipThrottle()  // 跳过内部限流（外部工具用专用 Key）
 *
 * 配置：环境变量 LICENSE_API_KEY（必填）。
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const providedKey = request.headers['x-api-key'] as string | undefined;

    const expectedKey = this.config.get<string>('license.apiKey') || '';
    if (!expectedKey) {
      throw new UnauthorizedException('服务端未配置 LICENSE_API_KEY');
    }

    if (!providedKey || providedKey !== expectedKey) {
      throw new UnauthorizedException('无效的 API Key');
    }

    return true;
  }
}
