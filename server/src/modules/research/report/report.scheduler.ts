import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportService } from './report.service';
import { ResearchSettingsEntity } from '../entities/settings.entity';
import { ResearchGmailAccountEntity } from '../entities/gmail-account.entity';

/**
 * 日报定时生成任务。
 * 文档 3.6 节：每天定时（默认 21:00，时区 Asia/Shanghai，设置可改）。
 * 文档 6.1：RESEARCH_REPORT_CRON=0 21 * * *
 */
@Injectable()
export class ReportScheduler {
  private readonly logger = new Logger(ReportScheduler.name);

  constructor(
    private readonly reportService: ReportService,
    private readonly configService: ConfigService,
    @InjectRepository(ResearchSettingsEntity)
    private readonly settingsRepo: Repository<ResearchSettingsEntity>,
    @InjectRepository(ResearchGmailAccountEntity)
    private readonly gmailAccountRepo: Repository<ResearchGmailAccountEntity>,
  ) {}

  /**
   * 默认 cron：每天 21:00（Asia/Shanghai）。
   * 实际执行时检查每个租户的设置。
   */
  @Cron('0 21 * * *', { timeZone: 'Asia/Shanghai' })
  async handleDailyReport() {
    this.logger.log('定时任务触发：生成每日报告');

    // 获取所有活跃的 Gmail 账号（即所有租户）
    const accounts = await this.gmailAccountRepo.find({
      where: { status: 'active' },
    });

    const tenantIds = [...new Set(accounts.map((a) => a.tenantId))];

    for (const tenantId of tenantIds) {
      try {
        // 检查租户的报告时间设置
        const settings = await this.settingsRepo.findOne({ where: { tenantId } });
        const reportTime = settings?.reportCronLocal || '21:00';

        // 简化处理：如果设置的时间不是 21:00，跳过（由其他 cron 处理）
        // 完整实现需要动态 cron，这里先用固定 21:00
        if (reportTime !== '21:00') {
          this.logger.log(`租户 ${tenantId} 报告时间为 ${reportTime}，跳过 21:00 任务`);
          continue;
        }

        await this.reportService.generateReport(tenantId);
        this.logger.log(`租户 ${tenantId} 日报生成完成`);
      } catch (err) {
        this.logger.error(`租户 ${tenantId} 日报生成失败: ${err.message}`);
      }
    }
  }
}
