import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Select,
  Space,
  Spin,
  TimePicker,
  Typography,
  message,
  Tag,
} from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { gmailApi, settingsApi, Settings as SettingsType } from '../services/api';

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [gmailStatus, setGmailStatus] = useState<{
    connected: boolean;
    email: string | null;
    lastSyncAt: string | null;
  }>({ connected: false, email: null, lastSyncAt: null });
  const [settings, setSettings] = useState<SettingsType>({
    marketingKeywords: [],
    reportCronLocal: '21:00',
    enabledVerifySources: [],
  });
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadData();
    // 检查 URL 参数（OAuth 回调后）
    const params = new URLSearchParams(window.location.search);
    if (params.get('gmail') === 'connected') {
      message.success('Gmail 授权成功');
      window.history.replaceState({}, '', '/settings');
    } else if (params.get('gmail') === 'error') {
      message.error(params.get('msg') || 'Gmail 授权失败');
      window.history.replaceState({}, '', '/settings');
    }
  }, []);

  const loadData = async () => {
    try {
      const [status, cfg] = await Promise.all([gmailApi.getStatus(), settingsApi.get()]);
      setGmailStatus(status);
      setSettings(cfg);
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectGmail = async () => {
    try {
      const { url } = await gmailApi.getAuthUrl();
      window.location.href = url;
    } catch (err: any) {
      message.error(err.message || '获取授权链接失败');
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await gmailApi.triggerSync();
      message.success('同步任务已触发，请稍后刷新查看');
    } catch (err: any) {
      message.error(err.message || '触发同步失败');
    } finally {
      setSyncing(false);
    }
  };

  const handleSave = async () => {
    try {
      await settingsApi.update(settings);
      message.success('设置已保存');
    } catch (err: any) {
      message.error(err.message || '保存失败');
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        设置
      </Typography.Title>

      <Card title="Gmail 授权" style={{ marginBottom: 16 }}>
        <Space direction="vertical">
          <div>
            状态：
            {gmailStatus.connected ? (
              <Tag color="success">已连接 {gmailStatus.email}</Tag>
            ) : (
              <Tag>未连接</Tag>
            )}
          </div>
          {gmailStatus.lastSyncAt && (
            <Typography.Text type="secondary">
              上次同步：{dayjs(gmailStatus.lastSyncAt).format('YYYY-MM-DD HH:mm')}
            </Typography.Text>
          )}
          <Space>
            <Button type="primary" onClick={handleConnectGmail}>
              {gmailStatus.connected ? '重新授权' : '连接 Google Gmail'}
            </Button>
            {gmailStatus.connected && (
              <Button icon={<SyncOutlined spin={syncing} />} onClick={handleSync} loading={syncing}>
                立即同步
              </Button>
            )}
          </Space>
        </Space>
      </Card>

      <Card title="营销过滤关键词" style={{ marginBottom: 16 }}>
        <Select
          mode="tags"
          style={{ width: '100%' }}
          value={settings.marketingKeywords}
          onChange={(v) => setSettings({ ...settings, marketingKeywords: v })}
          placeholder="输入后回车添加"
        />
        <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
          命中标题/正文的邮件将标记为垃圾营销并跳过后续 Agent。保存后仅对新邮件生效。
        </Typography.Paragraph>
      </Card>

      <Card title="验证源开关" style={{ marginBottom: 16 }}>
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          value={settings.enabledVerifySources}
          onChange={(v) => setSettings({ ...settings, enabledVerifySources: v })}
          options={[
            'google',
            'github',
            'producthunt',
            'reddit',
            'hackernews',
            'g2',
            'capterra',
            'crunchbase',
            'youtube',
            'x',
            'google_trends',
          ].map((v) => ({ value: v, label: v }))}
        />
      </Card>

      <Card title="日报">
        <Form layout="vertical">
          <Form.Item label="每日生成时间（Asia/Shanghai）">
            <TimePicker
              value={dayjs(settings.reportCronLocal, 'HH:mm')}
              format="HH:mm"
              onChange={(time) =>
                setSettings({ ...settings, reportCronLocal: time?.format('HH:mm') || '21:00' })
              }
            />
          </Form.Item>
          <Button type="primary" onClick={handleSave}>
            保存设置
          </Button>
        </Form>
      </Card>
    </div>
  );
}
