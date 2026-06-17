import { useEffect, useState } from 'react';
import { Layout, Menu, theme, Avatar, Space, Typography } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  ShoppingOutlined,
  KeyOutlined,
  OrderedListOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

const { Header, Sider, Content } = Layout;

/**
 * 主布局：侧边栏导航 + 顶部用户信息 + 内容区。
 */
export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const {
    token: { colorBgContainer },
  } = theme.useToken();

  const user = JSON.parse(localStorage.getItem('user') || 'null');

  useEffect(() => {
    if (!localStorage.getItem('accessToken')) {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  const menuItems = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
    { key: '/accounts', icon: <UserOutlined />, label: '闲鱼账号' },
    { key: '/products', icon: <ShoppingOutlined />, label: '商品规则' },
    { key: '/kami', icon: <KeyOutlined />, label: '卡密池' },
    { key: '/orders', icon: <OrderedListOutlined />, label: '订单日志' },
  ];

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    navigate('/login', { replace: true });
  };

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
          }}
        >
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
