import { useState, useCallback, useRef } from 'react';
import { Button, Card, Form, Input, Typography, message } from 'antd';
import { ExperimentOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';

/**
 * 登录页。注册入口隐藏：左下角透明区域连点 7 次呼出（与闲鱼前端一致）。
 */
export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [eggCount, setEggCount] = useState(0);
  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();
  const submittingRef = useRef(false);

  const persistUser = (username: string) => {
    localStorage.setItem(
      'research_user',
      JSON.stringify({ username, nickname: username }),
    );
  };

  const formatAuthError = (msg: string) => {
    if (/已被注册|已存在|already/i.test(msg)) {
      return '该用户名已注册，请直接登录';
    }
    return msg;
  };

  const handleLogin = async (values: { username: string; password: string }) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    try {
      await authApi.login(values.username, values.password);
      persistUser(values.username);
      message.success('登录成功');
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      message.error(formatAuthError((err as Error).message || '登录失败'));
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const handleRegister = async (values: { username: string; password: string }) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    try {
      await authApi.register(values.username, values.password);
      persistUser(values.username);
      message.success('注册成功');
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      const msg = formatAuthError((err as Error).message || '注册失败');
      if (msg.includes('请直接登录')) {
        message.warning(msg);
        setShowRegister(false);
        loginForm.setFieldsValue({ username: values.username });
      } else {
        message.error(msg);
      }
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const handleEggClick = useCallback(() => {
    setEggCount((prev) => {
      const next = prev + 1;
      if (next >= 7) {
        setShowRegister(true);
        message.info({ content: '注册通道已开启', duration: 2 });
        return 0;
      }
      return next;
    });
  }, []);

  return (
    <div
      style={{
        position: 'relative',
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

        {showRegister ? (
          <>
            <Form form={registerForm} layout="vertical" onFinish={handleRegister}>
              <Form.Item
                name="username"
                label="用户名"
                rules={[
                  { required: true, message: '请输入用户名' },
                  { min: 3, message: '至少 3 个字符' },
                ]}
              >
                <Input prefix={<UserOutlined />} placeholder="用户名" />
              </Form.Item>
              <Form.Item
                name="password"
                label="密码"
                rules={[
                  { required: true, message: '请输入密码' },
                  { min: 6, message: '至少 6 位' },
                ]}
              >
                <Input.Password prefix={<LockOutlined />} placeholder="密码" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                注册
              </Button>
            </Form>
            <Button
              type="link"
              block
              style={{ marginTop: 4, color: '#888' }}
              onClick={() => {
                setShowRegister(false);
                registerForm.resetFields();
              }}
            >
              ← 返回登录
            </Button>
          </>
        ) : (
          <Form form={loginForm} layout="vertical" onFinish={handleLogin}>
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
        )}
      </Card>

      {/* 彩蛋：左下角透明可点区域，连点 7 次呼出注册 */}
      <button
        type="button"
        onClick={handleEggClick}
        aria-label="."
        tabIndex={-1}
        style={{
          position: 'fixed',
          left: 0,
          bottom: 0,
          width: 60,
          height: 60,
          opacity: 0,
          background: 'transparent',
          border: 'none',
          cursor: 'default',
          zIndex: 9999,
          outline: 'none',
        }}
      />
    </div>
  );
}
