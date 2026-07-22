import { useEffect, useState } from 'react';
import {
  Avatar,
  Layout,
  Menu,
  Select,
  Space,
  Typography,
  message,
} from 'antd';
import {
  AppstoreOutlined,
  DashboardOutlined,
  MailOutlined,
  ProjectOutlined,
  FileTextOutlined,
  ApartmentOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

const { Header, Sider, Content } = Layout;

const SISTER_APP_URL =
  import.meta.env.VITE_SISTER_APP_URL || 'http://localhost:5173';

const SYSTEM_OPTIONS = [
  { value: 'research', label: '项目研究系统' },
  { value: 'xianyu', label: '闲鱼自动发货系统' },
];

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '今日概览' },
  { key: '/emails', icon: <MailOutlined />, label: '邮件流水' },
  { key: '/projects', icon: <ProjectOutlined />, label: '项目卡片库' },
  { key: '/reports', icon: <FileTextOutlined />, label: '每日报告' },
  { key: '/pipeline', icon: <ApartmentOutlined />, label: 'Agent 流水线' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
  { key: '/profile', icon: <UserOutlined />, label: '个人中心' },
];

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const user = JSON.parse(localStorage.getItem('research_user') || 'null');

  useEffect(() => {
    if (!localStorage.getItem('research_token')) {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('from') === 'switch') {
      message.info('已从闲鱼自动发货系统切换过来（原型登录态独立）');
      params.delete('from');
      const next = `${location.pathname}${params.toString() ? `?${params}` : ''}`;
      navigate(next, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  const handleSystemSwitch = (value: string) => {
    if (value === 'xianyu') {
      const url = new URL(SISTER_APP_URL);
      url.pathname = '/dashboard';
      url.searchParams.set('from', 'switch');
      window.location.href = url.toString();
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('research_token');
    localStorage.removeItem('research_user');
    navigate('/login', { replace: true });
  };

  const selectedKey =
    menuItems.find((m) => location.pathname.startsWith(m.key))?.key ||
    location.pathname;

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
            研
          </div>
          {!collapsed && (
            <span style={{ fontSize: 15, fontWeight: 600, color: '#0F172A' }}>
              项目研究
            </span>
          )}
        </div>
        <Menu
          mode="inline"
          theme="light"
          selectedKeys={[selectedKey]}
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
              value="research"
              options={SYSTEM_OPTIONS}
              onChange={handleSystemSwitch}
              style={{ width: 200 }}
              popupMatchSelectWidth={false}
              aria-label="管理系统切换"
            />
          </Space>
          <Space>
            <Avatar size={28} style={{ background: '#4F46E5' }} icon={<UserOutlined />} />
            <Typography.Text style={{ color: '#334155' }}>
              {user?.nickname || user?.username || 'demo'}
            </Typography.Text>
            <Typography.Link onClick={handleLogout} style={{ color: '#64748B', fontSize: 13 }}>
              <LogoutOutlined /> 退出
            </Typography.Link>
          </Space>
        </Header>
        <Content style={{ padding: 24, minHeight: 360 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
