import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { OrdersService } from './orders.service';
import { IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

class PaginationDto {
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  size?: number;
}

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Get()
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
  stats(@CurrentUser() user: JwtPayload) {
    return this.service.getStatusCounts(user.tenantId);
  }
}
