import { useCallback, useEffect, useState } from 'react';
import { Badge, Layout, Menu, theme, Avatar, Space, Typography, Tooltip } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  ShoppingOutlined,
  KeyOutlined,
  OrderedListOutlined,
  LogoutOutlined,
  WifiOutlined,
  SettingOutlined,
  MessageOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { apiPath } from '../api/config';
import { wsClient, type WsStatus } from '../api/ws';

const { Header, Sider, Content } = Layout;

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
  const {
    token: { colorBgContainer },
  } = theme.useToken();

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

  const menuItems = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
    { key: '/accounts', icon: <UserOutlined />, label: '闲鱼账号' },
    { key: '/products', icon: <ShoppingOutlined />, label: '商品规则' },
    { key: '/kami', icon: <KeyOutlined />, label: '卡密池' },
    { key: '/orders', icon: <OrderedListOutlined />, label: '订单日志' },
    { key: '/auto-reply', icon: <MessageOutlined />, label: '自动回复' },
    { key: '/license', icon: <SafetyCertificateOutlined />, label: '激活码' },
    { key: '/profile', icon: <SettingOutlined />, label: '个人中心' },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
        <div
          style={{
            height: 48,
            margin: 12,
            color: '#fff',
            textAlign: 'center',
            lineHeight: '48px',
            fontWeight: 600,
            fontSize: 16,
          }}
        >
          {collapsed ? '闲' : '闲鱼自动发货'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 24px',
            background: colorBgContainer,
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <Tooltip title={statusMeta[wsStatus].text}>
            <Badge
              status={wsStatus === 'connected' ? 'success' : wsStatus === 'connecting' ? 'processing' : 'error'}
            />
            <WifiOutlined style={{ color: statusMeta[wsStatus].color }} />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {statusMeta[wsStatus].text}
            </Typography.Text>
          </Tooltip>
          <Space>
            <Avatar icon={<UserOutlined />} />
            <Typography.Text>{user?.nickname || user?.username}</Typography.Text>
            <Typography.Link onClick={handleLogout}>
              <LogoutOutlined /> 退出
            </Typography.Link>
          </Space>
        </Header>
        <Content style={{ margin: 16 }}>
          <div
            style={{
              padding: 24,
              minHeight: 360,
              background: colorBgContainer,
              borderRadius: 8,
            }}
          >
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
