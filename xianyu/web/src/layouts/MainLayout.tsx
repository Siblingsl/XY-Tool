import { useCallback, useEffect, useState } from 'react';
import { Badge, Layout, Menu, Avatar, Space, Typography, Tooltip, Select } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  ShoppingOutlined,
  KeyOutlined,
  OrderedListOutlined,
  LogoutOutlined,
  SettingOutlined,
  MessageOutlined,
  SafetyCertificateOutlined,
  FormOutlined,
  RobotOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { apiPath } from '../api/config';
import { wsClient, type WsStatus } from '../api/ws';

const { Header, Sider, Content } = Layout;

const SISTER_APP_URL =
  import.meta.env.VITE_SISTER_APP_URL || 'http://localhost:5174';

const SYSTEM_OPTIONS = [
  { value: 'xianyu', label: '闲鱼自动发货系统' },
  { value: 'research', label: '项目研究系统' },
];

const statusMeta: Record<WsStatus, { color: string; text: string }> = {
  connected: { color: '#52c41a', text: '已连接' },
  connecting: { color: '#faad14', text: '连接中...' },
  disconnected: { color: '#ff4d4f', text: '未连接' },
};

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [wsStatus, setWsStatus] = useState<WsStatus>(wsClient.status);

  const user = JSON.parse(localStorage.getItem('user') || 'null');

  // WS 生命周期：已登录时连接，登出时断开
  useEffect(() => {
    if (localStorage.getItem('accessToken')) {
      wsClient.connect();
    }
    const off = wsClient.onStatus(setWsStatus);
    return () => {
      off();
      wsClient.disconnect();
    };
  }, []);

  // storage 事件监听（401 拦截器刷新 token 后自动重连 WS）
  const handleStorage = useCallback((e: StorageEvent) => {
    if (e.key === 'accessToken' && e.newValue) {
      wsClient.disconnect();
      wsClient.connect();
    }
  }, []);
  useEffect(() => {
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [handleStorage]);

  useEffect(() => {
    if (!localStorage.getItem('accessToken')) {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  const handleLogout = async () => {
    const rt = localStorage.getItem('refreshToken');
    try {
      await fetch(apiPath('/auth/logout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
    } catch { /* ignore */ }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    navigate('/login', { replace: true });
  };

  const handleSystemSwitch = (value: string) => {
    if (value === 'research') {
      const url = new URL(SISTER_APP_URL);
      url.pathname = '/dashboard';
      url.searchParams.set('from', 'switch');
      window.location.href = url.toString();
    }
  };

  const menuItems = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
    { key: '/accounts', icon: <UserOutlined />, label: '闲鱼账号' },
    { key: '/products', icon: <ShoppingOutlined />, label: '商品规则' },
    { key: '/listing-rewrite', icon: <FormOutlined />, label: '爆款仿写' },
    { key: '/kami', icon: <KeyOutlined />, label: '卡密池' },
    { key: '/orders', icon: <OrderedListOutlined />, label: '订单日志' },
    { key: '/auto-reply', icon: <MessageOutlined />, label: '自动回复' },
    { key: '/ai-settings', icon: <RobotOutlined />, label: 'AI 接入' },
    { key: '/license', icon: <SafetyCertificateOutlined />, label: '激活码' },
    { key: '/profile', icon: <SettingOutlined />, label: '个人中心' },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="light"
        width={240}
        style={{
          borderRight: '1px solid #E2E8F0',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
        }}
      >
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            borderBottom: '1px solid #F1F5F9',
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: '#4F46E5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            闲
          </div>
          {!collapsed && (
            <span style={{ fontSize: 15, fontWeight: 600, color: '#0F172A' }}>
              闲鱼自动发货
            </span>
          )}
        </div>
        <Menu
          mode="inline"
          theme="light"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ border: 'none', padding: '8px 12px' }}
        />
      </Sider>
      <Layout style={{ marginLeft: collapsed ? 80 : 240, transition: 'margin-left 0.2s' }}>
        <Header
          style={{
            padding: '0 24px',
            background: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            height: 56,
            lineHeight: '56px',
            borderBottom: '1px solid #E2E8F0',
            position: 'sticky',
            top: 0,
            zIndex: 99,
          }}
        >
          <Space>
            <AppstoreOutlined style={{ color: '#4F46E5' }} />
            <Select
              value="xianyu"
              options={SYSTEM_OPTIONS}
              onChange={handleSystemSwitch}
              style={{ width: 200 }}
              popupMatchSelectWidth={false}
              aria-label="管理系统切换"
            />
          </Space>
          <Space size="middle">
            <Tooltip title={statusMeta[wsStatus].text}>
              <Space size={4}>
                <Badge
                  status={wsStatus === 'connected' ? 'success' : wsStatus === 'connecting' ? 'processing' : 'error'}
                />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {statusMeta[wsStatus].text}
                </Typography.Text>
              </Space>
            </Tooltip>
            <Space>
              <Avatar size={28} style={{ background: '#4F46E5' }} icon={<UserOutlined />} />
              <Typography.Text style={{ color: '#334155' }}>
                {user?.nickname || user?.username}
              </Typography.Text>
              <Typography.Link onClick={handleLogout} style={{ color: '#64748B', fontSize: 13 }}>
                <LogoutOutlined /> 退出
              </Typography.Link>
            </Space>
          </Space>
        </Header>
        <Content style={{ padding: 24, minHeight: 360 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
