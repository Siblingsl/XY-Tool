import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Skeleton,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';
import {
  competitorApi,
  type CompetitorWatch,
  type CompetitorHit,
  type CompetitorAnalytic,
  type MatchScope,
} from '../services/api';
import PageHeader from '../components/PageHeader';
import TopProducts from '../components/TopProducts';

const matchScopeMap: Record<MatchScope, { color: string; text: string }> = {
  name: { color: 'processing', text: '名称' },
  competitors: { color: 'warning', text: '竞品' },
  all: { color: 'default', text: '全部' },
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('zh-CN', { hour12: false });
}

export default function CompetitorWatch() {
  const [loading, setLoading] = useState(true);
  const [watches, setWatches] = useState<CompetitorWatch[]>([]);
  const [hits, setHits] = useState<CompetitorHit[]>([]);
  const [analytics, setAnalytics] = useState<CompetitorAnalytic[]>([]);
  const [hitsLoading, setHitsLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CompetitorWatch | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const loadWatches = async () => {
    setLoading(true);
    try {
      const list = await competitorApi.list();
      setWatches(list);
    } catch (err: any) {
      message.error(err?.message || '加载监控词失败');
    } finally {
      setLoading(false);
    }
  };

  const loadHits = async () => {
    setHitsLoading(true);
    try {
      const res = await competitorApi.hits({ page: 1, pageSize: 20 });
      setHits(res.items);
    } catch (err: any) {
      message.error(err?.message || '加载命中记录失败');
    } finally {
      setHitsLoading(false);
    }
  };

  const loadAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const res = await competitorApi.analytics();
      setAnalytics(res.items);
    } catch (err: any) {
      message.error(err?.message || '加载竞品动态失败');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    loadWatches();
    loadHits();
    loadAnalytics();
  }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ matchScope: 'name', enabled: true });
    setModalOpen(true);
  };

  const openEdit = (w: CompetitorWatch) => {
    setEditing(w);
    form.setFieldsValue({ keyword: w.keyword, matchScope: w.matchScope, enabled: w.enabled });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      if (editing) {
        await competitorApi.update(editing.id, values);
        message.success('已更新监控词');
      } else {
        await competitorApi.create(values);
        message.success('已新增监控词');
      }
      setModalOpen(false);
      loadWatches();
    } catch (err: any) {
      if (err?.message) message.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (w: CompetitorWatch, enabled: boolean) => {
    try {
      await competitorApi.update(w.id, { enabled });
      setWatches((prev) => prev.map((x) => (x.id === w.id ? { ...x, enabled } : x)));
    } catch (err: any) {
      message.error(err?.message || '更新失败');
    }
  };

  const handleDelete = (w: CompetitorWatch) => {
    Modal.confirm({
      title: '删除监控词',
      content: `确定删除「${w.keyword}」？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await competitorApi.remove(w.id);
          message.success('已删除');
          loadWatches();
        } catch (err: any) {
          message.error(err?.message || '删除失败');
        }
      },
    });
  };

  const watchColumns: ColumnsType<CompetitorWatch> = [
    { title: '监控词', dataIndex: 'keyword', render: (v) => <Typography.Text strong>{v}</Typography.Text> },
    {
      title: '匹配范围',
      dataIndex: 'matchScope',
      width: 110,
      render: (s: MatchScope) => <Tag color={matchScopeMap[s]?.color}>{matchScopeMap[s]?.text}</Tag>,
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 90,
      render: (enabled: boolean, row) => (
        <Switch size="small" checked={enabled} onChange={(v) => handleToggle(row, v)} />
      ),
    },
    {
      title: '操作',
      key: 'op',
      width: 120,
      render: (_: unknown, row) => (
        <Space size="small">
          <Typography.Link onClick={() => openEdit(row)}>编辑</Typography.Link>
          <Typography.Link style={{ color: 'var(--err)' }} onClick={() => handleDelete(row)}>
            删除
          </Typography.Link>
        </Space>
      ),
    },
  ];

  const hitColumns: ColumnsType<CompetitorHit> = [
    { title: '监控词', dataIndex: 'keyword', render: (v) => <Tag color="processing">{v}</Tag> },
    { title: '命中字段', dataIndex: 'matchedField', render: (v) => v || '-' },
    {
      title: '项目',
      dataIndex: 'projectId',
      render: (id: string) => <Link to={`/projects/${id}`}>{id.slice(0, 8)}…</Link>,
    },
    { title: '时间', dataIndex: 'createdAt', width: 170, render: (v) => fmtTime(v) },
  ];

  return (
    <div>
      <PageHeader title="竞品监控" subtitle="命中即推站内通知。" extra={
        <Button type="primary" onClick={openCreate}>
          新增监控词
        </Button>
      } />

      <Card title="① 监控词管理" style={{ marginBottom: 16 }}>
        {loading ? (
          <Skeleton active paragraph={{ rows: 3 }} />
        ) : (
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            columns={watchColumns}
            dataSource={watches}
            locale={{ emptyText: '暂无监控词，点击右上角新增' }}
          />
        )}
      </Card>

      <Card title="② 命中记录" style={{ marginBottom: 16 }}>
        {hitsLoading ? (
          <Skeleton active paragraph={{ rows: 3 }} />
        ) : (
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            columns={hitColumns}
            dataSource={hits}
            locale={{ emptyText: '暂无命中记录' }}
          />
        )}
      </Card>

      <Card title="③ 竞品动态">
        {analyticsLoading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : analytics.length === 0 ? (
          <Typography.Text type="secondary">暂无竞品动态数据</Typography.Text>
        ) : (
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <div className="stat-key" style={{ marginBottom: 8 }}>
                各监控词命中榜
              </div>
              <TopProducts
                data={analytics.map((a) => ({
                  itemTitle: a.keyword,
                  count: a.hitCount,
                  revenue: 0,
                }))}
                formatRevenue={(v) => (v ? `¥${v}` : null)}
              />
            </Col>
            <Col xs={24} lg={12}>
              <div className="stat-key" style={{ marginBottom: 8 }}>
                命中最多的项目
              </div>
              <Space direction="vertical" style={{ width: '100%' }} size={4}>
                {analytics.map((a) => (
                  <div key={a.watchId} style={{ marginBottom: 10 }}>
                    <Typography.Text strong>{a.keyword}</Typography.Text>
                    <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                      覆盖 {a.projectCount} 个项目
                    </Typography.Text>
                    <div style={{ marginTop: 4 }}>
                      {a.topProjects.length === 0 ? (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          暂无
                        </Typography.Text>
                      ) : (
                        a.topProjects.map((p) => (
                          <Tag key={p.projectId} style={{ marginBottom: 4 }}>
                            <Link to={`/projects/${p.projectId}`}>
                              {p.name}（{p.hitCount}）
                            </Link>
                          </Tag>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </Space>
            </Col>
          </Row>
        )}
      </Card>

      <Modal
        title={editing ? '编辑监控词' : '新增监控词'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="keyword"
            label="监控词"
            rules={[{ required: true, message: '请输入监控词' }]}
          >
            <Input placeholder="如 Notion / 自动写作" />
          </Form.Item>
          <Form.Item name="matchScope" label="匹配范围" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'name', label: '名称' },
                { value: 'competitors', label: '竞品' },
                { value: 'all', label: '全部' },
              ]}
            />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
