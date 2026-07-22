import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../../common/interfaces/jwt-payload.interface';
import { ResearchEmailEntity } from '../entities/email.entity';

/**
 * 邮件流水控制器。
 * API 契约见文档附录 A.3。
 * 路由前缀: /api/research/emails
 */
@ApiTags('项目研究 - 邮件')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('research/emails')
export class EmailsController {
  constructor(
    @InjectRepository(ResearchEmailEntity)
    private readonly emailRepo: Repository<ResearchEmailEntity>,
  ) {}

  /**
   * 邮件列表（分页 + 筛选）。
   * GET /api/research/emails?status=&category=&page=&pageSize=
   */
  @Get()
  @ApiOperation({ summary: '获取邮件列表' })
  async listEmails(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const pageNum = parseInt(page || '1', 10);
    const size = parseInt(pageSize || '20', 10);

    const qb = this.emailRepo
      .createQueryBuilder('e')
      .where('e.tenant_id = :tenantId', { tenantId: user.tenantId })
      .orderBy('e.received_at', 'DESC');

    if (status) {
      qb.andWhere('e.status = :status', { status });
    }
    if (category) {
      qb.andWhere(':category = ANY(e.categories)', { category });
    }

    const [items, total] = await qb
      .skip((pageNum - 1) * size)
      .take(size)
      .getManyAndCount();

    return { items, total, page: pageNum, pageSize: size };
  }

  /**
   * 邮件详情。
   * GET /api/research/emails/:id
   */
  @Get(':id')
  @ApiOperation({ summary: '获取邮件详情' })
  async getEmail(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.emailRepo.findOne({
      where: { id, tenantId: user.tenantId },
    });
  }
}
