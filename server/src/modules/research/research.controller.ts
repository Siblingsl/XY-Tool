import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

/**
 * 研究域健康检查（公开，无 JWT）。
 * 用于确认项目区路由已挂载；真实业务接口后续在此模块扩展。
 */
@ApiTags('项目研究')
@Controller('research')
@SkipThrottle()
export class ResearchController {
  @Get('health')
  @ApiOperation({
    summary: '研究域健康检查',
    description: '返回 zone=research，证明 /api/research 项目区可用',
  })
  health(): { ok: true; zone: 'research'; timestamp: string } {
    return {
      ok: true,
      zone: 'research',
      timestamp: new Date().toISOString(),
    };
  }
}
