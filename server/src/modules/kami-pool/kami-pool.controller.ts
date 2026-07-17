import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
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

export class ImportTextDto {
  @ApiProperty({ description: '文本内容，每行一条卡密；也支持 CSV 首列' })
  @IsString()
  @IsNotEmpty()
  text: string;
}

@ApiTags('卡密池')
@ApiBearerAuth('access-token')
@Controller('kami')
@UseGuards(JwtAuthGuard)
export class KamiPoolController {
  constructor(private readonly service: KamiPoolService) {}

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

  @Get('low-stock')
  @ApiOperation({ summary: '查询低库存预警' })
  checkLowStock(@CurrentUser() user: JwtPayload) {
    return this.service.checkLowStock(user.tenantId);
  }

  @Get('items/:poolId/export')
  @ApiOperation({ summary: '导出卡密为 CSV（Excel 可直接打开）' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportItems(
    @CurrentUser() user: JwtPayload,
    @Param('poolId') poolId: string,
    @Res() res: Response,
  ) {
    const items = await this.service.listItems(Number(poolId), user.tenantId);
    const lines = ['id,content,status,orderId,createdAt'];
    for (const it of items as any[]) {
      const content = String(it.content || '').replace(/"/g, '""');
      lines.push(
        `${it.id},"${content}",${it.status},${it.orderId ?? ''},${it.createdAt ?? ''}`,
      );
    }
    const body = '\uFEFF' + lines.join('\n');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="kami-pool-${poolId}.csv"`,
    );
    res.send(body);
  }

  @Post('items/:poolId/import-text')
  @ApiOperation({ summary: '文本/CSV 批量导入卡密（每行一条）' })
  async importText(
    @CurrentUser() user: JwtPayload,
    @Param('poolId') poolId: string,
    @Body() body: ImportTextDto,
  ) {
    const raw = body?.text || '';
    const contents = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .map((s) => (s.includes(',') ? s.split(',')[0].trim() : s))
      .map((s) => s.replace(/^"|"$/g, ''))
      .filter(
        (s) => s && s.toLowerCase() !== 'content' && s.toLowerCase() !== 'id',
      );
    if (!contents.length) {
      return { success: false, message: '没有有效卡密', count: 0 };
    }
    const saved = await this.service.addItems(
      Number(poolId),
      user.tenantId,
      contents,
    );
    return {
      success: true,
      count: Array.isArray(saved) ? saved.length : contents.length,
    };
  }
}