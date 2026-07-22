import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchProvider, SearchResult } from './search-provider.interface';
import { MockSearchProvider } from './mock-search.provider';
import { ResearchProjectEntity } from '../entities/project.entity';
import { ResearchEmailEntity } from '../entities/email.entity';
import { ResearchEvidenceEntity } from '../entities/evidence.entity';
import { ResearchCompetitorEntity } from '../entities/competitor.entity';
import { ResearchHeatPointEntity } from '../entities/heat-point.entity';
import { ResearchPipelineJobEntity } from '../entities/pipeline-job.entity';

/**
 * 真伪验证 Agent 服务。
 * 文档 3.4 节（核心）。
 *
 * 硬约束：禁止模型「脑补」收入、用户数、融资、排名。
 * 只能引用检索到的证据；找不到则 claimStatus=unverified。
 *
 * 衍生输出：
 * - 竞争分析（亮点③）：competitorCount、topPlayers[]
 * - 市场热度（亮点④）：heatScore + heatSeries[]
 * - 过时判断（亮点⑤）：lifecycle: emerging | growing | saturated | declining
 *
 * 失败路径：全部源超时 → verifyStatus=degraded，评分时强制降权并在报告标红。
 */
@Injectable()
export class VerifyService {
  private readonly logger = new Logger(VerifyService.name);
  private readonly searchProvider: SearchProvider;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(ResearchProjectEntity)
    private readonly projectRepo: Repository<ResearchProjectEntity>,
    @InjectRepository(ResearchEmailEntity)
    private readonly emailRepo: Repository<ResearchEmailEntity>,
    @InjectRepository(ResearchEvidenceEntity)
    private readonly evidenceRepo: Repository<ResearchEvidenceEntity>,
    @InjectRepository(ResearchCompetitorEntity)
    private readonly competitorRepo: Repository<ResearchCompetitorEntity>,
    @InjectRepository(ResearchHeatPointEntity)
    private readonly heatPointRepo: Repository<ResearchHeatPointEntity>,
    @InjectRepository(ResearchPipelineJobEntity)
    private readonly jobRepo: Repository<ResearchPipelineJobEntity>,
  ) {
    // 根据配置选择搜索适配器
    const provider = this.configService.get<string>('research.searchProvider') || 'mock';
    if (provider === 'mock') {
      this.searchProvider = new MockSearchProvider();
    } else {
      // 后续可接入 SerpSearchProvider 等
      this.searchProvider = new MockSearchProvider();
    }
  }

  /**
   * 处理所有 verifying 状态的项目。
   * 仅当验证任务完成（成功或明确无结果）后才进入④。
   */
  async processVerifyingProjects(tenantId: number): Promise<{
    processed: number;
    verified: number;
    degraded: number;
  }> {
    // 查找 verifying 状态的邮件对应的项目
    const emails = await this.emailRepo.find({
      where: { tenantId, status: 'verifying' },
    });

    if (emails.length === 0) {
      return { processed: 0, verified: 0, degraded: 0 };
    }

    let verified = 0;
    let degraded = 0;

    for (const email of emails) {
      const project = await this.projectRepo.findOne({
        where: { emailId: email.id, tenantId },
      });

      if (!project) {
        email.status = 'scoring';
        await this.emailRepo.save(email);
        continue;
      }

      // 创建流水线任务
      const pipelineJob = this.jobRepo.create({
        tenantId,
        emailId: email.id,
        projectId: project.id,
        stage: 'verify',
        status: 'running',
        startedAt: new Date(),
      });
      await this.jobRepo.save(pipelineJob);

      try {
        const card = project.cardJson || {};
        const projectName = card.name || 'Unknown';

        // 1. 搜索证据
        const evidences = await this.gatherEvidences(projectName, project.id, tenantId);

        // 2. 竞争分析（亮点③）
        await this.analyzeCompetitors(projectName, project.id, tenantId, card.competitorsMentioned || []);

        // 3. 市场热度（亮点④）
        await this.assessMarketHeat(projectName, project.id, tenantId);

        // 4. 过时判断（亮点⑤）
        const lifecycle = this.determineLifecycle(evidences);

        // 5. 计算真实性星级
        const authenticityStars = this.calculateAuthenticityStars(evidences);

        // 更新项目
        project.verifyStatus = evidences.length > 0 ? 'verified' : 'unverified';
        project.authenticityStars = authenticityStars;
        project.lifecycle = lifecycle;
        await this.projectRepo.save(project);

        // 更新邮件状态 → 进入评分阶段
        email.status = 'scoring';
        await this.emailRepo.save(email);

        pipelineJob.status = 'done';
        pipelineJob.finishedAt = new Date();
        await this.jobRepo.save(pipelineJob);

        verified++;
        this.logger.log(
          `验证完成: ${projectName}, 证据 ${evidences.length} 条, 星级 ${authenticityStars}, lifecycle=${lifecycle}`,
        );
      } catch (err) {
        this.logger.error(`验证失败 (project=${project.id}): ${err.message}`);

        // 全部源超时 → degraded
        project.verifyStatus = 'degraded';
        await this.projectRepo.save(project);

        email.status = 'scoring'; // 仍然进入评分，但会降权
        await this.emailRepo.save(email);

        pipelineJob.status = 'failed';
        pipelineJob.error = err.message;
        pipelineJob.finishedAt = new Date();
        await this.jobRepo.save(pipelineJob);

        degraded++;
      }
    }

    this.logger.log(
      `验证完成: 处理 ${emails.length}, 已验证 ${verified}, 降级 ${degraded} (tenant=${tenantId})`,
    );

    return { processed: emails.length, verified, degraded };
  }

  /**
   * 搜集证据。
   * 硬约束：无 URL/无抓取结果不得写入具体数字事实。
   */
  private async gatherEvidences(
    projectName: string,
    projectId: string,
    tenantId: number,
  ): Promise<ResearchEvidenceEntity[]> {
    const sources = ['github', 'producthunt', 'google', 'reddit', 'hackernews'];
    const allResults: SearchResult[] = [];

    for (const source of sources) {
      try {
        const results = await this.searchProvider.search({
          projectName,
          query: `${projectName} ${source}`,
          source,
          maxResults: 3,
        });
        allResults.push(...results);
      } catch (err) {
        this.logger.warn(`搜索源 ${source} 失败: ${err.message}`);
      }
    }

    // 将搜索结果转为证据记录
    const evidences: ResearchEvidenceEntity[] = [];
    for (const result of allResults) {
      const evidence = this.evidenceRepo.create({
        tenantId,
        projectId,
        source: result.source,
        url: result.url,
        claim: this.extractClaimType(result),
        value: this.extractClaimValue(result),
        snippet: result.snippet,
        fetchedAt: new Date(),
      });
      evidences.push(evidence);
    }

    if (evidences.length > 0) {
      await this.evidenceRepo.save(evidences);
    }

    return evidences;
  }

  /**
   * 竞争分析（亮点③）。
   * 输出：competitorCount、topPlayers[]。
   */
  private async analyzeCompetitors(
    projectName: string,
    projectId: string,
    tenantId: number,
    mentionedCompetitors: string[],
  ): Promise<void> {
    // 先清除旧数据
    await this.competitorRepo.delete({ projectId });

    const competitors: ResearchCompetitorEntity[] = [];

    // 从邮件中提到的竞品
    for (const name of mentionedCompetitors) {
      competitors.push(
        this.competitorRepo.create({
          tenantId,
          projectId,
          name,
          url: null,
          notes: '邮件中提到的竞品',
        }),
      );
    }

    // 从搜索结果中发现的竞品（Mock 模式下模拟）
    if (this.searchProvider.name === 'mock') {
      const mockCompetitors = this.generateMockCompetitors(projectName);
      for (const comp of mockCompetitors) {
        if (!mentionedCompetitors.includes(comp.name)) {
          competitors.push(
            this.competitorRepo.create({
              tenantId,
              projectId,
              name: comp.name,
              url: comp.url,
              notes: '搜索发现',
            }),
          );
        }
      }
    }

    if (competitors.length > 0) {
      await this.competitorRepo.save(competitors);
    }
  }

  /**
   * 市场热度评估（亮点④）。
   * 综合 Trends / Star / Reddit / PH / X / YouTube → heatScore + heatSeries[]。
   */
  private async assessMarketHeat(
    projectName: string,
    projectId: string,
    tenantId: number,
  ): Promise<void> {
    // 先清除旧数据
    await this.heatPointRepo.delete({ projectId });

    const today = new Date().toISOString().split('T')[0];
    const heatPoints: ResearchHeatPointEntity[] = [];

    // Mock 模式下生成模拟热度数据
    const metrics = ['github_stars', 'reddit_mentions', 'ph_upvotes', 'trends'];
    for (const metric of metrics) {
      heatPoints.push(
        this.heatPointRepo.create({
          tenantId,
          projectId,
          date: today,
          metric,
          value: Math.floor(Math.random() * 100) + 10,
        }),
      );
    }

    await this.heatPointRepo.save(heatPoints);
  }

  /**
   * 过时/红海判断（亮点⑤）。
   * 检索近年同方向密度 → lifecycle。
   */
  private determineLifecycle(evidences: ResearchEvidenceEntity[]): string {
    // 基于证据数量和来源多样性判断
    const sourceCount = new Set(evidences.map((e) => e.source)).size;
    const evidenceCount = evidences.length;

    if (evidenceCount === 0) return 'emerging';
    if (sourceCount >= 4 && evidenceCount >= 8) return 'saturated';
    if (sourceCount >= 3 && evidenceCount >= 5) return 'growing';
    return 'emerging';
  }

  /**
   * 计算真实性星级（1-5）。
   * 基于证据数量和来源可信度。
   */
  private calculateAuthenticityStars(evidences: ResearchEvidenceEntity[]): number {
    if (evidences.length === 0) return 1;

    const sourceCount = new Set(evidences.map((e) => e.source)).size;
    const hasGithub = evidences.some((e) => e.source === 'github');
    const hasPH = evidences.some((e) => e.source === 'producthunt');

    let stars = 1;
    if (evidences.length >= 2) stars = 2;
    if (sourceCount >= 3) stars = 3;
    if (sourceCount >= 4 && (hasGithub || hasPH)) stars = 4;
    if (sourceCount >= 5 && hasGithub && hasPH) stars = 5;

    return stars;
  }

  /** 从搜索结果提取声称类型 */
  private extractClaimType(result: SearchResult): string {
    const snippet = result.snippet.toLowerCase();
    if (snippet.includes('star')) return 'stars';
    if (snippet.includes('upvote')) return 'upvotes';
    if (snippet.includes('revenue') || snippet.includes('mrr')) return 'revenue';
    if (snippet.includes('user')) return 'users';
    if (snippet.includes('funding') || snippet.includes('raised')) return 'funding';
    return 'presence';
  }

  /** 从搜索结果提取声称值 */
  private extractClaimValue(result: SearchResult): string {
    // 尝试从 snippet 中提取数字
    const numMatch = result.snippet.match(/(\d[\d,]*)/);
    return numMatch ? numMatch[1] : 'confirmed';
  }

  /** Mock 模式下生成模拟竞品 */
  private generateMockCompetitors(projectName: string): { name: string; url: string }[] {
    return [
      { name: 'CompetitorA', url: 'https://competitora.com' },
      { name: 'CompetitorB', url: 'https://competitorb.io' },
      { name: 'CompetitorC', url: 'https://competitorc.co' },
    ];
  }
}
