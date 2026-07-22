import { useEffect, useState } from 'react';
import { Select, Space, Spin, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';
import { projectsApi, Project } from '../services/api';

const verdictMap: Record<string, { color: string; text: string }> = {
  do: { color: 'success', text: '建议做' },
  watch: { color: 'warning', text: '观察' },
  skip: { color: 'error', text: '放弃' },
};

export default function Projects() {
  const [loading, setLoading] = useState(true);
  const [verdict, setVerdict] = useState<string | undefined>();
  const [data, setData] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadData();
  }, [verdict, page]);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await projectsApi.list({ verdict, page, pageSize: 20 });
      setData(result.items);
      setTotal(result.total);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  };

  const columns: ColumnsType<Project> = [
    {
      title: '项目',
      dataIndex: ['cardJson', 'name'],
      render: (name: string, row) => (
        <Space>
          <Link to={`/projects/${row.id}`}>{name || '未知'}</Link>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: ['cardJson', 'type'],
      width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: '定价',
      dataIndex: ['cardJson', 'price'],
      width: 100,
      render: (v: string) => v || '-',
    },
    {
      title: '受众',
      dataIndex: ['cardJson', 'audience'],
      width: 140,
      render: (v: string) => v || '-',
    },
    {
      title: '真实性',
      dataIndex: 'authenticityStars',
      width: 120,
      render: (n: number | null) =>
        n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '-',
    },
    {
      title: '落地指数',
      dataIndex: 'feasibilityIndex',
      width: 100,
      sorter: (a, b) => (a.feasibilityIndex || 0) - (b.feasibilityIndex || 0),
      render: (v: number | null) => v ?? '-',
    },
    {
      title: '建议',
      dataIndex: 'verdict',
      width: 100,
      render: (v: string | null) =>
        v ? <Tag color={verdictMap[v]?.color}>{verdictMap[v]?.text}</Tag> : '-',
    },
  ];

  return (
    <div>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        项目卡片库
      </Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="按建议筛选"
          style={{ width: 160 }}
          value={verdict}
          onChange={(v) => {
            setVerdict(v);
            setPage(1);
          }}
          options={[
            { value: 'do', label: '建议做' },
            { value: 'watch', label: '观察' },
            { value: 'skip', label: '放弃' },
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
            showTotal: (t) => `共 ${t} 个项目`,
          }}
        />
      </Spin>
    </div>
  );
}
