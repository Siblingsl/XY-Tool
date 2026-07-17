import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductEntity, DeliveryType } from './product.entity';

type ProductInput = {
  tenantId: number;
  accountId: number;
  itemId: string;
  title: string;
  deliveryType: DeliveryType;
  kamiPoolId?: number | null;
  licenseTypeCode?: string | null;
  fixedContent?: string | null;
  remark?: string | null;
  delaySeconds?: number;
  multiQuantity?: boolean;
  isMultiSpec?: boolean;
  specName?: string | null;
  specValue?: string | null;
  enabled?: boolean;
};

/**
 * 商品（发货规则）管理服务。
 * 把闲鱼商品ID 映射到发货规则（发卡密/发链接/发文本/发激活码）。
 * 支持多规格精确匹配、延时发货、多数量发货。
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

  async create(input: ProductInput): Promise<ProductEntity> {
    const normalized = this.normalizeFields(input);
    this.validateFields(normalized);
    const entity = this.repo.create({
      ...normalized,
      enabled: input.enabled ?? true,
    });
    const saved = await this.repo.save(entity);
    this.logger.log(
      `新增商品规则: ${saved.id} (${saved.itemId} → ${saved.deliveryType})`,
    );
    return saved;
  }

  async update(
    id: number,
    tenantId: number,
    patch: Partial<ProductEntity>,
  ): Promise<void> {
    const existing = await this.repo.findOne({ where: { id, tenantId } });
    if (!existing) {
      throw new NotFoundException('商品规则不存在');
    }

    const merged: ProductInput = {
      tenantId: existing.tenantId,
      accountId: patch.accountId ?? existing.accountId,
      itemId: patch.itemId ?? existing.itemId,
      title: patch.title ?? existing.title,
      deliveryType: (patch.deliveryType ?? existing.deliveryType) as DeliveryType,
      kamiPoolId:
        patch.kamiPoolId !== undefined ? patch.kamiPoolId : existing.kamiPoolId,
      licenseTypeCode:
        patch.licenseTypeCode !== undefined
          ? patch.licenseTypeCode
          : existing.licenseTypeCode,
      fixedContent:
        patch.fixedContent !== undefined
          ? patch.fixedContent
          : existing.fixedContent,
      remark: patch.remark !== undefined ? patch.remark : existing.remark,
      delaySeconds:
        patch.delaySeconds !== undefined
          ? patch.delaySeconds
          : existing.delaySeconds,
      multiQuantity:
        patch.multiQuantity !== undefined
          ? patch.multiQuantity
          : existing.multiQuantity,
      isMultiSpec:
        patch.isMultiSpec !== undefined
          ? patch.isMultiSpec
          : existing.isMultiSpec,
      specName: patch.specName !== undefined ? patch.specName : existing.specName,
      specValue:
        patch.specValue !== undefined ? patch.specValue : existing.specValue,
      enabled: patch.enabled ?? existing.enabled,
    };

    const normalized = this.normalizeFields(merged);
    this.validateFields(normalized);

    const updatePayload: Partial<ProductEntity> = {
      accountId: normalized.accountId,
      itemId: normalized.itemId,
      title: normalized.title,
      deliveryType: normalized.deliveryType,
      kamiPoolId: normalized.kamiPoolId,
      licenseTypeCode: normalized.licenseTypeCode,
      fixedContent: normalized.fixedContent,
      remark: normalized.remark,
      delaySeconds: normalized.delaySeconds ?? 0,
      multiQuantity: normalized.multiQuantity ?? false,
      isMultiSpec: normalized.isMultiSpec ?? false,
      specName: normalized.specName ?? null,
      specValue: normalized.specValue ?? null,
    };
    if (patch.enabled !== undefined) {
      updatePayload.enabled = patch.enabled;
    }

    await this.repo.update({ id, tenantId }, updatePayload);
  }

  async remove(id: number, tenantId: number): Promise<void> {
    await this.repo.delete({ id, tenantId });
  }

  /**
   * 按商品ID查找发货规则（兼容旧调用）。
   * 优先匹配 accountId + itemId，否则回退 tenantId + itemId。
   */
  async findByItemId(
    tenantId: number,
    itemId: string,
    accountId?: number,
  ): Promise<ProductEntity | null> {
    return this.findMatchingRule(tenantId, itemId, accountId);
  }

  /**
   * 智能匹配发货规则：
   * 1. 多规格精确匹配（isMultiSpec + specName/specValue）优先
   * 2. 同账号非多规格规则
   * 3. 租户级回退
   */
  async findMatchingRule(
    tenantId: number,
    itemId: string,
    accountId?: number,
    specName?: string | null,
    specValue?: string | null,
  ): Promise<ProductEntity | null> {
    if (!itemId) return null;

    const candidates = await this.repo.find({
      where: { tenantId, itemId, enabled: true },
      order: { id: 'ASC' },
    });
    if (candidates.length === 0) return null;

    const scoped = accountId
      ? candidates.filter((c) => c.accountId === accountId)
      : candidates;
    const pool = scoped.length > 0 ? scoped : candidates;

    const sn = (specName || '').trim();
    const sv = (specValue || '').trim();

    if (sn && sv) {
      const multiHit = pool.find(
        (p) =>
          p.isMultiSpec &&
          (p.specName || '').trim() === sn &&
          (p.specValue || '').trim() === sv,
      );
      if (multiHit) return multiHit;
      // 有规格信息但没命中多规格时，仍可回退到非多规格规则
    }

    // 非多规格优先（安全：不把多规格商品的默认第一条当成匹配）
    const plain = pool.find((p) => !p.isMultiSpec);
    if (plain) return plain;

    // 仅有多规格规则但订单无规格 → 不匹配，避免发错规格
    if (pool.some((p) => p.isMultiSpec) && (!sn || !sv)) {
      this.logger.warn(
        `商品 ${itemId} 仅配置了多规格规则，但订单缺少规格信息，跳过匹配`,
      );
      return null;
    }

    return null;
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

  private validateFields(
    product: Pick<
      ProductInput,
      | 'deliveryType'
      | 'kamiPoolId'
      | 'licenseTypeCode'
      | 'fixedContent'
      | 'isMultiSpec'
      | 'specName'
      | 'specValue'
      | 'delaySeconds'
    >,
  ): void {
    const dt = product.deliveryType;
    if (dt === 'kami') {
      if (!product.kamiPoolId) {
        throw new BadRequestException('卡密发货需选择卡密池');
      }
    } else if (dt === 'link' || dt === 'text') {
      if (!product.fixedContent?.trim()) {
        throw new BadRequestException('需填写固定发货内容');
      }
    } else if (dt === 'license') {
      if (!product.licenseTypeCode?.trim()) {
        throw new BadRequestException('激活码发货需选择激活码类型');
      }
      if (!product.fixedContent?.trim()) {
        throw new BadRequestException('激活码发货需填写网盘地址或下载链接');
      }
    }

    if (product.isMultiSpec) {
      if (!product.specName?.trim() || !product.specValue?.trim()) {
        throw new BadRequestException('多规格规则需填写规格名和规格值');
      }
    }

    if (
      product.delaySeconds != null &&
      (product.delaySeconds < 0 || product.delaySeconds > 3600)
    ) {
      throw new BadRequestException('延时发货秒数需在 0~3600 之间');
    }
  }

  /** 按发货方式清理无关字段，避免切换类型后残留旧配置 */
  private normalizeFields(input: ProductInput): Omit<ProductInput, 'enabled'> {
    const base = {
      tenantId: input.tenantId,
      accountId: input.accountId,
      itemId: input.itemId,
      title: input.title,
      deliveryType: input.deliveryType,
      remark: input.remark?.trim() || null,
      delaySeconds: Math.max(0, Math.min(3600, Number(input.delaySeconds) || 0)),
      multiQuantity: !!input.multiQuantity,
      isMultiSpec: !!input.isMultiSpec,
      specName: input.isMultiSpec
        ? input.specName?.trim() || null
        : null,
      specValue: input.isMultiSpec
        ? input.specValue?.trim() || null
        : null,
    };

    switch (input.deliveryType) {
      case 'kami':
        return {
          ...base,
          kamiPoolId: input.kamiPoolId ?? null,
          licenseTypeCode: null,
          fixedContent: null,
        };
      case 'link':
      case 'text':
        return {
          ...base,
          kamiPoolId: null,
          licenseTypeCode: null,
          fixedContent: input.fixedContent?.trim() || null,
        };
      case 'license':
        return {
          ...base,
          kamiPoolId: null,
          licenseTypeCode: input.licenseTypeCode?.trim() || null,
          fixedContent: input.fixedContent?.trim() || null,
        };
      default:
        return {
          ...base,
          kamiPoolId: input.kamiPoolId ?? null,
          licenseTypeCode: input.licenseTypeCode ?? null,
          fixedContent: input.fixedContent ?? null,
        };
    }
  }
}
