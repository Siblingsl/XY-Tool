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

/** 新增账号 DTO */
export class CreateAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nickname: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  xianyuUid: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(50, { message: 'Cookie 内容过短，请检查是否完整复制' })
  cookie: string;
}

/** 更新 Cookie DTO */
export class UpdateCookieDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(50)
  cookie: string;
}

/** 发起扫码登录 DTO */
export class StartQrLoginDto {
  @IsOptional()
  @IsInt()
  accountId?: number;
}

/** 启用/禁用账号 DTO */
export class SetAccountEnabledDto {
  @IsBoolean()
  enabled: boolean;
}

/**
 * 闲鱼账号管理接口。
 * 所有接口需要 JWT 登录态，且数据按 tenantId 隔离。
 */
@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class AccountsController {
  constructor(
    private readonly service: AccountsService,
    private readonly qrLogin: QrLoginService,
    private readonly cookieHealth: CookieHealthService,
  ) {}

  /** GET /api/accounts  列出租户下所有账号 */
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.service.listByTenant(user.tenantId);
  }

  /** POST /api/accounts/qr/start  生成扫码登录二维码 */
  @Post('qr/start')
  startQrLogin(
    @CurrentUser() user: JwtPayload,
    @Body() dto: StartQrLoginDto,
  ) {
    return this.qrLogin.start(user.tenantId, dto.accountId);
  }

  /** GET /api/accounts/qr/:sessionId/status  轮询扫码状态 */
  @Get('qr/:sessionId/status')
  qrLoginStatus(
    @CurrentUser() user: JwtPayload,
    @Param('sessionId') sessionId: string,
  ) {
    return this.qrLogin.pollStatus(sessionId, user.tenantId);
  }

  /** POST /api/accounts  新增账号 */
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateAccountDto) {
    return this.service.create({
      tenantId: user.tenantId,
      ...dto,
    });
  }

  /** PUT /api/accounts/:id/cookie  更新 Cookie */
  @Put(':id/cookie')
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

  /** PUT /api/accounts/:id/enabled  启用/禁用账号 */
  @Put(':id/enabled')
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

  /** POST /api/accounts/:id/health-check  主动检测 Cookie 是否有效 */
  @Post(':id/health-check')
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

  /** DELETE /api/accounts/:id  删除账号 */
  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.remove(Number(id), user.tenantId);
  }
}
