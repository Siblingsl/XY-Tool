import { useEffect, useState } from 'react';
import { Card, Col, Empty, Row, Select, Space, Spin, Tag, Typography, message } from 'antd';
import { Link } from 'react-router-dom';
import {
  analyticsApi,
  projectsApi,
  MaturityBucket,
  ProjectListItem,
} from '../services/api';
import PageHeader from '../components/PageHeader';

const LIFECYCLES = [
  'idea',
  'validating',
  'building',
  'launched',
  'scaling',
  'paused',
  'archived',
];

export default function MaturityBoard() {
  const [loading, setLoading] = useState(true);
  const [maturity, setMaturity] = useState<MaturityBucket[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [byLifecycle, setByLifecycle] = useState<Record<string, ProjectListItem[]>>({});
  const [loadingLifecycle, setLoadingLifecycle] = useState<string | null>(null);

  useEffect(() => {
    loadMaturity();
  }, []);

  const loadMaturity = async () => {
    setLoading(true);
    try {
      const data = await analyticsApi.maturity();
      setMaturity(data);
    } catch (err) {
      console.error('Failed to load maturity:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggle = async (lifecycle: string) => {
    if (expanded === lifecycle) {
      setExpanded(null);
      return;
    }
    setExpanded(lifecycle);
    if (!byLifecycle[lifecycle]) {
      setLoadingLifecycle(lifecycle);
      try {
        const res = await projectsApi.list({ lifecycle, pageSize: 100 });
        setByLifecycle((prev) => ({ ...prev, [lifecycle]: res.items }));
      } catch (err) {
        console.error('Failed to load lifecycle projects:', err);
      } finally {
        setLoadingLifecycle(null);
      }
    }
  };

  const handleChangeLifecycle = async (project: ProjectListItem, next: string) => {
    try {
      await projectsApi.setLifecycle(project.id, next);
      message.success(`已更新为「${next}」`);
      // 乐观更新：从当前列移除，刷新快照计数
      setByLifecycle((prev) => ({
        ...prev,
        [expanded as string]: (prev[expanded as string] || []).filter(
          (p) => p.id !== project.id,
        ),
      }));
      setMaturity((prev) =>
        prev
          .map((m) =>
            m.lifecycle === expanded
              ? { ...m, count: Math.max(0, m.count - 1) }
              : m.lifecycle === next
                ? { ...m, count: m.count + 1 }
                : m,
          )
          .sort((a, b) => b.count - a.count),
      );
    } catch (err: any) {
      message.error(err.message || '更新失败');
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="成熟度看板"
        subtitle="按生命周期阶段分列项目，点击列标题展开明细并支持改阶段。"
      />

      {maturity.length === 0 ? (
        <Empty description="暂无成熟度数据" />
      ) : (
        <Row gutter={[16, 16]}>
          {maturity.map((m) => (
            <Col xs={24} sm={12} md={8} lg={6} key={m.lifecycle}>
              <Card
                hoverable
                onClick={() => toggle(m.lifecycle)}
                title={
                  <Space>
                    <span>{m.lifecycle || '未知'}</span>
                    <Tag color="blue">{m.count}</Tag>
                  </Space>
                }
                style={{
                  borderColor:
                    expanded === m.lifecycle ? 'var(--brand-500)' : 'var(--border)',
                }}
              >
                {expanded === m.lifecycle ? (
                  loadingLifecycle === m.lifecycle ? (
                    <div style={{ textAlign: 'center', padding: 24 }}>
                      <Spin />
                    </div>
                  ) : (byLifecycle[m.lifecycle] || []).length === 0 ? (
                    <Empty description="该阶段暂无项目" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ) : (
                    <div onClick={(e) => e.stopPropagation()}>
                      {(byLifecycle[m.lifecycle] || []).map((p) => (
                        <div
                          key={p.id}
                          style={{
                            padding: '10px 0',
                            borderBottom: '1px solid var(--border)',
                          }}
                        >
                          <Link to={`/projects/${p.id}`}>
                            {p.cardJson?.name || '(未命名)'}
                          </Link>
                          <div style={{ marginTop: 6 }}>
                            <Select
                              size="small"
                              style={{ width: '100%' }}
                              value={p.lifecycle || undefined}
                              placeholder="改阶段"
                              onChange={(v) => handleChangeLifecycle(p, v)}
                              options={LIFECYCLES.map((l) => ({ value: l, label: l }))}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <Typography.Text type="secondary">
                    点击展开 {m.lifecycle} 阶段下的项目
                  </Typography.Text>
                )}
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}
