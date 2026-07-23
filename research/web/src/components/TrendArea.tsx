import { useId, useRef, useState, type MouseEvent } from 'react';

export interface TrendPoint {
  date: string;
  count: number;
}

export interface TrendAreaProps {
  data: TrendPoint[];
  /** 图表高度（viewBox 高度），宽度自适应 100% */
  height?: number;
  /** 折线/面积主题色，默认品牌色（CSS 变量） */
  accent?: string;
}

const VB_W = 660;
const PAD_L = 40;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 28;

/**
 * SVG 面积趋势图（7 天）：带坐标轴基线、网格、渐变填充、数据点及 hover 提示。
 * 响应式宽度（viewBox + 100%），无第三方图表库依赖。
 */
export default function TrendArea({ data, height = 220, accent = 'var(--brand-500)' }: TrendAreaProps) {
  const gradientId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="trend-empty">
        <span>暂无数据</span>
      </div>
    );
  }

  const VB_H = height;
  const plotW = VB_W - PAD_L - PAD_R;
  const plotH = VB_H - PAD_T - PAD_B;
  const max = Math.max(...data.map((d) => d.count), 1);

  const points = data.map((d, i) => {
    const x = PAD_L + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
    const y = PAD_T + (1 - d.count / max) * plotH;
    return { x, y, d };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${PAD_T + plotH} L${points[0].x.toFixed(1)},${PAD_T + plotH} Z`;

  const gridYs = [0, 0.25, 0.5, 0.75, 1].map((f) => PAD_T + f * plotH);

  const handleMove = (e: MouseEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * VB_W;
    let idx = 0;
    let best = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - relX);
      if (dist < best) {
        best = dist;
        idx = i;
      }
    });
    setActive(idx);
  };

  const activePoint = active != null ? points[active] : null;
  const tipLeft = activePoint ? `${(activePoint.x / VB_W) * 100}%` : '0%';
  const tipTop = activePoint ? `${(activePoint.y / VB_H) * 100}%` : '0%';

  return (
    <div className="trend-wrap" ref={wrapRef}>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="trend-svg"
        role="img"
        aria-label="近 7 天发货量趋势"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity={0.32} />
            <stop offset="100%" stopColor={accent} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* 网格基线 */}
        <g stroke="var(--border)" strokeWidth={1}>
          {gridYs.map((y, i) => (
            <line key={i} x1={PAD_L} y1={y} x2={VB_W - PAD_R} y2={y} />
          ))}
        </g>

        {/* 面积 + 折线 */}
        <path d={areaPath} fill={`url(#${gradientId})`} className="trend-area" />
        <path
          d={linePath}
          fill="none"
          stroke={accent}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="trend-line"
        />

        {/* 数据点 */}
        <g>
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={active === i ? 4.5 : 3}
              className="trend-dot"
              fill="var(--surface)"
              stroke={accent}
              strokeWidth={2.5}
            >
              <title>{`${p.d.date}：${p.d.count} 单`}</title>
            </circle>
          ))}
        </g>

        {/* X 轴标签 */}
        <g fill="var(--ink-2)" fontSize={11} fontFamily="var(--font-display)" textAnchor="middle">
          {points.map((p, i) => (
            <text key={i} x={p.x} y={VB_H - 8}>
              {i === points.length - 1 ? '今日' : p.d.date.slice(5)}
            </text>
          ))}
        </g>

        {/* 交互层 */}
        <rect
          x={PAD_L}
          y={0}
          width={plotW}
          height={VB_H}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={() => setActive(null)}
        />
      </svg>

      {activePoint && (
        <div className="trend-tip" style={{ left: tipLeft, top: tipTop }}>
          <div className="trend-tip-date">{activePoint.d.date}</div>
          <div className="trend-tip-val num">{activePoint.d.count} 单</div>
        </div>
      )}
    </div>
  );
}
