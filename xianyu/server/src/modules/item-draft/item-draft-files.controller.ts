import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ItemDraftService } from './item-draft.service';

/**
 * 草稿图片只读预览（无 JWT）。
 * 文件名含时间戳+随机串，难以枚举；不对外列出目录。
 */
@ApiTags('商品草稿图片')
@Controller('item-draft-files')
@SkipThrottle()
export class ItemDraftFilesController {
  constructor(private readonly service: ItemDraftService) {}

  @Get(':filename')
  @ApiOperation({ summary: '读取草稿图片（公开只读预览）' })
  getFile(@Param('filename') filename: string, @Res() res: Response) {
    const full = this.service.getLocalFile(filename);
    return res.sendFile(full);
  }
}
