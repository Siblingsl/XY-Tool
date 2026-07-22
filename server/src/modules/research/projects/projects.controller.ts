import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../../common/interfaces/jwt-payload.interface';
import { ResearchProjectEntity } from '../entities/project.entity';
import { ResearchEvidenceEntity } from '../entities/evidence.entity';
import { ResearchCompetitorEntity } from '../entities/competitor.entity';
import { ResearchHeatPointEntity } from '../entities/heat-point.entity';

/**
 * 项目卡片库控制器。
 * API 契约见文档附录 A.4。
 * 路由前缀: /api/research/projects
 */
@ApiTags('项目研究 - 项目')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('research/projects')
export class ProjectsController {
  constructor(
    @InjectRepository(ResearchProjectEntity)
    private readonly projectRepo: Repository<ResearchProjectEntity>,
    @InjectRepository(ResearchEvidenceEntity)
    private readonly evidenceRepo: Repository<ResearchEvidenceEntity>,
    @InjectRepository(ResearchCompetitorEntity)
    private readonly competitorRepo: Repository<ResearchCompetitorEntity>,
    @InjectRepository(ResearchHeatPointEntity)
    private readonly heatPointRepo: Repository<ResearchHeatPointEntity>,
  ) {}

  /**
   * 项目列表（分页 + 筛选）。
   * GET /api/research/projects?verdict=&clusterId=&page=
   */
  @Get()
  @ApiOperation({ summary: '获取项目列表' })
  async listProjects(
    @CurrentUser() user: JwtPayload,
    @Query('verdict') verdict?: string,
    @Query('clusterId') clusterId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const pageNum = parseInt(page || '1', 10);
    const size = parseInt(pageSize || '20', 10);

    const qb = this.projectRepo
      .createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId: user.tenantId })
      .orderBy('p.created_at', 'DESC');

    if (verdict) {
      qb.andWhere('p.verdict = :verdict', { verdict });
    }
    if (clusterId) {
      qb.andWhere('p.cluster_id = :clusterId', { clusterId });
    }

    const [items, total] = await qb
      .skip((pageNum - 1) * size)
      .take(size)
      .getManyAndCount();

    return { items, total, page: pageNum, pageSize: size };
  }

  /**
   * 项目详情（含 evidences、competitors、heatSeries、mvpPlan、scoreDimensions）。
   * GET /api/research/projects/:id
   */
  @Get(':id')
  @ApiOperation({ summary: '获取项目详情' })
  async getProject(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const project = await this.projectRepo.findOne({
      where: { id, tenantId: user.tenantId },
    });

    if (!project) return null;

    const evidences = await this.evidenceRepo.find({ where: { projectId: id } });
    const competitors = await this.competitorRepo.find({ where: { projectId: id } });
    const heatSeries = await this.heatPointRepo.find({
      where: { projectId: id },
      order: { date: 'ASC' },
    });

    return {
      ...project,
      evidences,
      competitors: {
        count: competitors.length,
        topPlayers: competitors.slice(0, 5).map((c) => c.name),
        list: competitors,
      },
      heatSeries,
    };
  }

  /**
   * 重新验证项目。
   * POST /api/research/projects/:id/reverify
   */
  @Post(':id/reverify')
  @ApiOperation({ summary: '重新验证项目' })
  async reverify(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const project = await this.projectRepo.findOne({
      where: { id, tenantId: user.tenantId },
    });
    if (!project) return { error: 'Project not found' };

    project.verifyStatus = 'pending';
    await this.projectRepo.save(project);
    return { message: 'Project marked for re-verification' };
  }

  /**
   * 重新评分项目。
   * POST /api/research/projects/:id/rescore
   */
  @Post(':id/rescore')
  @ApiOperation({ summary: '重新评分项目' })
  async rescore(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const project = await this.projectRepo.findOne({
      where: { id, tenantId: user.tenantId },
    });
    if (!project) return { error: 'Project not found' };

    project.feasibilityIndex = null;
    project.verdict = null;
    project.scoreJson = null;
    await this.projectRepo.save(project);
    return { message: 'Project marked for re-scoring' };
  }
}
