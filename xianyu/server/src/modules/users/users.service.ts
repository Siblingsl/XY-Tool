import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { UserEntity } from './user.entity';

/**
 * 用户服务。
 * 负责用户的增删改查与密码哈希校验。
 * 注意：密码字段在实体中 select:false，默认查询不返回明文哈希。
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: Repository<UserEntity>,
  ) {}

  /** 按用户名查询（含密码字段，用于登录校验） */
  async findByUsername(username: string): Promise<UserEntity | null> {
    return this.repo
      .createQueryBuilder('u')
      .addSelect('u.password')
      .where('u.username = :username', { username })
      .getOne();
  }

  async findById(id: number): Promise<UserEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** 创建用户。注册时调用，自动哈希密码 */
  async create(input: {
    username: string;
    password: string;
    nickname?: string;
  }): Promise<UserEntity> {
    return this.createWithManager(this.repo.manager, input);
  }

  /** 在事务内创建用户（注册原子性） */
  async createWithManager(
    manager: EntityManager,
    input: {
      username: string;
      password: string;
      nickname?: string;
    },
  ): Promise<UserEntity> {
    if (!input.password) {
      throw new BadRequestException('密码不能为空');
    }
    const hashed = await bcrypt.hash(input.password, 10);

    // 使用 insert + update，避免 save() 对 select:false 的 password
    // 二次持久化时写成 null（违反 NOT NULL）。
    const insertResult = await manager.insert(UserEntity, {
      username: input.username,
      password: hashed,
      nickname: input.nickname || null,
      role: 'admin',
      status: 'active',
      tenantId: 0,
    });
    const id = Number(insertResult.identifiers[0].id);
    await manager.update(UserEntity, id, { tenantId: id });

    const saved = await manager.findOne(UserEntity, { where: { id } });
    if (!saved) {
      throw new BadRequestException('创建用户失败');
    }
    return saved;
  }

  /** 注册失败补偿：删除未完成的用户记录 */
  async deleteById(id: number): Promise<void> {
    await this.repo.delete(id);
  }

  /** 校验明文密码与哈希是否匹配 */
  async verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  async updateNickname(id: number, nickname: string): Promise<void> {
    await this.repo.update(id, { nickname });
  }

  /**
   * 修改密码。
   * 校验旧密码 → 哈希新密码 → 写库 → 吊销所有 refresh token（强制重新登录）。
   * @throws BadRequestException 旧密码错误
   */
  async updatePassword(
    id: number,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.findByUsernameForId(id);
    if (!user) {
      throw new BadRequestException('用户不存在');
    }
    const ok = await this.verifyPassword(oldPassword, user.password);
    if (!ok) {
      throw new BadRequestException('旧密码错误');
    }
    if (oldPassword === newPassword) {
      throw new BadRequestException('新密码不能与旧密码相同');
    }
    const hashed = await bcrypt.hash(newPassword, 10);
    await this.repo.update(id, { password: hashed });
    // 吊销旧会话：改密后所有已签发的 refresh token 失效
    await this.clearRefreshToken(id);
  }

  /** 按 id 查询并带回密码（改密校验旧密码用） */
  private async findByUsernameForId(id: number): Promise<UserEntity | null> {
    return this.repo
      .createQueryBuilder('u')
      .addSelect('u.password')
      .where('u.id = :id', { id })
      .getOne();
  }

  /** 写入 refresh token 的 bcrypt 哈希（登录/刷新时调用） */
  async saveRefreshToken(id: number, refreshToken: string): Promise<void> {
    const hash = await bcrypt.hash(refreshToken, 10);
    await this.repo.update(id, { refreshTokenHash: hash });
  }

  async saveRefreshTokenWithManager(
    manager: EntityManager,
    id: number,
    refreshToken: string,
  ): Promise<void> {
    const hash = await bcrypt.hash(refreshToken, 10);
    await manager.update(UserEntity, id, { refreshTokenHash: hash });
  }

  /** 按 id 查询并带回 refreshTokenHash（校验 refresh 时用） */
  async findByIdWithRefresh(id: number): Promise<UserEntity | null> {
    return this.repo
      .createQueryBuilder('u')
      .addSelect('u.refreshTokenHash')
      .where('u.id = :id', { id })
      .getOne();
  }

  /** 校验 refresh token 哈希是否匹配 */
  async verifyRefreshToken(
    id: number,
    refreshToken: string,
  ): Promise<boolean> {
    const user = await this.findByIdWithRefresh(id);
    if (!user?.refreshTokenHash) return false;
    return bcrypt.compare(refreshToken, user.refreshTokenHash);
  }

  /** 清除 refresh token 哈希（登出/吊销） */
  async clearRefreshToken(id: number): Promise<void> {
    await this.repo.update(id, { refreshTokenHash: null });
  }
}
