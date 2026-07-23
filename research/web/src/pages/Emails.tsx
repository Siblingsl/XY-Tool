import { useEffect, useState } from 'react';
import { Drawer, Select, Space, Spin, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { emailsApi, Email } from '../services/api';
import dayjs from 'dayjs';
import PageHeader from '../components/PageHeader';

const statusColor: Record<string, string> = {
  done: 'success',
  filtered: 'default',
  identifying: 'processing',
  verifying: 'processing',
  scoring: 'processing',
  pending: 'warning',
  failed: 'error',
  skipped: 'default',
  no_project: 'default',
};

const statusLabel: Record<string, string> = {
  done: '已完成',
  filtered: '垃圾营销',
  identifying: '识别中',
  verifying: '验证中',
  scoring: '评分中',
  pending: '待处理',
  failed: '失败',
  skipped: '已跳过',
  no_project: '无项目',
};

export default function Emails() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | undefined>();
  const [data, setData] = useState<Email[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [current, setCurrent] = useState<Email | null>(null);

  useEffect(() => {
    loadData();
  }, [status, page]);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await emailsApi.list({ status, page, pageSize: 20 });
      setData(result.items);
      setTotal(result.total);
    } catch (err) {
      console.error('Failed to load emails:', err);
    } finally {
      setLoading(false);
    }
  };

  const columns: ColumnsType<Email> = [
    {
      title: '时间',
      dataIndex: 'receivedAt',
      width: 150,
      render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
    },
    { title: '标题', dataIndex: 'subject', ellipsis: true },
    { title: '发件人', dataIndex: 'fromAddr', width: 200, ellipsis: true },
    {
      title: '分类',
      dataIndex: 'categories',
      width: 220,
      render: (cats: string[] | null) =>
        cats?.map((c) => (
          <Tag
            key={c}
            style={{ background: 'var(--brand-tint)', color: 'var(--brand-700)', border: 'none' }}
          >
            {c}
          </Tag>
        )) || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (s: string) => <Tag color={statusColor[s]}>{statusLabel[s] || s}</Tag>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="邮件流水"
        subtitle="来自 Gmail 的订阅与产品动态，已自动分类与解析。"
      />
      <Space style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="按状态筛选"
          style={{ width: 180 }}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: 'done', label: '已完成' },
            { value: 'filtered', label: '垃圾营销' },
            { value: 'identifying', label: '识别中' },
            { value: 'verifying', label: '验证中' },
            { value: 'pending', label: '待处理' },
            { value: 'failed', label: '失败' },
          ]}
        />
      </Space>
      <Spin spinning={loading}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          pagination={{
            current: page,
            total,
            pageSize: 20,
            onChange: setPage,
            showTotal: (t) => `共 ${t} 封`,
          }}
          onRow={(record) => ({
            onClick: () => setCurrent(record),
            style: { cursor: 'pointer' },
          })}
        />
      </Spin>
      <Drawer
        title={current?.subject}
        open={!!current}
        onClose={() => setCurrent(null)}
        width={480}
      >
        {current && (
          <>
            <p>
              <Typography.Text type="secondary">发件人</Typography.Text>
              <br />
              {current.fromAddr}
            </p>
            <p>
              <Typography.Text type="secondary">正文摘要</Typography.Text>
              <br />
              {current.bodyText?.slice(0, 500) || '（无正文）'}
            </p>
            {current.filterReason && (
              <p>
                <Tag color="default">过滤原因</Tag> {current.filterReason}
              </p>
            )}
            <p>
              <Typography.Text type="secondary">提取链接</Typography.Text>
            </p>
            <ul>
              {(current.extractedJson?.links || []).length === 0 && <li>（无）</li>}
              {(current.extractedJson?.links || []).slice(0, 10).map((l) => (
                <li key={l}>
                  <Typography.Link href={l} target="_blank" rel="noreferrer">
                    {l}
                  </Typography.Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Drawer>
    </div>
  );
}
