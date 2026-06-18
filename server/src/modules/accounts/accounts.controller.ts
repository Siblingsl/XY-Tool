import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { AccountsService } from './accounts.service';
import { QrLoginService } from './qr-login.service';
import { CookieHealthService } from './cookie-health.service';
import {
  IsInt,
  IsOptional,
  IsString,
  IsNotEmpty,
  IsBoolean,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** 新增账号 DTO */
export class CreateAccountDto {
  @ApiProperty({ description: '账号昵称', example: '小明的闲鱼店' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nickname: string;

  @ApiProperty({ description: '闲鱼用户ID（unb）', example: '2201234567890' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  xianyuUid: string;

  @ApiProperty({ description: '完整 Cookie 字符串（从浏览器复制）', example: '_m_h5_tk=...; cookie2=...;' })
  @IsString()
  @IsNotEmpty()
  @MinLength(50, { message: 'Cookie 内容过短，请检查是否完整复制' })
  cookie: string;
}

/** 更新 Cookie DTO */
export class UpdateCookieDto {
  @ApiProperty({ description: '新的完整 Cookie' })
  @IsString()
  @IsNotEmpty()
  @MinLength(50)
  cookie: string;
}

/** 发起扫码登录 DTO */
export class StartQrLoginDto {
  @ApiProperty({ description: '指定更新已有账号的 ID（可选，不填则新建）', required: false })
  @IsOptional()
  @IsInt()
  accountId?: number;
}

/** 启用/禁用账号 DTO */
export class SetAccountEnabledDto {
  @ApiProperty({ description: '是否启用' })
  @IsBoolean()
  enabled: boolean;
}

/**
 * 闲鱼账号管理接口。
 * 所有接口需要 JWT 登录态，且数据按 tenantId 隔离。
 */
@ApiTags('闲鱼账号')
@ApiBearerAuth('access-token')
@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class AccountsController {
  constructor(
    private readonly service: AccountsService,
    private readonly qrLogin: QrLoginService,
    private readonly cookieHealth: CookieHealthService,
  ) {}

  @Get()
  @ApiOperation({ summary: '列出当前租户下所有账号' })
  list(@CurrentUser() user: JwtPayload) {
    return this.service.listByTenant(user.tenantId);
  }

  @Post('qr/start')
  @ApiOperation({ summary: '生成扫码登录二维码', description: '返回 sessionId 与二维码内容，前端轮询 status 接口' })
  startQrLogin(
    @CurrentUser() user: JwtPayload,
    @Body() dto: StartQrLoginDto,
  ) {
    return this.qrLogin.start(user.tenantId, dto.accountId);
  }

  @Get('qr/:sessionId/status')
  @ApiOperation({ summary: '轮询扫码登录状态' })
  qrLoginStatus(
    @CurrentUser() user: JwtPayload,
    @Param('sessionId') sessionId: string,
  ) {
    return this.qrLogin.pollStatus(sessionId, user.tenantId);
  }

  @Post()
  @ApiOperation({ summary: '新增闲鱼账号（手动粘贴 Cookie）' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateAccountDto) {
    return this.service.create({
      tenantId: user.tenantId,
      ...dto,
    });
  }

  @Put(':id/cookie')
  @ApiOperation({ summary: '更新账号 Cookie' })
  async updateCookie(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateCookieDto,
  ) {
    try {
      await this.service.updateCookie(Number(id), user.tenantId, dto.cookie);
      return { ok: true };
    } catch {
      throw new NotFoundException('账号不存在');
    }
  }

  @Put(':id/enabled')
  @ApiOperation({ summary: '启用/禁用账号' })
  async setEnabled(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SetAccountEnabledDto,
  ) {
    try {
      return await this.service.setEnabled(
        Number(id),
        user.tenantId,
        dto.enabled,
      );
    } catch {
      throw new NotFoundException('账号不存在');
    }
  }

  @Post(':id/health-check')
  @ApiOperation({ summary: '主动检测 Cookie 是否有效' })
  async healthCheck(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const account = await this.service.findById(Number(id), user.tenantId);
    if (!account) {
      throw new NotFoundException('账号不存在');
    }
    return this.cookieHealth.checkOne(Number(id));
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除账号' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.remove(Number(id), user.tenantId);
  }
}
