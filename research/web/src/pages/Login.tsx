import { useState } from 'react';
import { Button, Card, Form, Input, Typography, message } from 'antd';
import { ExperimentOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';

/**
 * 登录页：调用真实后端 /api/auth/login。
 */
export default function Login() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleLogin = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const data = await authApi.login(values.username, values.password);
      localStorage.setItem(
        'research_user',
        JSON.stringify({ username: values.username, nickname: values.username }),
      );
      message.success('登录成功啦啦啦啦啦啦啦啦啦啦啦阿联');
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      message.error(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(circle at 20% 20%, #ccfbf1 0%, transparent 40%), radial-gradient(circle at 80% 0%, #99f6e4 0%, transparent 35%), linear-gradient(160deg, #134e4a 0%, #0f766e 45%, #115e59 100%)',
        padding: 24,
      }}
    >
      <Card style={{ width: 400, boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <ExperimentOutlined style={{ fontSize: 36, color: '#0f766e' }} />
          <Typography.Title level={3} style={{ marginTop: 12, marginBottom: 4 }}>
            项目研究系统
          </Typography.Title>
          <Typography.Text type="secondary">
            从邮件中发现投资/副业/SaaS 机会
          </Typography.Text>
        </div>
        <Form form={form} layout="vertical" onFinish={handleLogin}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={loading}>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  );
}
