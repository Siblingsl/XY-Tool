import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
} from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsInt,
  IsIn,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { AutoReplyService } from './auto-reply.service';

// ============ DTO ============

class CreateKeywordDto {
  @ApiProperty({ description: '关联账号ID（不填=全局生效）', required: false })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  accountId?: number;

  @ApiProperty({ description: '关键词', example: '怎么用' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  keyword: string;

  @ApiProperty({ description: '匹配模式', enum: ['exact', 'contains'] })
  @IsIn(['exact', 'contains'])
  matchType: string;

  @ApiProperty({ description: '回复内容' })
  @IsString()
  @IsNotEmpty()
  replyContent: string;

  @ApiProperty({ description: '启用', required: false, default: true })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  enabled?: boolean;

  @ApiProperty({ description: '优先级（小优先）', required: false, default: 0 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  sortOrder?: number;
}

class UpdateKeywordDto {
  @ApiProperty({ description: '关键词', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @ApiProperty({ description: '匹配模式', enum: ['exact', 'contains'], required: false })
  @IsOptional()
  @IsIn(['exact', 'contains'])
  matchType?: string;

  @ApiProperty({ description: '回复内容', required: false })
  @IsOptional()
  @IsString()
  replyContent?: string;

  @ApiProperty({ description: '启用', required: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  enabled?: boolean;

  @ApiProperty({ description: '优先级', required: false })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  sortOrder?: number;
}

class UpdateConfigDto {
  @ApiProperty({ description: '默认回复开关', required: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  defaultReplyEnabled?: boolean;

  @ApiProperty({ description: '默认回复内容', required: false })
  @IsOptional()
  @IsString()
  defaultReplyContent?: string;

  @ApiProperty({ description: 'AI回复开关', required: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  aiEnabled?: boolean;

  @ApiProperty({ description: 'OpenAI兼容地址', required: false })
  @IsOptional()
  @IsString()
  aiBaseUrl?: string;

  @ApiProperty({ description: 'AI API Key（明文传入，服务端加密；空则不更新）', required: false })
  @IsOptional()
  @IsString()
  aiApiKey?: string;

  @ApiProperty({ description: '模型名', required: false })
  @IsOptional()
  @IsString()
  aiModel?: string;

  @ApiProperty({ description: '系统提示词', required: false })
  @IsOptional()
  @IsString()
  aiSystemPrompt?: string;

  @ApiProperty({ description: '温度(0-2)', required: false })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  aiTemperature?: number;

  @ApiProperty({ description: '转人工关键词(逗号分隔)', required: false })
  @IsOptional()
  @IsString()
  transferKeywords?: string;

  @ApiProperty({ description: '冷却秒数', required: false })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  cooldownSeconds?: number;
}

class TestAiDto {
  @ApiProperty({ description: 'OpenAI兼容地址' })
  @IsString()
  baseUrl: string;

  @ApiProperty({ description: 'API Key（明文，仅用于测试，不落库）' })
  @IsString()
  apiKey: string;

  @ApiProperty({ description: '模型名', required: false, default: 'gpt-4o-mini' })
  @IsOptional()
  @IsString()
  model?: string;
}

/**
 * 自动回复接口。
 *
 * 三大能力：
 * 1. 关键词回复：精确/包含匹配，命中自动回复
 * 2. 默认回复：兜底回复（无匹配时）
 * 3. AI 回复：OpenAI 兼容大模型，带上下文
 *
 * 优先级：转人工 > 关键词 > AI > 默认。
 */
@ApiTags('自动回复')
@ApiBearerAuth('access-token')
@Controller('auto-reply')
@UseGuards(JwtAuthGuard)
export class AutoReplyController {
  constructor(private readonly service: AutoReplyService) {}

  // ============ 关键词回复 ============

  @Get('keywords')
  @ApiOperation({ summary: '列出所有关键词回复规则' })
  listKeywords(@CurrentUser() user: JwtPayload) {
    return this.service.listKeywords(user.tenantId);
  }

  @Post('keywords')
  @ApiOperation({ summary: '创建关键词回复规则' })
  async createKeyword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateKeywordDto,
  ) {
    return this.service.createKeyword({
      tenantId: user.tenantId,
      accountId: dto.accountId ?? null,
      keyword: dto.keyword,
      matchType: dto.matchType as any,
      replyContent: dto.replyContent,
      enabled: dto.enabled ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });
  }

  @Put('keywords/:id')
  @ApiOperation({ summary: '更新关键词回复规则' })
  updateKeyword(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateKeywordDto,
  ) {
    return this.service.updateKeyword(
      Number(id),
      user.tenantId,
      dto as any,
    );
  }

  @Delete('keywords/:id')
  @ApiOperation({ summary: '删除关键词回复规则' })
  deleteKeyword(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.deleteKeyword(Number(id), user.tenantId);
  }

  // ============ 账号配置 ============

  @Get('config/:accountId')
  @ApiOperation({ summary: '获取账号回复配置（API Key 脱敏）' })
  async getConfig(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
  ) {
    const cfg = await this.service.getConfigWithMaskedKey(
      Number(accountId),
      user.tenantId,
    );
    // 无配置时返回默认值结构，方便前端直接编辑
    if (!cfg) {
      return {
        accountId: Number(accountId),
        defaultReplyEnabled: false,
        defaultReplyContent: '',
        aiEnabled: false,
        aiBaseUrl: 'https://api.openai.com/v1',
        aiApiKeyConfigured: false,
        aiModel: 'gpt-4o-mini',
        aiSystemPrompt: '',
        aiTemperature: 0.7,
        transferKeywords: '人工,客服',
        cooldownSeconds: 3,
      };
    }
    return cfg;
  }

  @Put('config/:accountId')
  @ApiOperation({ summary: '更新账号回复配置', description: 'aiApiKey 留空则保留原值' })
  updateConfig(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Body() dto: UpdateConfigDto,
  ) {
    return this.service.upsertConfig(
      Number(accountId),
      user.tenantId,
      dto as any,
    );
  }

  // ============ AI 测试 ============

  @Post('ai/test')
  @ApiOperation({ summary: '测试 AI 连通性', description: '用传入的配置即时测试，不落库' })
  async testAi(@Body() dto: TestAiDto) {
    const result = await this.service.testAi(
      dto.baseUrl,
      dto.apiKey,
      dto.model || 'gpt-4o-mini',
    );
    if (!result.ok) {
      throw new HttpException(result.error || 'AI 测试失败', HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  // ============ 人工接管 ============

  @Get('handoffs')
  @ApiOperation({ summary: '列出已转人工的买家会话' })
  listHandoffs(@CurrentUser() user: JwtPayload) {
    return this.service.listHandoffs(user.tenantId);
  }

  @Post('config/:accountId/reset-handoff/:buyerId')
  @ApiOperation({ summary: '重置人工接管', description: '恢复对指定买家的自动回复' })
  resetHandoff(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Param('buyerId') buyerId: string,
  ) {
    return this.service.resetHandoff(
      Number(accountId),
      user.tenantId,
      buyerId,
    );
  }
}
