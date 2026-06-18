import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { DeliveryLogEntity } from './delivery-log.entity';
import { DeliveryService } from './delivery.service';
import { IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

class DeliveryLogQueryDto {
  @ApiProperty({ description: '按订单ID过滤', required: false })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  orderId?: number;

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

/**
 * 发货日志与手动重试接口。
 */
@ApiTags('发货')
@ApiBearerAuth('access-token')
@Controller('delivery')
@UseGuards(JwtAuthGuard)
export class DeliveryController {
  constructor(
    @InjectRepository(DeliveryLogEntity)
    private readonly logRepo: Repository<DeliveryLogEntity>,
    private readonly deliveryService: DeliveryService,
  ) {}

  @Get('logs')
  @ApiOperation({ summary: '发货日志列表（分页，可按 orderId 过滤）' })
  async listLogs(
    @CurrentUser() user: JwtPayload,
    @Query() query: DeliveryLogQueryDto,
  ) {
    const page = query.page || 1;
    const size = query.size || 20;
    const where: Record<string, unknown> = { tenantId: user.tenantId };
    if (query.orderId) where['orderId'] = query.orderId;

    const [list, total] = await this.logRepo.find({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    return { list, total, page, size };
  }

  @Post('retry/:orderId')
  @ApiOperation({ summary: '手动重试发货', description: '仅 FAILED/PENDING/IGNORED 状态可重试' })
  retryDeliver(
    @CurrentUser() user: JwtPayload,
    @Param('orderId') orderId: string,
  ) {
    return this.deliveryService.retryDeliver(Number(orderId), user.tenantId);
  }
}
