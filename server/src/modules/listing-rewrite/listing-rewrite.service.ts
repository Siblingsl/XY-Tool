import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountsService } from '../accounts/accounts.service';
import { AiService } from '../ai/ai.service';
import { GoofishSdkService } from '../../goofish/goofish-sdk.service';
import { globalRiskGuard } from '../../common/utils/risk-control.util';
import { handleAccountAuthError } from '../accounts/account-auth.util';

export type SourceListing = {
  itemId: string;
  title: string;
  description: string;
  price: number | null;
  originalPrice: number | null;
  condition: string | null;
  category: string | null;
  brand: string | null;
  specs: string[];
  imageUrls: string[];
  soldCount: string | null;
  rawSnippet: string;
};

export type RewriteResult = {
  title: string;
  description: string;
  priceSuggestion: {
    low: number;
    mid: number;
    high: number;
    currency: string;
    reason: string;
  };
  specs: Array<{ name: string; value: string }>;
  sellingPoints: string[];
  tags: string[];
};

@Injectable()
export class ListingRewriteService {
  private readonly logger = new Logger(ListingRewriteService.name);

  constructor(
    private readonly accountsService: AccountsService,
    private readonly goofishSdk: GoofishSdkService,
    private readonly ai: AiService,
    private readonly config: ConfigService,
  ) {}

  /** 从闲鱼链接或纯数字解析 itemId */
  parseItemId(input: string): string {
    const raw = String(input || '').trim();
    if (!raw) throw new BadRequestException('请粘贴闲鱼商品链接或商品 ID');

    if (/^\d{5,20}$/.test(raw)) return raw;

    try {
      const u = new URL(raw);
      const q =
        u.searchParams.get('id') ||
        u.searchParams.get('itemId') ||
        u.searchParams.get('item_id');
      if (q && /^\d{5,20}$/.test(q)) return q;

      // /item/123 或 path 末段数字
      const mPath = u.pathname.match(/(?:item|idle)[\/\-]?(\d{5,20})/i);
      if (mPath) return mPath[1];

      const mAny = raw.match(/(?:id|itemId|item_id)[=/](\d{5,20})/i);
      if (mAny) return mAny[1];
    } catch {
      /* not url */
    }

    const loose = raw.match(/\b(\d{8,20})\b/);
    if (loose) return loose[1];

    throw new BadRequestException(
      '无法解析商品 ID。请粘贴类似 https://www.goofish.com/item?id=xxx 的链接',
    );
  }

  async rewriteFromLink(
    tenantId: number,
    accountId: number,
    linkOrId: string,
    style?: string,
  ): Promise<{
    itemId: string;
    source: SourceListing;
    rewrite: RewriteResult;
    modelNote: string;
  }> {
    if (this.config.get<string>('sign.provider') !== 'goofish') {
      throw new BadRequestException('需 SIGN_PROVIDER=goofish 才能抓取商品详情');
    }

    const itemId = this.parseItemId(linkOrId);
    const account = await this.accountsService.findById(accountId, tenantId);
    if (!account || !account.enabled || account.status !== 'active') {
      throw new BadRequestException('请选择可用的闲鱼账号（用于抓取详情 Cookie）');
    }

    let source: SourceListing;
    try {
      source = await globalRiskGuard.withAccountLock(account.id, async () => {
        await globalRiskGuard.humanDeliveryDelay(400, 1200);
        const cookie = this.accountsService.decryptCookie(account);
        const client = this.goofishSdk.createClient(cookie);
        if (typeof client.getItemInfo !== 'function') {
          throw new Error('goofish-sdk 未加载 getItemInfo，请重启服务');
        }
        const raw = await client.getItemInfo(itemId);
        const newCookie = client.getCookieString();
        if (newCookie && newCookie !== cookie) {
          await this.accountsService.updateCookieIfChanged(account.id, newCookie);
        }
        const ret = raw?.ret?.[0] || '';
        if (ret && !String(ret).startsWith('SUCCESS::')) {
          throw new Error(ret);
        }
        return this.normalizeDetail(itemId, raw?.data || raw);
      });
    } catch (err) {
      await handleAccountAuthError(this.accountsService, accountId, err);
      throw new BadRequestException(
        `抓取商品失败: ${(err as Error).message || '未知错误'}`,
      );
    }

    if (!source.title && !source.description) {
      throw new BadRequestException('未能从商品详情中解析出标题/描述，请换链接或账号重试');
    }

    const rewrite = await this.aiRewrite(tenantId, source, style);
    return {
      itemId,
      source,
      rewrite,
      modelNote: '使用该账号在「自动回复」中配置的 AI 模型',
    };
  }

  private normalizeDetail(itemId: string, data: unknown): SourceListing {
    const root = (data && typeof data === 'object' ? data : {}) as Record<
      string,
      unknown
    >;
    // 常见嵌套：itemDO / item / data.item / shareData
    const item = this.pickObj(root, [
      'itemDO',
      'item',
      'itemInfo',
      'idleItem',
      'shareData',
    ]) || root;

    const title =
      this.pickStr(item, ['title', 'itemTitle', 'item_title', 'name']) ||
      this.pickStr(root, ['title', 'itemTitle']) ||
      '';

    const description =
      this.pickStr(item, [
        'desc',
        'description',
        'itemDesc',
        'item_desc',
        'content',
        'detail',
      ]) ||
      this.pickStr(root, ['desc', 'description']) ||
      '';

    const price = this.pickMoney(item, [
      'price',
      'soldPrice',
      'salePrice',
      'priceInCent',
      'priceYuan',
    ]);
    const originalPrice = this.pickMoney(item, [
      'origPrice',
      'originalPrice',
      'orgPrice',
      'origPriceInCent',
    ]);

    const condition =
      this.pickStr(item, ['stuffStatus', 'condition', 'itemStatusStr', 'spuStatus']) ||
      null;
    const category =
      this.pickStr(item, ['categoryName', 'catName', 'channelCatName', 'cateName']) ||
      this.pickStr(
        this.pickObj(item, ['itemCatDTO', 'category']) || {},
        ['catName', 'name'],
      ) ||
      null;
    const brand = this.pickStr(item, ['brand', 'brandName']) || null;

    const specs = this.collectSpecs(item, root);
    const imageUrls = this.collectImages(item, root);
    const soldCount =
      this.pickStr(item, ['wantNum', 'soldQuantity', 'browseCnt', 'viewCount']) ||
      null;

    // 限长 snippet 给模型
    const rawSnippet = JSON.stringify(item).slice(0, 3500);

    return {
      itemId,
      title: title.slice(0, 200),
      description: String(description).slice(0, 4000),
      price,
      originalPrice,
      condition,
      category,
      brand,
      specs,
      imageUrls: imageUrls.slice(0, 9),
      soldCount,
      rawSnippet,
    };
  }

  private collectSpecs(
    item: Record<string, unknown>,
    root: Record<string, unknown>,
  ): string[] {
    const out: string[] = [];
    const arrays = [
      item.itemLabelExtList,
      item.labelList,
      item.properties,
      item.cpvList,
      item.skuList,
      root.properties,
    ];
    for (const arr of arrays) {
      if (!Array.isArray(arr)) continue;
      for (const row of arr) {
        if (!row || typeof row !== 'object') continue;
        const o = row as Record<string, unknown>;
        const name =
          this.pickStr(o, [
            'propertyName',
            'name',
            'text',
            'label',
            'channelCateName',
          ]) || '';
        const value =
          this.pickStr(o, [
            'valueName',
            'value',
            'catName',
            'text',
            'channelCateName',
          ]) || '';
        if (name && value && name !== value) out.push(`${name}: ${value}`);
        else if (value) out.push(value);
        else if (name) out.push(name);
      }
    }
    return [...new Set(out)].slice(0, 30);
  }

  private collectImages(
    item: Record<string, unknown>,
    root: Record<string, unknown>,
  ): string[] {
    const urls: string[] = [];
    const push = (u: unknown) => {
      if (typeof u === 'string' && /^https?:\/\//i.test(u)) urls.push(u);
    };
    const lists = [
      item.imageInfoDOList,
      item.images,
      item.imageInfos,
      item.picList,
      root.images,
    ];
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const img of list) {
        if (typeof img === 'string') push(img);
        else if (img && typeof img === 'object') {
          const o = img as Record<string, unknown>;
          push(o.url || o.picUrl || o.majorUrl || o.img);
        }
      }
    }
    push(item.picUrl || item.mainPic || item.imageUrl);
    return [...new Set(urls)];
  }

  private async aiRewrite(
    tenantId: number,
    source: SourceListing,
    style?: string,
  ): Promise<RewriteResult> {
    const styleHint =
      style?.trim() ||
      '闲鱼爆款风：标题吸睛但不标题党，描述真诚有信任感，适合虚拟/数码二手';

    const system = `你是资深闲鱼电商文案专家。根据参考商品信息，仿写一条「爆款上架文案」。
要求：
1. 原创改写，禁止逐字抄袭原标题/描述
2. 不编造不存在的品牌授权、正品鉴定、包退等虚假承诺
3. 不出现违禁词（刷单、假货、破解、外挂等）
4. 标题 ≤30 字，带核心卖点与品类词
5. 描述结构：开头钩子 → 成色/规格 → 使用说明/发货 → 售后边界（如实）
6. 售价建议结合参考价给出 low/mid/high（元，数字）
7. 规格用 name/value 列表，可基于原文合理归纳
8. 只输出合法 JSON，不要 markdown 代码块

JSON 结构：
{
  "title": "string",
  "description": "string",
  "priceSuggestion": { "low": number, "mid": number, "high": number, "currency": "CNY", "reason": "string" },
  "specs": [{ "name": "string", "value": "string" }],
  "sellingPoints": ["string"],
  "tags": ["string"]
}`;

    const user = `风格：${styleHint}

参考商品：
- 商品ID: ${source.itemId}
- 标题: ${source.title}
- 描述: ${source.description || '（无）'}
- 售价: ${source.price ?? '未知'}
- 原价: ${source.originalPrice ?? '未知'}
- 成色: ${source.condition ?? '未知'}
- 分类: ${source.category ?? '未知'}
- 品牌: ${source.brand ?? '未知'}
- 规格线索: ${source.specs.join('；') || '无'}
- 热度线索: ${source.soldCount ?? '无'}

请输出仿写 JSON。`;

    let text: string;
    try {
      text = await this.ai.chatCompletion(
        tenantId,
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        { maxTokens: 2200, temperature: 0.85, timeoutMs: 60_000 },
      );
    } catch (err) {
      throw new BadRequestException(
        `AI 仿写失败: ${(err as Error).message}`,
      );
    }

    return this.parseRewriteJson(text, source);
  }

  private parseRewriteJson(text: string, source: SourceListing): RewriteResult {
    let cleaned = text.trim();
    const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) cleaned = fence[1].trim();

    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      // 兜底：截取第一个 { 到最后一个 }
      const i = cleaned.indexOf('{');
      const j = cleaned.lastIndexOf('}');
      if (i >= 0 && j > i) {
        obj = JSON.parse(cleaned.slice(i, j + 1)) as Record<string, unknown>;
      } else {
        this.logger.warn(`AI JSON 解析失败，使用兜底: ${cleaned.slice(0, 200)}`);
        return this.fallbackRewrite(source, cleaned);
      }
    }

    const title = String(obj.title || source.title || '精选好物').slice(0, 60);
    const description = String(obj.description || cleaned).slice(0, 5000);
    const ps = (obj.priceSuggestion || {}) as Record<string, unknown>;
    const base = source.price && source.price > 0 ? source.price : 9.9;
    const priceSuggestion = {
      low: Number(ps.low) > 0 ? Number(ps.low) : Math.max(0.1, +(base * 0.85).toFixed(2)),
      mid: Number(ps.mid) > 0 ? Number(ps.mid) : +base.toFixed(2),
      high: Number(ps.high) > 0 ? Number(ps.high) : +(base * 1.15).toFixed(2),
      currency: String(ps.currency || 'CNY'),
      reason: String(ps.reason || '参考原价与市场常见区间'),
    };

    let specs: Array<{ name: string; value: string }> = [];
    if (Array.isArray(obj.specs)) {
      specs = obj.specs
        .map((s) => {
          if (!s || typeof s !== 'object') return null;
          const o = s as Record<string, unknown>;
          const name = String(o.name || o.key || '').trim();
          const value = String(o.value || o.val || '').trim();
          if (!name && !value) return null;
          return { name: name || '规格', value: value || '-' };
        })
        .filter(Boolean) as Array<{ name: string; value: string }>;
    }
    if (!specs.length && source.specs.length) {
      specs = source.specs.map((line) => {
        const [n, ...rest] = line.split(':');
        return rest.length
          ? { name: n.trim(), value: rest.join(':').trim() }
          : { name: '规格', value: line };
      });
    }

    const sellingPoints = Array.isArray(obj.sellingPoints)
      ? obj.sellingPoints.map((x) => String(x)).filter(Boolean).slice(0, 8)
      : [];
    const tags = Array.isArray(obj.tags)
      ? obj.tags.map((x) => String(x)).filter(Boolean).slice(0, 12)
      : [];

    return { title, description, priceSuggestion, specs, sellingPoints, tags };
  }

  private fallbackRewrite(source: SourceListing, aiText: string): RewriteResult {
    const base = source.price && source.price > 0 ? source.price : 9.9;
    return {
      title: (source.title || '精选好物').slice(0, 30),
      description: aiText.slice(0, 2000) || source.description,
      priceSuggestion: {
        low: +(base * 0.85).toFixed(2),
        mid: +base.toFixed(2),
        high: +(base * 1.15).toFixed(2),
        currency: 'CNY',
        reason: 'AI 未返回标准 JSON，按参考价估算',
      },
      specs: source.specs.map((s) => ({ name: '规格', value: s })),
      sellingPoints: [],
      tags: [],
    };
  }

  private pickObj(
    obj: Record<string, unknown>,
    keys: string[],
  ): Record<string, unknown> | null {
    for (const k of keys) {
      const v = obj[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        return v as Record<string, unknown>;
      }
    }
    return null;
  }

  private pickStr(obj: Record<string, unknown>, keys: string[]): string | null {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    }
    return null;
  }

  private pickMoney(
    obj: Record<string, unknown>,
    keys: string[],
  ): number | null {
    for (const k of keys) {
      const v = obj[k];
      if (v == null) continue;
      if (typeof v === 'number' && Number.isFinite(v)) {
        // 分字段
        if (/cent|Cent|InCent/i.test(k) || v > 1000 && Number.isInteger(v)) {
          if (/cent|Cent|InCent/i.test(k)) return +(v / 100).toFixed(2);
        }
        return +v.toFixed(2);
      }
      if (typeof v === 'string') {
        const n = parseFloat(v.replace(/[^\d.]/g, ''));
        if (Number.isFinite(n)) {
          if (/cent|Cent|InCent/i.test(k)) return +(n / 100).toFixed(2);
          return +n.toFixed(2);
        }
      }
      if (typeof v === 'object' && v) {
        const o = v as Record<string, unknown>;
        const nested = this.pickMoney(o, [
          'price',
          'priceInCent',
          'amount',
          'value',
        ]);
        if (nested != null) return nested;
      }
    }
    return null;
  }
}
