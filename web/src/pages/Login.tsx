import { useState, useCallback } from "react";
import {
  Form,
  Input,
  Button,
  Typography,
  message,
} from "antd";
import {
  LockOutlined,
  UserOutlined,
  ShopOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import api from "../api";

/**
 * 登录/注册页。
 *
 * 业务逻辑：handleLogin / handleRegister 调 /auth/* 接口，成功存 token 跳首页。
 * UI：玻璃拟态卡片 + 动态渐变背景 + Logo。
 * 彩蛋：左下角隐藏按钮连点 7 次动态呼出注册表单。
 */
export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [eggCount, setEggCount] = useState(0);
  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();

  // ============ 业务逻辑（保持原样） ============

  const handleLogin = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res: any = await api.post("/auth/login", values);
      localStorage.setItem("accessToken", res.accessToken);
      localStorage.setItem("refreshToken", res.refreshToken);
      localStorage.setItem("user", JSON.stringify(res.user));
      message.success("登录成功");
      if (!res.accessToken) {
        message.error("登录失败");
        return;
      } else {
        navigate("/dashboard", { replace: true });
      }
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (values: {
    username: string;
    password: string;
    nickname?: string;
  }) => {
    setLoading(true);
    try {
      const res: any = await api.post("/auth/register", values);
      localStorage.setItem("accessToken", res.accessToken);
      localStorage.setItem("refreshToken", res.refreshToken);
      localStorage.setItem("user", JSON.stringify(res.user));
      message.success("注册成功");
      navigate("/dashboard", { replace: true });
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // ============ 彩蛋：隐藏按钮连点 7 次 ============

  const handleEggClick = useCallback(() => {
    setEggCount((prev) => {
      const next = prev + 1;
      if (next >= 7) {
        setShowRegister(true);
        message.info({ content: "注册通道已开启", duration: 2 });
        return 0;
      }
      return next;
    });
  }, []);

  // ============ 渲染 ============

  const LoginForm = (
    <Form form={loginForm} onFinish={handleLogin} layout="vertical" size="large">
      <Form.Item
        name="username"
        rules={[{ required: true, message: "请输入用户名" }]}
      >
        <Input prefix={<UserOutlined />} placeholder="用户名" allowClear />
      </Form.Item>
      <Form.Item
        name="password"
        rules={[{ required: true, message: "请输入密码" }]}
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

  // 注册表单（动态渲染，showRegister 为 true 时才挂载）
  const RegisterForm = (
    <Form form={registerForm} onFinish={handleRegister} layout="vertical" size="large">
      <Form.Item
        name="username"
        label="用户名"
        rules={[
          { required: true, message: "请输入用户名" },
          { min: 3, message: "至少 3 个字符" },
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
          { required: true, message: "请输入密码" },
          { min: 6, message: "至少 6 位" },
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

  return (
    <div style={styles.bgWrap}>
      {/* 动态渐变背景层 */}
      <div style={styles.animatedBg} />

      <div style={styles.centerWrap}>
        <div style={styles.card}>
          {/* Logo 区 */}
          <div style={styles.logoWrap}>
            <div style={styles.logoIcon}>
              <ShopOutlined style={{ fontSize: 30, color: "#fff" }} />
            </div>
            <Typography.Title level={3} style={styles.title}>
              闲鱼自动发货
            </Typography.Title>
            <Typography.Text style={styles.subtitle}>
              虚拟商品自动发货 · 智能客服 · 激活码中台
            </Typography.Text>
          </div>

          {/* 表单区：登录 / 注册切换（动态渲染） */}
          <div style={{ marginTop: 28 }}>
            {showRegister ? (
              <>
                {RegisterForm}
                <Button
                  type="link"
                  block
                  style={{ marginTop: 4, color: "#888" }}
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
        </div>

        {/* 底部版权 */}
        <Typography.Text style={styles.copyright}>
          © 2026 闲鱼自动发货工具 · Safety{" "}
          <SafetyCertificateOutlined style={{ fontSize: 11 }} />
        </Typography.Text>
      </div>

      {/* 彩蛋：左下角永久隐藏的可点击按钮（opacity:0，连点7次呼出注册） */}
      <button
        onClick={handleEggClick}
        style={styles.eggButton}
        aria-label="."
        tabIndex={-1}
      />
    </div>
  );
}

// ============ 样式 ============

const styles: Record<string, React.CSSProperties> = {
  bgWrap: {
    position: "relative",
    minHeight: "100vh",
    overflow: "hidden",
  },
  animatedBg: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(-45deg, #667eea, #764ba2, #6B8DD6, #8E37D7)",
    backgroundSize: "400% 400%",
    animation: "loginBgGradient 15s ease infinite",
    zIndex: 0,
  },
  centerWrap: {
    position: "relative",
    zIndex: 1,
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
  },
  card: {
    width: 420,
    maxWidth: "100%",
    padding: "40px 36px 32px",
    borderRadius: 20,
    background: "rgba(255, 255, 255, 0.92)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.25)",
    border: "1px solid rgba(255, 255, 255, 0.4)",
  },
  logoWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
  },
  logoIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 8px 24px rgba(102, 126, 234, 0.4)",
    marginBottom: 4,
  },
  title: {
    margin: 0,
    color: "#1a1a2e",
    fontWeight: 600,
  },
  subtitle: {
    color: "#888",
    fontSize: 13,
  },
  copyright: {
    marginTop: 20,
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
  },
  // 彩蛋按钮：完全透明，不可见但可点击，位于左下角
  eggButton: {
    position: "fixed",
    left: 0,
    bottom: 0,
    width: 60,
    height: 60,
    opacity: 0,
    background: "transparent",
    border: "none",
    cursor: "default",
    zIndex: 9999,
    outline: "none",
  },
} as const;

// 动画 keyframes（注入到 document）
if (typeof document !== "undefined" && !document.getElementById("login-bg-anim")) {
  const style = document.createElement("style");
  style.id = "login-bg-anim";
  style.textContent = `
    @keyframes loginBgGradient {
      0%   { background-position: 0% 50%; }
      50%  { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
  `;
  document.head.appendChild(style);
}
