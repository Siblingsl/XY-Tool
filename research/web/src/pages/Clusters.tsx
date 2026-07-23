import { useEffect, useState } from 'react';
import { Card, Col, Empty, Row, Spin, Tag, Typography } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { clustersApi, Cluster, ClusterProject } from '../services/api';
import PageHeader from '../components/PageHeader';

export default function Clusters() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ label: string; projects: ClusterProject[] } | null>(
    null,
  );
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    loadClusters();
  }, []);

  const loadClusters = async () => {
    setLoading(true);
    try {
      const data = await clustersApi.list();
      setClusters(data);
    } catch (err) {
      console.error('Failed to load clusters:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (key: string, label: string) => {
    setSelectedKey(key);
    setDetailLoading(true);
    try {
      const data = await clustersApi.get(key);
      setSelected({ label: data.label, projects: data.projects });
    } catch (err) {
      console.error('Failed to load cluster detail:', err);
      setSelected({ label, projects: [] });
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="聚类视图"
        subtitle="按相似主题自动归类的项目集合，点击卡片查看聚类下的项目明细。"
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      ) : clusters.length === 0 ? (
        <Empty description="暂无聚类数据" />
      ) : (
        <Row gutter={[16, 16]}>
          {clusters.map((c) => (
            <Col xs={24} sm={12} md={8} lg={6} key={c.key}>
              <Card
                hoverable
                onClick={() => handleSelect(c.key, c.label)}
                style={{
                  borderColor: selectedKey === c.key ? 'var(--brand-500)' : 'var(--border)',
                }}
              >
                <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 4 }}>
                  {c.label}
                </Typography.Title>
                <Typography.Text type="secondary">
                  {c.projectCount} 个项目
                </Typography.Text>
                <div style={{ marginTop: 12 }}>
                  <Tag color="processing">{c.key}</Tag>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {selectedKey && (
        <Card
          title={`聚类明细 · ${selected?.label || selectedKey}`}
          style={{ marginTop: 16 }}
          extra={<Link to={`/clusters`}>收起</Link>}
        >
          {detailLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin />
            </div>
          ) : selected && selected.projects.length > 0 ? (
            <Row gutter={[12, 12]}>
              {selected.projects.map((p) => (
                <Col xs={24} sm={12} md={8} key={p.id}>
                  <Card
                    size="small"
                    hoverable
                    onClick={() => navigate(`/projects/${p.id}`)}
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <div style={{ fontWeight: 600 }}>
                      {p.name || <Typography.Text type="secondary">未命名</Typography.Text>}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <Tag
                        color={
                          p.verdict === 'do'
                            ? 'success'
                            : p.verdict === 'watch'
                              ? 'warning'
                              : p.verdict === 'skip'
                                ? 'error'
                                : 'default'
                        }
                      >
                        {p.verdict || '未知'}
                      </Tag>
                      <Typography.Text type="secondary">
                        落地 {p.feasibilityIndex ?? '-'}
                      </Typography.Text>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          ) : (
            <Empty description="该聚类下暂无项目" />
          )}
        </Card>
      )}
    </div>
  );
}
