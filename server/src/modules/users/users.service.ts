import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    const hashed = await bcrypt.hash(input.password, 10);
    const entity = this.repo.create({
      username: input.username,
      password: hashed,
      nickname: input.nickname || null,
      role: 'admin',
      status: 'active',
      tenantId: 0, // 占位，保存后用生成的 id 回填
    });
    // 保存后用生成的 id 回填 tenantId（单用户即租户）
    const saved = await this.repo.save(entity);
    saved.tenantId = saved.id;
    return this.repo.save(saved);
  }

  /** 校验明文密码与哈希是否匹配 */
  async verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  async updateNickname(id: number, nickname: string): Promise<void> {
    await this.repo.update(id, { nickname });
  }

  /** 写入 refresh token 的 bcrypt 哈希（登录/刷新时调用） */
  async saveRefreshToken(id: number, refreshToken: string): Promise<void> {
    const hash = await bcrypt.hash(refreshToken, 10);
    await this.repo.update(id, { refreshTokenHash: hash });
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
