import { Body, Controller, Post } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

/**
 * 认证接口（公开，无需登录）。
 */
@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({ summary: '注册账号', description: '严格限流：每分钟 3 次/用户IP' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle({
    default: {
      ttl: 60_000,
      limit: 3,
      getTracker: (req) => `${(req.body?.username || 'anon')}:${req.ip}`,
    },
  })
  @ApiOperation({ summary: '登录', description: '按用户名+IP 限流防爆破，返回 access+refresh token' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({ summary: '刷新 accessToken', description: '前端 401 时自动调用无感续期' })
  refresh(@Body() dto: { refreshToken: string }) {
    return this.authService.refreshAccessToken(dto.refreshToken);
  }

  @Post('logout')
  @SkipThrottle()
  @ApiOperation({ summary: '登出', description: '吊销 refreshToken（服务端失效）' })
  logout(@Body() dto: { refreshToken?: string }) {
    return this.authService.logout(dto.refreshToken);
  }
}
