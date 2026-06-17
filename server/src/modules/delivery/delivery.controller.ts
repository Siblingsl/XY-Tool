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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { DeliveryLogEntity } from './delivery-log.entity';
import { DeliveryService } from './delivery.service';
import { IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

class DeliveryLogQueryDto {
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  orderId?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  size?: number;
}

/**
 * 发货日志与手动重试接口。
 */
@Controller('delivery')
@UseGuards(JwtAuthGuard)
export class DeliveryController {
  constructor(
    @InjectRepository(DeliveryLogEntity)
    private readonly logRepo: Repository<DeliveryLogEntity>,
    private readonly deliveryService: DeliveryService,
  ) {}

  @Get('logs')
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

  /** POST /api/delivery/retry/:orderId  手动重试发货 */
  @Post('retry/:orderId')
  retryDeliver(
    @CurrentUser() user: JwtPayload,
    @Param('orderId') orderId: string,
  ) {
    return this.deliveryService.retryDeliver(Number(orderId), user.tenantId);
  }
}
