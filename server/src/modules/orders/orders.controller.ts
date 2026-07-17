import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { OrdersService } from './orders.service';
import { OrderPollingService } from './order-polling.service';
import { IsArray, IsNumber, IsOptional, IsString, ArrayMinSize } from 'class-validator';
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

  @ApiProperty({ description: '状态筛选', required: false })
  @IsString()
  @IsOptional()
  status?: string;
}

class BatchIdsDto {
  @ApiProperty({ description: '订单ID列表', type: [Number] })
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, { each: true })
  @Type(() => Number)
  ids: number[];
}

@ApiTags('订单')
@ApiBearerAuth('access-token')
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    private readonly service: OrdersService,
    private readonly polling: OrderPollingService,
  ) {}

  @Get()
  @ApiOperation({ summary: '订单列表（分页/状态筛选）' })
  list(
    @CurrentUser() user: JwtPayload,
    @Query() query: PaginationDto,
  ) {
    return this.service.listByTenant(
      user.tenantId,
      query.page || 1,
      query.size || 20,
      query.status,
    );
  }

  @Get('stats')
  @ApiOperation({ summary: '各状态订单计数' })
  stats(@CurrentUser() user: JwtPayload) {
    return this.service.getStatusCounts(user.tenantId);
  }

  @Get('export')
  @ApiOperation({ summary: '导出订单 CSV（Excel 可打开）' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @CurrentUser() user: JwtPayload,
    @Query('status') status: string | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.service.exportCsv(user.tenantId, status);
    const filename = `orders_${Date.now()}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get(':id')
  @ApiOperation({ summary: '订单详情' })
  async detail(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const order = await this.service.findByIdForTenant(Number(id), user.tenantId);
    if (!order) {
      return null;
    }
    return order;
  }

  @Post('poll')
  @ApiOperation({ summary: '立即触发一次订单轮询' })
  async pollNow() {
    await this.polling.triggerPoll();
    return { success: true, message: '已触发轮询' };
  }

  @Post(':id/refresh')
  @ApiOperation({ summary: '刷新单条订单详情（从闲鱼拉最新）' })
  refreshOne(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.polling.refreshOrder(Number(id), user.tenantId);
  }

  @Post('refresh-batch')
  @ApiOperation({ summary: '批量刷新订单（最多20条，带间隔防风控）' })
  refreshBatch(
    @CurrentUser() user: JwtPayload,
    @Body() dto: BatchIdsDto,
  ) {
    return this.polling.refreshOrdersBatch(dto.ids, user.tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除订单记录' })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    await this.service.remove(Number(id), user.tenantId);
    return { success: true };
  }
}
