import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../../common/interfaces/jwt-payload.interface';
import { ResearchSettingsEntity } from '../entities/settings.entity';

/** 默认营销关键词（与 filter service 保持一致） */
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

const DEFAULT_VERIFY_SOURCES = ['google', 'github', 'producthunt', 'reddit'];

class UpdateSettingsDto {
  marketingKeywords?: string[];
  reportCronLocal?: string;
  enabledVerifySources?: string[];
}

/**
 * 研究系统设置控制器。
 * API 契约见文档附录 A.7。
 * 路由前缀: /api/research/settings
 */
@ApiTags('项目研究 - 设置')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('research/settings')
export class SettingsController {
  constructor(
    @InjectRepository(ResearchSettingsEntity)
    private readonly settingsRepo: Repository<ResearchSettingsEntity>,
  ) {}

  /**
   * 获取设置。
   * GET /api/research/settings
   */
  @Get()
  @ApiOperation({ summary: '获取研究系统设置' })
  async getSettings(@CurrentUser() user: JwtPayload) {
    let settings = await this.settingsRepo.findOne({
      where: { tenantId: user.tenantId },
    });

    // 不存在则返回默认值
    return {
      marketingKeywords:
        settings?.marketingKeywords || DEFAULT_MARKETING_KEYWORDS,
      reportCronLocal: settings?.reportCronLocal || '21:00',
      enabledVerifySources:
        settings?.enabledVerifySources || DEFAULT_VERIFY_SOURCES,
    };
  }

  /**
   * 更新设置。
   * PUT /api/research/settings
   * 文档第七章：保存营销词后仅对新邮件生效。
   */
  @Put()
  @ApiOperation({ summary: '更新研究系统设置' })
  async updateSettings(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateSettingsDto,
  ) {
    let settings = await this.settingsRepo.findOne({
      where: { tenantId: user.tenantId },
    });

    if (!settings) {
      settings = this.settingsRepo.create({
        tenantId: user.tenantId,
        marketingKeywords: dto.marketingKeywords || DEFAULT_MARKETING_KEYWORDS,
        reportCronLocal: dto.reportCronLocal || '21:00',
        enabledVerifySources: dto.enabledVerifySources || DEFAULT_VERIFY_SOURCES,
      });
    } else {
      if (dto.marketingKeywords !== undefined) {
        settings.marketingKeywords = dto.marketingKeywords;
      }
      if (dto.reportCronLocal !== undefined) {
        settings.reportCronLocal = dto.reportCronLocal;
      }
      if (dto.enabledVerifySources !== undefined) {
        settings.enabledVerifySources = dto.enabledVerifySources;
      }
    }

    await this.settingsRepo.save(settings);

    return {
      marketingKeywords: settings.marketingKeywords,
      reportCronLocal: settings.reportCronLocal,
      enabledVerifySources: settings.enabledVerifySources,
    };
  }
}
