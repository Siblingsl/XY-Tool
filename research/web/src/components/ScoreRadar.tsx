export interface ScoreRadarProps {
  /** 各维度分数字典，值范围 0~max */
  dimensions: Record<string, number>;
  /** 满分值，默认 10 */
  max?: number;
  /** 画布边长（正方形 viewBox），默认 260 */
  size?: number;
  /** 维度中文标签映射（可选，缺省用 key） */
  labels?: Record<string, string>;
}

/**
 * 纯 SVG 雷达图（零依赖）：用于项目评分维度对比。
 * 颜色全部走 CSS 变量，自动适配亮/暗主题。
 */
export default function ScoreRadar({
  dimensions,
  max = 10,
  size = 260,
  labels,
}: ScoreRadarProps) {
  const entries = Object.entries(dimensions).filter(([, v]) => typeof v === 'number');
  const n = entries.length;

  if (n === 0) {
    return (
      <div className="top-empty" style={{ padding: 32 }}>
        暂无评分数据
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 42; // 留出标签空间
  const rings = 4;

  const angleOf = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;

  const pointAt = (i: number, ratio: number) => {
    const a = angleOf(i);
    return [cx + Math.cos(a) * radius * ratio, cy + Math.sin(a) * radius * ratio] as const;
  };

  const ringPolys = Array.from({ length: rings }, (_, r) => {
    const ratio = (r + 1) / rings;
    return entries
      .map((_, i) => {
        const [x, y] = pointAt(i, ratio);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  });

  const dataPoly = entries
    .map(([, v], i) => {
      const ratio = Math.max(0, Math.min(1, (v ?? 0) / max));
      const [x, y] = pointAt(i, ratio);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      style={{ maxWidth: size, display: 'block', margin: '0 auto' }}
      role="img"
      aria-label="评分维度雷达图"
    >
      {/* 网格环 */}
      <g stroke="var(--border)" strokeWidth={1} fill="none">
        {ringPolys.map((pts, i) => (
          <polygon key={i} points={pts} />
        ))}
      </g>

      {/* 轴线 */}
      <g stroke="var(--border)" strokeWidth={1}>
        {entries.map((_, i) => {
          const [x, y] = pointAt(i, 1);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} />;
        })}
      </g>

      {/* 数据多边形 */}
      <polygon
        points={dataPoly}
        fill="var(--brand-500)"
        fillOpacity={0.22}
        stroke="var(--brand-600)"
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* 数据点 */}
      <g>
        {entries.map(([, v], i) => {
          const ratio = Math.max(0, Math.min(1, (v ?? 0) / max));
          const [x, y] = pointAt(i, ratio);
          return <circle key={i} cx={x} cy={y} r={3} fill="var(--brand-600)" />;
        })}
      </g>

      {/* 维度标签 */}
      <g fill="var(--ink-2)" fontSize={11} fontFamily="var(--font-body)" textAnchor="middle">
        {entries.map(([key, v], i) => {
          const [x, y] = pointAt(i, 1.16);
          const label = labels?.[key] || key;
          return (
            <text key={i} x={x} y={y}>
              {label}
              <tspan dx={4} fill="var(--ink)" fontFamily="var(--font-display)">
                {Math.round((v ?? 0) * 10) / 10}
              </tspan>
            </text>
          );
        })}
      </g>
    </svg>
  );
}
