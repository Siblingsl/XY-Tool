import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { StatsService } from './stats.service';

class TrendQueryDto {
  @ApiProperty({ description: '统计天数', required: false, default: 7, minimum: 1, maximum: 90 })
  @IsInt()
  @Min(1)
  @Max(90)
  @IsOptional()
  @Type(() => Number)
  days?: number;
}

class TopProductsQueryDto {
  @ApiProperty({ description: 'TOP N', required: false, default: 5, maximum: 50 })
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @ApiProperty({ description: '统计天数', required: false, default: 30, maximum: 365 })
  @IsInt()
  @Min(1)
  @Max(365)
  @IsOptional()
  @Type(() => Number)
  days?: number;
}

/**
 * 统计报表接口。
 */
@ApiTags('统计报表')
@ApiBearerAuth('access-token')
@Controller('stats')
@UseGuards(JwtAuthGuard)
export class StatsController {
  constructor(private readonly service: StatsService) {}

  @Get('trend')
  @ApiOperation({ summary: '近 N 天每日发货量趋势' })
  trend(@CurrentUser() user: JwtPayload, @Query() query: TrendQueryDto) {
    return this.service.getDailyDeliveredTrend(user.tenantId, query.days ?? 7);
  }

  @Get('revenue')
  @ApiOperation({ summary: '近 N 天每日营收（分，排除退款）' })
  revenue(@CurrentUser() user: JwtPayload, @Query() query: TrendQueryDto) {
    return this.service.getDailyRevenue(user.tenantId, query.days ?? 7);
  }

  @Get('top-products')
  @ApiOperation({ summary: '商品销量 TOP N（近 N 天）' })
  topProducts(
    @CurrentUser() user: JwtPayload,
    @Query() query: TopProductsQueryDto,
  ) {
    return this.service.getTopProducts(
      user.tenantId,
      query.limit ?? 5,
      query.days ?? 30,
    );
  }
}
