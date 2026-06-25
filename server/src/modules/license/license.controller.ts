import {
  Body,
  Controller,
  Delete,
  Get,
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
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { LicenseService } from './license.service';

// ============ DTO ============

class CreateTypeDto {
  @ApiProperty({ description: '类型名称', example: '月卡' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: '类型编码（唯一）', example: 'monthly' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ description: '有效天数（null=永久）', required: false, example: 30 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  durationDays?: number;

  @ApiProperty({ description: '最大使用次数', required: false, default: 1 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  maxUses?: number;

  @ApiProperty({ description: '码前缀', required: false, example: 'SWA-' })
  @IsOptional()
  @IsString()
  codePrefix?: string;

  @ApiProperty({ description: '码段长度', required: false, default: 16 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  codeLength?: number;

  @ApiProperty({ description: '启用', required: false, default: true })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  enabled?: boolean;
}

class UpdateTypeDto {
  @ApiProperty({ description: '类型名称', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: '有效天数', required: false })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  durationDays?: number;

  @ApiProperty({ description: '最大使用次数', required: false })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  maxUses?: number;

  @ApiProperty({ description: '码前缀', required: false })
  @IsOptional()
  @IsString()
  codePrefix?: string;

  @ApiProperty({ description: '码段长度', required: false })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  codeLength?: number;

  @ApiProperty({ description: '启用', required: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  enabled?: boolean;
}

class GenerateDto {
  @ApiProperty({ description: '类型ID' })
  @IsInt()
  @Type(() => Number)
  typeId: number;

  @ApiProperty({ description: '生成数量(1-1000)', minimum: 1, maximum: 1000 })
  @IsInt()
  @Type(() => Number)
  count: number;
}

class ListCodesDto {
  @ApiProperty({ description: '类型ID', required: false })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  typeId?: number;

  @ApiProperty({ description: '状态', required: false, enum: ['unused', 'active', 'revoked', 'expired'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ description: '页码', required: false, default: 1 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  page?: number;

  @ApiProperty({ description: '每页条数', required: false, default: 20 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  size?: number;
}

/**
 * 激活码管理接口（内部，JWT 鉴权）。
 *
 * 对外验证 API 见 LicensePublicController（/api/license/verify，ApiKeyGuard）。
 */
@ApiTags('激活码（管理）')
@ApiBearerAuth('access-token')
@Controller('license/manage')
@UseGuards(JwtAuthGuard)
export class LicenseController {
  constructor(private readonly service: LicenseService) {}

  // ============ 类型管理 ============

  @Get('types')
  @ApiOperation({ summary: '列出所有激活码类型' })
  listTypes(@CurrentUser() user: JwtPayload) {
    return this.service.listTypes(user.tenantId);
  }

  @Post('types')
  @ApiOperation({ summary: '创建激活码类型' })
  createType(@CurrentUser() user: JwtPayload, @Body() dto: CreateTypeDto) {
    return this.service.createType({ ...dto, tenantId: user.tenantId });
  }

  @Put('types/:id')
  @ApiOperation({ summary: '更新激活码类型（code 不可改）' })
  updateType(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateTypeDto,
  ) {
    return this.service.updateType(Number(id), user.tenantId, dto);
  }

  @Delete('types/:id')
  @ApiOperation({ summary: '删除激活码类型（无关联码才可删）' })
  deleteType(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.deleteType(Number(id), user.tenantId);
  }

  // ============ 批量生成 ============

  @Post('batches/generate')
  @ApiOperation({ summary: '批量生成激活码' })
  generate(
    @CurrentUser() user: JwtPayload,
    @Body() dto: GenerateDto,
  ) {
    return this.service.generateCodes(dto.typeId, dto.count, user.tenantId, 'manual');
  }

  // ============ 激活码列表 ============

  @Get('codes')
  @ApiOperation({ summary: '激活码列表（分页+筛选）' })
  listCodes(@CurrentUser() user: JwtPayload, @Query() query: ListCodesDto) {
    return this.service.listCodes(user.tenantId, query as any);
  }

  @Post('codes/:id/revoke')
  @ApiOperation({ summary: '作废激活码' })
  revoke(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.revoke(Number(id), user.tenantId);
  }

  // ============ 统计 ============

  @Get('stats')
  @ApiOperation({ summary: '激活码统计（各类型生成/激活/作废数）' })
  stats(@CurrentUser() user: JwtPayload) {
    return this.service.getStats(user.tenantId);
  }
}
