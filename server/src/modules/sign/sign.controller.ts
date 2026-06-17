import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SignService } from './sign.service';

/**
 * 签名服务监控接口。
 * GET /api/sign/health  查看当前签名服务状态（用于前端展示+告警判断）
 */
@Controller('sign')
@UseGuards(JwtAuthGuard)
export class SignController {
  constructor(private readonly signService: SignService) {}

  @Get('health')
  async health() {
    return this.signService.checkHealth();
  }

  @Get('info')
  info() {
    return { provider: this.signService.providerName };
  }
}
