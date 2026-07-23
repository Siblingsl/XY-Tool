import { useEffect, useState } from 'react';
import { Button, Card, Col, Empty, List, Row, Spin, Statistic, Tag, Typography, message } from 'antd';
import { Link } from 'react-router-dom';
import { reportsApi, DailyReport, ReportGroupItem } from '../services/api';
import PageHeader from '../components/PageHeader';

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [groups, setGroups] = useState<{
    do: ReportGroupItem[];
    watch: ReportGroupItem[];
    skip: ReportGroupItem[];
  } | null>(null);

  useEffect(() => {
    loadReports();
  }, []);

  useEffect(() => {
    if (selectedDate) {
      loadGroups(selectedDate);
    } else {
      setGroups(null);
    }
  }, [selectedDate]);

  const loadReports = async () => {
    try {
      const data = await reportsApi.list();
      setReports(data);
      if (data.length > 0 && !selectedDate) {
        setSelectedDate(data[0].reportDate);
      }
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadGroups = async (date: string) => {
    try {
      const g = await reportsApi.groups(date);
      setGroups(g);
    } catch (err) {
      console.error('Failed to load report groups:', err);
      setGroups(null);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await reportsApi.generate();
      message.success('日报生成成功');
      await loadReports();
    } catch (err: any) {
      message.error(err.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const report = reports.find((r) => r.reportDate === selectedDate);
  const summary = report?.summaryJson;

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
        title="每日报告"
        subtitle="基于当日分析聚合的研究简报，可手动触发生成。"
      />
      <Row gutter={16}>
        <Col xs={24} md={7}>
          <Card
            title="报告日期"
            size="small"
            extra={
              <Button size="small" onClick={handleGenerate} loading={generating}>
                生成今日
              </Button>
            }
          >
            <List
              dataSource={reports}
              locale={{ emptyText: '暂无报告' }}
              renderItem={(item) => (
                <List.Item
                  onClick={() => setSelectedDate(item.reportDate)}
                  style={{
                    cursor: 'pointer',
                    background: item.reportDate === selectedDate ? 'var(--brand-tint)' : undefined,
                    padding: '8px 12px',
                    borderRadius: 6,
                  }}
                >
                  <List.Item.Meta
                    title={item.reportDate}
                    description={`分析 ${item.summaryJson?.total || 0} · 值得 ${item.summaryJson?.do || 0}`}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} md={17}>
          {report ? (
            <Card title={`每日投资研究报告 · ${report.reportDate}`}>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={6}>
                  <Statistic title="共分析" value={summary?.total || 0} />
                </Col>
                <Col span={6}>
                  <Statistic title="值得研究" value={summary?.do || 0} valueStyle={{ color: 'var(--ok)' }} />
                </Col>
                <Col span={6}>
                  <Statistic title="建议放弃" value={summary?.skip || 0} />
                </Col>
                <Col span={6}>
                  <Statistic title="真正新方向" value={summary?.newDirections || 0} />
                </Col>
              </Row>
              <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>
                {report.bodyMd || '（无内容）'}
              </Typography.Paragraph>
              {(report.projectIds || []).length > 0 && (
                <p>
                  相关项目：{' '}
                  {report.projectIds?.slice(0, 5).map((id) => (
                    <Link key={id} to={`/projects/${id}`} style={{ marginRight: 12 }}>
                      {id.slice(0, 8)}...
                    </Link>
                  ))}
                </p>
              )}

              {groups && (
                <Row gutter={16} style={{ marginTop: 16 }}>
                  {(
                    [
                      { key: 'do', label: '建议做', color: 'success' },
                      { key: 'watch', label: '观察', color: 'warning' },
                      { key: 'skip', label: '放弃', color: 'error' },
                    ] as const
                  ).map((g) => {
                    const items = groups[g.key] || [];
                    return (
                      <Col xs={24} md={8} key={g.key}>
                        <Card size="small" title={`${g.label} · ${items.length}`}>
                          {items.length === 0 ? (
                            <Empty
                              image={Empty.PRESENTED_IMAGE_SIMPLE}
                              description="无"
                            />
                          ) : (
                            <List
                              size="small"
                              dataSource={items}
                              renderItem={(it: ReportGroupItem) => (
                                <List.Item>
                                  <Link to={`/projects/${it.id}`}>
                                    <Tag color={g.color}>{g.label}</Tag>
                                    {it.name || it.id.slice(0, 8)}
                                  </Link>
                                </List.Item>
                              )}
                            />
                          )}
                        </Card>
                      </Col>
                    );
                  })}
                </Row>
              )}
            </Card>
          ) : (
            <Card>
              <Typography.Text type="secondary">选择左侧日期查看报告，或点击「生成今日」</Typography.Text>
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
}
