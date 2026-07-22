import { useEffect, useState } from 'react';
import { Card, Col, List, Progress, Row, Spin, Statistic, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { dashboardApi, projectsApi, Project } from '../services/api';

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [worthProjects, setWorthProjects] = useState<Project[]>([]);

  useEffect(() => {
    loadData();
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

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  const summary = stats?.todayReport;

  return (
    <div>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        今日概览
      </Typography.Title>

      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="今日共分析" value={summary?.total || 0} suffix="个项目" />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="值得研究" value={summary?.do || 0} valueStyle={{ color: '#0f766e' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="建议放弃" value={summary?.skip || 0} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="继续观察" value={summary?.watch || 0} valueStyle={{ color: '#d48806' }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={10}>
          <Card title="今日摘要">
            <p>
              真正新方向 <Tag color="green">{summary?.newDirections || 0}</Tag>
            </p>
            <p style={{ marginBottom: 8 }}>日报完成度</p>
            <Progress percent={stats?.latestReport ? 100 : 0} strokeColor="#0f766e" />
            {stats?.latestReport?.bodyMd && (
              <Typography.Paragraph style={{ marginTop: 16, whiteSpace: 'pre-wrap' }}>
                {stats.latestReport.bodyMd.split('\n').slice(0, 8).join('\n')}
              </Typography.Paragraph>
            )}
            <Link to="/reports">查看完整日报 →</Link>
          </Card>
        </Col>
        <Col xs={24} md={14}>
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
    </div>
  );
}
