import { useId } from 'react';

export interface SparklineProps {
  /** 数值序列；长度 < 2 或无正数时渲染占位基线 */
  data?: number[];
  /** 折线/面积颜色，默认品牌高亮色（CSS 变量） */
  color?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
  className?: string;
}

/**
 * 内联 SVG 迷你折线/面积图，用于 KPI 卡片。
 * 不依赖任何图表库，纯自绘，支持亮/暗双主题（颜色用 CSS 变量）。
 */
export default function Sparkline({
  data = [],
  color = 'var(--brand-400)',
  width = 72,
  height = 30,
  strokeWidth = 2,
  className,
}: SparklineProps) {
  const gradientId = useId();
  const pad = 3;
  const hasSeries = data.length >= 2 && data.some((v) => v > 0);

  if (!hasSeries) {
    const y = height / 2;
    return (
      <svg
        className={className}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="无趋势数据"
        style={{ display: 'block' }}
      >
        <line
          x1={pad}
          y1={y}
          x2={width - pad}
          y2={y}
          stroke="var(--ink-2)"
          strokeOpacity={0.35}
          strokeWidth={strokeWidth}
          strokeDasharray="3 3"
        />
      </svg>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const stepX = (width - pad * 2) / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const linePath = pts
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');
  const last = pts[pts.length - 1];
  const first = pts[0];
  const areaPath = `${linePath} L${last[0].toFixed(1)},${height - pad} L${first[0].toFixed(1)},${height - pad} Z`;

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="迷你趋势"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
