import { useEffect, useState } from 'react';
import {
  Avatar,
  Layout,
  Menu,
  Select,
  Space,
  theme,
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
  const {
    token: { colorBgContainer },
  } = theme.useToken();

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
        style={{ background: '#134e4a' }}
        theme="dark"
      >
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
          {collapsed ? '研' : '项目研究'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ background: '#134e4a' }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 24px',
            background: colorBgContainer,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <Space>
            <AppstoreOutlined style={{ color: '#0f766e' }} />
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
            <Avatar
              style={{ background: '#0f766e' }}
              icon={<UserOutlined />}
            />
            <Typography.Text>
              {user?.nickname || user?.username || 'demo'}
            </Typography.Text>
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
