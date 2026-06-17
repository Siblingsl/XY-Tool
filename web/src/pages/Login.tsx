import { useState } from "react";
import {
  Card,
  Form,
  Input,
  Button,
  Tabs,
  Typography,
  message,
} from "antd";
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import api from "../api";

/**
 * 登录/注册页。
 * 两个 Tab：登录、注册。
 * 成功后保存 token 和用户信息，跳转到首页。
 */
export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleLogin = async (values: {
    username: string;
    password: string;
  }) => {
    setLoading(true);
    try {
      const res: any = await api.post("/auth/login", values);
      localStorage.setItem("accessToken", res.accessToken);
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
      localStorage.setItem("user", JSON.stringify(res.user));
      message.success("注册成功");
      navigate("/dashboard", { replace: true });
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const LoginForm = (
    <Form onFinish={handleLogin} layout="vertical" size="large">
      <Form.Item
        name="username"
        rules={[{ required: true, message: "请输入用户名" }]}
      >
        <Input prefix={<UserOutlined />} placeholder="用户名" />
      </Form.Item>
      <Form.Item
        name="password"
        rules={[{ required: true, message: "请输入密码" }]}
      >
        <Input.Password prefix={<LockOutlined />} placeholder="密码" />
      </Form.Item>
      <Button type="primary" htmlType="submit" block loading={loading}>
        登录
      </Button>
    </Form>
  );

  const RegisterForm = (
    <Form onFinish={handleRegister} layout="vertical" size="large">
      <Form.Item
        name="username"
        label="用户名"
        rules={[
          { required: true, message: "请输入用户名" },
          { min: 3, message: "至少 3 个字符" },
        ]}
      >
        <Input prefix={<UserOutlined />} placeholder="用户名" />
      </Form.Item>
      <Form.Item name="nickname" label="昵称（可选）">
        <Input placeholder="展示昵称" />
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
      <Button type="primary" htmlType="submit" block loading={loading}>
        注册
      </Button>
    </Form>
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      }}
    >
      <Card style={{ width: 420, boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
        <Typography.Title
          level={3}
          style={{ textAlign: "center", marginBottom: 24 }}
        >
          闲鱼自动发货控制台
        </Typography.Title>
        <Tabs
          defaultActiveKey="login"
          centered
          items={[
            { key: "login", label: "登录", children: LoginForm },
            { key: "register", label: "注册", children: RegisterForm },
          ]}
        />
      </Card>
    </div>
  );
}
