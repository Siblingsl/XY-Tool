import { useEffect, useState } from 'react';
import { Card, Empty, Spin, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { analyticsApi, SourceInsight } from '../services/api';
import PageHeader from '../components/PageHeader';

export default function SourceInsights() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SourceInsight[]>([]);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const d = await analyticsApi.sources(10);
      setData(Array.isArray(d) ? d : []);
    } catch (err) {
      console.error('Failed to load source insights:', err);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const columns: ColumnsType<SourceInsight> = [
    {
      title: '来源邮箱',
      dataIndex: 'fromAddr',
      ellipsis: true,
      render: (v: string) => (
        <Typography.Text copyable={{ text: v }}>{v}</Typography.Text>
      ),
    },
    {
      title: '邮件数',
      dataIndex: 'emailCount',
      width: 110,
      sorter: (a, b) => a.emailCount - b.emailCount,
      render: (v: number) => <span className="num">{v}</span>,
    },
    {
      title: '衍生项目',
      dataIndex: 'projectCount',
      width: 110,
      sorter: (a, b) => a.projectCount - b.projectCount,
      render: (v: number) => <span className="num">{v}</span>,
    },
    {
      title: '平均落地指数',
      dataIndex: 'avgFeasibility',
      width: 140,
      sorter: (a, b) => (a.avgFeasibility ?? 0) - (b.avgFeasibility ?? 0),
      render: (v: number | null) =>
        v == null ? (
          '-'
        ) : (
          <span className="num" style={{ color: 'var(--ok)' }}>
            {v}
          </span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="来源画像"
        subtitle="按发件邮箱统计邮件与衍生项目数量，识别高价值信息源。"
      />

      <Card>
        <Spin spinning={loading}>
          {data.length === 0 && !loading ? (
            <Empty description="暂无来源数据" />
          ) : (
            <Table
              rowKey="fromAddr"
              columns={columns}
              dataSource={data}
              pagination={false}
            />
          )}
        </Spin>
      </Card>
    </div>
  );
}
