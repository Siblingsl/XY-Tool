import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SignService } from './sign.service';

/**
 * 签名服务监控接口。
 */
@ApiTags('签名服务')
@ApiBearerAuth('access-token')
@Controller('sign')
@UseGuards(JwtAuthGuard)
export class SignController {
  constructor(private readonly signService: SignService) {}

  @Get('health')
  @ApiOperation({ summary: '签名服务健康检查' })
  async health() {
    return this.signService.checkHealth();
  }

  @Get('info')
  @ApiOperation({ summary: '当前签名提供者信息' })
  info() {
    return { provider: this.signService.providerName };
  }
}
