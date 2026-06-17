import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
  Space,
  Popconfirm,
} from 'antd';
import { ReloadOutlined, RedoOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api';

/**
 * 订单与发货日志页。
 * 两个 Tab：订单列表（含状态）、发货日志。
 */
export default function Orders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshOrders = async () => {
    setLoading(true);
    try {
      const res: any = await api.get('/orders', { params: { size: 50 } });
      setOrders(res.list || []);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const refreshLogs = async () => {
    setLoading(true);
    try {
      const res: any = await api.get('/delivery/logs', { params: { size: 50 } });
      setLogs(res.list || []);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshOrders();
  }, []);

  const handleRetry = async (orderId: number) => {
    try {
      const res: any = await api.post(`/delivery/retry/${orderId}`);
      if (res?.success) {
        message.success(res.message || '重试成功');
      } else {
        message.warning(res?.message || '重试未完成');
      }
      refreshOrders();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const statusColor: Record<string, string> = {
    PENDING: 'processing',
    ASSIGNED: 'cyan',
    DELIVERING: 'blue',
    DELIVERED: 'success',
    FAILED: 'error',
    IGNORED: 'default',
  };

  const orderColumns = [
    { title: '订单号', dataIndex: 'bizOrderId', width: 220 },
    { title: '商品', dataIndex: 'itemTitle', ellipsis: true },
    { title: '买家', dataIndex: 'buyerNick', width: 100 },
    {
      title: '金额',
      dataIndex: 'amount',
      width: 80,
      render: (a: number) => (a ? `¥${(a / 100).toFixed(2)}` : '-'),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: string) => <Tag color={statusColor[s]}>{s}</Tag>,
    },
    {
      title: '重试',
      dataIndex: 'retryCount',
      width: 60,
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (t: string) => (t ? dayjs(t).format('MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '操作',
      width: 100,
      render: (_: any, row: any) =>
        ['FAILED', 'PENDING', 'IGNORED'].includes(row.status) ? (
          <Popconfirm
            title="重新尝试自动发货？"
            onConfirm={() => handleRetry(row.id)}
          >
            <Button size="small" icon={<RedoOutlined />}>
              重试
            </Button>
          </Popconfirm>
        ) : null,
    },
  ];

  const logColumns = [
    { title: '订单ID', dataIndex: 'orderId', width: 80 },
    {
      title: '类型',
      dataIndex: 'deliveryType',
      width: 80,
      render: (t: string) => <Tag>{t}</Tag>,
    },
    {
      title: '内容',
      dataIndex: 'payload',
      ellipsis: true,
      render: (p: string) => (
        <Typography.Text ellipsis style={{ maxWidth: 200 }}>
          {p}
        </Typography.Text>
      ),
    },
    {
      title: '结果',
      dataIndex: 'result',
      width: 80,
      render: (r: string) => (
        <Tag color={r === 'success' ? 'success' : 'error'}>{r}</Tag>
      ),
    },
    {
      title: '耗时',
      dataIndex: 'durationMs',
      width: 80,
      render: (d: number) => `${d}ms`,
    },
    {
      title: '错误',
      dataIndex: 'error',
      ellipsis: true,
      render: (e: string | null) =>
        e ? (
          <Typography.Text type="danger" ellipsis style={{ maxWidth: 200 }}>
            {e}
          </Typography.Text>
        ) : (
          '-'
        ),
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (t: string) => (t ? dayjs(t).format('MM-DD HH:mm:ss') : '-'),
    },
  ];

  return (
    <div>
      <Typography.Title level={4}>订单与日志</Typography.Title>
      <Tabs
        defaultActiveKey="orders"
        onChange={(key) => {
          if (key === 'logs') refreshLogs();
          else refreshOrders();
        }}
        items={[
          {
            key: 'orders',
            label: '订单列表',
            children: (
              <Card
                extra={
                  <Button icon={<ReloadOutlined />} onClick={refreshOrders}>
                    刷新
                  </Button>
                }
              >
                <Table
                  rowKey="id"
                  columns={orderColumns}
                  dataSource={orders}
                  loading={loading}
                  size="small"
                  pagination={{ pageSize: 20 }}
                />
              </Card>
            ),
          },
          {
            key: 'logs',
            label: '发货日志',
            children: (
              <Card
                extra={
                  <Button icon={<ReloadOutlined />} onClick={refreshLogs}>
                    刷新
                  </Button>
                }
              >
                <Table
                  rowKey="id"
                  columns={logColumns}
                  dataSource={logs}
                  loading={loading}
                  size="small"
                  pagination={{ pageSize: 20 }}
                />
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
