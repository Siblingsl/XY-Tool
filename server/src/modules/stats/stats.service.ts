import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderEntity } from '../orders/order.entity';

/**
 * 统计报表服务。
 *
 * 基于 orders 表做聚合查询，全部带 tenantId 隔离。
 * - trend: 近 N 天每日发货量（DELIVERED 按天 group）
 * - revenue: 近 N 天每日营收（amount 求和，排除 REFUNDED）
 * - topProducts: 商品销量 TOP N（按 itemTitle group + count）
 */
@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly repo: Repository<OrderEntity>,
  ) {}

  /**
   * 近 N 天每日发货成功量。
   * 返回 [{ date: 'YYYY-MM-DD', count: number }]，补齐无数据的天为 0。
   */
  async getDailyDeliveredTrend(
    tenantId: number,
    days = 7,
  ): Promise<{ date: string; count: number }[]> {
    const since = this.daysAgo(days);
    const raw = await this.repo
      .createQueryBuilder('o')
      .select("to_char(o.created_at, 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('o.tenant_id = :tenantId', { tenantId })
      .andWhere('o.status = :status', { status: 'DELIVERED' })
      .andWhere('o.created_at >= :since', { since })
      .groupBy("to_char(o.created_at, 'YYYY-MM-DD')")
      .orderBy('date', 'ASC')
      .getRawMany();

    return this.fillMissingDays(raw, days);
  }

  /**
   * 近 N 天每日营收（分），排除退款。
   * 返回 [{ date: 'YYYY-MM-DD', amount: number }]（amount 单位：分）。
   */
  async getDailyRevenue(
    tenantId: number,
    days = 7,
  ): Promise<{ date: string; amount: number }[]> {
    const since = this.daysAgo(days);
    const raw = await this.repo
      .createQueryBuilder('o')
      .select("to_char(o.created_at, 'YYYY-MM-DD')", 'date')
      .addSelect('COALESCE(SUM(o.amount), 0)', 'amount')
      .where('o.tenant_id = :tenantId', { tenantId })
      .andWhere('o.status = :status', { status: 'DELIVERED' })
      .andWhere('o.created_at >= :since', { since })
      .groupBy("to_char(o.created_at, 'YYYY-MM-DD')")
      .orderBy('date', 'ASC')
      .getRawMany();

    const map = new Map(raw.map((r) => [r.date, Number(r.amount)]));
    return this.buildDateRange(days).map((date) => ({
      date,
      amount: map.get(date) ?? 0,
    }));
  }

  /**
   * 商品销量 TOP N（已发货），按 itemTitle 分组。
   */
  async getTopProducts(
    tenantId: number,
    limit = 5,
    days = 30,
  ): Promise<{ itemTitle: string; count: number; revenue: number }[]> {
    const since = this.daysAgo(days);
    const raw = await this.repo
      .createQueryBuilder('o')
      .select('o.item_title', 'itemTitle')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(o.amount), 0)', 'revenue')
      .where('o.tenant_id = :tenantId', { tenantId })
      .andWhere('o.status = :status', { status: 'DELIVERED' })
      .andWhere('o.created_at >= :since', { since })
      .groupBy('o.item_title')
      .orderBy('count', 'DESC')
      .limit(limit)
      .getRawMany();

    return raw.map((r) => ({
      itemTitle: r.itemTitle,
      count: Number(r.count),
      revenue: Number(r.revenue),
    }));
  }

  // ============ 工具方法 ============

  private daysAgo(days: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /** 生成最近 N 天的 YYYY-MM-DD 列表（含今天，倒序） */
  private buildDateRange(days: number): string[] {
    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }

  /** 把聚合结果补齐为连续 N 天（无数据的天填 0） */
  private fillMissingDays(
    raw: { date: string; count: string | number }[],
    days: number,
  ): { date: string; count: number }[] {
    const map = new Map(raw.map((r) => [r.date, Number(r.count)]));
    return this.buildDateRange(days).map((date) => ({
      date,
      count: map.get(date) ?? 0,
    }));
  }
}
