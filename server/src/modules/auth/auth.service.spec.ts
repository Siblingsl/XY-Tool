import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

/**
 * 认证服务单测示例。
 *
 * 验证：
 * - 登录成功签发 access + refresh 双 token
 * - refreshAccessToken 拒绝非 refresh 类型的 token
 * - refreshAccessToken 在 token 无效时抛 UnauthorizedException
 *
 * 这是测试框架示例，证明 jest 可用，后续可照此补 login/register/logout 用例。
 */
describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    findByUsername: jest.Mock;
    verifyPassword: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    saveRefreshToken: jest.Mock;
    verifyRefreshToken: jest.Mock;
    clearRefreshToken: jest.Mock;
  };
  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    usersService = {
      findByUsername: jest.fn(),
      verifyPassword: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      saveRefreshToken: jest.fn(),
      verifyRefreshToken: jest.fn(),
      clearRefreshToken: jest.fn(),
    };
    jwtService = {
      sign: jest.fn(),
      verify: jest.fn(),
    };
    configService = {
      get: jest.fn((key: string) => {
        const map: Record<string, unknown> = {
          'jwt.expiresIn': '7d',
          'jwt.refreshExpiresIn': '30d',
          'jwt.refreshSecret': 'refresh-secret',
        };
        return map[key];
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('login', () => {
    it('密码正确时签发 access + refresh 双 token 并存哈希', async () => {
      const user = {
        id: 1,
        username: 'admin',
        password: 'hashed',
        status: 'active',
        nickname: '管理员',
        tenantId: 1,
        role: 'admin',
      };
      usersService.findByUsername.mockResolvedValue(user);
      usersService.verifyPassword.mockResolvedValue(true);
      jwtService.sign
        .mockReturnValueOnce('access-token') // access
        .mockReturnValueOnce('refresh-token'); // refresh

      const result = await service.login({ username: 'admin', password: 'secret' });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(usersService.saveRefreshToken).toHaveBeenCalledWith(1, 'refresh-token');
    });

    it('密码错误时抛 UnauthorizedException', async () => {
      usersService.findByUsername.mockResolvedValue({
        id: 1,
        username: 'admin',
        password: 'hashed',
        status: 'active',
      });
      usersService.verifyPassword.mockResolvedValue(false);

      await expect(
        service.login({ username: 'admin', password: 'wrong' }),
      ).rejects.toThrow();
    });
  });

  describe('refreshAccessToken', () => {
    it('拒绝 type=access 的 token（业务 token 不能换 access）', async () => {
      jwtService.verify.mockReturnValue({ sub: 1, type: 'access' });
      usersService.findById.mockResolvedValue({ id: 1, status: 'active' });

      await expect(
        service.refreshAccessToken('access-token'),
      ).rejects.toThrow();
    });

    it('refresh token 无效时抛异常', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt malformed');
      });

      await expect(
        service.refreshAccessToken('bad-token'),
      ).rejects.toThrow();
    });

    it('refresh token 哈希不匹配时抛异常（已被吊销）', async () => {
      jwtService.verify.mockReturnValue({ sub: 1, type: 'refresh' });
      usersService.findById.mockResolvedValue({ id: 1, status: 'active' });
      usersService.verifyRefreshToken.mockResolvedValue(false);

      await expect(
        service.refreshAccessToken('revoked-token'),
      ).rejects.toThrow();
    });
  });

  describe('logout', () => {
    it('有有效 refresh token 时清除哈希', async () => {
      jwtService.verify.mockReturnValue({ sub: 1, type: 'refresh' });

      const result = await service.logout('refresh-token');

      expect(result).toEqual({ ok: true });
      expect(usersService.clearRefreshToken).toHaveBeenCalledWith(1);
    });

    it('无 token 时直接返回 ok', async () => {
      const result = await service.logout(undefined);
      expect(result).toEqual({ ok: true });
      expect(usersService.clearRefreshToken).not.toHaveBeenCalled();
    });
  });
});
