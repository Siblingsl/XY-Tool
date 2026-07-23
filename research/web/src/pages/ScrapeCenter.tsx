import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Input,
  Table,
  Tag,
  Space,
  Typography,
  message,
  Modal,
  Switch,
  Popconfirm,
  Spin,
  Empty,
  Select,
  Tooltip,
} from 'antd';
import {
  CloudDownloadOutlined,
  PlusOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  EditOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import { scrapeApi, knowledgeApi, type ScrapeResult, type ScrapeJob } from '../services/api';
import PageHeader from '../components/PageHeader';

function domainOf(u: string): string {
  try {
    return new URL(u).hostname;
  } catch {
    return 'web';
  }
}

function fmtTime(iso?: string): string {
  if (!iso) return '从未';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('zh-CN', { hour12: false });
}

const statusMeta: Record<string, { color: string; text: string }> = {
  success: { color: 'success', text: '成功' },
  failed: { color: 'error', text: '失败' },
  running: { color: 'processing', text: '运行中' },
  pending: { color: 'default', text: '待运行' },
};

export default function ScrapeCenter() {
  const [url, setUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [preview, setPreview] = useState<ScrapeResult | null>(null);
  const [previewTags, setPreviewTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [jobs, setJobs] = useState<ScrapeJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);

  const [jobModalOpen, setJobModalOpen] = useState(false);
  const [editing, setEditing] = useState<ScrapeJob | null>(null);
  const [jobSubmitting, setJobSubmitting] = useState(false);
  const [jobForm, setJobForm] = useState({
    url: '',
    title: '',
    intervalMinutes: 1440,
    enabled: true,
  });

  const loadJobs = async () => {
    setJobsLoading(true);
    try {
      const res = await scrapeApi.listJobs();
      setJobs(res.items || []);
    } catch (err: any) {
      message.error(err?.message || '加载抓取任务失败');
    } finally {
      setJobsLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  // ---- 手动抓取 ----
  const handleScrape = async () => {
    if (!/^https?:\/\//i.test(url.trim())) {
      message.warning('请输入合法的 http/https 链接');
      return;
    }
    setScraping(true);
    setPreview(null);
    try {
      const res = await scrapeApi.scrape(url.trim(), false);
      setPreview(res.extracted);
      setPreviewTags([domainOf(res.extracted.url), 'web']);
    } catch (err: any) {
      message.error(err?.message || '抓取失败');
    } finally {
      setScraping(false);
    }
  };

  const handleSaveToKB = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      await knowledgeApi.create({
        title: preview.title || domainOf(preview.url),
        content: preview.text,
        tags: previewTags,
        source: 'web',
      });
      message.success('已保存到知识库（来源：网页）');
      setPreview(null);
      setUrl('');
      setPreviewTags([]);
    } catch (err: any) {
      if (err?.message) message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ---- 定时任务 ----
  const openJobCreate = () => {
    setEditing(null);
    setJobForm({ url: '', title: '', intervalMinutes: 1440, enabled: true });
    setJobModalOpen(true);
  };

  const openJobEdit = (j: ScrapeJob) => {
    setEditing(j);
    setJobForm({
      url: j.url,
      title: j.title || '',
      intervalMinutes: j.intervalMinutes,
      enabled: j.enabled,
    });
    setJobModalOpen(true);
  };

  const handleJobSubmit = async () => {
    if (!/^https?:\/\//i.test(jobForm.url.trim())) {
      message.warning('请输入合法的 http/https 链接');
      return;
    }
    setJobSubmitting(true);
    try {
      if (editing) {
        await scrapeApi.updateJob(editing.id, { ...jobForm, url: jobForm.url.trim() });
        message.success('已更新定时任务');
      } else {
        await scrapeApi.createJob({ ...jobForm, url: jobForm.url.trim() });
        message.success('已新增定时任务');
      }
      setJobModalOpen(false);
      loadJobs();
    } catch (err: any) {
      if (err?.message) message.error(err.message);
    } finally {
      setJobSubmitting(false);
    }
  };

  const handleJobDelete = async (id: string) => {
    try {
      await scrapeApi.deleteJob(id);
      message.success('已删除');
      loadJobs();
    } catch (err: any) {
      message.error(err?.message || '删除失败');
    }
  };

  const handleToggle = async (j: ScrapeJob, enabled: boolean) => {
    try {
      await scrapeApi.updateJob(j.id, { enabled });
      loadJobs();
    } catch (err: any) {
      message.error(err?.message || '更新失败');
    }
  };

  const handleRun = async (id: string) => {
    setRunningId(id);
    try {
      await scrapeApi.runJob(id);
      message.success('已触发抓取，结果将进入知识库');
      loadJobs();
    } catch (err: any) {
      message.error(err?.message || '运行失败');
    } finally {
      setRunningId(null);
    }
  };

  const columns = [
    {
      title: '目标链接',
      dataIndex: 'url',
      key: 'url',
      render: (u: string, j: ScrapeJob) => (
        <Space>
          <a href={u} target="_blank" rel="noreferrer">
            {j.title || u}
          </a>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {domainOf(u)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '间隔(分钟)',
      dataIndex: 'intervalMinutes',
      key: 'intervalMinutes',
      width: 110,
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (v: boolean, j: ScrapeJob) => (
        <Switch size="small" checked={v} onChange={(checked) => handleToggle(j, checked)} />
      ),
    },
    {
      title: '上次运行',
      dataIndex: 'lastRunAt',
      key: 'lastRunAt',
      width: 160,
      render: (v?: string) => fmtTime(v),
    },
    {
      title: '状态',
      dataIndex: 'lastStatus',
      key: 'lastStatus',
      width: 90,
      render: (s: string) => {
        const m = statusMeta[s] || statusMeta.pending;
        return <Tag color={m.color}>{m.text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'ops',
      width: 170,
      render: (_: unknown, j: ScrapeJob) => (
        <Space size="small">
          <Tooltip title="立即抓取一次">
            <Button
              size="small"
              icon={<PlayCircleOutlined />}
              loading={runningId === j.id}
              onClick={() => handleRun(j.id)}
            />
          </Tooltip>
          <Tooltip title="编辑">
            <Button size="small" icon={<EditOutlined />} onClick={() => openJobEdit(j)} />
          </Tooltip>
          <Popconfirm title="删除该定时任务？" onConfirm={() => handleJobDelete(j.id)} okText="删除" cancelText="取消">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="信息采集"
        subtitle="抓取任意网页正文并沉淀到知识库；支持手动触发与定时自动抓取。"
      />

      {/* 手动抓取 */}
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="粘贴网页链接，如 https://example.com/article"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPressEnter={handleScrape}
            style={{ width: 420 }}
            prefix={<LinkOutlined style={{ color: 'var(--ink-2)' }} />}
          />
          <Button type="primary" icon={<CloudDownloadOutlined />} loading={scraping} onClick={handleScrape}>
            抓取并预览
          </Button>
        </Space>

        {scraping && (
          <div style={{ marginTop: 16 }}>
            <Spin tip="正在抓取与解析正文…" />
          </div>
        )}

        {!scraping && preview && (
          <div
            style={{
              marginTop: 16,
              padding: 16,
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'var(--surface-2, #faf8f4)',
            }}
          >
            <Space style={{ marginBottom: 8 }} wrap>
              {preview.siteName && <Tag color="processing">{preview.siteName}</Tag>}
              {preview.author && <Tag>{preview.author}</Tag>}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                字数 {preview.length} · {fmtTime(preview.fetchedAt)}
              </Typography.Text>
            </Space>
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              {preview.title || domainOf(preview.url)}
            </Typography.Title>
            {preview.excerpt && (
              <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
                {preview.excerpt}
              </Typography.Paragraph>
            )}
            <div
              style={{
                maxHeight: 220,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                fontSize: 14,
                lineHeight: 1.7,
                padding: '8px 12px',
                background: '#fff',
                borderRadius: 6,
                border: '1px solid var(--border)',
              }}
            >
              {preview.text}
            </div>
            <div style={{ marginTop: 12 }}>
              <Select
                mode="tags"
                style={{ width: '100%', maxWidth: 480 }}
                placeholder="标签（回车添加）"
                value={previewTags}
                onChange={setPreviewTags}
              />
            </div>
            <Space style={{ marginTop: 12 }}>
              <Button type="primary" loading={saving} onClick={handleSaveToKB}>
                保存到知识库
              </Button>
              <Button onClick={() => setPreview(null)}>丢弃</Button>
            </Space>
          </div>
        )}
      </Card>

      {/* 定时任务 */}
      <Card
        title="定时抓取任务"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openJobCreate}>
            新建任务
          </Button>
        }
      >
        {jobsLoading ? (
          <Spin />
        ) : jobs.length === 0 ? (
          <Empty description="暂无定时任务，点击右上角新建，或上方手动抓取" />
        ) : (
          <Table rowKey="id" columns={columns} dataSource={jobs} pagination={false} size="small" />
        )}
      </Card>

      <Modal
        title={editing ? '编辑定时任务' : '新建定时任务'}
        open={jobModalOpen}
        onOk={handleJobSubmit}
        onCancel={() => setJobModalOpen(false)}
        confirmLoading={jobSubmitting}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Input
            placeholder="目标网页链接（http/https）"
            value={jobForm.url}
            onChange={(e) => setJobForm({ ...jobForm, url: e.target.value })}
          />
          <Input
            placeholder="备注标题（可选，留空则用网页标题）"
            value={jobForm.title}
            onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
          />
          <Input
            type="number"
            addonBefore="抓取间隔"
            addonAfter="分钟"
            min={1}
            value={jobForm.intervalMinutes}
            onChange={(e) =>
              setJobForm({ ...jobForm, intervalMinutes: Math.max(1, Number(e.target.value) || 1) })
            }
          />
          <Space>
            <span>启用</span>
            <Switch checked={jobForm.enabled} onChange={(v) => setJobForm({ ...jobForm, enabled: v })} />
          </Space>
        </Space>
      </Modal>
    </div>
  );
}
