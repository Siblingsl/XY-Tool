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
} from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
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
    </div>
  );
}
