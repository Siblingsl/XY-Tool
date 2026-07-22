import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiProperty, ApiSecurity } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { LicenseService } from './license.service';

class VerifyCodeDto {
  @ApiProperty({ description: '激活码', example: 'SWA-A3F2-9KX1-MN7P' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ description: '激活方标识（设备ID/用户ID，审计用，可选）', required: false })
  @IsOptional()
  @IsString()
  activatedBy?: string;
}

/**
 * 激活码对外验证 API。
 *
 * 供外部工具/项目调用：买家输入激活码 → 外部工具调本接口验证 → 解锁功能。
 *
 * 鉴权：X-API-Key 请求头（与内部 JWT 隔离，外部工具无需闲鱼登录态）。
 * 限流：SkipThrottle（外部工具调用频率不可控，由 API Key 本身限速）。
 *
 * 调用示例：
 *   curl -X POST https://your-domain/api/license/verify \
 *     -H "X-API-Key: your_key" \
 *     -d '{"code":"SWA-A3F2-9KX1-MN7P","activatedBy":"device-xxx"}'
 */
@ApiTags('激活码（对外）')
@ApiSecurity('X-API-Key')
@Controller('license')
@UseGuards(ApiKeyGuard)
@SkipThrottle()
export class LicensePublicController {
  constructor(private readonly licenseService: LicenseService) {}

  /**
   * 验证并消费激活码。
   * 首次验证设过期时间（按类型 durationDays），used_count+1。
   * 多次验证（maxUses>1）累加使用次数，超限返回 invalid。
   */
  @Post('verify')
  @ApiOperation({ summary: '验证并消费激活码（对外，需 X-API-Key）' })
  async verify(@Body() dto: VerifyCodeDto) {
    return this.licenseService.verify(dto.code, dto.activatedBy);
  }
}
