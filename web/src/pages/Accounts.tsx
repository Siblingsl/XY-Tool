import { useEffect, useRef, useState } from 'react';
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
  Tag,
  Typography,
  QRCode,
  Spin,
  Alert,
  Switch,
} from 'antd';
import { PlusOutlined, QrcodeOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../api';

type QrStatus =
  | 'PENDING'
  | 'NEW'
  | 'SCANNED'
  | 'SCANED'
  | 'CONFIRMED'
  | 'EXPIRED'
  | 'CANCELED'
  | 'ERROR';

/**
 * 闲鱼账号管理页。
 * - 列表展示绑定的账号
 * - 扫码登录 / 手动粘贴 Cookie 新增账号
 * - 扫码 / 粘贴更新 Cookie（登录态过期时）
 */
export default function Accounts() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [cookieModal, setCookieModal] = useState<{ id: number } | null>(null);
  const [qrModal, setQrModal] = useState<{ accountId?: number } | null>(null);
  const [qrContent, setQrContent] = useState('');
  const [qrSessionId, setQrSessionId] = useState('');
  const [qrStatus, setQrStatus] = useState<QrStatus>('PENDING');
  const [qrMessage, setQrMessage] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [form] = Form.useForm();
  const [cookieForm] = Form.useForm();

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => () => stopPolling(), []);

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await api.get('/accounts');
      setData(list as unknown as any[]);
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
      await api.post('/accounts', values);
      message.success('账号添加成功');
      setModalOpen(false);
      form.resetFields();
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const handleUpdateCookie = async () => {
    if (!cookieModal) return;
    const values = await cookieForm.validateFields();
    try {
      await api.put(`/accounts/${cookieModal.id}/cookie`, { cookie: values.cookie });
      message.success('Cookie 更新成功');
      setCookieModal(null);
      cookieForm.resetFields();
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const pollQrStatus = async (sessionId: string) => {
    try {
      const res = (await api.get(`/accounts/qr/${sessionId}/status`)) as {
        status: QrStatus;
        message?: string;
        nickname?: string;
        accountId?: number;
      };
      setQrStatus(res.status);
      setQrMessage(res.message || '');

      if (res.status === 'CONFIRMED') {
        stopPolling();
        message.success(`登录成功：${res.nickname || '闲鱼账号'}`);
        setQrModal(null);
        refresh();
      } else if (['EXPIRED', 'CANCELED', 'ERROR'].includes(res.status)) {
        stopPolling();
      }
    } catch (e) {
      stopPolling();
      setQrStatus('ERROR');
      setQrMessage((e as Error).message);
    }
  };

  const startQrLogin = async (accountId?: number) => {
    stopPolling();
    setQrLoading(true);
    setQrContent('');
    setQrSessionId('');
    setQrStatus('PENDING');
    setQrMessage('正在生成二维码...');
    setQrModal({ accountId });

    try {
      const res = (await api.post('/accounts/qr/start', accountId ? { accountId } : {})) as {
        sessionId: string;
        qrContent: string;
      };
      setQrSessionId(res.sessionId);
      setQrContent(res.qrContent);
      setQrStatus('NEW');
      setQrMessage('请使用闲鱼 App 扫描二维码');

      pollRef.current = setInterval(() => {
        pollQrStatus(res.sessionId);
      }, 2500);
      pollQrStatus(res.sessionId);
    } catch (e) {
      setQrStatus('ERROR');
      setQrMessage((e as Error).message);
    } finally {
      setQrLoading(false);
    }
  };

  const closeQrModal = () => {
    stopPolling();
    setQrModal(null);
    setQrContent('');
    setQrSessionId('');
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/accounts/${id}`);
      message.success('已删除');
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const handleToggleEnabled = async (id: number, enabled: boolean) => {
    try {
      await api.put(`/accounts/${id}/enabled`, { enabled });
      message.success(enabled ? '账号已启用' : '账号已禁用');
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const statusColor: Record<string, string> = {
    active: 'success',
    expired: 'warning',
    banned: 'error',
    disabled: 'default',
  };

  const expiredCount = data.filter((r) => r.status === 'expired').length;

  const handleHealthCheck = async (id: number) => {
    try {
      const res: any = await api.post(`/accounts/${id}/health-check`);
      if (res?.ok) {
        message.success('Cookie 有效');
      } else {
        message.warning(res?.reason || 'Cookie 无效，请重新扫码登录');
      }
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const qrStatusText: Record<string, string> = {
    PENDING: '准备中',
    NEW: '等待扫码',
    SCANNED: '已扫码，请确认',
    SCANED: '已扫码，请确认',
    CONFIRMED: '登录成功',
    EXPIRED: '二维码已过期',
    CANCELED: '已取消',
    ERROR: '登录失败',
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '昵称', dataIndex: 'nickname' },
    { title: '闲鱼UID', dataIndex: 'xianyuUid' },
    {
      title: '状态',
      dataIndex: 'status',
      render: (s: string) => (
        <Tag color={statusColor[s] || 'default'}>
          {s === 'expired' ? '已过期' : s}
        </Tag>
      ),
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 80,
      render: (enabled: boolean, row: any) => (
        <Switch
          checked={enabled}
          size="small"
          onChange={(checked) => handleToggleEnabled(row.id, checked)}
        />
      ),
    },
    {
      title: '操作',
      render: (_: any, row: any) => (
        <Space>
          {row.status === 'expired' && (
            <Button size="small" type="primary" onClick={() => startQrLogin(row.id)}>
              重新登录
            </Button>
          )}
          <Button size="small" onClick={() => handleHealthCheck(row.id)}>
            检测Cookie
          </Button>
          <Button size="small" onClick={() => startQrLogin(row.id)}>
            扫码更新
          </Button>
          <Button size="small" onClick={() => setCookieModal({ id: row.id })}>
            粘贴Cookie
          </Button>
          <Popconfirm title="确定删除该账号？" onConfirm={() => handleDelete(row.id)}>
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={4}>闲鱼账号管理</Typography.Title>
      {expiredCount > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`有 ${expiredCount} 个账号 Cookie 已过期，请重新扫码登录`}
        />
      )}
      <Card
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={refresh}>
              刷新
            </Button>
            <Button icon={<QrcodeOutlined />} onClick={() => startQrLogin()}>
              扫码登录
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              手动添加
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={false}
        />
      </Card>

      <Modal
        title="扫码登录闲鱼"
        open={!!qrModal}
        onCancel={closeQrModal}
        footer={
          <Space>
            {['EXPIRED', 'CANCELED', 'ERROR'].includes(qrStatus) && (
              <Button type="primary" onClick={() => startQrLogin(qrModal?.accountId)}>
                重新获取
              </Button>
            )}
            <Button onClick={closeQrModal}>关闭</Button>
          </Space>
        }
        width={420}
        destroyOnClose
      >
        <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
          {qrLoading ? (
            <Spin tip="生成二维码中..." />
          ) : qrContent ? (
            <QRCode value={qrContent} size={220} />
          ) : (
            <Alert type="error" message={qrMessage || '二维码生成失败'} showIcon />
          )}
          <div style={{ marginTop: 16 }}>
            <Tag color={qrStatus === 'CONFIRMED' ? 'success' : 'processing'}>
              {qrStatusText[qrStatus] || qrStatus}
            </Tag>
          </div>
          {qrMessage && (
            <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
              {qrMessage}
            </Typography.Paragraph>
          )}
          <Typography.Paragraph type="secondary" style={{ marginTop: 12, fontSize: 12 }}>
            打开闲鱼 App → 左上角扫一扫 → 扫描上方二维码 → 在手机上确认登录
          </Typography.Paragraph>
        </div>
      </Modal>

      <Modal
        title="手动添加闲鱼账号"
        open={modalOpen}
        onOk={handleAdd}
        onCancel={() => setModalOpen(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="nickname" label="昵称" rules={[{ required: true }]}>
            <Input placeholder="如：小明的闲鱼店" />
          </Form.Item>
          <Form.Item name="xianyuUid" label="闲鱼UID" rules={[{ required: true }]}>
            <Input placeholder="闲鱼用户ID（unb）" />
          </Form.Item>
          <Form.Item
            name="cookie"
            label="Cookie"
            rules={[{ required: true }, { min: 50 }]}
            tooltip="从浏览器开发者工具复制完整的 Cookie 字符串"
          >
            <Input.TextArea rows={6} placeholder="粘贴完整 Cookie..." />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="粘贴 Cookie 更新"
        open={!!cookieModal}
        onOk={handleUpdateCookie}
        onCancel={() => setCookieModal(null)}
        width={600}
      >
        <Form form={cookieForm} layout="vertical">
          <Form.Item name="cookie" label="新 Cookie" rules={[{ required: true }]}>
            <Input.TextArea rows={6} placeholder="粘贴新的 Cookie..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
