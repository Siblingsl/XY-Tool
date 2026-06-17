import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { KamiPoolService } from './kami-pool.service';
import { IsString, IsNotEmpty, IsOptional, IsArray, ArrayMinSize } from 'class-validator';

export class CreatePoolDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  remark?: string;
}

export class AddItemsDto {
  @IsArray()
  @ArrayMinSize(1, { message: '至少添加一条卡密' })
  @IsString({ each: true })
  contents: string[];
}

@Controller('kami')
@UseGuards(JwtAuthGuard)
export class KamiPoolController {
  constructor(private readonly service: KamiPoolService) {}

  // ============ 卡密池 ============

  @Get('pools')
  listPools(@CurrentUser() user: JwtPayload) {
    return this.service.listPools(user.tenantId);
  }

  @Post('pools')
  createPool(@CurrentUser() user: JwtPayload, @Body() dto: CreatePoolDto) {
    return this.service.createPool(user.tenantId, dto.name, dto.remark);
  }

  @Delete('pools/:id')
  removePool(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.removePool(Number(id), user.tenantId);
  }

  // ============ 卡密条目 ============

  @Get('items/:poolId')
  listItems(
    @CurrentUser() user: JwtPayload,
    @Param('poolId') poolId: string,
  ) {
    return this.service.listItems(Number(poolId), user.tenantId);
  }

  @Get('stock/:poolId')
  getStock(
    @CurrentUser() user: JwtPayload,
    @Param('poolId') poolId: string,
  ) {
    return this.service.getStockCount(Number(poolId), user.tenantId);
  }

  @Post('items/:poolId')
  addItems(
    @CurrentUser() user: JwtPayload,
    @Param('poolId') poolId: string,
    @Body() dto: AddItemsDto,
  ) {
    return this.service.addItems(Number(poolId), user.tenantId, dto.contents);
  }

  @Delete('items/:id')
  removeItem(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.removeItem(Number(id), user.tenantId);
  }

  // ============ 库存预警 ============

  @Get('low-stock')
  checkLowStock(@CurrentUser() user: JwtPayload) {
    return this.service.checkLowStock(user.tenantId);
  }
}
