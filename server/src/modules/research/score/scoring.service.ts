import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiService } from '../../ai/ai.service';
import { ResearchProjectEntity } from '../entities/project.entity';
import { ResearchEmailEntity } from '../entities/email.entity';
import { ResearchEvidenceEntity } from '../entities/evidence.entity';
import { ResearchCompetitorEntity } from '../entities/competitor.entity';
import { ResearchPipelineJobEntity } from '../entities/pipeline-job.entity';

/**
 * 可落地评分 Agent 服务。
 * 文档 3.5 节：不是「项目好不好」，而是「我能不能做」。
 *
 * 评分维度（0-10 加权到 100）：
 * devDifficulty, capitalNeeded, teamRequired, competition, modelCost,
 * promoCost, chinaFeasible, licenseNeeded, computeHeavy, apiDependency, soloFeasible
 *
 * 输出：feasibilityIndex(0-100), stars(1-5), verdict(do/watch/skip),
 *       summary, mvpPlan（亮点⑥：按周拆解）
 */
@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(
    private readonly aiService: AiService,
    @InjectRepository(ResearchProjectEntity)
    private readonly projectRepo: Repository<ResearchProjectEntity>,
    @InjectRepository(ResearchEmailEntity)
    private readonly emailRepo: Repository<ResearchEmailEntity>,
    @InjectRepository(ResearchEvidenceEntity)
    private readonly evidenceRepo: Repository<ResearchEvidenceEntity>,
    @InjectRepository(ResearchCompetitorEntity)
    private readonly competitorRepo: Repository<ResearchCompetitorEntity>,
    @InjectRepository(ResearchPipelineJobEntity)
    private readonly jobRepo: Repository<ResearchPipelineJobEntity>,
  ) {}

  /**
   * 处理所有 scoring 状态的项目。
   */
  async processScoringProjects(tenantId: number): Promise<{
    processed: number;
    scored: number;
  }> {
    const emails = await this.emailRepo.find({
      where: { tenantId, status: 'scoring' },
    });

    if (emails.length === 0) {
      return { processed: 0, scored: 0 };
    }

    let scored = 0;

    for (const email of emails) {
      const project = await this.projectRepo.findOne({
        where: { emailId: email.id, tenantId },
      });

      if (!project) {
        email.status = 'done';
        await this.emailRepo.save(email);
        continue;
      }

      // 创建流水线任务
      const pipelineJob = this.jobRepo.create({
        tenantId,
        emailId: email.id,
        projectId: project.id,
        stage: 'score',
        status: 'running',
        startedAt: new Date(),
      });
      await this.jobRepo.save(pipelineJob);

      try {
        // 获取证据和竞品信息作为评分上下文
        const evidences = await this.evidenceRepo.find({ where: { projectId: project.id } });
        const competitors = await this.competitorRepo.find({ where: { projectId: project.id } });

        // 使用 LLM 评分
        const scoreResult = await this.scoreProject(project, evidences, competitors, tenantId);

        // 更新项目
        project.feasibilityIndex = scoreResult.feasibilityIndex;
        project.stars = scoreResult.stars;
        project.verdict = scoreResult.verdict;
        project.summary = scoreResult.summary;
        project.scoreJson = scoreResult.dimensions;
        project.mvpPlanJson = scoreResult.mvpPlan;
        await this.projectRepo.save(project);

        // 更新邮件状态 → done
        email.status = 'done';
        await this.emailRepo.save(email);

        pipelineJob.status = 'done';
        pipelineJob.finishedAt = new Date();
        await this.jobRepo.save(pipelineJob);

        scored++;
        this.logger.log(
          `评分完成: ${project.cardJson?.name}, 指数 ${scoreResult.feasibilityIndex}, 建议 ${scoreResult.verdict}`,
        );
      } catch (err) {
        this.logger.error(`评分失败 (project=${project.id}): ${err.message}`);

        email.status = 'done'; // 评分失败仍标记完成，避免卡住
        await this.emailRepo.save(email);

        pipelineJob.status = 'failed';
        pipelineJob.error = err.message;
        pipelineJob.finishedAt = new Date();
        await this.jobRepo.save(pipelineJob);
      }
    }

    this.logger.log(`评分完成: 处理 ${emails.length}, 已评分 ${scored} (tenant=${tenantId})`);
    return { processed: emails.length, scored };
  }

  /**
   * 使用 LLM 对项目进行可落地评分。
   */
  private async scoreProject(
    project: ResearchProjectEntity,
    evidences: ResearchEvidenceEntity[],
    competitors: ResearchCompetitorEntity[],
    tenantId: number,
  ): Promise<{
    feasibilityIndex: number;
    stars: number;
    verdict: 'do' | 'watch' | 'skip';
    summary: string;
    dimensions: Record<string, number>;
    mvpPlan: { week: number; items: string[] }[];
  }> {
    const card = project.cardJson || {};

    const systemPrompt = `你是一个「可落地评分 Agent」。你的任务不是评估项目好不好，而是评估「一个独立开发者能不能做」。

评分维度（每项 0-10 分，10 分表示对个人开发者最有利）：
1. devDifficulty: 开发难度（10=极简单，0=极难）
2. capitalNeeded: 启动资金（10=几乎不需要钱，0=需要大量资金）
3. teamRequired: 是否需要团队（10=一人可做，0=必须大团队）
4. competition: 竞争程度（10=几乎无竞争，0=红海）
5. modelCost: 模型成本（10=不需要/极低成本，0=极贵）
6. promoCost: 推广成本（10=自然流量即可，0=需要大量广告）
7. chinaFeasible: 国内是否能做（10=完全可以，0=被墙/政策不允许）
8. licenseNeeded: 许可证（10=不需要任何资质，0=需要特殊牌照）
9. computeHeavy: 算力需求（10=普通服务器即可，0=需要 GPU 集群）
10. apiDependency: API 依赖（10=不依赖第三方，0=完全依赖）
11. soloFeasible: 能否一人完成（10=完全可以，0=不可能）

输出严格 JSON（不要 markdown 代码块）：
{
  "dimensions": { "devDifficulty": 8, "capitalNeeded": 7, ... },
  "feasibilityIndex": 75,
  "stars": 4,
  "verdict": "do",
  "summary": "适合一个人 / 3 个月 / 启动资金 3000 / 可 MVP",
  "mvpPlan": [
    { "week": 1, "items": ["完成登录注册"] },
    { "week": 2, "items": ["核心功能开发"] },
    { "week": 3, "items": ["接入支付"] },
    { "week": 4, "items": ["上线测试"] }
  ]
}

verdict 规则：feasibilityIndex >= 70 → "do"，50-69 → "watch"，< 50 → "skip"
如果项目 verifyStatus 是 degraded，所有维度额外扣 2 分（强制降权）。`;

    const evidenceSummary = evidences
      .slice(0, 5)
      .map((e) => `[${e.source}] ${e.claim}: ${e.value} (${e.url})`)
      .join('\n');

    const competitorSummary = competitors.map((c) => c.name).join(', ') || '未知';

    const userContent = `项目信息：
名称: ${card.name}
类型: ${card.type}
定价: ${card.price}
目标用户: ${card.audience}
是否开源: ${card.openSource}
市场: ${card.market}
生命周期: ${project.lifecycle}
验证状态: ${project.verifyStatus}
真实性星级: ${project.authenticityStars}

证据（${evidences.length} 条）：
${evidenceSummary || '无证据'}

竞品（${competitors.length} 个）：${competitorSummary}

请评估这个项目对独立开发者的可落地性。`;

    const reply = await this.aiService.chatCompletion(
      tenantId,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      { temperature: 0.3, maxTokens: 1500, timeoutMs: 90_000 },
    );

    try {
      const cleaned = reply
        .replace(/^```json\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
      const result = JSON.parse(cleaned);

      // 验证和规范化
      const feasibilityIndex = Math.max(0, Math.min(100, result.feasibilityIndex || 50));
      const stars = Math.max(1, Math.min(5, result.stars || 3));
      const verdict = ['do', 'watch', 'skip'].includes(result.verdict)
        ? result.verdict
        : feasibilityIndex >= 70
          ? 'do'
          : feasibilityIndex >= 50
            ? 'watch'
            : 'skip';

      return {
        feasibilityIndex,
        stars,
        verdict,
        summary: result.summary || '无摘要',
        dimensions: result.dimensions || {},
        mvpPlan: Array.isArray(result.mvpPlan) ? result.mvpPlan : [],
      };
    } catch {
      this.logger.warn(`评分 LLM 返回非 JSON: ${reply.slice(0, 200)}`);
      // 降级：返回默认中等评分
      return {
        feasibilityIndex: 50,
        stars: 3,
        verdict: 'watch',
        summary: '评分解析失败，建议人工复核',
        dimensions: {},
        mvpPlan: [],
      };
    }
  }
}
