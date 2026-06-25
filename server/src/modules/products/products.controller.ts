import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { ProductsService } from './products.service';
import { IsString, IsNotEmpty, IsIn, IsNumber, IsOptional, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @ApiProperty({ description: '关联的闲鱼账号ID' })
  @IsNumber()
  @Type(() => Number)
  accountId: number;

  @ApiProperty({ description: '闲鱼商品ID' })
  @IsString()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ description: '商品标题' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: '发货方式', enum: ['kami', 'link', 'text', 'license'] })
  @IsString()
  @IsIn(['kami', 'link', 'text', 'license'])
  deliveryType: string;

  @ApiProperty({ description: '卡密池ID（deliveryType=kami 时必填）', required: false })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  kamiPoolId?: number;

  @ApiProperty({ description: '激活码类型编码（deliveryType=license 时填，如 monthly）', required: false })
  @IsString()
  @IsOptional()
  licenseTypeCode?: string;

  @ApiProperty({ description: '固定发货内容（deliveryType=link/text 时填）', required: false })
  @IsString()
  @IsOptional()
  fixedContent?: string;

  @ApiProperty({ description: '发货附言（可选）', required: false })
  @IsString()
  @IsOptional()
  remark?: string;
}

export class UpdateProductDto {
  @ApiProperty({ description: '商品标题', required: false })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({ description: '发货方式', enum: ['kami', 'link', 'text', 'license'], required: false })
  @IsString()
  @IsIn(['kami', 'link', 'text', 'license'])
  @IsOptional()
  deliveryType?: string;

  @ApiProperty({ description: '卡密池ID', required: false })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  kamiPoolId?: number;

  @ApiProperty({ description: '激活码类型编码（license 模式）', required: false })
  @IsString()
  @IsOptional()
  licenseTypeCode?: string;

  @ApiProperty({ description: '固定发货内容', required: false })
  @IsString()
  @IsOptional()
  fixedContent?: string;

  @ApiProperty({ description: '发货附言', required: false })
  @IsString()
  @IsOptional()
  remark?: string;

  @ApiProperty({ description: '是否启用', required: false })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  enabled?: boolean;
}

@ApiTags('商品规则')
@ApiBearerAuth('access-token')
@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  @ApiOperation({ summary: '列出所有商品发货规则' })
  list(@CurrentUser() user: JwtPayload) {
    return this.service.listByTenant(user.tenantId);
  }

  @Get('account/:accountId')
  @ApiOperation({ summary: '列出指定账号的商品规则' })
  listByAccount(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
  ) {
    return this.service.listByAccount(user.tenantId, Number(accountId));
  }

  @Post()
  @ApiOperation({ summary: '创建商品发货规则' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateProductDto) {
    return this.service.create({ tenantId: user.tenantId, ...dto } as any);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新商品发货规则' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.service.update(Number(id), user.tenantId, dto as any);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除商品发货规则' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.remove(Number(id), user.tenantId);
  }
}
