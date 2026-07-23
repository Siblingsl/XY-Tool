import { useCallback, useEffect, useState } from 'react';
import {
  Avatar, Badge, Button, Drawer, Layout, Menu, Select, Space, Tooltip, Typography,
} from 'antd';
import {
  AppstoreOutlined, DashboardOutlined, FormOutlined, KeyOutlined,
  LogoutOutlined, MenuOutlined, MessageOutlined, MoonOutlined, OrderedListOutlined,
  RobotOutlined, SafetyCertificateOutlined, SettingOutlined, ShoppingOutlined,
  SunOutlined, UserOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import api from '../api';
import { apiPath } from '../api/config';
import { wsClient, type WsStatus } from '../api/ws';
import { useTheme } from '../context/ThemeContext';

const { Header, Sider, Content } = Layout;

const SISTER_APP_URL =
  import.meta.env.VITE_SISTER_APP_URL || 'http://localhost:5174';

const SYSTEM_OPTIONS = [
  { value: 'xianyu', label: '闲鱼自动发货系统' },
  { value: 'research', label: '项目研究系统' },
];

const statusMeta: Record<WsStatus, { text: string; dotClass: string }> = {
  connected: { text: '已连接', dotClass: 'connected' },
  connecting: { text: '连接中...', dotClass: 'connecting' },
  disconnected: { text: '未连接', dotClass: 'disconnected' },
};

const MOBILE_QUERY = '(max-width: 820px)';

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { mode, toggle } = useTheme();

  const [collapsed, setCollapsed] = useState(false);
  const [wsStatus, setWsStatus] = useState<WsStatus>(wsClient.status);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);

  const user = JSON.parse(localStorage.getItem('user') || 'null');

  // 响应式：监听断点（<820px 用抽屉式导航）
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

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

  // 401 路由守卫：未登录跳登录页
  useEffect(() => {
    if (!localStorage.getItem('accessToken')) {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  // 导航角标：订单待处理数 + 卡密低库存数（仅用于视觉角标，不影响原有业务）
  useEffect(() => {
    let alive = true;
    const loadBadges = async () => {
      try {
        const [stats, stock]: any = await Promise.all([
          api.get('/orders/stats').catch(() => ({})),
          api.get('/kami/low-stock').catch(() => []),
        ]);
        if (!alive) return;
        setPending(stats?.PENDING || 0);
        setLowStockCount(Array.isArray(stock) ? stock.length : 0);
      } catch {
        /* ignore */
      }
    };
    if (localStorage.getItem('accessToken')) loadBadges();
    const offStatus = wsClient.on('order:status', loadBadges);
    const offCreated = wsClient.on('order:created', loadBadges);
    const offStock = wsClient.on('kami:lowstock', (items: any) => {
      setLowStockCount(Array.isArray(items) ? items.length : 0);
    });
    return () => {
      alive = false;
      offStatus();
      offCreated();
      offStock();
    };
  }, []);

  const handleLogout = async () => {
    const rt = localStorage.getItem('refreshToken');
    try {
      await fetch(apiPath('/auth/logout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
    } catch {
      /* ignore */
    }
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

  const handleNavigate = (key: string) => {
    navigate(key);
    if (isMobile) setDrawerOpen(false);
  };

  // 带角标的菜单项标签
  const badgeLabel = (text: string, count?: number) => (
    <span className="menu-item-row">
      <span>{text}</span>
      {count ? (
        <Badge
          count={count}
          size="small"
          style={{ backgroundColor: 'var(--warn)', boxShadow: 'none' }}
        />
      ) : null}
    </span>
  );

  // 信息架构分组（design-system.md §四）
  const menuItems = [
    {
      key: 'g-overview',
      icon: <DashboardOutlined />,
      label: '总览',
      children: [{ key: '/dashboard', icon: <DashboardOutlined />, label: '经营概览' }],
    },
    {
      key: 'g-fulfill',
      icon: <ShoppingOutlined />,
      label: '发货管理',
      children: [
        { key: '/accounts', icon: <UserOutlined />, label: '闲鱼账号' },
        { key: '/products', icon: <ShoppingOutlined />, label: '商品规则' },
        { key: '/kami', icon: <KeyOutlined />, label: badgeLabel('卡密池', lowStockCount) },
        {
          key: '/orders',
          icon: <OrderedListOutlined />,
          label: badgeLabel('订单日志', pending),
        },
      ],
    },
    {
      key: 'g-ops',
      icon: <RobotOutlined />,
      label: '智能运营',
      children: [
        { key: '/auto-reply', icon: <MessageOutlined />, label: '自动回复' },
        { key: '/ai-settings', icon: <RobotOutlined />, label: 'AI 接入' },
        { key: '/listing-rewrite', icon: <FormOutlined />, label: '爆款仿写' },
      ],
    },
    {
      key: 'g-asset',
      icon: <SafetyCertificateOutlined />,
      label: '资产与授权',
      children: [
        { key: '/license', icon: <SafetyCertificateOutlined />, label: '激活码' },
      ],
    },
    {
      key: 'g-system',
      icon: <SettingOutlined />,
      label: '系统',
      children: [{ key: '/profile', icon: <SettingOutlined />, label: '个人中心' }],
    },
  ];

  const renderNav = () => (
    <>
      <div className="layout-logo">
        <div className="brandmark">闲</div>
        <span className="layout-logo-text">闲鱼自动发货</span>
      </div>
      <Menu
        mode="inline"
        selectedKeys={[location.pathname]}
        items={menuItems}
        onClick={({ key }) => {
          if (!key.startsWith('g-')) handleNavigate(key);
        }}
        style={{ border: 'none', padding: '8px 12px', background: 'transparent' }}
      />
    </>
  );

  const wsMeta = statusMeta[wsStatus];
  const wsPill = (
    <Tooltip title={wsMeta.text}>
      <span className="ws-pill">
        <span className={`ws-dot ${wsMeta.dotClass}`} />
        <span>{wsMeta.text}</span>
      </span>
    </Tooltip>
  );

  const header = (
    <Header
      style={{
        padding: '0 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
        height: 56,
        lineHeight: '56px',
        position: 'sticky',
        top: 0,
        zIndex: 99,
      }}
    >
      <Space>
        {isMobile && (
          <Button
            type="text"
            aria-label="菜单"
            icon={<MenuOutlined />}
            onClick={() => setDrawerOpen(true)}
          />
        )}
        <AppstoreOutlined style={{ color: 'var(--brand-600)' }} />
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
        {wsPill}
        <Button
          type="text"
          aria-label={mode === 'dark' ? '切换为亮色' : '切换为暗色'}
          icon={mode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
          onClick={toggle}
          style={{ color: 'var(--ink-2)' }}
        />
        <Space>
          <Avatar size={28} style={{ background: 'var(--brand-600)' }} icon={<UserOutlined />} />
          <Typography.Text style={{ color: 'var(--ink)' }}>
            {user?.nickname || user?.username}
          </Typography.Text>
          <Typography.Link
            onClick={handleLogout}
            style={{ color: 'var(--ink-2)', fontSize: 13 }}
          >
            <LogoutOutlined /> 退出
          </Typography.Link>
        </Space>
      </Space>
    </Header>
  );

  // 移动端：抽屉式侧栏
  if (isMobile) {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        {header}
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={248}
          styles={{ body: { padding: 0 }, header: { display: 'none' } }}
          zIndex={200}
        >
          {renderNav()}
        </Drawer>
        <Content style={{ padding: 16, minHeight: 360 }}>
          <Outlet />
        </Content>
      </Layout>
    );
  }

  // 桌面端：固定侧栏
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={248}
        style={{
          borderRight: '1px solid var(--border)',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
        }}
      >
        {renderNav()}
      </Sider>
      <Layout style={{ marginLeft: collapsed ? 80 : 248, transition: 'margin-left 0.2s' }}>
        {header}
        <Content style={{ padding: 24, minHeight: 360 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
