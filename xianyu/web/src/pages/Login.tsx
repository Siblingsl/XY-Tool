import { useState, useCallback, useRef, type CSSProperties } from 'react';
import { Form, Input, Button, Typography, message } from 'antd';
import {
  LockOutlined,
  UserOutlined,
  ShopOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../api';

/**
 * 登录/注册页。
 *
 * 业务逻辑（保持原样）：
 *   handleLogin / handleRegister 调 /auth/* 接口，成功存 token 跳首页；
 *   persistAuth / formatAuthError 处理凭证与错误文案；
 *   彩蛋：左下角隐藏按钮连点 7 次动态呼出注册表单。
 *
 * 视觉重做：左右分栏（左品牌暖墨面板 + 右白卡表单），移动端上下堆叠。
 */
export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [eggCount, setEggCount] = useState(0);
  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();
  const submittingRef = useRef(false);

  const persistAuth = (res: {
    accessToken?: string;
    refreshToken?: string;
    user?: unknown;
  }) => {
    if (!res?.accessToken || !res?.refreshToken) {
      throw new Error('未获取到登录凭证，请重试或直接登录');
    }
    localStorage.setItem('accessToken', res.accessToken);
    localStorage.setItem('refreshToken', res.refreshToken);
    localStorage.setItem('user', JSON.stringify(res.user ?? {}));
  };

  const formatAuthError = (message: string) => {
    if (/已被注册|已存在|already/i.test(message)) {
      return '该用户名已注册，请直接登录';
    }
    return message;
  };

  // ============ 业务逻辑（保持原样） ============

  const handleLogin = async (values: { username: string; password: string }) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    try {
      const res: any = await api.post('/auth/login', values);
      persistAuth(res);
      message.success('登录成功');
      navigate('/dashboard', { replace: true });
    } catch (e) {
      message.error(formatAuthError((e as Error).message));
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const handleRegister = async (values: {
    username: string;
    password: string;
    nickname?: string;
  }) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    try {
      const res: any = await api.post('/auth/register', values);
      persistAuth(res);
      message.success('注册成功');
      navigate('/dashboard', { replace: true });
    } catch (e) {
      const msg = formatAuthError((e as Error).message);
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

  // ============ 彩蛋：隐藏按钮连点 7 次 ============

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

  // ============ 表单（结构保持原样） ============

  const LoginForm = (
    <Form form={loginForm} onFinish={handleLogin} layout="vertical" size="large">
      <Form.Item
        name="username"
        rules={[{ required: true, message: '请输入用户名' }]}
      >
        <Input prefix={<UserOutlined />} placeholder="用户名" allowClear />
      </Form.Item>
      <Form.Item
        name="password"
        rules={[{ required: true, message: '请输入密码' }]}
      >
        <Input.Password prefix={<LockOutlined />} placeholder="密码" />
      </Form.Item>
      <Button
        type="primary"
        htmlType="submit"
        block
        loading={loading}
        style={{ height: 44, borderRadius: 8, fontWeight: 500 }}
      >
        登 录
      </Button>
    </Form>
  );

  const RegisterForm = (
    <Form form={registerForm} onFinish={handleRegister} layout="vertical" size="large">
      <Form.Item
        name="username"
        rules={[
          { required: true, message: '请输入用户名' },
          { min: 3, message: '至少 3 个字符' },
        ]}
      >
        <Input prefix={<UserOutlined />} placeholder="用户名" allowClear />
      </Form.Item>
      <Form.Item name="nickname" label="昵称（可选）">
        <Input placeholder="展示昵称" allowClear />
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
      <Button
        type="primary"
        htmlType="submit"
        block
        loading={loading}
        style={{ height: 44, borderRadius: 8, fontWeight: 500 }}
      >
        注 册
      </Button>
    </Form>
  );

  // ============ 渲染（左右分栏） ============

  return (
    <div className="lp-page">
      {/* 左：品牌暖墨面板 */}
      <aside className="lp-hero">
        <div className="lp-inner">
          <div>
            <span className="lp-badge">● 虚拟商品自动发货中台</span>
            <h2>
              让发货
              <br />
              自己跑起来
            </h2>
            <p>卡密、链接、激活码全自动发出，AI 客服 7×24 接待，营收一眼看清。</p>
            <div className="lp-feats">
              <div className="lp-feat">
                <div className="fi">⚡</div>
                <div>
                  <b>云端自动发货</b>
                  <span>买家下单即触发，IM 自动推送卡密/链接，失败自动重试。</span>
                </div>
              </div>
              <div className="lp-feat">
                <div className="fi">🤖</div>
                <div>
                  <b>智能客服</b>
                  <span>关键词 + AI 回复，支持转人工与冷却，解放双手。</span>
                </div>
              </div>
              <div className="lp-feat">
                <div className="fi">🎫</div>
                <div>
                  <b>激活码中台</b>
                  <span>批量生成、库存预警、对外验证 API，一码多用。</span>
                </div>
              </div>
            </div>
          </div>
          <div className="lp-mini">
            <div className="m">
              <b className="num">1,196</b>
              <span>近 7 天已发货</span>
            </div>
            <div className="m">
              <b className="num">99.3%</b>
              <span>发货成功率</span>
            </div>
            <div className="m">
              <b className="num">¥24.9k</b>
              <span>近 30 天营收</span>
            </div>
          </div>
        </div>
      </aside>

      {/* 右：表单卡片 */}
      <main className="lp-formside">
        <div className="lp-formcard">
          <div className="lp-mark">闲</div>
          <h3>欢迎回来</h3>
          <p className="lp-sub">登录以管理你的自动发货控制台</p>

          <div>
            {showRegister ? (
              <>
                {RegisterForm}
                <Button
                  type="link"
                  block
                  style={{ marginTop: 4, color: 'var(--ink-2)' }}
                  onClick={() => {
                    setShowRegister(false);
                    registerForm.resetFields();
                  }}
                >
                  ← 返回登录
                </Button>
              </>
            ) : (
              LoginForm
            )}
          </div>

          <Typography.Text
            style={{
              display: 'block',
              textAlign: 'center',
              marginTop: 18,
              color: 'var(--ink-2)',
              fontSize: 12,
            }}
          >
            © 2026 闲鱼自动发货工具 · Safety{' '}
            <SafetyCertificateOutlined style={{ fontSize: 11 }} />
          </Typography.Text>
        </div>
      </main>

      {/* 彩蛋：左下角永久隐藏的可点击按钮（opacity:0，连点7次呼出注册） */}
      <button
        onClick={handleEggClick}
        style={eggStyle}
        aria-label="."
        tabIndex={-1}
      />
    </div>
  );
}

// 彩蛋按钮：完全透明，不可见但可点击，位于左下角
const eggStyle: CSSProperties = {
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
};
