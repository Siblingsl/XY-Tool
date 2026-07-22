import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../../common/interfaces/jwt-payload.interface';
import { ResearchPipelineJobEntity } from '../entities/pipeline-job.entity';

/**
 * Agent 流水线控制器。
 * API 契约见文档附录 A.6。
 * 路由前缀: /api/research/jobs
 */
@ApiTags('项目研究 - 流水线')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('research/jobs')
export class PipelineController {
  constructor(
    @InjectRepository(ResearchPipelineJobEntity)
    private readonly jobRepo: Repository<ResearchPipelineJobEntity>,
  ) {}

  /**
   * 任务列表。
   * GET /api/research/jobs?status=&stage=
   */
  @Get()
  @ApiOperation({ summary: '获取流水线任务列表' })
  async listJobs(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('stage') stage?: string,
  ) {
    const qb = this.jobRepo
      .createQueryBuilder('j')
      .where('j.tenant_id = :tenantId', { tenantId: user.tenantId })
      .orderBy('j.created_at', 'DESC')
      .limit(50);

    if (status) {
      qb.andWhere('j.status = :status', { status });
    }
    if (stage) {
      qb.andWhere('j.stage = :stage', { stage });
    }

    return qb.getMany();
  }

  /**
   * 任务详情。
   * GET /api/research/jobs/:id
   */
  @Get(':id')
  @ApiOperation({ summary: '获取任务详情' })
  async getJob(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.jobRepo.findOne({
      where: { id, tenantId: user.tenantId },
    });
  }

  /**
   * 重试失败任务。
   * POST /api/research/jobs/:id/retry
   * 文档第七章：流水线失败提供「重试」按钮。
   */
  @Post(':id/retry')
  @ApiOperation({ summary: '重试失败任务' })
  async retryJob(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const job = await this.jobRepo.findOne({
      where: { id, tenantId: user.tenantId },
    });

    if (!job) return { error: 'Job not found' };
    if (job.status !== 'failed') return { error: 'Only failed jobs can be retried' };

    job.status = 'queued';
    job.error = null;
    job.startedAt = null;
    job.finishedAt = null;
    await this.jobRepo.save(job);

    return { message: 'Job queued for retry' };
  }
}
