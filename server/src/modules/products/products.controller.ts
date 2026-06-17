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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { ProductsService } from './products.service';
import { IsString, IsNotEmpty, IsIn, IsNumber, IsOptional, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsNumber()
  @Type(() => Number)
  accountId: number;

  @IsString()
  @IsNotEmpty()
  itemId: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsIn(['kami', 'link', 'text'])
  deliveryType: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  kamiPoolId?: number;

  @IsString()
  @IsOptional()
  fixedContent?: string;

  @IsString()
  @IsOptional()
  remark?: string;
}

export class UpdateProductDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsIn(['kami', 'link', 'text'])
  @IsOptional()
  deliveryType?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  kamiPoolId?: number;

  @IsString()
  @IsOptional()
  fixedContent?: string;

  @IsString()
  @IsOptional()
  remark?: string;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  enabled?: boolean;
}

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.service.listByTenant(user.tenantId);
  }

  @Get('account/:accountId')
  listByAccount(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
  ) {
    return this.service.listByAccount(user.tenantId, Number(accountId));
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateProductDto) {
    return this.service.create({ tenantId: user.tenantId, ...dto } as any);
  }

  @Put(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.service.update(Number(id), user.tenantId, dto as any);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.remove(Number(id), user.tenantId);
  }
}
