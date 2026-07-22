import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { ItemDraftService } from './item-draft.service';

class ItemDraftDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  accountId?: number;

  @ApiProperty({ example: 'Steam CDK 赛博朋克2077' })
  @IsString()
  @MaxLength(60)
  title: string;

  @ApiProperty({ example: '自动发货，拍下秒发' })
  @IsString()
  description: string;

  @ApiProperty({ example: 9.9 })
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  price: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  originalPrice?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ required: false, example: '全新' })
  @IsOptional()
  @IsString()
  condition?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiProperty({ required: false, type: 'array' })
  @IsOptional()
  @IsArray()
  images?: Array<{
    localPath?: string;
    url?: string;
    width?: number;
    height?: number;
  }>;

  @ApiProperty({ required: false, example: '无需邮寄' })
  @IsOptional()
  @IsString()
  deliveryChoice?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  postPrice?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  remark?: string;
}

@ApiTags('商品草稿')
@ApiBearerAuth('access-token')
@Controller('item-drafts')
@UseGuards(JwtAuthGuard)
export class ItemDraftController {
  constructor(private readonly service: ItemDraftService) {}

  @Get()
  @ApiOperation({ summary: '草稿/素材列表' })
  list(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
  ) {
    return this.service.list(user.tenantId, status);
  }

  @Post('upload')
  @ApiOperation({ summary: '上传商品图片（最多9张，每张≤5MB）' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 9, {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async upload(
    @UploadedFiles()
    files: Array<{
      originalname?: string;
      mimetype?: string;
      size: number;
      buffer: Buffer;
    }>,
  ) {
    const saved = await this.service.saveUploadedFiles(files || []);
    return { files: saved };
  }

  @Get(':id')
  @ApiOperation({ summary: '草稿详情' })
  detail(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.findOne(Number(id), user.tenantId);
  }

  @Post()
  @ApiOperation({ summary: '新建本地草稿' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: ItemDraftDto) {
    return this.service.create(user.tenantId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新本地草稿' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ItemDraftDto,
  ) {
    return this.service.update(Number(id), user.tenantId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除草稿' })
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.service.remove(Number(id), user.tenantId);
    return { success: true };
  }

  @Post(':id/push-draft')
  @ApiOperation({
    summary: '【已禁用】推送到闲鱼',
    description:
      '闲鱼无公开「仅草稿」API；正式发布易触发风控封号。本接口永久禁用，仅保留本地草稿。',
  })
  pushDraft() {
    return {
      success: false,
      message:
        '已禁用自动上架：闲鱼无公开草稿 API，正式发布接口风控严格易封号。请使用本页本地草稿，并在闲鱼 App/网页手动发布。',
    };
  }
}
