import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { OrdersService } from './orders.service';
import { IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

class PaginationDto {
  @ApiProperty({ description: '页码', required: false, default: 1 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiProperty({ description: '每页条数', required: false, default: 20 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  size?: number;
}

@ApiTags('订单')
@ApiBearerAuth('access-token')
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Get()
  @ApiOperation({ summary: '订单列表（分页）' })
  list(
    @CurrentUser() user: JwtPayload,
    @Query() query: PaginationDto,
  ) {
    return this.service.listByTenant(
      user.tenantId,
      query.page || 1,
      query.size || 20,
    );
  }

  @Get('stats')
  @ApiOperation({ summary: '各状态订单计数' })
  stats(@CurrentUser() user: JwtPayload) {
    return this.service.getStatusCounts(user.tenantId);
  }
}
