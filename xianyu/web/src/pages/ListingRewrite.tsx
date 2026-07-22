import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CopyOutlined,
  FireOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import api from '../api';

/**
 * 爆款仿写：粘贴闲鱼链接 → 抓取详情 → AI 改写标题/描述/售价/规格。
 * 不上架，仅生成文案。
 */
export default function ListingRewrite() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [form] = Form.useForm();

  const loadAccounts = async () => {
    try {
      const accs = await api.get<any[]>('/accounts');
      const list = Array.isArray(accs) ? accs : [];
      setAccounts(
        list.filter((a) => a.enabled && a.status === 'active'),
      );
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(`已复制${label}`);
    } catch {
      message.error('复制失败，请手动选择文本');
    }
  };

  const handleGenerate = async () => {
    const values = await form.validateFields();
    setLoading(true);
    setResult(null);
    try {
      const res = await api.post('/listing-rewrite/generate', {
        url: values.url,
        accountId: values.accountId,
        style: values.style || undefined,
      });
      setResult(res);
      message.success('仿写完成');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const rewrite = result?.rewrite;
  const source = result?.source;

  return (
    <div>
      <Typography.Title level={4}>
        <FireOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
        爆款仿写
      </Typography.Title>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="粘贴闲鱼商品链接，自动抓取上架内容并 AI 仿写爆款文案"
        description={
          <>
            需要：1）可用闲鱼账号 Cookie（抓取详情）；2）在「AI 接入」配置公共
            Base URL / API Key / 模型（OpenAI 兼容，如 FreeLLMAPI）。
            <b> 不会自动上架</b>，结果仅供你手动复制到闲鱼发布。
          </>
        }
      />

      <Card style={{ marginBottom: 16 }}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ style: '闲鱼爆款风，真诚不夸张，突出卖点与发货说明' }}
        >
          <Form.Item
            name="url"
            label="闲鱼商品链接 / 商品 ID"
            rules={[{ required: true, message: '请粘贴链接或商品 ID' }]}
          >
            <Input.TextArea
              rows={2}
              placeholder="例如 https://www.goofish.com/item?id=1001160709960"
              allowClear
            />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="accountId"
                label="抓取账号（仅用 Cookie）"
                rules={[{ required: true, message: '请选择账号' }]}
              >
                <Select
                  placeholder="选择闲鱼账号"
                  options={accounts.map((a) => ({
                    value: a.id,
                    label: `${a.nickname || a.xianyuUid} (${a.xianyuUid})`,
                  }))}
                  notFoundContent="暂无可用账号"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="style" label="仿写风格（可选）">
                <Input placeholder="如：虚拟商品秒发风 / 数码二手专业风" />
              </Form.Item>
            </Col>
          </Row>
          <Space>
            <Button
              type="primary"
              icon={<FireOutlined />}
              loading={loading}
              onClick={handleGenerate}
            >
              抓取并仿写
            </Button>
            <Button icon={<ReloadOutlined />} onClick={loadAccounts}>
              刷新账号
            </Button>
          </Space>
        </Form>
      </Card>

      {source && (
        <Card title="原商品摘要" style={{ marginBottom: 16 }} size="small">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="商品 ID">{source.itemId}</Descriptions.Item>
            <Descriptions.Item label="原标题">{source.title || '-'}</Descriptions.Item>
            <Descriptions.Item label="原价">
              {source.price != null ? `¥${source.price}` : '-'}
              {source.originalPrice != null
                ? `（原价 ¥${source.originalPrice}）`
                : ''}
            </Descriptions.Item>
            <Descriptions.Item label="分类/成色">
              {[source.category, source.condition, source.brand]
                .filter(Boolean)
                .join(' / ') || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="原描述">
              <Typography.Paragraph
                ellipsis={{ rows: 4, expandable: true }}
                style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}
              >
                {source.description || '-'}
              </Typography.Paragraph>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {rewrite && (
        <Card
          title="仿写结果（可复制到闲鱼手动发布）"
          extra={
            <Space>
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() =>
                  copyText(
                    [
                      `【标题】${rewrite.title}`,
                      `【建议售价】¥${rewrite.priceSuggestion?.mid}（区间 ${rewrite.priceSuggestion?.low}-${rewrite.priceSuggestion?.high}）`,
                      `【规格】\n${(rewrite.specs || [])
                        .map((s: any) => `${s.name}: ${s.value}`)
                        .join('\n')}`,
                      `【描述】\n${rewrite.description}`,
                      `【卖点】${(rewrite.sellingPoints || []).join('、')}`,
                    ].join('\n\n'),
                    '全文',
                  )
                }
              >
                复制全文
              </Button>
            </Space>
          }
        >
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item
              label={
                <Space>
                  标题
                  <Button
                    type="link"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => copyText(rewrite.title, '标题')}
                  />
                </Space>
              }
            >
              <Typography.Text strong style={{ fontSize: 16 }}>
                {rewrite.title}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="售价建议">
              <Space wrap>
                <Tag color="blue">低 ¥{rewrite.priceSuggestion?.low}</Tag>
                <Tag color="green">中 ¥{rewrite.priceSuggestion?.mid}</Tag>
                <Tag color="orange">高 ¥{rewrite.priceSuggestion?.high}</Tag>
              </Space>
              <div style={{ marginTop: 8, color: '#666' }}>
                {rewrite.priceSuggestion?.reason}
              </div>
            </Descriptions.Item>
            <Descriptions.Item
              label={
                <Space>
                  描述
                  <Button
                    type="link"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => copyText(rewrite.description, '描述')}
                  />
                </Space>
              }
            >
              <Typography.Paragraph
                style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}
              >
                {rewrite.description}
              </Typography.Paragraph>
            </Descriptions.Item>
            <Descriptions.Item label="卖点">
              <Space wrap>
                {(rewrite.sellingPoints || []).map((p: string) => (
                  <Tag key={p} color="magenta">
                    {p}
                  </Tag>
                ))}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="标签">
              <Space wrap>
                {(rewrite.tags || []).map((t: string) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </Space>
            </Descriptions.Item>
          </Descriptions>

          <Typography.Title level={5} style={{ marginTop: 16 }}>
            商品规格
          </Typography.Title>
          <Table
            size="small"
            pagination={false}
            rowKey={(_, i) => String(i)}
            dataSource={rewrite.specs || []}
            columns={[
              { title: '规格名', dataIndex: 'name', width: 160 },
              { title: '规格值', dataIndex: 'value' },
            ]}
          />
          {result?.modelNote && (
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
              {result.modelNote}
            </Typography.Text>
          )}
        </Card>
      )}
    </div>
  );
}
