import { useEffect, useState } from 'react';
import { Card, Col, Empty, List, Row, Spin, Statistic, Tag, Typography, message } from 'antd';
import { Link } from 'react-router-dom';
import { workbenchApi, projectsApi, WorkbenchData, ProjectSummary } from '../services/api';
import PageHeader from '../components/PageHeader';
import TopProducts from '../components/TopProducts';

function verdictTag(v: string | null) {
  if (v === 'do') return <Tag color="success">建议做</Tag>;
  if (v === 'watch') return <Tag color="warning">观察</Tag>;
  if (v === 'skip') return <Tag color="error">放弃</Tag>;
  return <Tag>未知</Tag>;
}

export default function Workbench() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<WorkbenchData | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const d = await workbenchApi.get();
      setData(d);
    } catch (err) {
      console.error('Failed to load workbench:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUnfavorite = async (item: ProjectSummary) => {
    try {
      await projectsApi.favorite(item.id);
      message.success('已取消收藏');
      setData((prev) =>
        prev
          ? { ...prev, favorited: prev.favorited.filter((f) => f.id !== item.id) }
          : prev,
      );
    } catch (err: any) {
      message.error(err.message || '操作失败');
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  const maturityData = (data?.maturity || []).map((m) => ({
    itemTitle: m.lifecycle || '未知',
    count: m.count,
    revenue: 0,
  }));

  return (
    <div>
      <PageHeader
        title="个人工作台"
        subtitle="收藏夹、近期浏览与成熟度快照，集中管理你的研究重点。"
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="标签总数" value={data?.tagCount || 0} valueStyle={{ color: 'var(--brand-600)' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="笔记总数" value={data?.noteCount || 0} valueStyle={{ color: 'var(--brand-600)' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="收藏项目" value={data?.favorited.length || 0} valueStyle={{ color: 'var(--ok)' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="近期浏览" value={data?.recent.length || 0} valueStyle={{ color: 'var(--info)' }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="收藏夹">
            {data && data.favorited.length > 0 ? (
              <List
                dataSource={data.favorited}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      <Typography.Link
                        key="u"
                        onClick={() => handleUnfavorite(item)}
                        style={{ color: 'var(--ink-2)' }}
                      >
                        取消收藏
                      </Typography.Link>,
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <Link to={`/projects/${item.id}`}>
                          {item.name || '(未命名)'}
                        </Link>
                      }
                      description={
                        <span>
                          {verdictTag(item.verdict)}
                          <Typography.Text type="secondary">
                            落地 {item.feasibilityIndex ?? '-'}
                          </Typography.Text>
                        </span>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="还没有收藏的项目" />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="近期项目">
            {data && data.recent.length > 0 ? (
              <List
                dataSource={data.recent}
                renderItem={(item) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Link to={`/projects/${item.id}`}>
                          {item.name || '(未命名)'}
                        </Link>
                      }
                      description={
                        <span>
                          {verdictTag(item.verdict)}
                          <Typography.Text type="secondary">
                            {item.lifecycle || '未知阶段'}
                          </Typography.Text>
                        </span>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="暂无近期浏览" />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card title="成熟度快照">
            {maturityData.length > 0 ? (
              <TopProducts data={maturityData} formatRevenue={() => ''} />
            ) : (
              <Empty description="暂无成熟度数据" />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
