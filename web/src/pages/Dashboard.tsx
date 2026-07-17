import { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Tag, Typography, Alert, notification, Table, Progress } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import api from '../api';
import { wsClient } from '../api/ws';

/**
 * 仪表盘：展示订单统计概览 + 签名服务状态。
 * 数据来源：首次拉取 + WS 实时推送增量更新（不再高频轮询）。
 */
export default function Dashboard() {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [signInfo, setSignInfo] = useState<{ provider: string; healthy: boolean } | null>(null);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [trend, setTrend] = useState<{ date: string; count: number }[]>([]);
  const [topProducts, setTopProducts] = useState<{ itemTitle: string; count: number; revenue: number }[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [s, info, health, stock, trendData, topData]: any = await Promise.all([
        api.get('/orders/stats'),
        api.get('/sign/info'),
        api.get('/sign/health'),
        api.get('/kami/low-stock').catch(() => []),
        api.get('/stats/trend?days=7').catch(() => []),
        api.get('/stats/top-products?limit=5&days=30').catch(() => []),
      ]);
      setStats(s || {});
      setSignInfo({ provider: info?.provider, healthy: health?.healthy });
      setLowStock(Array.isArray(stock) ? stock : []);
      setTrend(Array.isArray(trendData) ? trendData : []);
      setTopProducts(Array.isArray(topData) ? topData : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // 首次拉取后改用 WS 增量更新，状态变化时刷新统计
    const reloadStats = () =>
      api.get('/orders/stats').then((s: any) => setStats(s || {})).catch(() => {});
    const offStatus = wsClient.on('order:status', reloadStats);
    const offCreated = wsClient.on('order:created', (data: any) => {
      notification.info({
        message: '新订单',
        description: `${data.itemTitle || ''} (${data.bizOrderId || ''})`,
        placement: 'bottomRight',
        duration: 3,
      });
      reloadStats();
    });
    const offLowStock = wsClient.on('kami:lowstock', (items: any) => {
      setLowStock(Array.isArray(items) ? items : []);
    });
    const offExpired = wsClient.on('account:expired', (data: any) => {
      notification.warning({
        message: '账号 Cookie 已过期',
        description: `账号 ID: ${data.accountId}，请重新扫码登录`,
        placement: 'bottomRight',
        duration: 0,
      });
    });
    const offCaptcha = wsClient.on('account:captcha', (data: any) => {
      notification.warning({
        message: '账号触发闲鱼风控',
        description:
          data?.message ||
          `账号 ${data?.accountId} 已进入冷静期，请到「闲鱼账号」查看`,
        placement: 'bottomRight',
        duration: 0,
      });
    });
    // 每 30s 兜底刷新一次（防止漏推）
    const timer = setInterval(refresh, 30000);
    return () => {
      offStatus();
      offCreated();
      offLowStock();
      offExpired();
      offCaptcha();
      clearInterval(timer);
    };
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

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={14}>
          <Card title="近 7 天发货量趋势">
            {trend.length === 0 ? (
              <Typography.Text type="secondary">暂无数据</Typography.Text>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 160, padding: '0 8px' }}>
                {(() => {
                  const max = Math.max(...trend.map((t) => t.count), 1);
                  return trend.map((t) => (
                    <div key={t.date} style={{ flex: 1, textAlign: 'center' }}>
                      <Typography.Text style={{ fontSize: 12 }}>{t.count}</Typography.Text>
                      <div
                        style={{
                          width: '100%',
                          minHeight: 4,
                          height: `${(t.count / max) * 120}px`,
                          background: '#1677ff',
                          borderRadius: 4,
                          margin: '4px 0',
                          transition: 'height 0.3s',
                        }}
                      />
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        {t.date.slice(5)}
                      </Typography.Text>
                    </div>
                  ));
                })()}
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="销量 TOP 5（近 30 天）">
            <Table
              size="small"
              rowKey="itemTitle"
              dataSource={topProducts}
              pagination={false}
              loading={loading}
              columns={[
                { title: '商品', dataIndex: 'itemTitle', ellipsis: true },
                { title: '销量', dataIndex: 'count', width: 70, align: 'center' as const },
                {
                  title: '营收',
                  dataIndex: 'revenue',
                  width: 90,
                  align: 'right' as const,
                  render: (v: number) => `¥${(v / 100).toFixed(2)}`,
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

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
