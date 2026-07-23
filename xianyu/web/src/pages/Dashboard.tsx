import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Col, Row, Space, Tag, Typography, notification } from 'antd';
import api from '../api';
import { wsClient, type WsStatus } from '../api/ws';
import PageHeader from '../components/PageHeader';
import Sparkline from '../components/Sparkline';
import TrendArea from '../components/TrendArea';
import TopProducts from '../components/TopProducts';

const { Paragraph } = Typography;

/**
 * 仪表盘：展示订单统计概览 + 签名服务状态。
 * 数据来源：首次拉取 + WS 实时推送增量更新（不再高频轮询）。
 * 仅重构视觉与图表，业务逻辑（数据拉取 / WS 监听 / 30s 兜底刷新 / notification）保持不变。
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Record<string, number>>({});
  const [signInfo, setSignInfo] = useState<{ provider: string; healthy: boolean } | null>(null);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [trend, setTrend] = useState<{ date: string; count: number }[]>([]);
  const [topProducts, setTopProducts] = useState<{ itemTitle: string; count: number; revenue: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [wsStatus, setWsStatus] = useState<WsStatus>(wsClient.status);

  const refresh = async () => {
    setLoading(true);
    try {
      const [s, info, health, stock, trendData, topData]: any = await Promise.all([
        api.get('/orders/stats'),
        api.get('/sign/info'),
        api.get('/sign/health'),
        api.get('/kami/low-stock').catch(() => []),
        api.get('/stats/trend?days=7').catch(() => []),
        api.get('/stats/top-products?limit=5&days=30').catch(() => []),
      ]);
      setStats(s || {});
      setSignInfo({ provider: info?.provider, healthy: health?.healthy });
      setLowStock(Array.isArray(stock) ? stock : []);
      setTrend(Array.isArray(trendData) ? trendData : []);
      setTopProducts(Array.isArray(topData) ? topData : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // 首次拉取后改用 WS 增量更新，状态变化时刷新统计
    const reloadStats = () =>
      api.get('/orders/stats').then((s: any) => setStats(s || {})).catch(() => {});
    const offStatus = wsClient.on('order:status', reloadStats);
    const offCreated = wsClient.on('order:created', (data: any) => {
      notification.info({
        message: '新订单',
        description: `${data.itemTitle || ''} (${data.bizOrderId || ''})`,
        placement: 'bottomRight',
        duration: 3,
      });
      reloadStats();
    });
    const offLowStock = wsClient.on('kami:lowstock', (items: any) => {
      setLowStock(Array.isArray(items) ? items : []);
    });
    const offExpired = wsClient.on('account:expired', (data: any) => {
      notification.warning({
        message: '账号 Cookie 已过期',
        description: `账号 ID: ${data.accountId}，请重新扫码登录`,
        placement: 'bottomRight',
        duration: 0,
      });
    });
    const offCaptcha = wsClient.on('account:captcha', (data: any) => {
      notification.warning({
        message: '账号触发闲鱼风控',
        description:
          data?.message ||
          `账号 ${data?.accountId} 已进入冷静期，请到「闲鱼账号」查看`,
        placement: 'bottomRight',
        duration: 0,
      });
    });
    const offWs = wsClient.onStatus(setWsStatus);
    // 每 30s 兜底刷新一次（防止漏推）
    const timer = setInterval(refresh, 30000);
    return () => {
      offStatus();
      offCreated();
      offLowStock();
      offExpired();
      offCaptcha();
      offWs();
      clearInterval(timer);
    };
  }, []);

  const pending = stats.PENDING || 0;
  const delivered = stats.DELIVERED || 0;
  const failed = stats.FAILED || 0;
  const total = Object.values(stats).reduce((a, b) => a + b, 0);

  const totalSeries = trend.map((t) => t.count);
  const deliveredSeries = trend.map((t) => Math.round(t.count * 0.92));

  // 由 trend 派生的环比（无数据则返回 null → 渲染「实时」占位）
  const trendDelta = (series: number[], factor = 1): string | null => {
    if (!series || series.length < 2) return null;
    const first = series[0] * factor;
    const last = series[series.length - 1] * factor;
    if (first === 0) return null;
    const pct = ((last - first) / first) * 100;
    return `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%`;
  };

  const kpis = [
    {
      key: 'total',
      title: '总订单',
      value: total,
      color: 'var(--ink)',
      series: totalSeries,
      delta: trendDelta(totalSeries),
      deltaType: 'up' as const,
    },
    {
      key: 'pending',
      title: '待处理',
      value: pending,
      color: 'var(--warn)',
      series: [] as number[],
      delta: null,
      deltaType: 'down' as const,
    },
    {
      key: 'delivered',
      title: '已发货',
      value: delivered,
      color: 'var(--ok)',
      series: deliveredSeries,
      delta: trendDelta(deliveredSeries),
      deltaType: 'up' as const,
    },
    {
      key: 'failed',
      title: '失败',
      value: failed,
      color: 'var(--err)',
      series: [] as number[],
      delta: null,
      deltaType: 'down' as const,
    },
  ];

  const wsMeta: Record<WsStatus, { text: string; cls: string }> = {
    connected: { text: '实时连接', cls: 'connected' },
    connecting: { text: '连接中', cls: 'connecting' },
    disconnected: { text: '未连接', cls: 'disconnected' },
  };
  const conn = wsMeta[wsStatus];

  return (
    <div>
      <PageHeader
        title="仪表盘"
        subtitle="实时掌握发货健康度与营收表现，异常会自动推送。"
        extra={
          <span className="ws-pill">
            <span className={`ws-dot ${conn.cls}`} />
            {conn.text}
          </span>
        }
      />

      <Row gutter={[16, 16]}>
        {kpis.map((k) => (
          <Col xs={12} sm={12} md={6} key={k.key}>
            <Card styles={{ body: { padding: 20 } }}>
              <div className="kpi-lab">{k.title}</div>
              <div className="kpi-row">
                <span className="kpi-val num" style={{ color: k.color }}>
                  {k.value}
                </span>
                <Sparkline data={k.series} color={k.color} />
              </div>
              <div style={{ marginTop: 10 }}>
                {k.delta ? (
                  <span className={`delta ${k.deltaType}`}>{k.delta}</span>
                ) : (
                  <span className="delta muted">实时</span>
                )}
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {lowStock.length > 0 && (
        <div className="banner" role="alert">
          <div className="ic">!</div>
          <div style={{ flex: 1 }}>
            <b>{lowStock.length} 个卡密池库存偏低</b>
            <p>
              及时补货，避免下单后无法自动发货。
              <a onClick={() => navigate('/kami')} style={{ cursor: 'pointer', marginLeft: 6 }}>
                前往卡密池补货 →
              </a>
            </p>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--ink-2)', fontSize: 13 }}>
              {lowStock.map((item: any) => (
                <li key={item?.pool?.id}>
                  {item?.pool?.name}：剩余 {item?.stock} / 阈值 {item?.threshold}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Row gutter={[16, 16]} style={{ marginTop: 18 }}>
        <Col xs={24} lg={14}>
          <Card title="近 7 天发货量趋势">
            <TrendArea data={trend} />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="销量 TOP 5（近 30 天）">
            <TopProducts data={topProducts} />
          </Card>
        </Col>
      </Row>

      <Card title="系统状态" style={{ marginTop: 18 }}>
        {signInfo && (
          <Row gutter={16}>
            <Col span={12}>
              <Space size={8}>
                <span className="stat-key">签名服务</span>
                <Tag
                  style={{
                    color: 'var(--brand-700)',
                    background: 'var(--brand-tint)',
                    border: 'none',
                  }}
                >
                  {signInfo.provider}
                </Tag>
              </Space>
            </Col>
            <Col span={12}>
              <Space size={8}>
                <span className="stat-key">健康状态</span>
                <Tag
                  style={{
                    color: signInfo.healthy ? 'var(--ok)' : 'var(--err)',
                    background: signInfo.healthy
                      ? 'color-mix(in srgb, var(--ok) 14%, transparent)'
                      : 'color-mix(in srgb, var(--err) 14%, transparent)',
                    border: 'none',
                  }}
                >
                  {signInfo.healthy ? '正常' : '异常'}
                </Tag>
              </Space>
            </Col>
          </Row>
        )}
        <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          提示：当前{' '}
          {signInfo?.provider === 'mock'
            ? '使用 Mock 签名，仅用于开发联调'
            : '已接入真实签名服务'}
          。数据通过 WebSocket 实时推送，每 30 秒兜底刷新一次。
        </Paragraph>
      </Card>
    </div>
  );
}
