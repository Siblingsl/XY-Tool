import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResearchProjectEntity } from '../entities/project.entity';
import { ResearchDailyReportEntity } from '../entities/daily-report.entity';
import { ResearchClusterEntity } from '../entities/cluster.entity';
import { ResearchEvidenceEntity } from '../entities/evidence.entity';
import { ResearchCompetitorEntity } from '../entities/competitor.entity';

/**
 * 每日投资报告服务。
 * 文档 3.6 节：每天定时生成（默认 21:00 Asia/Shanghai）。
 *
 * 汇总指标：
 * - 今日共分析 N
 * - 值得研究 / 建议放弃 / 继续观察
 * - 今日新增真正新方向（去重聚类后）
 *
 * 每个入选项目摘要：真实性星级、数据来源列表、竞争、开发难度、
 * 启动资金、预计 MVP 天数、建议指数、亮点一句。
 */
@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  constructor(
    @InjectRepository(ResearchProjectEntity)
    private readonly projectRepo: Repository<ResearchProjectEntity>,
    @InjectRepository(ResearchDailyReportEntity)
    private readonly reportRepo: Repository<ResearchDailyReportEntity>,
    @InjectRepository(ResearchClusterEntity)
    private readonly clusterRepo: Repository<ResearchClusterEntity>,
    @InjectRepository(ResearchEvidenceEntity)
    private readonly evidenceRepo: Repository<ResearchEvidenceEntity>,
    @InjectRepository(ResearchCompetitorEntity)
    private readonly competitorRepo: Repository<ResearchCompetitorEntity>,
  ) {}

  /**
   * 生成指定日期的日报。
   * 如果已存在则更新。
   */
  async generateReport(tenantId: number, date?: string): Promise<ResearchDailyReportEntity> {
    const reportDate = date || new Date().toISOString().split('T')[0];

    this.logger.log(`开始生成日报: ${reportDate} (tenant=${tenantId})`);

    // 获取当日完成的项目（status=done 的邮件对应的项目）
    const todayStart = new Date(`${reportDate}T00:00:00+08:00`);
    const todayEnd = new Date(`${reportDate}T23:59:59+08:00`);

    const projects = await this.projectRepo
      .createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.created_at >= :start', { start: todayStart })
      .andWhere('p.created_at <= :end', { end: todayEnd })
      .andWhere('p.verdict IS NOT NULL')
      .getMany();

    // 统计
    const doCount = projects.filter((p) => p.verdict === 'do').length;
    const watchCount = projects.filter((p) => p.verdict === 'watch').length;
    const skipCount = projects.filter((p) => p.verdict === 'skip').length;

    // 去重聚类：计算真正新方向数
    const clusterIds = new Set(projects.map((p) => p.clusterId).filter(Boolean));
    const newDirectionCount = clusterIds.size;

    // 生成 Markdown 报告正文
    const bodyMd = await this.buildReportBody(projects, {
      total: projects.length,
      doCount,
      watchCount,
      skipCount,
      newDirectionCount,
    });

    // 汇总 JSON
    const summaryJson = {
      total: projects.length,
      do: doCount,
      watch: watchCount,
      skip: skipCount,
      newDirections: newDirectionCount,
      date: reportDate,
    };

    // 查找或创建报告
    let report = await this.reportRepo.findOne({
      where: { tenantId, reportDate },
    });

    if (report) {
      report.summaryJson = summaryJson;
      report.bodyMd = bodyMd;
      report.projectIds = projects.map((p) => p.id);
    } else {
      report = this.reportRepo.create({
        tenantId,
        reportDate,
        summaryJson,
        bodyMd,
        projectIds: projects.map((p) => p.id),
      });
    }

    await this.reportRepo.save(report);
    this.logger.log(`日报生成完成: ${reportDate}, 共 ${projects.length} 个项目`);

    return report;
  }

  /**
   * 获取报告列表。
   * API: GET /reports?from=&to=
   */
  async listReports(
    tenantId: number,
    from?: string,
    to?: string,
  ): Promise<ResearchDailyReportEntity[]> {
    const qb = this.reportRepo
      .createQueryBuilder('r')
      .where('r.tenant_id = :tenantId', { tenantId })
      .orderBy('r.report_date', 'DESC');

    if (from) {
      qb.andWhere('r.report_date >= :from', { from });
    }
    if (to) {
      qb.andWhere('r.report_date <= :to', { to });
    }

    return qb.limit(30).getMany();
  }

  /**
   * 获取指定日期的报告。
   * API: GET /reports/:date
   */
  async getReportByDate(
    tenantId: number,
    date: string,
  ): Promise<ResearchDailyReportEntity | null> {
    return this.reportRepo.findOne({
      where: { tenantId, reportDate: date },
    });
  }

  /**
   * 构建报告 Markdown 正文。
   */
  private async buildReportBody(
    projects: ResearchProjectEntity[],
    stats: {
      total: number;
      doCount: number;
      watchCount: number;
      skipCount: number;
      newDirectionCount: number;
    },
  ): Promise<string> {
    const lines: string[] = [];

    lines.push(`# 每日投资研究报告`);
    lines.push('');
    lines.push(`## 今日概览`);
    lines.push('');
    lines.push(`- 今日共分析 **${stats.total}** 个项目`);
    lines.push(`- 值得研究：**${stats.doCount}** 个`);
    lines.push(`- 继续观察：**${stats.watchCount}** 个`);
    lines.push(`- 建议放弃：**${stats.skipCount}** 个`);
    lines.push(`- 今日新增真正新方向（去重聚类后）：**${stats.newDirectionCount}** 个`);
    lines.push('');

    // 值得研究的项目
    const doProjects = projects.filter((p) => p.verdict === 'do');
    if (doProjects.length > 0) {
      lines.push(`## 值得研究`);
      lines.push('');
      for (const project of doProjects) {
        const card = project.cardJson || {};
        const evidences = await this.evidenceRepo.find({ where: { projectId: project.id } });
        const competitors = await this.competitorRepo.find({ where: { projectId: project.id } });
        const sources = [...new Set(evidences.map((e) => e.source))];

        lines.push(`### ${card.name || '未知项目'}`);
        lines.push('');
        lines.push(`- 类型：${card.type || '未知'}`);
        lines.push(`- 真实性：${'★'.repeat(project.authenticityStars || 1)}${'☆'.repeat(5 - (project.authenticityStars || 1))}`);
        lines.push(`- 落地指数：**${project.feasibilityIndex || 0}/100**`);
        lines.push(`- 生命周期：${project.lifecycle || '未知'}`);
        lines.push(`- 竞品数量：${competitors.length}`);
        lines.push(`- 数据来源：${sources.join(', ') || '无'}`);
        lines.push(`- 摘要：${project.summary || '无'}`);
        if (project.mvpPlanJson && Array.isArray(project.mvpPlanJson)) {
          const totalWeeks = project.mvpPlanJson.length;
          lines.push(`- 预计 MVP：${totalWeeks} 周`);
        }
        lines.push('');
      }
    }

    // 继续观察的项目
    const watchProjects = projects.filter((p) => p.verdict === 'watch');
    if (watchProjects.length > 0) {
      lines.push(`## 继续观察`);
      lines.push('');
      for (const project of watchProjects) {
        const card = project.cardJson || {};
        lines.push(`- **${card.name || '未知'}**（${card.type || ''}）- 落地指数 ${project.feasibilityIndex || 0}`);
      }
      lines.push('');
    }

    // 建议放弃的项目
    const skipProjects = projects.filter((p) => p.verdict === 'skip');
    if (skipProjects.length > 0) {
      lines.push(`## 建议放弃`);
      lines.push('');
      for (const project of skipProjects) {
        const card = project.cardJson || {};
        const reason = project.lifecycle === 'saturated' ? '红海市场' : '落地难度高';
        lines.push(`- **${card.name || '未知'}** - ${reason}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push(`*报告生成时间：${new Date().toISOString()}*`);

    return lines.join('\n');
  }
}
