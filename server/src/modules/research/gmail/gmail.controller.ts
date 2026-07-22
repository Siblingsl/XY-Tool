import {
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../../common/interfaces/jwt-payload.interface';
import { GmailService } from './gmail.service';

/**
 * Gmail OAuth 授权与同步控制器。
 * API 契约见文档附录 A.2。
 * 路由前缀: /api/research/gmail
 */
@ApiTags('项目研究 - Gmail')
@Controller('research/gmail')
export class GmailController {
  constructor(
    private readonly gmailService: GmailService,
    private readonly configService: ConfigService,
    @InjectQueue('research-sync')
    private readonly syncQueue: Queue,
  ) {}

  /**
   * 获取 Gmail OAuth 授权 URL。
   * GET /api/research/gmail/auth-url → { url }
   */
  @Get('auth-url')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取 Gmail OAuth 授权链接' })
  getAuthUrl(@CurrentUser() user: JwtPayload): { url: string } {
    return { url: this.gmailService.getAuthUrl(user.tenantId) };
  }

  /**
   * OAuth 回调：换取 token 并重定向前端设置页。
   * GET /api/research/gmail/callback?code=xxx&state=tenantId
   * 此端点由 Google 重定向触发，无需 JWT。
   */
  @Get('callback')
  @SkipThrottle()
  @ApiOperation({ summary: 'Gmail OAuth 回调（Google 重定向，公开）' })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<void> {
    const frontendUrl = this.configService.get<string>('research.frontendUrl');

    try {
      if (!code) {
        throw new Error('缺少授权码');
      }
      // state 中携带 tenantId（auth-url 生成时编码进去）
      const tenantId = state ? parseInt(state, 10) : 1;
      await this.gmailService.handleCallback(code, tenantId);
      res.redirect(`${frontendUrl}/settings?gmail=connected`);
    } catch (err) {
      res.redirect(
        `${frontendUrl}/settings?gmail=error&msg=${encodeURIComponent(err.message)}`,
      );
    }
  }

  /**
   * 查询 Gmail 连接状态。
   * GET /api/research/gmail/status → { connected, email, lastSyncAt }
   */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '查询 Gmail 连接状态' })
  getStatus(@CurrentUser() user: JwtPayload) {
    return this.gmailService.getStatus(user.tenantId);
  }

  /**
   * 触发增量同步任务。
   * POST /api/research/gmail/sync → { jobId }
   */
  @Post('sync')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '触发 Gmail 增量邮件同步' })
  async triggerSync(@CurrentUser() user: JwtPayload): Promise<{ jobId: string }> {
    const job = await this.syncQueue.add(
      { tenantId: user.tenantId },
      {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    return { jobId: job.id.toString() };
  }
}
