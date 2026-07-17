import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { XianyuAccountEntity } from './account.entity';
import { decrypt, encrypt } from '../../common/utils/crypto.util';
import { isGoofishSessionExpired } from '../../goofish/goofish-error.util';
import { globalRiskGuard } from '../../common/utils/risk-control.util';
import { RealtimeService } from '../realtime/realtime.service';

/**
 * 闲鱼账号管理服务。
 * 负责账号的 CRUD 以及 Cookie 的加密存取。
 */
@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    @InjectRepository(XianyuAccountEntity)
    private readonly repo: Repository<XianyuAccountEntity>,
    private readonly config: ConfigService,
    private readonly realtime: RealtimeService,
  ) {}

  /** 获取主密钥 */
  private get encKey(): string {
    return this.config.get<string>('cookieEncryptionKey') || '';
  }

  /** 列出租户下所有账号 */
  async listByTenant(tenantId: number) {
    return this.repo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  /** 兼容旧接口：冷静期已取消 */
  async clearCaptchaPause(id: number, tenantId: number): Promise<void> {
    const account = await this.findById(id, tenantId);
    if (!account) throw new Error('账号不存在');
    globalRiskGuard.clearCaptchaPause(id);
  }

  /** 兼容旧接口：仅推送提示，不暂停业务 */
  notifyCaptchaPaused(
    tenantId: number,
    accountId: number,
    _pauseUntil: number,
    nickname?: string,
  ): void {
    this.realtime.pushAccountCaptcha(tenantId, {
      accountId,
      nickname,
      pauseUntil: Date.now(),
      remainingMs: 0,
      message: `账号${nickname ? `「${nickname}」` : ` ${accountId}`} 收到闲鱼风控提示，系统未暂停，将自动重试。`,
    });
  }

  /** 新增账号（自动加密 Cookie） */
  async create(input: {
    tenantId: number;
    nickname: string;
    xianyuUid: string;
    cookie: string; // 明文 cookie
  }): Promise<XianyuAccountEntity> {
    const encrypted = encrypt(input.cookie, this.encKey);
    const entity = this.repo.create({
      tenantId: input.tenantId,
      nickname: input.nickname,
      xianyuUid: input.xianyuUid,
      cookieEncrypted: encrypted,
      status: 'active',
      enabled: true,
    });
    const saved = await this.repo.save(entity);
    this.logger.log(`新增闲鱼账号: ${saved.id} (${saved.nickname})`);
    return saved;
  }

  /** 更新 Cookie（重新加密，需租户校验） */
  async updateCookie(
    id: number,
    tenantId: number,
    newCookie: string,
  ): Promise<void> {
    const account = await this.findById(id, tenantId);
    if (!account) {
      throw new Error('账号不存在');
    }
    const encrypted = encrypt(newCookie, this.encKey);
    await this.repo.update(id, {
      cookieEncrypted: encrypted,
      status: 'active',
      enabled: true,
      lastCheckedAt: new Date(),
    });
    this.logger.log(`更新 Cookie: ${id}`);
  }

  /** 兼容旧调用（内部仍应带 tenantId） */
  async updateCookieUnsafe(id: number, newCookie: string): Promise<void> {
    const encrypted = encrypt(newCookie, this.encKey);
    await this.repo.update(id, {
      cookieEncrypted: encrypted,
      status: 'active',
      lastCheckedAt: new Date(),
    });
  }

  /** 若 Cookie 有变化则写回（mtop 令牌刷新后） */
  async updateCookieIfChanged(id: number, newCookie: string): Promise<void> {
    const account = await this.repo.findOne({ where: { id } });
    if (!account) return;
    const current = decrypt(account.cookieEncrypted, this.encKey);
    if (current !== newCookie) {
      await this.updateCookieUnsafe(id, newCookie);
    }
  }

  async findById(id: number, tenantId: number): Promise<XianyuAccountEntity | null> {
    return this.repo.findOne({ where: { id, tenantId } });
  }

  /** 内部用，不做租户隔离 */
  async findByIdUnsafe(id: number): Promise<XianyuAccountEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** 健康检查通过后更新校验时间 */
  async touchHealthy(id: number): Promise<void> {
    await this.repo.update(id, {
      lastCheckedAt: new Date(),
      status: 'active',
    });
  }

  /**
   * 主动校验 Cookie 是否仍有效（调用 mtop login.token）。
   * @returns ok=true 表示有效；false 表示已过期并已 markExpired
   */
  async validateSession(
    accountId: number,
    probe: (cookie: string) => Promise<{ cookie: string }>,
  ): Promise<{ ok: boolean; cookie?: string; reason?: string }> {
    const account = await this.findByIdUnsafe(accountId);
    if (!account) {
      return { ok: false, reason: '账号不存在' };
    }
    if (!account.enabled || account.status !== 'active') {
      return { ok: false, reason: '账号未启用或非 active' };
    }

    try {
      const cookie = this.decryptCookie(account);
      const result = await probe(cookie);
      if (result.cookie && result.cookie !== cookie) {
        await this.updateCookieUnsafe(accountId, result.cookie);
      }
      await this.touchHealthy(accountId);
      return { ok: true, cookie: result.cookie };
    } catch (error) {
      if (isGoofishSessionExpired(error)) {
        await this.markExpired(accountId);
        return { ok: false, reason: 'Cookie 会话已过期' };
      }
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async setEnabled(
    id: number,
    tenantId: number,
    enabled: boolean,
  ): Promise<XianyuAccountEntity> {
    const account = await this.findById(id, tenantId);
    if (!account) {
      throw new Error('账号不存在');
    }
    await this.repo.update(id, { enabled });
    return { ...account, enabled };
  }

  async setAutoConfirm(
    id: number,
    tenantId: number,
    autoConfirm: boolean,
  ): Promise<XianyuAccountEntity> {
    const account = await this.findById(id, tenantId);
    if (!account) {
      throw new Error('账号不存在');
    }
    await this.repo.update(id, { autoConfirm });
    return { ...account, autoConfirm };
  }

  /** 删除账号 */
  async remove(id: number, tenantId: number): Promise<void> {
    await this.repo.delete({ id, tenantId });
  }

  /** 获取启用的账号（用于订单监听） */
  async listEnabled(tenantId: number): Promise<XianyuAccountEntity[]> {
    return this.repo.find({
      where: { tenantId, enabled: true, status: 'active' },
    });
  }

  /**
   * 获取所有租户下所有启用的账号（跨租户，仅订单轮询/调度器使用）。
   * 轮询服务需要扫描每个账号的订单，故需跨租户。
   */
  async listAllEnabled(): Promise<XianyuAccountEntity[]> {
    return this.repo.find({
      where: { enabled: true, status: 'active' },
    });
  }

  /** 解密 Cookie（供发货/订单拉取使用） */
  decryptCookie(account: XianyuAccountEntity): string {
    return decrypt(account.cookieEncrypted, this.encKey);
  }

  /** 标记账号登录过期 */
  async markExpired(id: number): Promise<void> {
    const account = await this.repo.findOne({ where: { id } });
    await this.repo.update(id, { status: 'expired', enabled: false });
    this.logger.warn(`账号登录过期: ${id}`);
    if (account) {
      this.realtime.pushAccountExpired(account.tenantId, id);
    }
  }
}
