import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiService } from '../../ai/ai.service';
import { ResearchEmailEntity } from '../entities/email.entity';
import { ResearchProjectEntity } from '../entities/project.entity';
import { ResearchClusterEntity } from '../entities/cluster.entity';
import { ResearchPipelineJobEntity } from '../entities/pipeline-job.entity';

/**
 * 项目识别 Agent 服务。
 * 文档 3.3 节：从通过过滤的邮件中提取 Project Card。
 * 输出字段：name, type, price, audience, model, openSource,
 * competitorsMentioned[], market, launchYear, author, website, clusterKey。
 *
 * 重复聚类（亮点②）：名称/描述语义相近归入同一 clusterId。
 * 失败路径：无法抽出可识别项目 → status=no_project，仅归档邮件。
 */
@Injectable()
export class ProjectIdentifyService {
  private readonly logger = new Logger(ProjectIdentifyService.name);

  constructor(
    private readonly aiService: AiService,
    @InjectRepository(ResearchEmailEntity)
    private readonly emailRepo: Repository<ResearchEmailEntity>,
    @InjectRepository(ResearchProjectEntity)
    private readonly projectRepo: Repository<ResearchProjectEntity>,
    @InjectRepository(ResearchClusterEntity)
    private readonly clusterRepo: Repository<ResearchClusterEntity>,
    @InjectRepository(ResearchPipelineJobEntity)
    private readonly jobRepo: Repository<ResearchPipelineJobEntity>,
  ) {}

  /**
   * 处理所有 identifying 状态的邮件，提取 Project Card。
   */
  async processIdentifyingEmails(tenantId: number): Promise<{
    processed: number;
    identified: number;
    noProject: number;
  }> {
    const emails = await this.emailRepo.find({
      where: { tenantId, status: 'identifying' },
    });

    if (emails.length === 0) {
      return { processed: 0, identified: 0, noProject: 0 };
    }

    let identified = 0;
    let noProject = 0;

    for (const email of emails) {
      // 创建流水线任务
      const pipelineJob = this.jobRepo.create({
        tenantId,
        emailId: email.id,
        projectId: null,
        stage: 'identify',
        status: 'running',
        startedAt: new Date(),
      });
      await this.jobRepo.save(pipelineJob);

      try {
        const card = await this.extractProjectCard(email, tenantId);

        if (!card || !card.name) {
          // 无法识别项目
          email.status = 'no_project';
          await this.emailRepo.save(email);
          pipelineJob.status = 'done';
          pipelineJob.finishedAt = new Date();
          await this.jobRepo.save(pipelineJob);
          noProject++;
          continue;
        }

        // 聚类处理
        const cluster = await this.findOrCreateCluster(
          tenantId,
          card.clusterKey,
          card.name,
        );

        // 创建项目记录
        const project = this.projectRepo.create({
          tenantId,
          emailId: email.id,
          clusterId: cluster.id,
          cardJson: card,
          verifyStatus: 'pending',
          feasibilityIndex: null,
          verdict: null,
          authenticityStars: null,
          lifecycle: null,
          mvpPlanJson: null,
          scoreJson: null,
          summary: null,
          stars: null,
        });
        await this.projectRepo.save(project);

        // 更新聚类的 project_ids
        if (!cluster.projectIds) cluster.projectIds = [];
        cluster.projectIds.push(project.id);
        await this.clusterRepo.save(cluster);

        // 更新邮件状态 → 进入验证阶段
        email.status = 'verifying';
        await this.emailRepo.save(email);

        pipelineJob.projectId = project.id;
        pipelineJob.status = 'done';
        pipelineJob.finishedAt = new Date();
        await this.jobRepo.save(pipelineJob);

        identified++;
        this.logger.log(`识别到项目: ${card.name} (cluster=${cluster.key})`);
      } catch (err) {
        this.logger.error(`项目识别失败 (email=${email.id}): ${err.message}`);
        email.status = 'failed';
        await this.emailRepo.save(email);
        pipelineJob.status = 'failed';
        pipelineJob.error = err.message;
        pipelineJob.finishedAt = new Date();
        await this.jobRepo.save(pipelineJob);
      }
    }

    this.logger.log(
      `项目识别完成: 处理 ${emails.length}, 识别 ${identified}, 无项目 ${noProject} (tenant=${tenantId})`,
    );

    return { processed: emails.length, identified, noProject };
  }

  /**
   * 使用 LLM 从邮件中提取 Project Card。
   */
  private async extractProjectCard(
    email: ResearchEmailEntity,
    tenantId: number,
  ): Promise<Record<string, any> | null> {
    const systemPrompt = `你是一个项目识别 Agent。从邮件内容中提取创业/产品/SaaS 项目信息。
如果邮件中没有可识别的具体项目（产品/工具/服务），返回 JSON: {"name": null}。
如果能识别到项目，返回严格 JSON（不要 markdown 代码块）：
{
  "name": "项目名称",
  "type": "项目类型（如 AI Video, SaaS, Tool, Marketplace）",
  "price": "定价（如 $29/月, Free, Freemium）或 null",
  "audience": "目标用户群",
  "model": "使用的 AI 模型（若有）或 null",
  "openSource": true/false/null,
  "competitorsMentioned": ["邮件中提到的竞品名称"],
  "market": "市场描述（一句话）",
  "launchYear": 2026 或 null,
  "author": "作者/创始人 或 null",
  "website": "官网 URL 或 null",
  "clusterKey": "归一化方向键（小写下划线，如 ai_ppt, ai_video, seo_tool）"
}`;

    const userContent = `邮件标题: ${email.subject}
发件人: ${email.fromAddr}
正文:
${(email.bodyText || '').slice(0, 3000)}

提取的链接: ${JSON.stringify(email.extractedJson?.links?.slice(0, 10) || [])}
GitHub 链接: ${JSON.stringify(email.extractedJson?.githubUrls || [])}
Product Hunt 链接: ${JSON.stringify(email.extractedJson?.productUrls || [])}`;

    const reply = await this.aiService.chatCompletion(
      tenantId,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      { temperature: 0.3, maxTokens: 1000, timeoutMs: 60_000 },
    );

    try {
      // 尝试解析 JSON（处理可能的 markdown 包裹）
      const cleaned = reply
        .replace(/^```json\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
      const card = JSON.parse(cleaned);

      if (!card.name || card.name === null) {
        return null;
      }

      return card;
    } catch {
      this.logger.warn(`LLM 返回非 JSON: ${reply.slice(0, 200)}`);
      return null;
    }
  }

  /**
   * 查找或创建聚类。
   * 文档亮点②：名称/描述语义相近归入同一 clusterId。
   */
  private async findOrCreateCluster(
    tenantId: number,
    clusterKey: string | undefined,
    projectName: string,
  ): Promise<ResearchClusterEntity> {
    const key = clusterKey || this.normalizeKey(projectName);

    // 查找已有聚类
    let cluster = await this.clusterRepo.findOne({
      where: { tenantId, key },
    });

    if (!cluster) {
      cluster = this.clusterRepo.create({
        tenantId,
        key,
        label: this.keyToLabel(key),
        projectIds: [],
      });
      await this.clusterRepo.save(cluster);
    }

    return cluster;
  }

  /**
   * 将项目名称归一化为 clusterKey。
   */
  private normalizeKey(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 50);
  }

  /**
   * 将 clusterKey 转为可读标签。
   */
  private keyToLabel(key: string): string {
    return key
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
}
