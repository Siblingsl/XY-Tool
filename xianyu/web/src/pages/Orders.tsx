import { useCallback, useEffect, useState, type Key } from 'react';
import {
  Button,
  Card,
  Drawer,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  RedoOutlined,
  ReloadOutlined,
  SendOutlined,
  SyncOutlined,
  DeleteOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api';
import { apiPath } from '../api/config';
import { wsClient } from '../api/ws';

export default function Orders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [tabKey, setTabKey] = useState('orders');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [detail, setDetail] = useState<any | null>(null);
  const [shipOpen, setShipOpen] = useState(false);
  const [shipOrderId, setShipOrderId] = useState<number | null>(null);
  const [shipMode, setShipMode] = useState<'full' | 'status_only'>('full');
  const [shipping, setShipping] = useState(false);

  const refreshOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { size: 50 };
      if (statusFilter && statusFilter !== 'all') params.status = statusFilter;
      const res: any = await api.get('/orders', { params });
      setOrders(res.list || []);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const refreshLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await api.get('/delivery/logs', { params: { size: 50 } });
      setLogs(res.list || []);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshOrders();
    const offStatus = wsClient.on('order:status', () => {
      if (tabKey === 'orders') refreshOrders();
    });
    const offDelivery = wsClient.on('delivery:result', () => {
      if (tabKey === 'logs') refreshLogs();
      if (tabKey === 'orders') refreshOrders();
    });
    return () => {
      offStatus();
      offDelivery();
    };
  }, [tabKey, refreshOrders, refreshLogs]);

  const handleRetry = async (orderId: number) => {
    try {
      const res: any = await api.post(`/delivery/retry/${orderId}`);
      if (res?.success) message.success(res.message || '已入队');
      else message.warning(res?.message || '重试未完成');
      refreshOrders();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const handleRefreshOne = async (orderId: number) => {
    try {
      const res: any = await api.post(`/orders/${orderId}/refresh`);
      if (res?.success) message.success(res.message || '已刷新');
      else message.warning(res?.message || '刷新失败');
      refreshOrders();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const handleBatchRefresh = async () => {
    if (!selectedRowKeys.length) {
      message.warning('请先勾选订单');
      return;
    }
    try {
      setLoading(true);
      const res: any = await api.post('/orders/refresh-batch', {
        ids: selectedRowKeys.map(Number),
      });
      message.success(`刷新完成：成功 ${res.ok} / ${res.total}`);
      if (res.failed) {
        message.warning(res.errors?.slice(0, 3).join('; '));
      }
      setSelectedRowKeys([]);
      refreshOrders();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handlePoll = async () => {
    try {
      await api.post('/orders/poll');
      message.success('已触发轮询');
      setTimeout(refreshOrders, 1500);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const qs =
        statusFilter && statusFilter !== 'all'
          ? `?status=${encodeURIComponent(statusFilter)}`
          : '';
      const resp = await fetch(apiPath(`/orders/export${qs}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error('导出失败');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orders_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('已导出 CSV（可用 Excel 打开）');
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const openManualShip = (orderId: number) => {
    setShipOrderId(orderId);
    setShipMode('full');
    setShipOpen(true);
  };

  const doManualShip = async () => {
    if (!shipOrderId) return;
    setShipping(true);
    try {
      const res: any = await api.post(`/delivery/manual-ship/${shipOrderId}`, {
        mode: shipMode,
      });
      if (res?.success) message.success(res.message || '已提交');
      else message.warning(res?.message || '发货失败');
      setShipOpen(false);
      refreshOrders();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setShipping(false);
    }
  };

  const handleDelete = async (orderId: number) => {
    try {
      await api.delete(`/orders/${orderId}`);
      message.success('已删除');
      refreshOrders();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const openDetail = async (row: any) => {
    try {
      const res: any = await api.get(`/orders/${row.id}`);
      setDetail(res || row);
    } catch {
      setDetail(row);
    }
  };

  const statusColor: Record<string, string> = {
    PENDING: 'processing',
    ASSIGNED: 'cyan',
    DELIVERING: 'blue',
    DELIVERED: 'success',
    FAILED: 'error',
    IGNORED: 'default',
    REFUNDING: 'orange',
    REFUNDED: 'volcano',
  };

  const orderColumns = [
    { title: '订单号', dataIndex: 'bizOrderId', width: 180, ellipsis: true },
    {
      title: '商品',
      dataIndex: 'itemTitle',
      ellipsis: true,
      render: (t: string, row: any) => (
        <a onClick={() => openDetail(row)}>{t || row.itemId}</a>
      ),
    },
    { title: '买家', dataIndex: 'buyerNick', width: 90, ellipsis: true },
    {
      title: '数量',
      dataIndex: 'quantity',
      width: 50,
      render: (q: number) => q || 1,
    },
    {
      title: '规格',
      width: 100,
      ellipsis: true,
      render: (_: any, row: any) =>
        row.specValue
          ? `${row.specName || '规格'}:${row.specValue}`
          : '-',
    },
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
      title: '时间',
      dataIndex: 'createdAt',
      width: 140,
      render: (t: string) => (t ? dayjs(t).format('MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '操作',
      width: 260,
      fixed: 'right' as const,
      render: (_: any, row: any) => (
        <Space size={4} wrap>
          <Button
            size="small"
            icon={<SyncOutlined />}
            onClick={() => handleRefreshOne(row.id)}
          >
            同步
          </Button>
          <Button
            size="small"
            type="primary"
            ghost
            icon={<SendOutlined />}
            onClick={() => openManualShip(row.id)}
          >
            发货
          </Button>
          {['FAILED', 'PENDING', 'IGNORED'].includes(row.status) && (
            <Popconfirm title="重新尝试自动发货？" onConfirm={() => handleRetry(row.id)}>
              <Button size="small" icon={<RedoOutlined />}>
                重试
              </Button>
            </Popconfirm>
          )}
          <Popconfirm title="删除该订单记录？" onConfirm={() => handleDelete(row.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
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
          setTabKey(key);
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
                  <Space wrap>
                    <Select
                      style={{ width: 140 }}
                      value={statusFilter}
                      onChange={(v) => setStatusFilter(v)}
                      options={[
                        { value: 'all', label: '全部状态' },
                        { value: 'PENDING', label: '待发货' },
                        { value: 'DELIVERED', label: '已发货' },
                        { value: 'FAILED', label: '失败' },
                        { value: 'IGNORED', label: '已忽略' },
                        { value: 'REFUNDING', label: '退款中' },
                        { value: 'REFUNDED', label: '已退款' },
                      ]}
                    />
                    <Button icon={<ReloadOutlined />} onClick={refreshOrders}>
                      刷新
                    </Button>
                    <Button icon={<SyncOutlined />} onClick={handlePoll}>
                      拉取新订单
                    </Button>
                    <Button
                      icon={<SyncOutlined />}
                      onClick={handleBatchRefresh}
                      disabled={!selectedRowKeys.length}
                    >
                      批量同步
                    </Button>
                    <Button icon={<DownloadOutlined />} onClick={handleExport}>
                      导出Excel
                    </Button>
                  </Space>
                }
              >
                <Table
                  rowKey="id"
                  columns={orderColumns}
                  dataSource={orders}
                  loading={loading}
                  size="small"
                  scroll={{ x: 1200 }}
                  rowSelection={{
                    selectedRowKeys,
                    onChange: setSelectedRowKeys,
                  }}
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

      <Drawer
        title="订单详情"
        open={!!detail}
        width={420}
        onClose={() => setDetail(null)}
      >
        {detail && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div><b>订单号：</b>{detail.bizOrderId}</div>
            <div><b>商品：</b>{detail.itemTitle} ({detail.itemId})</div>
            <div><b>买家：</b>{detail.buyerNick || '-'} / {detail.buyerId || '-'}</div>
            <div><b>数量：</b>{detail.quantity || 1}</div>
            <div><b>规格：</b>{detail.specName ? `${detail.specName}:${detail.specValue}` : '-'}</div>
            <div><b>金额：</b>{detail.amount ? `¥${(detail.amount / 100).toFixed(2)}` : '-'}</div>
            <div><b>状态：</b><Tag color={statusColor[detail.status]}>{detail.status}</Tag></div>
            <div><b>闲鱼状态：</b>{detail.xyStatus || '-'}</div>
            <div><b>会话ID：</b>{detail.conversationId || '-'}</div>
            <div><b>收货人：</b>{detail.receiverName || '-'}</div>
            <div><b>电话：</b>{detail.receiverPhone || '-'}</div>
            <div><b>地址：</b>{detail.receiverAddress || '-'}</div>
            <div><b>失败原因：</b>{detail.failReason || '-'}</div>
            <div><b>创建时间：</b>{detail.createdAt ? dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm:ss') : '-'}</div>
            <Space>
              <Button type="primary" icon={<SendOutlined />} onClick={() => openManualShip(detail.id)}>
                手动发货
              </Button>
              <Button icon={<SyncOutlined />} onClick={() => handleRefreshOne(detail.id)}>
                同步详情
              </Button>
            </Space>
          </Space>
        )}
      </Drawer>

      <Modal
        title="手动发货"
        open={shipOpen}
        onOk={doManualShip}
        onCancel={() => setShipOpen(false)}
        confirmLoading={shipping}
        okText="确认发货"
      >
        <p>请选择发货方式：</p>
        <Select
          style={{ width: '100%' }}
          value={shipMode}
          onChange={(v) => setShipMode(v)}
          options={[
            {
              value: 'full',
              label: '完整发货（匹配规则 + 发卡密/内容 + IM 发送）',
            },
            {
              value: 'status_only',
              label: '仅修改闲鱼发货状态（不消耗卡密，适用于已私发）',
            },
          ]}
        />
      </Modal>
    </div>
  );
}
