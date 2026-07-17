import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Space,
  Switch,
  Typography,
  message,
} from 'antd';
import { ExperimentOutlined, SaveOutlined } from '@ant-design/icons';
import api from '../api';

/**
 * 公共 AI 接入：全系统共用（自动回复 / 爆款仿写等）。
 * 兼容 OpenAI / FreeLLMAPI / DeepSeek 等 /v1/chat/completions。
 */
export default function AiSettings() {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res: any = await api.get('/ai/config');
      setConfigured(!!res?.apiKeyConfigured);
      form.setFieldsValue({
        enabled: res?.enabled ?? true,
        baseUrl: res?.baseUrl || 'https://api.openai.com/v1',
        apiKey: '',
        defaultModel: res?.defaultModel || 'gpt-4o-mini',
        defaultTemperature: res?.defaultTemperature ?? 0.7,
      });
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      const res: any = await api.put('/ai/config', values);
      setConfigured(!!res?.apiKeyConfigured);
      message.success('公共 AI 配置已保存');
      form.setFieldValue('apiKey', '');
      load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const handleTest = async () => {
    const values = form.getFieldsValue();
    setTesting(true);
    try {
      const body: Record<string, string> = {};
      if (values.baseUrl && values.apiKey) {
        body.baseUrl = values.baseUrl;
        body.apiKey = values.apiKey;
        body.model = values.defaultModel || 'gpt-4o-mini';
      }
      const res: any = await api.post('/ai/test', body);
      message.success(`连通正常：${res.reply || 'OK'}`);
    } catch (e) {
      message.error(`测试失败：${(e as Error).message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <Typography.Title level={4}>AI 接入</Typography.Title>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="全系统公共 AI 配置"
        description={
          <>
            自动回复、爆款仿写等业务统一使用此处配置。支持 OpenAI 兼容接口（Base URL
            通常以 <code>/v1</code> 结尾，对话路径为{' '}
            <code>/v1/chat/completions</code>）。
            <br />
            示例 FreeLLMAPI：Base URL 填{' '}
            <code>http://freellmapi.xxx/v1</code>，Key 填统一 API 密钥，模型按提供商列表填写。
          </>
        }
      />

      <Card loading={loading} style={{ maxWidth: 640 }}>
        <Form form={form} layout="vertical">
          <Form.Item name="enabled" label="启用公共 AI" valuePropName="checked">
            <Switch checkedChildren="开" unCheckedChildren="关" />
          </Form.Item>
          <Form.Item
            name="baseUrl"
            label="Base URL"
            rules={[{ required: true, message: '请填写 Base URL' }]}
            extra="含 /v1，例如 https://api.openai.com/v1 或 http://host/v1"
          >
            <Input placeholder="https://api.openai.com/v1" />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label={`API Key${configured ? '（已配置，留空保留原值）' : ''}`}
            rules={
              configured
                ? []
                : [{ required: true, message: '请填写 API Key' }]
            }
          >
            <Input.Password placeholder="sk-... 或 freellmapi-..." />
          </Form.Item>
          <Form.Item
            name="defaultModel"
            label="默认模型"
            rules={[{ required: true, message: '请填写模型名' }]}
          >
            <Input placeholder="gpt-4o-mini / deepseek-chat / ..." />
          </Form.Item>
          <Form.Item name="defaultTemperature" label="默认温度（0-2）">
            <InputNumber min={0} max={2} step={0.1} style={{ width: '100%' }} />
          </Form.Item>

          <Space>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>
              保存
            </Button>
            <Button
              icon={<ExperimentOutlined />}
              loading={testing}
              onClick={handleTest}
            >
              测试连通
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
}
