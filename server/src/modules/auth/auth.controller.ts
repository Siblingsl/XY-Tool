import { Body, Controller, Post } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

/**
 * 认证接口（公开，无需登录）。
 * POST /api/auth/register  注册
 * POST /api/auth/login     登录
 * POST /api/auth/refresh   刷新 accessToken
 * POST /api/auth/logout    登出（吊销 refreshToken）
 *
 * 限流策略（防爆破）：
 * - login/register：每分钟 3 次/用户IP（ThrottlerGuard 已全局生效）
 * - refresh：放宽到每分钟 30 次（前端拦截器会高频调用）
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** 注册：严格限流 */
  @Post('register')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /** 登录：严格限流（按用户名+IP 限流，防止分布式爆破） */
  @Post('login')
  @Throttle({
    default: {
      ttl: 60_000,
      limit: 3,
      getTracker: (req) => `${(req.body?.username || 'anon')}:${req.ip}`,
    },
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /** 刷新令牌：放宽限流（前端 401 时会自动调） */
  @Post('refresh')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  refresh(@Body() dto: { refreshToken: string }) {
    return this.authService.refreshAccessToken(dto.refreshToken);
  }

  /** 登出：吊销 refreshToken（不严格限流） */
  @Post('logout')
  @SkipThrottle()
  logout(@Body() dto: { refreshToken?: string }) {
    return this.authService.logout(dto.refreshToken);
  }
}
