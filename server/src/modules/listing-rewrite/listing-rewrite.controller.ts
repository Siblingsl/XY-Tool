import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { ListingRewriteService } from './listing-rewrite.service';

class RewriteDto {
  @ApiProperty({
    example: 'https://www.goofish.com/item?id=1001160709960',
    description: '闲鱼商品链接或纯数字商品 ID',
  })
  @IsString()
  @MaxLength(500)
  url: string;

  @ApiProperty({ description: '用于抓取详情 + 读取 AI 配置的闲鱼账号 ID' })
  @IsNumber()
  @Type(() => Number)
  accountId: number;

  @ApiProperty({
    required: false,
    example: '虚拟商品爆款风，强调秒发与售后边界',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  style?: string;
}

@ApiTags('爆款仿写')
@ApiBearerAuth('access-token')
@Controller('listing-rewrite')
@UseGuards(JwtAuthGuard)
export class ListingRewriteController {
  constructor(private readonly service: ListingRewriteService) {}

  @Post('generate')
  @ApiOperation({
    summary: '根据闲鱼链接抓取商品并 AI 仿写爆款文案',
    description:
      '抓取使用账号 Cookie；AI 使用该账号在「自动回复」中配置的模型。不会上架商品。',
  })
  generate(@CurrentUser() user: JwtPayload, @Body() dto: RewriteDto) {
    return this.service.rewriteFromLink(
      user.tenantId,
      dto.accountId,
      dto.url,
      dto.style,
    );
  }
}
