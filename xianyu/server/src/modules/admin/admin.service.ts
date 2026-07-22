import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../users/user.entity';
import { XianyuAccountEntity } from '../accounts/account.entity';
import { OrderEntity } from '../orders/order.entity';
import { KamiItemEntity } from '../kami-pool/kami-pool.entity';

/**
 * 运营后台服务（system 角色专用）。
 *
 * 跨租户查询，用于平台运营方监控所有租户的用量、封禁异常租户。
 * 不做业务操作（发货/改密等），只读 + 状态控制。
 */
@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(XianyuAccountEntity)
    private readonly accountRepo: Repository<XianyuAccountEntity>,
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
    @InjectRepository(KamiItemEntity)
    private readonly kamiRepo: Repository<KamiItemEntity>,
  ) {}

  /** 列出所有租户（role=admin 的用户即租户） */
  async listTenants(): Promise<any[]> {
    const users = await this.userRepo.find({
      where: { role: 'admin' },
      order: { createdAt: 'DESC' },
    });
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      nickname: u.nickname,
      status: u.status,
      tenantId: u.tenantId,
      createdAt: u.createdAt,
    }));
  }

  /** 单租户用量统计（账号数/订单数/卡密数，分状态） */
  async getTenantUsage(tenantId: number) {
    const accountCount = await this.accountRepo.count({
      where: { tenantId },
    });
    const accountActive = await this.accountRepo.count({
      where: { tenantId, status: 'active', enabled: true },
    });

    const orderStats = await this.orderRepo
      .createQueryBuilder('o')
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('o.tenant_id = :tenantId', { tenantId })
      .groupBy('o.status')
      .getRawMany();

    const kamiTotal = await this.kamiRepo.count({ where: { tenantId } });
    const kamiUnused = await this.kamiRepo.count({
      where: { tenantId, status: 'unused' },
    });

    const ordersByStatus: Record<string, number> = {};
    for (const row of orderStats) {
      ordersByStatus[row.status] = Number(row.count);
    }

    return {
      tenantId,
      accounts: { total: accountCount, active: accountActive },
      orders: ordersByStatus,
      kami: { total: kamiTotal, unused: kamiUnused },
    };
  }

  /** 封禁/解封租户（改 user.status：active/disabled） */
  async setUserStatus(userId: number, status: 'active' | 'disabled') {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    // 防止运营方误封自己
    if (user.role === 'system') {
      throw new Error('不能修改 system 运营账号的状态');
    }
    await this.userRepo.update(userId, { status });
    return { id: userId, status };
  }
}
