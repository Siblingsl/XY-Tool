import { useEffect, useState } from 'react';
import { Card, Col, List, Progress, Row, Spin, Tag, Typography, Button, Space } from 'antd';
import {
  ApartmentOutlined,
  BranchesOutlined,
  GlobalOutlined,
  SwapOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { dashboardApi, projectsApi, trendsApi, Project } from '../services/api';
import PageHeader from '../components/PageHeader';
import TopProducts from '../components/TopProducts';
import TrendArea from '../components/TrendArea';

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [worthProjects, setWorthProjects] = useState<Project[]>([]);
  const [trend, setTrend] = useState<{ date: string; count: number }[] | null>(null);

  useEffect(() => {
    loadData();
    loadTrend();
  }, []);

  const loadData = async () => {
    try {
      const [dashboardStats, projects] = await Promise.all([
        dashboardApi.getStats(),
        projectsApi.list({ pageSize: 50 }),
      ]);
      setStats(dashboardStats);
      setWorthProjects(
        projects.items.filter((p) => p.verdict === 'do' || p.verdict === 'watch'),
      );
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTrend = async () => {
    try {
      const res = await trendsApi.get({ scope: 'all' });
      if (res.series && res.series.length > 0) {
        setTrend(res.series.map((s) => ({ date: s.date, count: s.value })));
      }
    } catch (err) {
      console.error('Failed to load trends:', err);
    }
  };

  const quickEntries = [
    { to: '/clusters', icon: <ApartmentOutlined />, label: '聚类视图' },
    { to: '/maturity', icon: <BranchesOutlined />, label: '成熟度看板' },
    { to: '/sources', icon: <GlobalOutlined />, label: '来源画像' },
    { to: '/workbench', icon: <DashboardOutlined />, label: '个人工作台' },
    { to: '/compare', icon: <SwapOutlined />, label: '项目对比' },
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  const summary = stats?.todayReport;

  // KPI：语义着色替代原 #0f766e / #cf1322 / #d48806
  const kpis = [
    { title: '今日共分析', value: summary?.total || 0, color: 'var(--ink)' },
    { title: '值得研究', value: summary?.do || 0, color: 'var(--ok)' },
    { title: '建议放弃', value: summary?.skip || 0, color: 'var(--err)' },
    { title: '继续观察', value: summary?.watch || 0, color: 'var(--warn)' },
  ];

  // 「建议分布」条形榜：revenue 传空字符串并由 formatRevenue 隐藏营收列
  const distribution = [
    { itemTitle: '建议做', count: summary?.do || 0, revenue: '' },
    { itemTitle: '观察', count: summary?.watch || 0, revenue: '' },
    { itemTitle: '放弃', count: summary?.skip || 0, revenue: '' },
  ];

  return (
    <div>
      <PageHeader
        title="今日概览"
        subtitle="聚合邮件、项目与每日报告，一眼看清今天的机会分布。"
      />

      <Row gutter={[16, 16]}>
        {kpis.map((k) => (
          <Col xs={12} sm={12} md={6} key={k.title}>
            <Card styles={{ body: { padding: 20 } }}>
              <div className="kpi-lab">{k.title}</div>
              <div className="kpi-val num" style={{ color: k.color, marginTop: 6 }}>
                {k.value}
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card title="快捷入口">
            <Space wrap>
              {quickEntries.map((e) => (
                <Button
                  key={e.to}
                  icon={e.icon}
                  onClick={() => navigate(e.to)}
                  style={{ borderColor: 'var(--border)' }}
                >
                  {e.label}
                </Button>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>

      {trend && trend.length > 0 && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24}>
            <Card title="整体趋势">
              <TrendArea data={trend} />
            </Card>
          </Col>
        </Row>
      )}

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={10}>
          <Card title="今日摘要">
            <p>
              真正新方向 <Tag color="success">{summary?.newDirections || 0}</Tag>
            </p>
            <p style={{ marginBottom: 8 }}>日报完成度</p>
            <Progress percent={stats?.latestReport ? 100 : 0} strokeColor="var(--ok)" />
            {stats?.latestReport?.bodyMd && (
              <Typography.Paragraph style={{ marginTop: 16, whiteSpace: 'pre-wrap' }}>
                {stats.latestReport.bodyMd.split('\n').slice(0, 8).join('\n')}
              </Typography.Paragraph>
            )}
            <Link to="/reports">查看完整日报 →</Link>
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title="值得关注的项目">
            <List
              dataSource={worthProjects}
              locale={{ emptyText: '暂无数据，请先同步 Gmail 邮件' }}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Link key="d" to={`/projects/${item.id}`}>
                      详情
                    </Link>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <span>
                        {item.cardJson?.name || '未知项目'}{' '}
                        <Tag color={item.verdict === 'do' ? 'success' : 'warning'}>
                          {item.verdict === 'do' ? '建议做' : '观察'}
                        </Tag>
                      </span>
                    }
                    description={`${item.cardJson?.type || ''} · 落地指数 ${item.feasibilityIndex || 0} · 真实性 ${'★'.repeat(item.authenticityStars || 1)}`}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={10}>
          <Card title="建议分布">
            <TopProducts
              data={distribution as any}
              formatRevenue={(v: any) => (v ? `¥${(Number(v) / 100).toFixed(2)}` : '')}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
