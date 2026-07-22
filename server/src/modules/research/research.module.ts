import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ResearchController } from './research.controller';
import { GmailController } from './gmail/gmail.controller';
import { GmailService } from './gmail/gmail.service';
import { GmailSyncProcessor } from './gmail/gmail-sync.processor';
import { EmailFilterService } from './filter/email-filter.service';
import { ProjectIdentifyService } from './identify/project-identify.service';
import { VerifyService } from './verify/verify.service';
import { ScoringService } from './score/scoring.service';
import { ReportService } from './report/report.service';
import { ReportController } from './report/report.controller';
import { ReportScheduler } from './report/report.scheduler';
import { SettingsController } from './settings/settings.controller';
import { EmailsController } from './emails/emails.controller';
import { ProjectsController } from './projects/projects.controller';
import { PipelineController } from './pipeline/pipeline.controller';
import {
  ResearchGmailAccountEntity,
  ResearchEmailEntity,
  ResearchProjectEntity,
  ResearchEvidenceEntity,
  ResearchCompetitorEntity,
  ResearchHeatPointEntity,
  ResearchClusterEntity,
  ResearchDailyReportEntity,
  ResearchPipelineJobEntity,
  ResearchSettingsEntity,
} from './entities';

/**
 * 项目研究系统模块。
 * 业务 API 一律挂在 /api/research/*，与闲鱼模块隔离。
 * 完整契约见 docs/project-research-system.md。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ResearchGmailAccountEntity,
      ResearchEmailEntity,
      ResearchProjectEntity,
      ResearchEvidenceEntity,
      ResearchCompetitorEntity,
      ResearchHeatPointEntity,
      ResearchClusterEntity,
      ResearchDailyReportEntity,
      ResearchPipelineJobEntity,
      ResearchSettingsEntity,
    ]),
    BullModule.registerQueue({ name: 'research-sync' }),
  ],
  controllers: [ResearchController, GmailController, SettingsController, ReportController, EmailsController, ProjectsController, PipelineController],
  providers: [GmailService, GmailSyncProcessor, EmailFilterService, ProjectIdentifyService, VerifyService, ScoringService, ReportService, ReportScheduler],
  exports: [GmailService, EmailFilterService, ProjectIdentifyService, VerifyService, ScoringService, ReportService],
})
export class ResearchModule {}
