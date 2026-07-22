import { useEffect, useState } from 'react';
import { Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tabs, Tag, Typography, message, Upload } from 'antd';
import { PlusOutlined, ReloadOutlined, ExperimentOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import api from '../api';
import { apiPath } from '../api/config';

/**
 * 自动回复配置页。
 * 三 Tab：关键词回复 / 回复配置 / 人工接管
 *
 * 优先级：转人工 > 关键词 > AI > 默认。
 */
export default function AutoReply() {
  return (
    <div>
      <Typography.Title level={4}>自动回复</Typography.Title>
      <Tabs
        defaultActiveKey="keywords"
        items={[
          { key: 'keywords', label: '关键词回复', children: <KeywordsTab /> },
          { key: 'config', label: '回复配置', children: <ConfigTab /> },
          { key: 'handoff', label: '人工接管', children: <HandoffTab /> },
        ]}
      />
    </div>
  );
}

// ============================================================
// Tab 1: 关键词回复
// ============================================================

function KeywordsTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form] = Form.useForm();

  const refresh = async () => {
    setLoading(true);
    try {
      const list: any = await api.get('/auto-reply/keywords');
      setData(list as any[]);
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
        await api.put(`/auto-reply/keywords/${editId}`, values);
        message.success('已更新');
      } else {
        await api.post('/auto-reply/keywords', values);
        message.success('已添加');
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
      keyword: row.keyword,
      itemId: row.itemId || undefined,
      matchType: row.matchType,
      replyContent: row.replyContent,
      enabled: row.enabled,
      sortOrder: row.sortOrder,
      accountId: row.accountId,
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/auto-reply/keywords/${id}`);
      message.success('已删除');
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const handleToggle = async (id: number, enabled: boolean) => {
    try {
      await api.put(`/auto-reply/keywords/${id}`, { enabled });
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '适用',
      dataIndex: 'accountId',
      width: 90,
      render: (v: number | null) =>
        v ? <Tag color="blue">指定账号</Tag> : <Tag color="purple">全局</Tag>,
    },
    { title: '关键词', dataIndex: 'keyword' },
      { title: '商品ID', dataIndex: 'itemId', width: 120, render: (v: string) => v || '通用' },
    {
      title: '匹配',
      dataIndex: 'matchType',
      width: 80,
      render: (t: string) => (
        <Tag>{t === 'exact' ? '精确' : '包含'}</Tag>
      ),
    },
    {
      title: '回复内容',
      dataIndex: 'replyContent',
      ellipsis: true,
    },
    { title: '优先级', dataIndex: 'sortOrder', width: 70 },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 70,
      render: (e: boolean, row: any) => (
        <Switch checked={e} size="small" onChange={(v) => handleToggle(row.id, v)} />
      ),
    },
    {
      title: '操作',
      width: 140,
      render: (_: any, row: any) => (
        <Space>
          <Button size="small" onClick={() => handleEdit(row)}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(row.id)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const resp = await fetch(apiPath('/auto-reply/keywords/export'), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error('导出失败');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `keywords_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('已导出关键词 CSV');
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const res: any = await api.post('/auto-reply/keywords/import', { text });
      message.success(`导入成功 ${res.imported} 条，跳过 ${res.skipped} 条`);
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
    return false;
  };

  return (
    <Card
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>导出</Button>
          <Upload
            accept=".csv,.txt"
            showUploadList={false}
            beforeUpload={(file) => {
              void handleImportFile(file);
              return false;
            }}
          >
            <Button icon={<UploadOutlined />}>导入CSV</Button>
          </Upload>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditId(null);
              form.resetFields();
              form.setFieldsValue({ matchType: 'contains', enabled: true, sortOrder: 0 });
              setModalOpen(true);
            }}
          >
            添加规则
          </Button>
        </Space>
      }
    >
      <Table rowKey="id" columns={columns} dataSource={data} loading={loading} />
      <Modal
        title={editId ? '编辑关键词' : '添加关键词'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); setEditId(null); }}
        width={560}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="accountId" label="适用账号（留空=全局生效）">
            <Input placeholder="账号ID（可选）" type="number" />
          </Form.Item>
          <Form.Item name="itemId" label="商品ID（可选，商品专属回复）" extra="填写后仅该商品会话命中；留空为通用规则">
            <Input placeholder="闲鱼商品ID，留空=通用" />
          </Form.Item>
          <Form.Item name="keyword" label="关键词" rules={[{ required: true }]}>
            <Input placeholder="如：怎么用 / 发货" />
          </Form.Item>
          <Form.Item name="matchType" label="匹配模式" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'contains', label: '包含（买家消息含关键词即命中）' },
                { value: 'exact', label: '精确（买家消息完全等于关键词）' },
              ]}
            />
          </Form.Item>
          <Form.Item name="replyContent" label="回复内容" rules={[{ required: true }]}>
            <Input.TextArea rows={4} placeholder="自动回复的文本" />
          </Form.Item>
          <Form.Item name="sortOrder" label="优先级（数字小优先）">
            <Input type="number" />
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
// Tab 2: 回复配置（占位，下一步实现）
// ============================================================

function ConfigTab() {
  return <ConfigTabImpl />;
}

// ============================================================
// Tab 3: 人工接管（占位，下一步实现）
// ============================================================

function HandoffTab() {
  return <HandoffTabImpl />;
}

// 占位实现（下一段补充）
function ConfigTabImpl() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState<number | undefined>();
  const [cfg, setCfg] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    api.get('/accounts').then((list: any) => {
      setAccounts(list || []);
      if (list?.length > 0) {
        setAccountId(list[0].id);
      }
    });
  }, []);

  const loadCfg = async (id: number) => {
    setLoading(true);
    try {
      const res: any = await api.get(`/auto-reply/config/${id}`);
      setCfg(res);
      form.setFieldsValue({
        defaultReplyEnabled: res.defaultReplyEnabled,
        defaultReplyContent: res.defaultReplyContent || '',
        aiEnabled: res.aiEnabled,
        aiBaseUrl: res.aiBaseUrl || 'https://api.openai.com/v1',
        aiApiKey: '',
        aiModel: res.aiModel || 'gpt-4o-mini',
        aiSystemPrompt: res.aiSystemPrompt || '',
        aiTemperature: res.aiTemperature ?? 0.7,
        transferKeywords: res.transferKeywords || '人工,客服',
        cooldownSeconds: res.cooldownSeconds ?? 3,
        aiBargainEnabled: !!res.aiBargainEnabled,
        maxDiscountPercent: res.maxDiscountPercent ?? 10,
        maxDiscountAmount: res.maxDiscountAmount ?? 100,
        maxBargainRounds: res.maxBargainRounds ?? 3,
        bargainKeywords: res.bargainKeywords || '便宜,刀,优惠,少点,砍价,议价',
      });
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountId) loadCfg(accountId);
  }, [accountId]);

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      await api.put(`/auto-reply/config/${accountId}`, values);
      message.success('配置已保存');
      loadCfg(accountId!);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const handleTestAi = async () => {
    const values = await form.validateFields();
    if (!values.aiBaseUrl || !values.aiApiKey) {
      message.warning('请先填写 Base URL 和 API Key');
      return;
    }
    setTesting(true);
    try {
      const res: any = await api.post('/auto-reply/ai/test', {
        baseUrl: values.aiBaseUrl,
        apiKey: values.aiApiKey,
        model: values.aiModel || 'gpt-4o-mini',
      });
      message.success(`AI 连通正常：${res.reply || 'OK'}`);
    } catch (e) {
      message.error(`AI 测试失败：${(e as Error).message}`);
    } finally {
      setTesting(false);
    }
  };

  if (accounts.length === 0) {
    return <Card><Typography.Text type="secondary">请先添加闲鱼账号</Typography.Text></Card>;
  }

  return (
    <Card loading={loading}>
      <Form.Item label="选择账号" style={{ maxWidth: 300 }}>
        <Select
          value={accountId}
          onChange={setAccountId}
          options={accounts.map((a) => ({ value: a.id, label: a.nickname }))}
        />
      </Form.Item>

      <Form form={form} layout="vertical" style={{ maxWidth: 600 }}>
        <Typography.Title level={5}>默认回复</Typography.Title>
        <Form.Item name="defaultReplyEnabled" label="启用默认回复" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="defaultReplyContent" label="默认回复内容">
          <Input.TextArea rows={2} placeholder="未命中关键词且AI未启用时，回复此内容" />
        </Form.Item>

        <Typography.Title level={5} style={{ marginTop: 16 }}>AI 智能回复</Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
          接口凭据在「AI 接入」统一配置；此处仅控制本账号是否启用及角色设定。
          未配公共 AI 时，仍可填写下方账号级 Key 作为回退。
        </Typography.Paragraph>
        <Form.Item name="aiEnabled" label="启用 AI 回复" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="aiSystemPrompt" label="系统提示词（角色设定）">
          <Input.TextArea rows={3} placeholder="你是一个友善的闲鱼客服..." />
        </Form.Item>
        <Form.Item name="aiTemperature" label="温度（0-2，越大越随机）">
          <Input type="number" step="0.1" />
        </Form.Item>
        <Typography.Title level={5} style={{ marginTop: 8 }}>账号级 AI 回退（可选）</Typography.Title>
        <Form.Item name="aiBaseUrl" label="OpenAI 兼容地址">
          <Input placeholder="公共 AI 未配置时才使用" />
        </Form.Item>
        <Form.Item
          name="aiApiKey"
          label={`API Key${cfg?.aiApiKeyConfigured ? '（已配置，留空保留原值）' : ''}`}
        >
          <Input.Password placeholder="可选回退 Key" />
        </Form.Item>
        <Form.Item name="aiModel" label="模型名">
          <Input placeholder="gpt-4o-mini" />
        </Form.Item>
        <Button icon={<ExperimentOutlined />} loading={testing} onClick={handleTestAi} style={{ marginBottom: 16 }}>
          测试账号级 AI
        </Button>

        <Typography.Title level={5} style={{ marginTop: 16 }}>转人工 / 冷却</Typography.Title>
        
        <Form.Item name="aiBargainEnabled" label="AI 智能议价" valuePropName="checked" extra="命中议价关键词时走议价策略（需同时开启 AI 回复）">
          <Switch checkedChildren="开" unCheckedChildren="关" />
        </Form.Item>
        <Form.Item noStyle shouldUpdate={(p, c) => p.aiBargainEnabled !== c.aiBargainEnabled}>
          {({ getFieldValue }) =>
            getFieldValue('aiBargainEnabled') ? (
              <>
                <Form.Item name="maxDiscountPercent" label="最大优惠百分比">
                  <InputNumber min={0} max={90} style={{ width: '100%' }} addonAfter="%" />
                </Form.Item>
                <Form.Item name="maxDiscountAmount" label="最大优惠金额（元）">
                  <InputNumber min={0} max={10000} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="maxBargainRounds" label="最大议价轮数">
                  <InputNumber min={1} max={10} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="bargainKeywords" label="议价关键词" extra="逗号分隔">
                  <Input placeholder="便宜,刀,优惠,少点,砍价,议价" />
                </Form.Item>
              </>
            ) : null
          }
        </Form.Item>
        <Form.Item name="transferKeywords" label="转人工关键词（逗号分隔）">
          <Input placeholder="人工,客服,转人工" />
        </Form.Item>
        <Form.Item name="cooldownSeconds" label="冷却秒数（同买家最小回复间隔）">
          <Input type="number" />
        </Form.Item>

        <Button type="primary" onClick={handleSave}>保存配置</Button>
      </Form>
    </Card>
  );
}

function HandoffTabImpl() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const list: any = await api.get('/auto-reply/handoffs');
      setData(list as any[]);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleReset = async (accountId: number, buyerId: string) => {
    try {
      await api.post(`/auto-reply/config/${accountId}/reset-handoff/${buyerId}`);
      message.success('已恢复自动回复');
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const columns = [
    { title: '账号ID', dataIndex: 'accountId', width: 80 },
    { title: '买家ID', dataIndex: 'buyerId' },
    { title: '买家昵称', dataIndex: 'buyerNick' },
    {
      title: '触发内容',
      dataIndex: 'triggerContent',
      ellipsis: true,
    },
    {
      title: '转人工时间',
      dataIndex: 'handedOffAt',
      width: 170,
      render: (t: string) => (t ? new Date(t).toLocaleString('zh-CN') : '-'),
    },
    {
      title: '操作',
      width: 120,
      render: (_: any, row: any) => (
        <Popconfirm title="恢复自动回复？" onConfirm={() => handleReset(row.accountId, row.buyerId)}>
          <Button size="small">恢复</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Card
      extra={<Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>}
    >
      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        locale={{ emptyText: '暂无转人工记录' }}
      />
    </Card>
  );
}
