import { useEffect, useState } from 'react';
import {
  message,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  Statistic,
  Row,
  Col,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  CopyOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import api from '../api';

/**
 * 激活码中台管理页。
 * 四 Tab：类型管理 / 激活码列表 / 批量生成 / 使用说明
 */
export default function License() {
  return (
    <div>
      <Typography.Title level={4}>激活码中台</Typography.Title>
      <Tabs
        defaultActiveKey="types"
        items={[
          { key: 'types', label: '类型管理', children: <TypesTab /> },
          { key: 'codes', label: '激活码列表', children: <CodesTab /> },
          { key: 'generate', label: '批量生成', children: <GenerateTab /> },
          { key: 'guide', label: '使用说明', children: <GuideTab /> },
        ]}
      />
    </div>
  );
}

// ============================================================
// Tab 1: 类型管理
// ============================================================

function TypesTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form] = Form.useForm();

  const refresh = async () => {
    setLoading(true);
    try {
      const list: any = await api.get('/license/manage/types');
      setData(list || []);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      if (editId) {
        await api.put(`/license/manage/types/${editId}`, values);
        message.success('已更新');
      } else {
        await api.post('/license/manage/types', values);
        message.success('已创建');
      }
      setModalOpen(false);
      setEditId(null);
      form.resetFields();
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const handleEdit = (row: any) => {
    setEditId(row.id);
    form.setFieldsValue({
      name: row.name,
      code: row.code,
      durationDays: row.durationDays,
      maxUses: row.maxUses,
      codePrefix: row.codePrefix,
      codeLength: row.codeLength,
      enabled: row.enabled,
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/license/manage/types/${id}`);
      message.success('已删除');
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '名称', dataIndex: 'name' },
    { title: '编码', dataIndex: 'code', render: (v: string) => <Tag color="blue">{v}</Tag> },
    {
      title: '有效期',
      dataIndex: 'durationDays',
      width: 90,
      render: (v: number | null) => (v ? `${v}天` : '永久'),
    },
    { title: '最大次数', dataIndex: 'maxUses', width: 80 },
    { title: '前缀', dataIndex: 'codePrefix', width: 80 },
    { title: '码长', dataIndex: 'codeLength', width: 70 },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 70,
      render: (e: boolean) => <Tag color={e ? 'success' : 'default'}>{e ? '启用' : '禁用'}</Tag>,
    },
    {
      title: '操作',
      width: 140,
      render: (_: any, row: any) => (
        <Space>
          <Button size="small" onClick={() => handleEdit(row)}>编辑</Button>
          <Popconfirm title="确定删除？（无关联码才可删）" onConfirm={() => handleDelete(row.id)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditId(null);
              form.resetFields();
              form.setFieldsValue({ maxUses: 1, codeLength: 16, enabled: true });
              setModalOpen(true);
            }}
          >
            新建类型
          </Button>
        </Space>
      }
    >
      <Table rowKey="id" columns={columns} dataSource={data} loading={loading} />
      <Modal
        title={editId ? '编辑类型' : '新建类型'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); setEditId(null); }}
        width={560}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="类型名称" rules={[{ required: true }]}>
            <Input placeholder="如：月卡 / 软件A永久" />
          </Form.Item>
          <Form.Item name="code" label="类型编码（唯一，不可改）" rules={[{ required: true }]}>
            <Input placeholder="如 monthly / yearly / software_a" disabled={!!editId} />
          </Form.Item>
          <Form.Item name="durationDays" label="有效天数（空=永久）">
            <InputNumber min={1} placeholder="如 30" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="maxUses" label="单码最大使用次数（1=单次，>1=团队版）">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="codePrefix" label="码前缀（如 SWA-）">
            <Input placeholder="SWA-" />
          </Form.Item>
          <Form.Item name="codeLength" label="码段长度（不含前缀，每4位一段）">
            <InputNumber min={4} max={40} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

// ============================================================
// Tab 2: 激活码列表
// ============================================================

function CodesTab() {
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [types, setTypes] = useState<any[]>([]);
  const [filter, setFilter] = useState<{ typeId?: number; status?: string; page: number; size: number }>({
    page: 1,
    size: 20,
  });

  const refresh = async () => {
    setLoading(true);
    try {
      const res: any = await api.get('/license/manage/codes', { params: filter });
      setData(res?.list || []);
      setTotal(res?.total || 0);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get('/license/manage/types').then((list: any) => setTypes(list || []));
  }, []);

  useEffect(() => {
    refresh();
  }, [filter]);

  const handleRevoke = async (id: number) => {
    try {
      await api.post(`/license/manage/codes/${id}/revoke`);
      message.success('已作废');
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const statusColor: Record<string, string> = {
    unused: 'default',
    active: 'success',
    revoked: 'error',
    expired: 'warning',
  };

  const columns = [
    { title: '激活码', dataIndex: 'code', render: (v: string) => <Typography.Text copyable code>{v}</Typography.Text> },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: string) => <Tag color={statusColor[s] || 'default'}>{s}</Tag>,
    },
    { title: '使用次数', dataIndex: 'usedCount', width: 80 },
    {
      title: '激活时间',
      dataIndex: 'activatedAt',
      width: 160,
      render: (t: string) => (t ? new Date(t).toLocaleString('zh-CN') : '-'),
    },
    {
      title: '到期时间',
      dataIndex: 'expiresAt',
      width: 160,
      render: (t: string) => (t ? new Date(t).toLocaleString('zh-CN') : '永久'),
    },
    { title: '订单ID', dataIndex: 'orderId', width: 80, render: (v: number | null) => v || '-' },
    {
      title: '操作',
      width: 90,
      render: (_: any, row: any) =>
        row.status === 'unused' || row.status === 'active' ? (
          <Popconfirm title="确定作废？" onConfirm={() => handleRevoke(row.id)}>
            <Button size="small" danger>作废</Button>
          </Popconfirm>
        ) : null,
    },
  ];

  return (
    <Card>
      <Space style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="按类型筛选"
          style={{ width: 180 }}
          value={filter.typeId}
          onChange={(v) => setFilter({ ...filter, typeId: v, page: 1 })}
          options={types.map((t) => ({ value: t.id, label: t.name }))}
        />
        <Select
          allowClear
          placeholder="按状态筛选"
          style={{ width: 140 }}
          value={filter.status}
          onChange={(v) => setFilter({ ...filter, status: v, page: 1 })}
          options={[
            { value: 'unused', label: '未使用' },
            { value: 'active', label: '已激活' },
            { value: 'revoked', label: '已作废' },
            { value: 'expired', label: '已过期' },
          ]}
        />
        <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
      </Space>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        size="small"
        pagination={{
          current: filter.page,
          pageSize: filter.size,
          total,
          onChange: (page, size) => setFilter({ ...filter, page, size }),
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
        }}
      />
    </Card>
  );
}

// ============================================================
// Tab 3: 批量生成
// ============================================================

function GenerateTab() {
  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string[]>([]);
  const [form] = Form.useForm();

  useEffect(() => {
    api.get('/license/manage/types').then((list: any) => setTypes(list || []));
  }, []);

  const handleGenerate = async () => {
    const values = await form.validateFields();
    setLoading(true);
    setResult([]);
    try {
      const res: any = await api.post('/license/manage/batches/generate', values);
      setResult(res?.codes || []);
      message.success(`已生成 ${res?.codes?.length || 0} 个激活码`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAll = () => {
    navigator.clipboard.writeText(result.join('\n'));
    message.success('已复制全部激活码');
  };

  return (
    <Card>
      <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="typeId" label="类型" rules={[{ required: true }]}>
          <Select
            placeholder="选择类型"
            style={{ width: 200 }}
            options={types.map((t) => ({ value: t.id, label: `${t.name} (${t.code})` }))}
          />
        </Form.Item>
        <Form.Item name="count" label="数量" rules={[{ required: true }]}>
          <InputNumber min={1} max={1000} placeholder="1-1000" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" icon={<ThunderboltOutlined />} loading={loading} onClick={handleGenerate}>
            生成
          </Button>
        </Form.Item>
      </Form>

      {result.length > 0 && (
        <div>
          <Space style={{ marginBottom: 8 }}>
            <Typography.Text strong>生成结果（{result.length} 个）</Typography.Text>
            <Button size="small" icon={<CopyOutlined />} onClick={handleCopyAll}>复制全部</Button>
          </Space>
          <Card size="small" style={{ maxHeight: 400, overflow: 'auto' }}>
            {result.map((c, i) => (
              <Typography.Text key={i} copyable style={{ display: 'block', padding: '2px 0' }}>
                {c}
              </Typography.Text>
            ))}
          </Card>
        </div>
      )}
    </Card>
  );
}

// ============================================================
// Tab 4: 使用说明（对外 API 对接文档）
// ============================================================

function GuideTab() {
  const [stats, setStats] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);

  useEffect(() => {
    api.get('/license/manage/stats').then((s: any) => setStats(s?.types || []));
    api.get('/license/manage/types').then((list: any) => setTypes(list || []));
  }, []);

  const sampleCode =
`curl -X POST https://your-domain/api/license/verify \\
  -H "X-API-Key: YOUR_LICENSE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"code":"SWA-A3F2-9KX1-MN7P","activatedBy":"device-xxx"}'`;

  return (
    <div>
      {stats.length > 0 && (
        <Card title="激活码统计" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            {stats.map((s) => (
              <Col key={s.typeId} xs={12} md={6} style={{ marginBottom: 16 }}>
                <Card size="small">
                  <Statistic title={s.typeName} value={s.total} suffix="个" />
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    <Tag>未用 {s.unused}</Tag>
                    <Tag color="success">激活 {s.active}</Tag>
                    <Tag color="error">作废 {s.revoked}</Tag>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      <Card title="对外验证 API（给外部工具对接用）">
        <Typography.Paragraph>
          <Typography.Text strong>接口地址：</Typography.Text>
          <Typography.Text code>POST /api/license/verify</Typography.Text>
        </Typography.Paragraph>
        <Typography.Paragraph>
          <Typography.Text strong>鉴权方式：</Typography.Text> 请求头 <Typography.Text code>X-API-Key</Typography.Text>
          （值在服务器 <Typography.Text code>.env</Typography.Text> 的 <Typography.Text code>LICENSE_API_KEY</Typography.Text> 配置）
        </Typography.Paragraph>
        <Typography.Paragraph>
          <Typography.Text strong>请求参数：</Typography.Text>
          <ul>
            <li><Typography.Text code>code</Typography.Text>（必填）：激活码</li>
            <li><Typography.Text code>activatedBy</Typography.Text>（可选）：激活方标识，如设备ID/用户ID</li>
          </ul>
        </Typography.Paragraph>
        <Typography.Paragraph>
          <Typography.Text strong>调用示例：</Typography.Text>
        </Typography.Paragraph>
        <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, overflow: 'auto' }}>{sampleCode}</pre>
        <Typography.Paragraph>
          <Typography.Text strong>返回示例：</Typography.Text>
        </Typography.Paragraph>
        <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 8 }}>
{`// 验证成功
{"valid":true,"type":"monthly","typeName":"月卡","expiresAt":"2026-07-22T...","remainingUses":0}

// 验证失败
{"valid":false,"reason":"激活码已作废"}`}
        </pre>

        {types.length > 0 && (
          <>
            <Typography.Paragraph>
              <Typography.Text strong>可用类型编码（商品规则 license 模式填这个）：</Typography.Text>
            </Typography.Paragraph>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={types}
              columns={[
                { title: '名称', dataIndex: 'name' },
                { title: '编码', dataIndex: 'code', render: (v: string) => <Typography.Text copyable code>{v}</Typography.Text> },
                { title: '有效期', dataIndex: 'durationDays', render: (v: number | null) => (v ? `${v}天` : '永久') },
              ]}
            />
          </>
        )}
      </Card>
    </div>
  );
}
