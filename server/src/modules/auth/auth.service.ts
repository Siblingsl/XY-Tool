import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { LoginDto, RegisterDto } from './dto/auth.dto';

/**
 * 认证服务。
 * 处理注册（创建用户）和登录（校验密码 + 签发 JWT）。
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.usersService.findByUsername(dto.username);
    if (exists) {
      throw new ConflictException('用户名已被注册');
    }
    const user = await this.usersService.create(dto);
    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByUsername(dto.username);
    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const ok = await this.usersService.verifyPassword(dto.password, user.password);
    if (!ok) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    if (user.status !== 'active') {
      throw new UnauthorizedException('账号已被禁用');
    }
    return this.buildAuthResponse(user);
  }

  /** 组装登录态响应 */
  private buildAuthResponse(user: { id: number; username: string; tenantId: number; nickname: string | null }) {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      tenantId: user.tenantId,
      role: 'admin',
    };
    const expiresIn = this.config.get<string>('jwt.expiresIn') || '7d';
    const token = this.jwtService.sign(payload, { expiresIn });
    return {
      accessToken: token,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        tenantId: user.tenantId,
      },
    };
  }
}
