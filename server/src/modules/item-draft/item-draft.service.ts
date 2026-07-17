import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import { ItemDraftEntity } from './item-draft.entity';

export type ItemDraftInput = {
  accountId?: number | null;
  title: string;
  description: string;
  price: number;
  originalPrice?: number | null;
  category?: string | null;
  condition?: string | null;
  brand?: string | null;
  images?: ItemDraftEntity['images'];
  deliveryChoice?: string;
  postPrice?: number | null;
  address?: string | null;
  remark?: string | null;
};

/**
 * 商品草稿：仅本地素材 CRUD。
 * 不调用闲鱼发布接口（正式上架易封号；亦无公开草稿 API）。
 */
@Injectable()
export class ItemDraftService {
  private readonly logger = new Logger(ItemDraftService.name);
  private readonly uploadRoot: string;

  constructor(
    @InjectRepository(ItemDraftEntity)
    private readonly repo: Repository<ItemDraftEntity>,
    private readonly config: ConfigService,
  ) {
    this.uploadRoot = path.resolve(
      process.cwd(),
      this.config.get<string>('itemDraft.uploadDir') || 'uploads/item-drafts',
    );
    fs.mkdirSync(this.uploadRoot, { recursive: true });
  }

  async list(tenantId: number, status?: string) {
    const where: Record<string, unknown> = { tenantId };
    if (status && status !== 'all') where.status = status;
    return this.repo.find({
      where,
      order: { updatedAt: 'DESC' },
      take: 200,
    });
  }

  async findOne(id: number, tenantId: number) {
    const row = await this.repo.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('草稿不存在');
    return row;
  }

  async create(tenantId: number, input: ItemDraftInput): Promise<ItemDraftEntity> {
    this.validateInput(input);
    const entity = this.repo.create({
      tenantId,
      accountId: input.accountId ?? null,
      title: input.title.trim(),
      description: input.description.trim(),
      price: Number(input.price) || 0,
      originalPrice:
        input.originalPrice != null ? Number(input.originalPrice) : null,
      category: input.category?.trim() || null,
      condition: input.condition?.trim() || null,
      brand: input.brand?.trim() || null,
      images: input.images || [],
      deliveryChoice: input.deliveryChoice || '无需邮寄',
      postPrice: input.postPrice != null ? Number(input.postPrice) : null,
      address: input.address?.trim() || null,
      remark: input.remark?.trim() || null,
      status: 'local',
      xyDraftId: null,
      xyItemId: null,
      lastError: null,
      pushedAt: null,
    });
    return this.repo.save(entity);
  }

  async update(
    id: number,
    tenantId: number,
    patch: Partial<ItemDraftInput>,
  ): Promise<ItemDraftEntity> {
    const row = await this.findOne(id, tenantId);
    if (patch.title !== undefined) row.title = patch.title.trim();
    if (patch.description !== undefined) row.description = patch.description.trim();
    if (patch.price !== undefined) row.price = Number(patch.price) || 0;
    if (patch.originalPrice !== undefined) {
      row.originalPrice =
        patch.originalPrice != null ? Number(patch.originalPrice) : null;
    }
    if (patch.category !== undefined) row.category = patch.category?.trim() || null;
    if (patch.condition !== undefined) row.condition = patch.condition?.trim() || null;
    if (patch.brand !== undefined) row.brand = patch.brand?.trim() || null;
    if (patch.images !== undefined) row.images = patch.images || [];
    if (patch.deliveryChoice !== undefined) {
      row.deliveryChoice = patch.deliveryChoice || '无需邮寄';
    }
    if (patch.postPrice !== undefined) {
      row.postPrice = patch.postPrice != null ? Number(patch.postPrice) : null;
    }
    if (patch.address !== undefined) row.address = patch.address?.trim() || null;
    if (patch.remark !== undefined) row.remark = patch.remark?.trim() || null;
    if (patch.accountId !== undefined) row.accountId = patch.accountId ?? null;

    this.validateInput({
      title: row.title,
      description: row.description,
      price: Number(row.price),
    });

    if (row.status === 'failed' || row.status === 'xy_draft' || row.status === 'pushing') {
      row.status = 'local';
      row.lastError = null;
    }

    return this.repo.save(row);
  }

  async remove(id: number, tenantId: number): Promise<void> {
    const row = await this.findOne(id, tenantId);
    for (const img of row.images || []) {
      if (img.localPath && fs.existsSync(img.localPath)) {
        try {
          fs.unlinkSync(img.localPath);
        } catch {
          /* ignore */
        }
      }
    }
    await this.repo.delete({ id, tenantId });
  }

  async saveUploadedFiles(
    files: Array<{
      originalname?: string;
      mimetype?: string;
      size: number;
      buffer: Buffer;
    }>,
  ): Promise<Array<{ localPath: string; url: string; filename: string }>> {
    if (!files?.length) {
      throw new BadRequestException('请至少上传一张图片');
    }
    if (files.length > 9) {
      throw new BadRequestException('最多上传 9 张图片');
    }

    const out: Array<{ localPath: string; url: string; filename: string }> = [];
    for (const f of files) {
      if (!f.mimetype?.startsWith('image/')) {
        throw new BadRequestException(`不支持的文件类型: ${f.originalname}`);
      }
      if (f.size > 5 * 1024 * 1024) {
        throw new BadRequestException(`图片超过 5MB: ${f.originalname}`);
      }
      const ext = path.extname(f.originalname || '') || '.jpg';
      const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`;
      const localPath = path.join(this.uploadRoot, filename);
      fs.writeFileSync(localPath, f.buffer);
      out.push({
        localPath,
        url: `/api/item-draft-files/${filename}`,
        filename,
      });
    }
    return out;
  }

  getLocalFile(filename: string): string {
    const safe = path.basename(filename);
    const full = path.join(this.uploadRoot, safe);
    if (!full.startsWith(this.uploadRoot) || !fs.existsSync(full)) {
      throw new NotFoundException('文件不存在');
    }
    return full;
  }

  /**
   * 【已禁用】自动推送/上架。
   * 闲鱼无公开草稿 API；正式发布风控严、易封号。
   */
  async pushToXianyuDraft(
    _id: number,
    _tenantId: number,
    _accountId?: number,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.warn('pushToXianyuDraft 已禁用（防封号）');
    return {
      success: false,
      message:
        '已禁用自动上架：闲鱼无公开草稿 API，正式发布接口风控严格易封号。请使用本地草稿并在闲鱼 App 手动发布。',
    };
  }

  private validateInput(input: {
    title: string;
    description: string;
    price: number;
  }) {
    if (!input.title?.trim()) throw new BadRequestException('标题不能为空');
    if (input.title.trim().length > 60) {
      throw new BadRequestException('标题最多 60 字');
    }
    if (!input.description?.trim()) {
      throw new BadRequestException('描述不能为空');
    }
    if (!(Number(input.price) > 0)) {
      throw new BadRequestException('售价必须大于 0');
    }
  }
}
