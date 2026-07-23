import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
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
import {
  MinusCircleOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  automationApi,
  projectsApi,
  type AutomationRule,
  type RuleExecution,
  type RuleEventType,
  type RuleConditionField,
  type RuleActionType,
  type RuleAction,
} from '../services/api';
import PageHeader from '../components/PageHeader';

const EVENT_MAP: Record<RuleEventType, string> = {
  'project.created': '项目创建',
  'project.verified': '项目验证完成',
  'project.verdict.changed': '建议变更',
  'project.lifecycle.changed': '生命周期变更',
};

const FIELD_MAP: Record<RuleConditionField, string> = {
  verdict: '建议',
  feasibilityIndex: '落地指数',
  clusterId: '聚类',
  tag: '标签',
  authenticityStars: '真实性星级',
  lifecycle: '生命周期',
};

const OP_MAP: Record<string, string> = {
  eq: '等于',
  gte: '大于等于',
  lte: '小于等于',
  ne: '不等于',
};

const ACTION_MAP: Record<RuleActionType, string> = {
  add_tag: '加标签',
  set_verdict: '设建议',
  favorite: '收藏',
  set_lifecycle: '设生命周期',
  notify: '通知',
};

const NUMERIC_FIELDS: RuleConditionField[] = ['feasibilityIndex', 'authenticityStars'];

/** 动作 payload 键名映射（用于从单行 value 反推 payload） */
function buildActionPayload(type: RuleActionType, value: string): Record<string, unknown> {
  switch (type) {
    case 'add_tag':
      return { tag: value };
    case 'set_verdict':
      return { verdict: value };
    case 'set_lifecycle':
      return { lifecycle: value };
    case 'notify':
      return { text: value };
    case 'favorite':
      return {};
    default:
      return {};
  }
}

/** 从 payload 反取单行 value（编辑时回填表单） */
function payloadToValue(action: RuleAction): string {
  const p = action.payload as Record<string, unknown>;
  if (action.type === 'add_tag') return String(p?.tag ?? '');
  if (action.type === 'set_verdict') return String(p?.verdict ?? '');
  if (action.type === 'set_lifecycle') return String(p?.lifecycle ?? '');
  if (action.type === 'notify') return String(p?.text ?? '');
  return '';
}

function ruleToForm(rule: AutomationRule) {
  return {
    name: rule.name,
    eventType: rule.eventType,
    enabled: rule.enabled,
    priority: rule.priority,
    conditions: rule.conditions.map((c) => ({
      field: c.field,
      op: c.op,
      value: String(c.value ?? ''),
    })),
    actions: rule.actions.map((a) => ({ type: a.type, value: payloadToValue(a) })),
  };
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('zh-CN', { hour12: false });
}

export default function AutomationRules() {
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<AutomationRule[]>([]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AutomationRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const [logOpen, setLogOpen] = useState(false);
  const [logRule, setLogRule] = useState<AutomationRule | null>(null);
  const [logs, setLogs] = useState<RuleExecution[]>([]);
  const [logLoading, setLogLoading] = useState(false);

  const [simOpen, setSimOpen] = useState(false);
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState<string>('');
  const [simForm] = Form.useForm();

  const loadRules = async () => {
    setLoading(true);
    try {
      const list = await automationApi.list();
      setRules(list);
    } catch (err: any) {
      message.error(err?.message || '加载规则失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const openEditor = (rule?: AutomationRule) => {
    setEditing(rule ?? null);
    if (rule) {
      form.setFieldsValue(ruleToForm(rule));
    } else {
      form.resetFields();
      form.setFieldsValue({
        enabled: true,
        priority: 0,
        eventType: 'project.created',
        conditions: [{ field: 'verdict', op: 'eq', value: '' }],
        actions: [{ type: 'add_tag', value: '' }],
      });
    }
    setEditorOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const conditions = (values.conditions || []).map((c: any) => {
      const isNum = NUMERIC_FIELDS.includes(c.field);
      const raw = c.value;
      return {
        field: c.field,
        op: c.op,
        value: isNum && raw !== '' && raw != null ? Number(raw) : raw,
      };
    });
    const actions = (values.actions || []).map((a: any) => ({
      type: a.type,
      payload: buildActionPayload(a.type, a.value ?? ''),
    }));
    const body = {
      name: values.name,
      enabled: values.enabled,
      priority: Number(values.priority ?? 0),
      eventType: values.eventType,
      conditions,
      actions,
    };
    setSaving(true);
    try {
      if (editing) {
        await automationApi.update(editing.id, body);
        message.success('已更新规则');
      } else {
        await automationApi.create(body);
        message.success('已新建规则');
      }
      setEditorOpen(false);
      loadRules();
    } catch (err: any) {
      if (err?.message) message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (rule: AutomationRule, enabled: boolean) => {
    try {
      await automationApi.update(rule.id, { enabled });
      setRules((prev) => prev.map((x) => (x.id === rule.id ? { ...x, enabled } : x)));
    } catch (err: any) {
      message.error(err?.message || '更新失败');
    }
  };

  const handleDelete = (rule: AutomationRule) => {
    Modal.confirm({
      title: '删除规则',
      content: `确定删除「${rule.name}」？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await automationApi.remove(rule.id);
          message.success('已删除');
          loadRules();
        } catch (err: any) {
          message.error(err?.message || '删除失败');
        }
      },
    });
  };

  const openLog = async (rule: AutomationRule) => {
    setLogRule(rule);
    setLogOpen(true);
    setLogLoading(true);
    try {
      const res = await automationApi.executions(rule.id, { page: 1, pageSize: 20 });
      setLogs(res.items);
    } catch (err: any) {
      message.error(err?.message || '加载执行日志失败');
    } finally {
      setLogLoading(false);
    }
  };

  const openSimulate = async () => {
    setSimResult('');
    try {
      const list = await projectsApi.list({ pageSize: 1 });
      simForm.resetFields();
      simForm.setFieldsValue({
        projectId: list.items[0]?.id || '',
        eventType: 'project.created',
      });
    } catch {
      simForm.resetFields();
      simForm.setFieldsValue({ eventType: 'project.created' });
    }
    setSimOpen(true);
  };

  const handleSimulate = async () => {
    const values = await simForm.validateFields();
    if (!values.projectId) {
      message.warning('请填写项目 ID');
      return;
    }
    setSimLoading(true);
    setSimResult('');
    try {
      const res = await automationApi.simulate({
        projectId: values.projectId,
        eventType: values.eventType,
      });
      setSimResult(JSON.stringify(res, null, 2));
    } catch (err: any) {
      message.error(err?.message || '模拟失败');
    } finally {
      setSimLoading(false);
    }
  };

  const columns: ColumnsType<AutomationRule> = [
    { title: '名称', dataIndex: 'name', render: (v) => <Typography.Text strong>{v}</Typography.Text> },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 90,
      render: (enabled: boolean, row) => (
        <Switch size="small" checked={enabled} onChange={(v) => handleToggle(row, v)} />
      ),
    },
    { title: '优先级', dataIndex: 'priority', width: 90, render: (v) => <span className="num">{v}</span> },
    {
      title: '触发器',
      dataIndex: 'eventType',
      width: 150,
      render: (e: RuleEventType) => <Tag color="processing">{EVENT_MAP[e] || e}</Tag>,
    },
    {
      title: '操作',
      key: 'op',
      width: 170,
      render: (_: unknown, row) => (
        <Space size="small">
          <Typography.Link onClick={() => openEditor(row)}>编辑</Typography.Link>
          <Typography.Link onClick={() => openLog(row)}>日志</Typography.Link>
          <Typography.Link style={{ color: 'var(--err)' }} onClick={() => handleDelete(row)}>
            删除
          </Typography.Link>
        </Space>
      ),
    },
  ];

  const logColumns: ColumnsType<RuleExecution> = [
    {
      title: '触发器',
      dataIndex: 'eventType',
      render: (e: string) => <Tag color="processing">{EVENT_MAP[e as RuleEventType] || e}</Tag>,
    },
    {
      title: '项目',
      dataIndex: 'projectId',
      render: (id: string) => (
        <Typography.Link href={`/projects/${id}`} target="_blank" rel="noreferrer">
          {id.slice(0, 8)}…
        </Typography.Link>
      ),
    },
    {
      title: '匹配',
      dataIndex: 'matched',
      width: 80,
      render: (m: boolean) => <Tag color={m ? 'success' : 'default'}>{m ? '命中' : '未命中'}</Tag>,
    },
    {
      title: '动作结果',
      dataIndex: 'actionResults',
      render: (r: unknown) =>
        r ? (
          <Typography.Text style={{ fontSize: 12 }}>{JSON.stringify(r).slice(0, 80)}</Typography.Text>
        ) : (
          '-'
        ),
    },
    {
      title: '错误',
      dataIndex: 'error',
      width: 120,
      render: (e: string | null) =>
        e ? <Typography.Text style={{ color: 'var(--err)', fontSize: 12 }}>{e}</Typography.Text> : '-',
    },
    { title: '时间', dataIndex: 'createdAt', width: 170, render: (v) => fmtTime(v) },
  ];

  return (
    <div>
      <PageHeader
        title="自动化规则"
        subtitle="让机会筛选自动跑起来。"
        extra={
          <Space>
            <Button icon={<ThunderboltOutlined />} onClick={openSimulate}>
              模拟触发
            </Button>
            <Button type="primary" onClick={() => openEditor()}>
              新建规则
            </Button>
          </Space>
        }
      />

      <Card title="规则列表">
        {loading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : (
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            columns={columns}
            dataSource={rules}
            locale={{ emptyText: '暂无规则，点击右上角新建' }}
          />
        )}
      </Card>

      {/* 规则编辑器 */}
      <Drawer
        title={editing ? '编辑规则' : '新建规则'}
        width={520}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        extra={
          <Button type="primary" loading={saving} onClick={handleSave}>
            保存
          </Button>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="规则名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如 高落地指数自动收藏" />
          </Form.Item>
          <Form.Item name="eventType" label="触发器" rules={[{ required: true }]}>
            <Select
              options={Object.entries(EVENT_MAP).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Space size="large" style={{ display: 'flex' }}>
            <Form.Item name="enabled" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="priority" label="优先级" rules={[{ required: true }]}>
              <InputNumber min={0} max={999} style={{ width: 120 }} />
            </Form.Item>
          </Space>

          <Form.Item label="条件（满足全部）">
            <Form.List name="conditions">
              {(fields, { add, remove }) => (
                <Space direction="vertical" style={{ width: '100%' }} size="small">
                  {fields.map(({ key, name, ...rest }) => (
                    <Space key={key} align="baseline" wrap>
                      <Form.Item {...rest} name={[name, 'field']} rules={[{ required: true }]} noStyle>
                        <Select
                          style={{ width: 140 }}
                          options={Object.entries(FIELD_MAP).map(([value, label]) => ({
                            value,
                            label,
                          }))}
                        />
                      </Form.Item>
                      <Form.Item {...rest} name={[name, 'op']} rules={[{ required: true }]} noStyle>
                        <Select
                          style={{ width: 110 }}
                          options={Object.entries(OP_MAP).map(([value, label]) => ({ value, label }))}
                        />
                      </Form.Item>
                      <Form.Item {...rest} name={[name, 'value']} rules={[{ required: true, message: '值' }]} noStyle>
                        <Input style={{ width: 150 }} placeholder="值" />
                      </Form.Item>
                      <MinusCircleOutlined onClick={() => remove(name)} style={{ color: 'var(--err)' }} />
                    </Space>
                  ))}
                  <Button
                    type="dashed"
                    onClick={() => add({ field: 'verdict', op: 'eq', value: '' })}
                    block
                    icon={<PlusOutlined />}
                  >
                    添加条件
                  </Button>
                </Space>
              )}
            </Form.List>
          </Form.Item>

          <Form.Item label="动作">
            <Form.List name="actions">
              {(fields, { add, remove }) => (
                <Space direction="vertical" style={{ width: '100%' }} size="small">
                  {fields.map(({ key, name, ...rest }) => (
                    <Space key={key} align="baseline" wrap>
                      <Form.Item {...rest} name={[name, 'type']} rules={[{ required: true }]} noStyle>
                        <Select
                          style={{ width: 140 }}
                          options={Object.entries(ACTION_MAP).map(([value, label]) => ({
                            value,
                            label,
                          }))}
                        />
                      </Form.Item>
                      <Form.Item {...rest} name={[name, 'value']} noStyle>
                        <Input style={{ width: 180 }} placeholder="参数（如标签名 / 建议值）" />
                      </Form.Item>
                      <MinusCircleOutlined onClick={() => remove(name)} style={{ color: 'var(--err)' }} />
                    </Space>
                  ))}
                  <Button
                    type="dashed"
                    onClick={() => add({ type: 'add_tag', value: '' })}
                    block
                    icon={<PlusOutlined />}
                  >
                    添加动作
                  </Button>
                </Space>
              )}
            </Form.List>
          </Form.Item>
        </Form>
      </Drawer>

      {/* 执行日志 */}
      <Drawer
        title={`执行日志 · ${logRule?.name || ''}`}
        width={620}
        open={logOpen}
        onClose={() => setLogOpen(false)}
      >
        {logLoading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : (
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            columns={logColumns}
            dataSource={logs}
            locale={{ emptyText: '暂无执行记录' }}
          />
        )}
      </Drawer>

      {/* 模拟触发 */}
      <Modal
        title="模拟触发"
        open={simOpen}
        onOk={handleSimulate}
        onCancel={() => setSimOpen(false)}
        confirmLoading={simLoading}
        okText="运行"
        cancelText="取消"
        width={560}
      >
        <Form form={simForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="projectId"
            label="项目 ID"
            rules={[{ required: true, message: '请填写项目 ID' }]}
            extra="无流水线时用于演示规则匹配与动作结果"
          >
            <Input placeholder="粘贴一个项目 ID（默认取列表首个）" />
          </Form.Item>
          <Form.Item name="eventType" label="触发事件" rules={[{ required: true }]}>
            <Select
              options={Object.entries(EVENT_MAP).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
        </Form>
        {simResult && (
          <pre
            style={{
              marginTop: 12,
              padding: 12,
              maxHeight: 280,
              overflow: 'auto',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)',
              fontSize: 12,
              color: 'var(--ink)',
              fontFamily: 'var(--font-body)',
            }}
          >
            {simResult}
          </pre>
        )}
      </Modal>
    </div>
  );
}
