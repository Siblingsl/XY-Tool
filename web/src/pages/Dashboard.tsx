import { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Tag, Typography, Alert } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import api from '../api';

/**
 * 仪表盘：展示订单统计概览 + 签名服务状态。
 */
export default function Dashboard() {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [signInfo, setSignInfo] = useState<{ provider: string; healthy: boolean } | null>(null);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [s, info, health, stock]: any = await Promise.all([
        api.get('/orders/stats'),
        api.get('/sign/info'),
        api.get('/sign/health'),
        api.get('/kami/low-stock').catch(() => []),
      ]);
      setStats(s || {});
      setSignInfo({ provider: info?.provider, healthy: health?.healthy });
      setLowStock(Array.isArray(stock) ? stock : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);

  const pending = stats.PENDING || 0;
  const delivered = stats.DELIVERED || 0;
  const failed = stats.FAILED || 0;
  const total = Object.values(stats).reduce((a, b) => a + b, 0);

  return (
    <div>
      <Typography.Title level={4}>仪表盘</Typography.Title>

      <Row gutter={[16, 16]}>
        <Col xs={12} sm={12} md={6}>
          <Card>
            <Statistic
              title="总订单"
              value={total}
              prefix={<ThunderboltOutlined />}
              loading={loading}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card>
            <Statistic
              title="待处理"
              value={pending}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#faad14' }}
              loading={loading}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card>
            <Statistic
              title="已发货"
              value={delivered}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
              loading={loading}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card>
            <Statistic
              title="失败"
              value={failed}
              prefix={<CloseCircleOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
              loading={loading}
            />
          </Card>
        </Col>
      </Row>

      {lowStock.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
          message="卡密库存不足"
          description={
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {lowStock.map((item: any) => (
                <li key={item.pool?.id}>
                  {item.pool?.name}：剩余 {item.stock} / 阈值 {item.threshold}
                </li>
              ))}
            </ul>
          }
        />
      )}

      <Card title="系统状态" style={{ marginTop: 16 }}>
        {signInfo && (
          <Row gutter={16}>
            <Col span={12}>
              <Typography.Text>签名服务: </Typography.Text>
              <Tag color="blue">{signInfo.provider}</Tag>
            </Col>
            <Col span={12}>
              <Typography.Text>健康状态: </Typography.Text>
              <Tag color={signInfo.healthy ? 'success' : 'error'}>
                {signInfo.healthy ? '正常' : '异常'}
              </Tag>
            </Col>
          </Row>
        )}
        <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
          提示: 当前 {signInfo?.provider === 'mock' ? '使用 Mock 签名，仅用于开发联调' : '已接入真实签名服务'}。
          订单数据每 5 秒自动刷新。
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
