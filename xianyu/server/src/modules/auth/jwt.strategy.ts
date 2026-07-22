import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';

/**
 * JWT 策略。
 * 从 Authorization: Bearer <token> 中解析 JWT，
 * 校验用户仍存在且 active，然后把 payload 挂到 request.user。
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret'),
    });
  }

  async validate(payload: JwtPayload) {
    // 拒绝 refresh token 访问业务接口（必须用 access token）
    if (payload.type && payload.type !== 'access') {
      throw new UnauthorizedException('请使用 accessToken 访问');
    }
    const user = await this.usersService.findById(payload.sub);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('用户不存在或已被禁用');
    }
    // 返回的内容会挂到 request.user，供 @CurrentUser 使用
    return {
      sub: user.id,
      username: user.username,
      tenantId: user.tenantId,
      role: user.role,
      type: 'access' as const,
    } as JwtPayload;
  }
}
