import { useEffect, useState } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Descriptions,
  Tag,
  Typography,
  message,
} from 'antd';
import api from '../api';

/**
 * 个人中心页。
 * - 展示个人信息（用户名/昵称/角色）
 * - 修改昵称
 * - 修改密码（改密后强制重新登录）
 */
export default function Profile() {
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();

  const loadMe = async () => {
    setLoading(true);
    try {
      const res: any = await api.get('/users/me');
      setInfo(res);
      profileForm.setFieldsValue({ nickname: res?.nickname });
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMe();
  }, []);

  const handleUpdateProfile = async () => {
    const values = await profileForm.validateFields();
    try {
      await api.put('/users/profile', { nickname: values.nickname });
      message.success('昵称已更新');
      // 同步更新 localStorage（顶部 Header 从这里读）
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      user.nickname = values.nickname;
      localStorage.setItem('user', JSON.stringify(user));
      loadMe();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const handleChangePassword = async () => {
    const values = await passwordForm.validateFields();
    try {
      await api.put('/users/password', {
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      });
      message.success('密码已修改，即将重新登录');
      // 改密后旧 token 已吊销，清理并跳登录
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      setTimeout(() => {
        window.location.href = '/login';
      }, 1000);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const roleText: Record<string, string> = {
    admin: '管理员',
    system: '系统管理员',
  };

  return (
    <div>
      <Typography.Title level={4}>个人中心</Typography.Title>

      <Card title="个人信息" loading={loading} style={{ marginBottom: 16 }}>
        <Descriptions column={1}>
          <Descriptions.Item label="用户名">
            {info?.username}
          </Descriptions.Item>
          <Descriptions.Item label="昵称">
            {info?.nickname || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="角色">
            <Tag color="blue">{roleText[info?.role] || info?.role}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="注册时间">
            {info?.createdAt
              ? new Date(info.createdAt).toLocaleString('zh-CN')
              : '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="修改昵称" style={{ marginBottom: 16 }}>
        <Form
          form={profileForm}
          layout="vertical"
          style={{ maxWidth: 400 }}
          onFinish={handleUpdateProfile}
        >
          <Form.Item
            name="nickname"
            label="新昵称"
            rules={[{ required: true, message: '请输入昵称' }]}
          >
            <Input placeholder="展示昵称" />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            保存
          </Button>
        </Form>
      </Card>

      <Card title="修改密码">
        <Form
          form={passwordForm}
          layout="vertical"
          style={{ maxWidth: 400 }}
          onFinish={handleChangePassword}
        >
          <Form.Item
            name="oldPassword"
            label="当前密码"
            rules={[{ required: true, message: '请输入当前密码' }]}
          >
            <Input.Password placeholder="当前密码" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '至少 6 位' },
            ]}
          >
            <Input.Password placeholder="新密码（至少 6 位）" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="再次输入新密码" />
          </Form.Item>
          <Button type="primary" danger htmlType="submit">
            修改密码
          </Button>
          <Typography.Text type="secondary" style={{ marginLeft: 12 }}>
            修改后将强制所有设备重新登录
          </Typography.Text>
        </Form>
      </Card>
    </div>
  );
}
