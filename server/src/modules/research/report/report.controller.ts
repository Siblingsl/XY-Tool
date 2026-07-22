import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../../common/interfaces/jwt-payload.interface';
import { ReportService } from './report.service';

/**
 * 每日报告控制器。
 * API 契约见文档附录 A.5。
 * 路由前缀: /api/research/reports
 */
@ApiTags('项目研究 - 报告')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('research/reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  /**
   * 获取报告列表。
   * GET /api/research/reports?from=&to=
   */
  @Get()
  @ApiOperation({ summary: '获取日报列表' })
  listReports(
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reportService.listReports(user.tenantId, from, to);
  }

  /**
   * 获取指定日期的报告。
   * GET /api/research/reports/:date
   */
  @Get(':date')
  @ApiOperation({ summary: '获取指定日期的日报' })
  getReportByDate(
    @CurrentUser() user: JwtPayload,
    @Param('date') date: string,
  ) {
    return this.reportService.getReportByDate(user.tenantId, date);
  }

  /**
   * 手动生成当日报告（调试用）。
   * POST /api/research/reports/generate
   */
  @Post('generate')
  @ApiOperation({ summary: '手动生成当日日报' })
  generateReport(@CurrentUser() user: JwtPayload) {
    return this.reportService.generateReport(user.tenantId);
  }
}
