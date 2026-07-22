import { Logger } from '@nestjs/common';
import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bull';
import { GmailService } from './gmail.service';
import { EmailFilterService } from '../filter/email-filter.service';
import { ProjectIdentifyService } from '../identify/project-identify.service';
import { VerifyService } from '../verify/verify.service';
import { ScoringService } from '../score/scoring.service';
import { ResearchPipelineJobEntity } from '../entities/pipeline-job.entity';
import { ResearchEmailEntity } from '../entities/email.entity';

export interface SyncJobData {
  tenantId: number;
}

/**
 * Gmail 增量同步队列处理器。
 * 队列名: research-sync
 * 职责：拉取邮件 → 营销过滤 → 项目识别 → 真伪验证 → 落地评分。
 * 对应流水线阶段 ①②③④。
 */
@Processor('research-sync')
export class GmailSyncProcessor {
  private readonly logger = new Logger(GmailSyncProcessor.name);

  constructor(
    private readonly gmailService: GmailService,
    private readonly emailFilterService: EmailFilterService,
    private readonly projectIdentifyService: ProjectIdentifyService,
    private readonly verifyService: VerifyService,
    private readonly scoringService: ScoringService,
    @InjectRepository(ResearchPipelineJobEntity)
    private readonly jobRepo: Repository<ResearchPipelineJobEntity>,
    @InjectRepository(ResearchEmailEntity)
    private readonly emailRepo: Repository<ResearchEmailEntity>,
  ) {}

  @Process({ concurrency: 1 })
  async handleSync(job: Job<SyncJobData>) {
    const { tenantId } = job.data;
    this.logger.log(`开始同步 Gmail 邮件 (tenant=${tenantId}, jobId=${job.id})`);

    const pipelineJob = this.jobRepo.create({
      tenantId,
      emailId: null,
      projectId: null,
      stage: 'parse',
      status: 'running',
      startedAt: new Date(),
    });
    await this.jobRepo.save(pipelineJob);

    try {
      // ① 拉取邮件入库 + 营销过滤 + 分类
      const syncResult = await this.gmailService.syncEmails(tenantId);
      const filterResult = await this.emailFilterService.processPendingEmails(tenantId);

      // ② 项目识别 → Card
      const identifyResult = await this.projectIdentifyService.processIdentifyingEmails(tenantId);

      // ③ 真伪验证（联网，禁止臆造）
      const verifyResult = await this.verifyService.processVerifyingProjects(tenantId);

      // ④ 可落地评分 + MVP 周计划
      const scoreResult = await this.scoringService.processScoringProjects(tenantId);

      pipelineJob.status = 'done';
      pipelineJob.finishedAt = new Date();
      await this.jobRepo.save(pipelineJob);

      this.logger.log(
        `流水线 ①②③④ 完成: 新增 ${syncResult.synced} 封, 过滤 ${filterResult.filtered}, ` +
        `识别 ${identifyResult.identified}, 验证 ${verifyResult.verified}, 评分 ${scoreResult.scored} (tenant=${tenantId})`,
      );

      return { ...syncResult, ...filterResult, ...identifyResult, ...verifyResult, ...scoreResult };
    } catch (err) {
      pipelineJob.status = 'failed';
      pipelineJob.error = err.message;
      pipelineJob.finishedAt = new Date();
      await this.jobRepo.save(pipelineJob);

      if (err.message === 'auth_required') {
        this.logger.warn(`Gmail token 过期，需重新授权 (tenant=${tenantId})`);
        await this.emailRepo.update(
          { tenantId, status: 'pending' },
          { status: 'auth_required' },
        );
      }

      throw err;
    }
  }

  @OnQueueFailed()
  onFailed(job: Job<SyncJobData>, err: Error) {
    this.logger.error(
      `Gmail 同步失败 (tenant=${job.data.tenantId}, jobId=${job.id}): ${err.message}`,
    );
  }
}
