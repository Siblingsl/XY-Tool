import { useEffect, useState } from 'react';
import {
  message,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { PlusOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../api';

/**
 * 卡密池管理页。
 * 两个 Tab：卡密池列表、卡密条目（按池查看）。
 */
export default function KamiPool() {
  const [pools, setPools] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [stockMap, setStockMap] = useState<Record<number, number>>({});
  const [selectedPool, setSelectedPool] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [poolModal, setPoolModal] = useState(false);
  const [itemModal, setItemModal] = useState(false);
  const [poolForm] = Form.useForm();
  const [itemForm] = Form.useForm();

  const refreshPools = async () => {
    setLoading(true);
    try {
      const list = (await api.get('/kami/pools')) as unknown as any[];
      setPools(list);
      // 拉取每个池的库存
      const stocks: Record<number, number> = {};
      await Promise.all(
        list.map(async (p) => {
          const s = (await api.get(`/kami/stock/${p.id}`)) as number;
          stocks[p.id] = s;
        }),
      );
      setStockMap(stocks);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const refreshItems = async (poolId: number) => {
    setLoading(true);
    try {
      const list = (await api.get(`/kami/items/${poolId}`)) as any[];
      setItems(list);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshPools();
  }, []);

  const handleCreatePool = async () => {
    const values = await poolForm.validateFields();
    try {
      await api.post('/kami/pools', values);
      message.success('卡密池已创建');
      setPoolModal(false);
      poolForm.resetFields();
      refreshPools();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const handleAddItems = async () => {
    if (!selectedPool) return;
    const values = await itemForm.validateFields();
    const contents = (values.contents as string)
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await api.post(`/kami/items/${selectedPool}`, { contents });
      message.success(`已添加 ${contents.length} 条卡密`);
      setItemModal(false);
      itemForm.resetFields();
      refreshItems(selectedPool);
      refreshPools();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const handleDeletePool = async (id: number) => {
    try {
      await api.delete(`/kami/pools/${id}`);
      message.success('已删除');
      refreshPools();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const statusColor: Record<string, string> = {
    unused: 'success',
    locked: 'warning',
    used: 'default',
  };

  const poolColumns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '池名称', dataIndex: 'name' },
    {
      title: '可用库存',
      render: (_: any, row: any) => (
        <Tag color={stockMap[row.id] <= row.lowStockThreshold ? 'red' : 'green'}>
          {stockMap[row.id] ?? '-'} / 阈值 {row.lowStockThreshold}
        </Tag>
      ),
    },
    {
      title: '操作',
      render: (_: any, row: any) => (
        <Space>
          <Button
            size="small"
            onClick={() => {
              setSelectedPool(row.id);
              refreshItems(row.id);
            }}
          >
            查看卡密
          </Button>
          <Button
            size="small"
            type="primary"
            onClick={() => {
              setSelectedPool(row.id);
              setItemModal(true);
            }}
          >
            添加卡密
          </Button>
          <Popconfirm title="删除池会保留卡密记录，确定？" onConfirm={() => handleDeletePool(row.id)}>
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const itemColumns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '卡密内容',
      dataIndex: 'content',
      render: (c: string) => (
        <Typography.Text ellipsis style={{ maxWidth: 300 }}>
          {c}
        </Typography.Text>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (s: string) => <Tag color={statusColor[s]}>{s}</Tag>,
    },
  ];


  const handleExport = async () => {
    if (!selectedPool) {
      message.warning('请先选择卡密池');
      return;
    }
    try {
      const token = localStorage.getItem('accessToken');
      const { apiPath } = await import('../api/config');
      const resp = await fetch(apiPath(`/kami/items/${selectedPool}/export`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error('导出失败');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kami-pool-${selectedPool}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('已导出 CSV');
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <div>
      <Typography.Title level={4}>卡密池管理</Typography.Title>
      <Tabs
        defaultActiveKey="pools"
        items={[
          {
            key: 'pools',
            label: '卡密池',
            children: (
              <Card
                extra={
                  <Space>
                    <Button icon={<ReloadOutlined />} onClick={refreshPools}>
                      刷新
                    </Button>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setPoolModal(true)}>
                      新建卡密池
                    </Button>
                  </Space>
                }
              >
                <Table rowKey="id" columns={poolColumns} dataSource={pools} loading={loading} />
              </Card>
            ),
          },
          {
            key: 'items',
            label: '卡密条目',
            children: (
              <Card
                title={selectedPool ? `池 #${selectedPool} 的卡密` : '请先在"卡密池"中点击"查看卡密"'}
                extra={
                  selectedPool && (
                    <Space>
                      <Button icon={<DownloadOutlined />} onClick={handleExport}>
                        导出CSV
                      </Button>
                      <Button type="primary" icon={<PlusOutlined />} onClick={() => setItemModal(true)}>
                        批量添加
                      </Button>
                    </Space>
                  )
                }
              >
                <Table rowKey="id" columns={itemColumns} dataSource={items} loading={loading} />
              </Card>
            ),
          },
        ]}
      />

      <Modal
        title="新建卡密池"
        open={poolModal}
        onOk={handleCreatePool}
        onCancel={() => setPoolModal(false)}
      >
        <Form form={poolForm} layout="vertical">
          <Form.Item name="name" label="池名称" rules={[{ required: true }]}>
            <Input placeholder="如：Steam CDK 池" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="批量添加卡密"
        open={itemModal}
        onOk={handleAddItems}
        onCancel={() => setItemModal(false)}
        width={600}
      >
        <Form form={itemForm} layout="vertical">
          <Form.Item
            name="contents"
            label="卡密内容（每行一条）"
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={8} placeholder="CDK-AAAA-BBBB&#10;CDK-CCCC-DDDD&#10;..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
