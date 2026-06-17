import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductEntity, DeliveryType } from './product.entity';

/**
 * 商品（发货规则）管理服务。
 * 把闲鱼商品ID 映射到发货规则（发卡密/发链接/发文本）。
 */
@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(ProductEntity)
    private readonly repo: Repository<ProductEntity>,
  ) {}

  async listByTenant(tenantId: number) {
    return this.repo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async listByAccount(tenantId: number, accountId: number) {
    return this.repo.find({
      where: { tenantId, accountId },
      order: { createdAt: 'DESC' },
    });
  }

  async create(input: {
    tenantId: number;
    accountId: number;
    itemId: string;
    title: string;
    deliveryType: DeliveryType;
    kamiPoolId?: number | null;
    fixedContent?: string | null;
    remark?: string | null;
  }): Promise<ProductEntity> {
    const entity = this.repo.create({
      ...input,
      enabled: true,
    });
    const saved = await this.repo.save(entity);
    this.logger.log(`新增商品规则: ${saved.id} (${saved.itemId} → ${saved.deliveryType})`);
    return saved;
  }

  async update(id: number, tenantId: number, patch: Partial<ProductEntity>): Promise<void> {
    await this.repo.update({ id, tenantId }, patch);
  }

  async remove(id: number, tenantId: number): Promise<void> {
    await this.repo.delete({ id, tenantId });
  }

  /**
   * 按商品ID查找发货规则（发货引擎调用）。
   * 优先匹配 accountId + itemId，否则回退 tenantId + itemId。
   */
  async findByItemId(
    tenantId: number,
    itemId: string,
    accountId?: number,
  ): Promise<ProductEntity | null> {
    if (accountId) {
      const byAccount = await this.repo.findOne({
        where: { tenantId, itemId, accountId, enabled: true },
      });
      if (byAccount) return byAccount;
    }
    return this.repo.findOne({
      where: { tenantId, itemId, enabled: true },
    });
  }

  /** 列出所有启用的商品规则（订单匹配时用） */
  async listEnabled(tenantId: number): Promise<ProductEntity[]> {
    return this.repo.find({
      where: { tenantId, enabled: true },
    });
  }

  async findById(id: number): Promise<ProductEntity | null> {
    return this.repo.findOne({ where: { id } });
  }
}
