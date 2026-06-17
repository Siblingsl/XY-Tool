import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { LoginDto, RegisterDto } from './dto/auth.dto';

/**
 * 认证服务。
 * 处理注册（创建用户）和登录（校验密码 + 签发 JWT）。
 *
 * 双 Token 机制：
 * - accessToken：短效（默认 7d），用于业务接口鉴权
 * - refreshToken：长效（默认 30d），用于无感续期，哈希存库可服务端吊销
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

  /**
   * 用 refreshToken 换取新的 accessToken（无感续期）。
   * 校验：token 签名有效 + type=refresh + 数据库哈希匹配（支持服务端吊销）。
   */
  async refreshAccessToken(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('缺少 refreshToken');
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('refreshToken 无效或已过期');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('token 类型错误');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('用户不存在或已被禁用');
    }

    // 服务端吊销校验：哈希必须匹配
    const valid = await this.usersService.verifyRefreshToken(
      user.id,
      refreshToken,
    );
    if (!valid) {
      throw new UnauthorizedException('refreshToken 已失效');
    }

    // 签发新的 accessToken（不轮换 refreshToken，降低复杂度）
    const accessToken = this.signAccessToken(user);
    return { accessToken };
  }

  /** 登出：吊销 refresh token（清空库内哈希） */
  async logout(refreshToken?: string): Promise<{ ok: true }> {
    if (!refreshToken) return { ok: true };
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
      if (payload.type === 'refresh') {
        await this.usersService.clearRefreshToken(payload.sub);
      }
    } catch {
      // token 已无效，无需操作
    }
    return { ok: true };
  }

  /** 组装登录态响应（access + refresh） */
  private async buildAuthResponse(user: {
    id: number;
    username: string;
    tenantId: number;
    nickname: string | null;
    role: string;
  }) {
    const accessToken = this.signAccessToken(user);
    const refreshToken = await this.signAndStoreRefreshToken(user);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        tenantId: user.tenantId,
      },
    };
  }

  private signAccessToken(user: {
    id: number;
    username: string;
    tenantId: number;
    role: string;
  }): string {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      tenantId: user.tenantId,
      role: user.role ?? 'admin',
      type: 'access',
    };
    const expiresIn = this.config.get<string>('jwt.expiresIn') || '7d';
    return this.jwtService.sign(payload, { expiresIn });
  }

  private async signAndStoreRefreshToken(user: {
    id: number;
    username: string;
    tenantId: number;
    role: string;
  }): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      tenantId: user.tenantId,
      role: user.role ?? 'admin',
      type: 'refresh',
    };
    const expiresIn = this.config.get<string>('jwt.refreshExpiresIn') || '30d';
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get<string>('jwt.refreshSecret'),
      expiresIn,
    });
    // 哈希入库，支持服务端吊销
    await this.usersService.saveRefreshToken(user.id, refreshToken);
    return refreshToken;
  }
}
