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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { KamiPoolService } from './kami-pool.service';
import { IsString, IsNotEmpty, IsOptional, IsArray, ArrayMinSize } from 'class-validator';

export class CreatePoolDto {
  @ApiProperty({ description: '卡密池名称', example: 'Steam CDK 池' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: '备注', required: false })
  @IsString()
  @IsOptional()
  remark?: string;
}

export class AddItemsDto {
  @ApiProperty({ description: '卡密内容数组', type: [String], example: ['ABCD-1234', 'EFGH-5678'] })
  @IsArray()
  @ArrayMinSize(1, { message: '至少添加一条卡密' })
  @IsString({ each: true })
  contents: string[];
}

@ApiTags('卡密池')
@ApiBearerAuth('access-token')
@Controller('kami')
@UseGuards(JwtAuthGuard)
export class KamiPoolController {
  constructor(private readonly service: KamiPoolService) {}

  // ============ 卡密池 ============

  @Get('pools')
  @ApiOperation({ summary: '列出所有卡密池' })
  listPools(@CurrentUser() user: JwtPayload) {
    return this.service.listPools(user.tenantId);
  }

  @Post('pools')
  @ApiOperation({ summary: '创建卡密池' })
  createPool(@CurrentUser() user: JwtPayload, @Body() dto: CreatePoolDto) {
    return this.service.createPool(user.tenantId, dto.name, dto.remark);
  }

  @Delete('pools/:id')
  @ApiOperation({ summary: '删除卡密池' })
  removePool(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.removePool(Number(id), user.tenantId);
  }

  // ============ 卡密条目 ============

  @Get('items/:poolId')
  @ApiOperation({ summary: '列出池内卡密' })
  listItems(
    @CurrentUser() user: JwtPayload,
    @Param('poolId') poolId: string,
  ) {
    return this.service.listItems(Number(poolId), user.tenantId);
  }

  @Get('stock/:poolId')
  @ApiOperation({ summary: '查询可用库存数' })
  getStock(
    @CurrentUser() user: JwtPayload,
    @Param('poolId') poolId: string,
  ) {
    return this.service.getStockCount(Number(poolId), user.tenantId);
  }

  @Post('items/:poolId')
  @ApiOperation({ summary: '批量添加卡密' })
  addItems(
    @CurrentUser() user: JwtPayload,
    @Param('poolId') poolId: string,
    @Body() dto: AddItemsDto,
  ) {
    return this.service.addItems(Number(poolId), user.tenantId, dto.contents);
  }

  @Delete('items/:id')
  @ApiOperation({ summary: '删除单条卡密' })
  removeItem(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.removeItem(Number(id), user.tenantId);
  }

  // ============ 库存预警 ============

  @Get('low-stock')
  @ApiOperation({ summary: '查询低库存预警' })
  checkLowStock(@CurrentUser() user: JwtPayload) {
    return this.service.checkLowStock(user.tenantId);
  }
}
