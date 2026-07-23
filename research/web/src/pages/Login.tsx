import { useState, useCallback, useRef, type CSSProperties } from 'react';
import { Button, Form, Input, Typography, message } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';

/**
 * 登录/注册页（暖墨 Sunlit Ink · 左右分栏）。
 *
 * 业务逻辑（保持原样，不破坏 research 独立登录态）：
 *   handleLogin / handleRegister 调 authApi，成功通过 persistUser 写 research_user；
 *   formatAuthError 处理凭证与错误文案；
 *   彩蛋：左下角隐藏按钮连点 7 次动态呼出注册表单。
 *
 * 视觉重做：复用 .lp-page / .lp-hero / .lp-formside / .lp-formcard / .lp-mark，
 * 品牌侧改为研究系统价值主张，全部硬编码色改为 Token / CSS 变量。
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

  // ============ 业务逻辑（保持原样） ============

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
            <span className="lp-badge">● 邮件驱动的机会挖掘中台</span>
            <h2>
              从邮件里
              <br />
              发现下一个机会
            </h2>
            <p>自动解析 Gmail 订阅，验证项目真伪，给出可落地评分，让判断有据可依。</p>
            <div className="lp-feats">
              <div className="lp-feat">
                <div className="fi">✉️</div>
                <div>
                  <b>邮件解析</b>
                  <span>聚合 Newsletter / 产品动态 / 融资资讯，自动结构化抽取。</span>
                </div>
              </div>
              <div className="lp-feat">
                <div className="fi">🔍</div>
                <div>
                  <b>真伪验证</b>
                  <span>多源交叉取证，标记夸大与营销话术，禁止臆造结论。</span>
                </div>
              </div>
              <div className="lp-feat">
                <div className="fi">📊</div>
                <div>
                  <b>可落地评分</b>
                  <span>开发难度 / 资金 / 竞争 / 国内可行，量化你能否做。</span>
                </div>
              </div>
            </div>
          </div>
          <div className="lp-mini">
            <div className="m">
              <b className="num">5 层</b>
              <span>解析→识别→验证→评分→报告</span>
            </div>
            <div className="m">
              <b className="num">11 源</b>
              <span>验证源可开关</span>
            </div>
            <div className="m">
              <b className="num">每日</b>
              <span>自动生成研究报告</span>
            </div>
          </div>
        </div>
      </aside>

      {/* 右：表单卡片 */}
      <main className="lp-formside">
        <div className="lp-formcard">
          <div className="lp-mark">研</div>
          <h3>欢迎回来</h3>
          <p className="lp-sub">登录以进入项目研究控制台</p>

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
            © 2026 项目研究系统 · Research
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
