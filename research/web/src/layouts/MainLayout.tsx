import { useEffect, useState } from 'react';
import {
  Avatar,
  Button,
  Drawer,
  Layout,
  Menu,
  Select,
  Space,
  Tooltip,
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
  ExperimentOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuOutlined,
  MoonOutlined,
  SunOutlined,
  BranchesOutlined,
  GlobalOutlined,
  SwapOutlined,
  EyeOutlined,
  RobotOutlined,
  ReadOutlined,
  CloudDownloadOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import NotificationBell from '../components/NotificationBell';

const { Header, Sider, Content } = Layout;

const SISTER_APP_URL =
  import.meta.env.VITE_SISTER_APP_URL || 'http://localhost:5173';

const SYSTEM_OPTIONS = [
  { value: 'research', label: '项目研究系统' },
  { value: 'xianyu', label: '闲鱼自动发货系统' },
];

// 叶子菜单 key（用于高亮匹配，含 /projects/:id）
const LEAF_KEYS = [
  '/dashboard',
  '/emails',
  '/projects',
  '/reports',
  '/pipeline',
  '/skills',
  '/clusters',
  '/maturity',
  '/sources',
  '/compare',
  '/workbench',
  '/settings',
  '/profile',
  '/competitor-watch',
  '/automation-rules',
  '/knowledge',
  '/scrape',
];

const MOBILE_QUERY = '(max-width: 820px)';

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { mode, toggle } = useTheme();

  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  const user = JSON.parse(localStorage.getItem('research_user') || 'null');

  // 响应式：监听断点（<820px 用抽屉式导航）
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // 路由守卫：未登录跳登录页（research 独立登录态）
  useEffect(() => {
    if (!localStorage.getItem('research_token')) {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  // 姊妹系统切换提示（保留 from=switch 逻辑，不破坏独立登录态）
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

  const handleNavigate = (key: string) => {
    navigate(key);
    if (isMobile) setDrawerOpen(false);
  };

  // 信息架构分组（design-system.md §四）
  const menuItems = [
    {
      key: 'g-overview',
      icon: <DashboardOutlined />,
      label: '总览',
      children: [{ key: '/dashboard', icon: <DashboardOutlined />, label: '今日概览' }],
    },
    {
      key: 'g-research',
      icon: <AppstoreOutlined />,
      label: '研究数据',
      children: [
        { key: '/emails', icon: <MailOutlined />, label: '邮件流水' },
        { key: '/projects', icon: <ProjectOutlined />, label: '项目卡片库' },
        { key: '/reports', icon: <FileTextOutlined />, label: '每日报告' },
        { key: '/pipeline', icon: <ApartmentOutlined />, label: 'Agent 流水线' },
        { key: '/skills', icon: <ExperimentOutlined />, label: 'AI 技能' },
        { key: '/clusters', icon: <ApartmentOutlined />, label: '聚类视图' },
        { key: '/maturity', icon: <BranchesOutlined />, label: '成熟度看板' },
        { key: '/sources', icon: <GlobalOutlined />, label: '来源画像' },
        { key: '/compare', icon: <SwapOutlined />, label: '项目对比' },
        { key: '/workbench', icon: <DashboardOutlined />, label: '个人工作台' },
        { key: '/knowledge', icon: <ReadOutlined />, label: '知识库' },
        { key: '/scrape', icon: <CloudDownloadOutlined />, label: '信息采集' },
      ],
    },
    {
      key: 'g-system',
      icon: <SettingOutlined />,
      label: '系统',
      children: [
        { key: '/settings', icon: <SettingOutlined />, label: '设置' },
        { key: '/profile', icon: <UserOutlined />, label: '个人中心' },
      ],
    },
    {
      key: 'g-ops',
      icon: <RobotOutlined />,
      label: '智能运营',
      children: [
        { key: '/competitor-watch', icon: <EyeOutlined />, label: '竞品监控' },
        { key: '/automation-rules', icon: <RobotOutlined />, label: '自动化规则' },
      ],
    },
  ];

  const renderNav = () => (
    <>
      <div className="layout-logo">
        <div className="brandmark">研</div>
        <span className="layout-logo-text">项目研究</span>
      </div>
      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        items={menuItems}
        onClick={({ key }) => {
          if (!key.startsWith('g-')) handleNavigate(key);
        }}
        style={{ border: 'none', padding: '8px 12px', background: 'transparent' }}
      />
    </>
  );

  const selectedKey =
    LEAF_KEYS.find(
      (k) => location.pathname === k || location.pathname.startsWith(`${k}/`),
    ) || '/dashboard';

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
          <Tooltip title="菜单">
            <Button
              type="text"
              aria-label="菜单"
              icon={<MenuOutlined />}
              onClick={() => setDrawerOpen(true)}
              style={{ color: 'var(--ink-2)' }}
            />
          </Tooltip>
        )}
        <AppstoreOutlined style={{ color: 'var(--brand-600)' }} />
        <Select
          value="research"
          options={SYSTEM_OPTIONS}
          onChange={handleSystemSwitch}
          style={{ width: 200 }}
          popupMatchSelectWidth={false}
          aria-label="管理系统切换"
        />
      </Space>
      <Space size="middle">
        <Tooltip title={mode === 'dark' ? '切换为亮色' : '切换为暗色'}>
          <Button
            type="text"
            aria-label={mode === 'dark' ? '切换为亮色' : '切换为暗色'}
            icon={mode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
            onClick={toggle}
            style={{ color: 'var(--ink-2)' }}
          />
        </Tooltip>
        <NotificationBell />
        <Space>
          <Avatar size={28} style={{ background: 'var(--brand-600)' }} icon={<UserOutlined />} />
          <Typography.Text style={{ color: 'var(--ink)' }}>
            {user?.nickname || user?.username || 'demo'}
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
