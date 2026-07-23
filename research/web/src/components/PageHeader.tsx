import type { ReactNode } from 'react';
import { Typography } from 'antd';

export interface PageHeaderProps {
  /** 大标题 */
  title: ReactNode;
  /** 一句话说明（可选） */
  subtitle?: ReactNode;
  /** 右侧操作区（可选） */
  extra?: ReactNode;
  /** 面包屑（可选），建议传入 <breadcrumb> / <a> 组合 */
  breadcrumb?: ReactNode;
}

/**
 * 统一页头模板：面包屑 + 标题/描述 + 右侧操作区。
 * 语义化 nav/main，全站内容页复用，保证节奏一致。
 */
export default function PageHeader({ title, subtitle, extra, breadcrumb }: PageHeaderProps) {
  return (
    <header style={{ marginBottom: 20 }}>
      {breadcrumb && (
        <nav aria-label="面包屑" className="ph-crumb">
          {breadcrumb}
        </nav>
      )}
      <div className="ph-head">
        <div>
          <Typography.Title level={3} className="ph-title font-display">
            {title}
          </Typography.Title>
          {subtitle && (
            <Typography.Paragraph type="secondary" className="ph-sub" style={{ marginBottom: 0 }}>
              {subtitle}
            </Typography.Paragraph>
          )}
        </div>
        {extra && <div className="ph-extra">{extra}</div>}
      </div>
    </header>
  );
}
