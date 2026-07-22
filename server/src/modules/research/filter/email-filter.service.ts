import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResearchEmailEntity } from '../entities/email.entity';
import { ResearchSettingsEntity } from '../entities/settings.entity';

/**
 * 默认营销过滤关键词。
 * 文档 3.2 节：标题/正文命中规则则 status=filtered，不进入②。
 */
const DEFAULT_MARKETING_KEYWORDS = [
  'Earn $',
  'Get Rich',
  'AI Millionaire',
  'No Code',
  'Passive Income',
  '10000/month',
  '$10,000/month',
  'Make Money Online',
  'Work From Home',
  'Limited Time Offer',
  'Act Now',
  'Buy Now',
  'Click Here',
  'Free Trial',
  'Subscribe Now',
  'Unsubscribe',
  'You won',
  'Congratulations',
  'Claim your prize',
  'Double your income',
];

/**
 * 分类关键词映射。
 * 文档 3.2 节分类标签：AI_SaaS | SideHustle | Startup | GitHub | OpenSource |
 * Tool | ProductHunt | YC | Investment | Funding | SEO | Affiliate | Newsletter | Other
 */
const CATEGORY_RULES: { category: string; patterns: RegExp[] }[] = [
  {
    category: 'AI_SaaS',
    patterns: [/ai\s*(saas|tool|platform|api|model)/i, /llm/i, /gpt/i, /machine learning/i, /neural/i],
  },
  {
    category: 'SideHustle',
    patterns: [/side\s*hustle/i, /副业/i, /extra\s*income/i, /freelanc/i],
  },
  {
    category: 'Startup',
    patterns: [/startup/i, /launch/i, /founder/i, /seed\s*round/i, /pre-?seed/i],
  },
  {
    category: 'GitHub',
    patterns: [/github\.com/i, /open\s*source/i, /repo(sitory)?/i],
  },
  {
    category: 'OpenSource',
    patterns: [/open[\s-]?source/i, /mit\s*license/i, /apache\s*license/i, /gpl/i],
  },
  {
    category: 'Tool',
    patterns: [/tool/i, /extension/i, /plugin/i, /chrome\s*extension/i, /cli/i, /sdk/i],
  },
  {
    category: 'ProductHunt',
    patterns: [/product\s*hunt/i, /producthunt\.com/i, /featured\s*on\s*ph/i],
  },
  {
    category: 'YC',
    patterns: [/y\s*combinator/i, /yc\s*(batch|demo|w\d|s\d)/i, /combinator\.com/i],
  },
  {
    category: 'Investment',
    patterns: [/invest/i, /vc/i, /venture\s*capital/i, /angel/i, /valuation/i],
  },
  {
    category: 'Funding',
    patterns: [/funding/i, /raised?\s*\$/i, /series\s*[a-f]/i, /seed\s*fund/i],
  },
  {
    category: 'SEO',
    patterns: [/seo/i, /search\s*engine/i, /backlink/i, /keyword/i, /serp/i],
  },
  {
    category: 'Affiliate',
    patterns: [/affiliate/i, /referral/i, /commission/i, /partner\s*program/i],
  },
  {
    category: 'Newsletter',
    patterns: [/newsletter/i, /digest/i, /weekly\s*roundup/i, /subscribe/i, /unsubscribe/i],
  },
];

/**
 * 邮件营销过滤 + 基础分类服务。
 * 文档 3.2 节（营销过滤硬约束亮点①）。
 */
@Injectable()
export class EmailFilterService {
  private readonly logger = new Logger(EmailFilterService.name);

  constructor(
    @InjectRepository(ResearchEmailEntity)
    private readonly emailRepo: Repository<ResearchEmailEntity>,
    @InjectRepository(ResearchSettingsEntity)
    private readonly settingsRepo: Repository<ResearchSettingsEntity>,
  ) {}

  /**
   * 处理所有 pending 状态的邮件：过滤 + 分类。
   * 返回处理统计。
   */
  async processPendingEmails(tenantId: number): Promise<{
    processed: number;
    filtered: number;
    classified: number;
  }> {
    const pendingEmails = await this.emailRepo.find({
      where: { tenantId, status: 'pending' },
    });

    if (pendingEmails.length === 0) {
      return { processed: 0, filtered: 0, classified: 0 };
    }

    // 获取租户的营销关键词配置
    const keywords = await this.getMarketingKeywords(tenantId);

    let filtered = 0;
    let classified = 0;

    for (const email of pendingEmails) {
      // 1. 营销过滤
      const filterResult = this.checkMarketingFilter(email, keywords);
      if (filterResult.isFiltered) {
        email.status = 'filtered';
        email.filterReason = filterResult.reason;
        filtered++;
      } else {
        // 2. 基础分类
        email.categories = this.classifyEmail(email);
        email.status = 'identifying'; // 进入下一阶段：项目识别
        classified++;
      }

      await this.emailRepo.save(email);
    }

    this.logger.log(
      `邮件过滤完成: 处理 ${pendingEmails.length}, 过滤 ${filtered}, 通过 ${classified} (tenant=${tenantId})`,
    );

    return { processed: pendingEmails.length, filtered, classified };
  }

  /**
   * 获取租户的营销关键词（优先用户配置，否则用默认）。
   */
  async getMarketingKeywords(tenantId: number): Promise<string[]> {
    const settings = await this.settingsRepo.findOne({
      where: { tenantId },
    });

    if (settings?.marketingKeywords && settings.marketingKeywords.length > 0) {
      return settings.marketingKeywords;
    }

    return DEFAULT_MARKETING_KEYWORDS;
  }

  /**
   * 检查邮件是否命中营销过滤规则。
   * 标题/正文命中任一关键词则过滤。
   */
  private checkMarketingFilter(
    email: ResearchEmailEntity,
    keywords: string[],
  ): { isFiltered: boolean; reason: string | null } {
    const subject = (email.subject || '').toLowerCase();
    const body = (email.bodyText || '').toLowerCase();

    for (const keyword of keywords) {
      const kw = keyword.toLowerCase();
      if (subject.includes(kw)) {
        return {
          isFiltered: true,
          reason: `标题命中营销关键词: "${keyword}"`,
        };
      }
      if (body.includes(kw)) {
        return {
          isFiltered: true,
          reason: `正文命中营销关键词: "${keyword}"`,
        };
      }
    }

    return { isFiltered: false, reason: null };
  }

  /**
   * 对邮件进行多标签分类。
   * 基于标题、正文、链接进行规则匹配。
   */
  private classifyEmail(email: ResearchEmailEntity): string[] {
    const text = [
      email.subject || '',
      email.bodyText || '',
      JSON.stringify(email.extractedJson || {}),
    ]
      .join(' ')
      .toLowerCase();

    const categories: string[] = [];

    for (const rule of CATEGORY_RULES) {
      for (const pattern of rule.patterns) {
        if (pattern.test(text)) {
          categories.push(rule.category);
          break; // 每个分类只加一次
        }
      }
    }

    // 链接特征补充分类
    const extracted = email.extractedJson;
    if (extracted) {
      if (extracted.githubUrls?.length > 0 && !categories.includes('GitHub')) {
        categories.push('GitHub');
      }
      if (extracted.productUrls?.length > 0 && !categories.includes('ProductHunt')) {
        categories.push('ProductHunt');
      }
    }

    // 无匹配则标记 Other
    if (categories.length === 0) {
      categories.push('Other');
    }

    return categories;
  }
}
