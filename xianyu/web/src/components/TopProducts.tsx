import type { ReactNode } from 'react';

export interface TopProduct {
  itemTitle: string;
  count: number;
  revenue: number;
}

export interface TopProductsProps {
  data: TopProduct[];
  /** 营收格式化函数，默认 ¥xx.xx */
  formatRevenue?: (v: number) => ReactNode;
}

/**
 * 横向条形榜（替代原 Table）：最大项满宽，其余按比例。
 * 品牌色渐变填充，语义清晰、一眼看懂 TOP5。
 */
export default function TopProducts({ data, formatRevenue }: TopProductsProps) {
  if (!data || data.length === 0) {
    return <div className="top-empty">暂无数据</div>;
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  const fmt = formatRevenue ?? ((v: number) => `¥${(v / 100).toFixed(2)}`);

  return (
    <ul className="top-list">
      {data.map((d) => {
        const pct = Math.max(6, Math.round((d.count / max) * 100));
        return (
          <li className="top-item" key={d.itemTitle}>
            <span className="top-name" title={d.itemTitle}>
              {d.itemTitle}
            </span>
            <span className="top-bar">
              <i style={{ width: `${pct}%` }} title={`销量 ${d.count}`} />
            </span>
            <span className="top-val">
              <b className="num">{fmt(d.revenue)}</b>
              <em className="top-count num">{d.count}</em>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
