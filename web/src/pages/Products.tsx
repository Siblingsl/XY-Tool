import { useEffect, useState } from 'react';
import {
  message,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  Image,
  Empty,
} from 'antd';
import { PlusOutlined, ReloadOutlined, CloudDownloadOutlined } from '@ant-design/icons';
import api from '../api';

/**
 * 商品发货规则管理页。
 * 把闲鱼商品ID 映射到发货方式（卡密/链接/文本）。
 */
export default function Products() {
  const [data, setData] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [pools, setPools] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  // 拉取在售商品弹窗状态
  const [fetchModalOpen, setFetchModalOpen] = useState(false);
  const [fetchAccountId, setFetchAccountId] = useState<number | undefined>();
  const [fetchItems, setFetchItems] = useState<any[]>([]);
  const [fetchPage, setFetchPage] = useState(1);
  const [fetchHasNext, setFetchHasNext] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [list, accs, pls] = await Promise.all([
        api.get('/products'),
        api.get('/accounts'),
        api.get('/kami/pools'),
      ]);
      setData(list as unknown as any[]);
      setAccounts(accs as unknown as any[]);
      setPools(pls as unknown as any[]);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleAdd = async () => {
    const values = await form.validateFields();
    try {
      await api.post('/products', values);
      message.success('添加成功');
      setModalOpen(false);
      form.resetFields();
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const handleToggle = async (id: number, enabled: boolean) => {
    try {
      await api.put(`/products/${id}`, { enabled });
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/products/${id}`);
      message.success('已删除');
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  // ============ 拉取在售商品 ============

  const fetchItemsPage = async (accountId: number, page = 1, append = false) => {
    setFetchLoading(true);
    try {
      const res: any = await api.get(`/accounts/${accountId}/items`, {
        params: { page, size: 20 },
      });
      const newList = res?.list || [];
      setFetchItems(append ? [...fetchItems, ...newList] : newList);
      setFetchPage(page);
      setFetchHasNext(!!res?.hasNext);
    } catch (e) {
      message.error((e as Error).message);
      if (!append) setFetchItems([]);
    } finally {
      setFetchLoading(false);
    }
  };

  const openFetchModal = () => {
    setFetchItems([]);
    setFetchPage(1);
    setFetchHasNext(false);
    setFetchModalOpen(true);
    // 默认选第一个账号并拉取
    if (accounts.length > 0 && fetchAccountId == null) {
      const firstId = accounts[0].id;
      setFetchAccountId(firstId);
      fetchItemsPage(firstId, 1);
    } else if (fetchAccountId != null) {
      fetchItemsPage(fetchAccountId, 1);
    }
  };

  const handleFetchAccountChange = (id: number) => {
    setFetchAccountId(id);
    fetchItemsPage(id, 1);
  };

  /** 把在售商品导入为发货规则：自动填 itemId/title，打开规则表单 */
  const handleImportToRule = (item: any) => {
    form.setFieldsValue({
      itemId: item.itemId,
      title: item.title,
      accountId: fetchAccountId,
      deliveryType: undefined,
      kamiPoolId: undefined,
      fixedContent: undefined,
      remark: undefined,
    });
    setFetchModalOpen(false);
    setModalOpen(true);
    message.success(`已填入「${item.title}」，请补全发货方式`);
  };

  const deliveryTypeText: Record<string, string> = {
    kami: '发卡密',
    link: '发链接',
    text: '发文本',
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '商品ID', dataIndex: 'itemId' },
    { title: '商品标题', dataIndex: 'title' },
    {
      title: '发货方式',
      dataIndex: 'deliveryType',
      render: (t: string) => <Tag color="blue">{deliveryTypeText[t] || t}</Tag>,
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      render: (e: boolean, row: any) => (
        <Switch checked={e} onChange={(v) => handleToggle(row.id, v)} />
      ),
    },
    {
      title: '操作',
      render: (_: any, row: any) => (
        <Popconfirm title="确定删除？" onConfirm={() => handleDelete(row.id)}>
          <Button size="small" danger>
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={4}>商品发货规则</Typography.Title>
      <Card
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={refresh}>
              刷新
            </Button>
            <Button
              icon={<CloudDownloadOutlined />}
              onClick={openFetchModal}
              disabled={accounts.length === 0}
            >
              从闲鱼拉取商品
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              添加规则
            </Button>
          </Space>
        }
      >
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} />
      </Card>

      <Modal
        title="添加发货规则"
        open={modalOpen}
        onOk={handleAdd}
        onCancel={() => setModalOpen(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="accountId" label="闲鱼账号" rules={[{ required: true }]}>
            <Select
              placeholder="选择账号"
              options={accounts.map((a) => ({ value: a.id, label: a.nickname }))}
            />
          </Form.Item>
          <Form.Item name="itemId" label="商品ID" rules={[{ required: true }]}>
            <Input placeholder="闲鱼商品ID" />
          </Form.Item>
          <Form.Item name="title" label="商品标题" rules={[{ required: true }]}>
            <Input placeholder="商品标题" />
          </Form.Item>
          <Form.Item name="deliveryType" label="发货方式" rules={[{ required: true }]}>
            <Select
              placeholder="选择发货方式"
              options={[
                { value: 'kami', label: '发卡密（从卡密池取）' },
                { value: 'link', label: '发链接（固定内容）' },
                { value: 'text', label: '发文本（固定内容）' },
              ]}
            />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.deliveryType !== cur.deliveryType}
          >
            {({ getFieldValue }) =>
              getFieldValue('deliveryType') === 'kami' ? (
                <Form.Item name="kamiPoolId" label="卡密池" rules={[{ required: true }]}>
                  <Select
                    placeholder="选择卡密池"
                    options={pools.map((p) => ({ value: p.id, label: p.name }))}
                  />
                </Form.Item>
              ) : (
                <Form.Item name="fixedContent" label="固定内容" rules={[{ required: true }]}>
                  <Input.TextArea rows={4} placeholder="链接或文本内容" />
                </Form.Item>
              )
            }
          </Form.Item>
          <Form.Item name="remark" label="发货附言（可选）">
            <Input.TextArea rows={2} placeholder="如：有问题联系客服" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 拉取在售商品弹窗 */}
      <Modal
        title="从闲鱼拉取在售商品"
        open={fetchModalOpen}
        onCancel={() => setFetchModalOpen(false)}
        footer={<Button onClick={() => setFetchModalOpen(false)}>关闭</Button>}
        width={800}
        destroyOnClose
      >
        <Space style={{ marginBottom: 16, width: '100%' }} direction="vertical">
          <Select
            placeholder="选择闲鱼账号"
            style={{ width: 280 }}
            value={fetchAccountId}
            onChange={handleFetchAccountChange}
            options={accounts.map((a) => ({ value: a.id, label: a.nickname }))}
          />
        </Space>
        <Table
          size="small"
          rowKey="itemId"
          dataSource={fetchItems}
          loading={fetchLoading}
          pagination={false}
          scroll={{ y: 360 }}
          locale={{
            emptyText: fetchLoading ? '加载中...' : <Empty description="暂无在售商品" />,
          }}
          columns={[
            {
              title: '商品',
              dataIndex: 'title',
              ellipsis: true,
              render: (title: string, row: any) => (
                <Space>
                  {row.picUrl ? (
                    <Image
                      src={row.picUrl}
                      width={36}
                      height={36}
                      style={{ borderRadius: 4, objectFit: 'cover' }}
                      fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"
                    />
                  ) : null}
                  <a href={row.detailUrl} target="_blank" rel="noreferrer">
                    {title}
                  </a>
                </Space>
              ),
            },
            {
              title: '商品ID',
              dataIndex: 'itemId',
              width: 140,
              render: (v: string) => (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {v}
                </Typography.Text>
              ),
            },
            {
              title: '价格',
              dataIndex: 'priceText',
              width: 90,
              render: (p: string, row: any) => p || (row.price ? `¥${(row.price / 100).toFixed(2)}` : '-'),
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 80,
              render: (s: string) => (
                <Tag color={s === '在售' ? 'success' : 'default'}>{s}</Tag>
              ),
            },
            {
              title: '操作',
              width: 110,
              render: (_: any, row: any) => (
                <Button
                  size="small"
                  type="link"
                  onClick={() => handleImportToRule(row)}
                >
                  导入为规则
                </Button>
              ),
            },
          ]}
        />
        {fetchHasNext && (
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <Button
              loading={fetchLoading}
              onClick={() =>
                fetchAccountId && fetchItemsPage(fetchAccountId, fetchPage + 1, true)
              }
            >
              加载更多
            </Button>
          </div>
        )}
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
          实时从闲鱼拉取在售商品，点击「导入为规则」可自动填入商品ID和标题，无需手动输入。
        </Typography.Paragraph>
      </Modal>
    </div>
  );
}
