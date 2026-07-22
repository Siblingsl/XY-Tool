import { useEffect, useState } from 'react';
import { Button, Card, Col, Row, Spin, Steps, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { jobsApi, PipelineJob } from '../services/api';
import dayjs from 'dayjs';

const statusColor: Record<string, string> = {
  queued: 'default',
  running: 'processing',
  done: 'success',
  skipped: 'warning',
  failed: 'error',
};

const stageIndex: Record<string, number> = {
  parse: 0,
  identify: 1,
  verify: 2,
  score: 3,
  report: 4,
};

export default function Pipeline() {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<PipelineJob[]>([]);

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      const data = await jobsApi.list();
      setJobs(data);
    } catch (err) {
      console.error('Failed to load jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async (id: string) => {
    try {
      await jobsApi.retry(id);
      message.success('任务已重新加入队列');
      await loadJobs();
    } catch (err: any) {
      message.error(err.message || '重试失败');
    }
  };

  const running = jobs.find((j) => j.status === 'running');

  const columns: ColumnsType<PipelineJob> = [
    {
      title: '阶段',
      dataIndex: 'stage',
      width: 100,
      render: (s: string) => {
        const labels: Record<string, string> = {
          parse: '① 解析',
          identify: '② 识别',
          verify: '③ 验证',
          score: '④ 评分',
          report: '⑤ 报告',
        };
        return labels[s] || s;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: string) => <Tag color={statusColor[s]}>{s}</Tag>,
    },
    {
      title: '开始时间',
      dataIndex: 'startedAt',
      width: 160,
      render: (v: string | null) => (v ? dayjs(v).format('MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '完成时间',
      dataIndex: 'finishedAt',
      width: 160,
      render: (v: string | null) => (v ? dayjs(v).format('MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '错误',
      dataIndex: 'error',
      ellipsis: true,
      render: (v: string | null) => v || '-',
    },
    {
      title: '操作',
      width: 80,
      render: (_, record) =>
        record.status === 'failed' ? (
          <Button size="small" onClick={() => handleRetry(record.id)}>
            重试
          </Button>
        ) : null,
    },
  ];

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
        Agent 流水线
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        五层：邮件解析 → 项目识别 → 真伪验证 → 可落地评分 → 每日报告
      </Typography.Paragraph>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <Card title={running ? `进行中：阶段 ${running.stage}` : '当前无运行中任务'}>
            <Steps
              current={running ? stageIndex[running.stage] : 4}
              status={running ? 'process' : 'finish'}
              items={[
                { title: '① 邮件解析' },
                { title: '② 项目识别' },
                { title: '③ 真伪验证' },
                { title: '④ 可落地评分' },
                { title: '⑤ 每日报告' },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card title="最近任务">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={jobs}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: '暂无任务，请先在设置页同步 Gmail 邮件' }}
        />
      </Card>
    </div>
  );
}
