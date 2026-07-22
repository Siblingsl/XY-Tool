import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Put,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { AiService } from './ai.service';

class UpdateAiConfigDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  enabled?: boolean;

  @ApiProperty({ description: 'OpenAI 兼容 Base URL', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  baseUrl?: string;

  @ApiProperty({ description: 'API Key（明文，空则不更新）', required: false })
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  defaultModel?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  defaultTemperature?: number;
}

class TestAiDto {
  @ApiProperty({ description: 'OpenAI 兼容地址', required: false })
  @IsOptional()
  @IsString()
  baseUrl?: string;

  @ApiProperty({ description: 'API Key', required: false })
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  model?: string;
}

@ApiTags('AI 接入')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('config')
  @ApiOperation({ summary: '获取公共 AI 配置（Key 脱敏）' })
  getConfig(@CurrentUser() user: JwtPayload) {
    return this.ai.getConfigPublic(user.tenantId);
  }

  @Put('config')
  @ApiOperation({ summary: '保存公共 AI 配置', description: 'apiKey 留空则保留原值' })
  updateConfig(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateAiConfigDto,
  ) {
    return this.ai.upsertConfig(user.tenantId, dto);
  }

  @Post('test')
  @ApiOperation({
    summary: '测试 AI 连通',
    description: '传 baseUrl+apiKey 则即时测；否则测已保存配置',
  })
  async test(
    @CurrentUser() user: JwtPayload,
    @Body() dto: TestAiDto,
  ) {
    let result: { ok: boolean; reply?: string; error?: string; source?: string };
    if (dto.baseUrl && dto.apiKey) {
      result = await this.ai.testConnection(
        dto.baseUrl,
        dto.apiKey,
        dto.model || 'gpt-4o-mini',
      );
    } else {
      result = await this.ai.testSaved(user.tenantId);
    }
    if (!result.ok) {
      throw new HttpException(
        result.error || 'AI 测试失败',
        HttpStatus.BAD_REQUEST,
      );
    }
    return result;
  }
}
