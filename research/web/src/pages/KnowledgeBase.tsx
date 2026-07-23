import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Select,
  Skeleton,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, LinkOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { knowledgeApi, type KnowledgeItem } from '../services/api';
import PageHeader from '../components/PageHeader';

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('zh-CN', { hour12: false });
}

const sourceMap: Record<string, { color: string; text: string }> = {
  manual: { color: 'default', text: '手动' },
  project: { color: 'processing', text: '项目沉淀' },
  web: { color: 'gold', text: '网页抓取' },
};

export default function KnowledgeBase() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [allTags, setAllTags] = useState<string[]>([]);

  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string | undefined>();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: '',
    content: '',
    tags: [] as string[],
    source: 'manual',
  });

  const loadTags = async () => {
    try {
      setAllTags(await knowledgeApi.tags());
    } catch {
      /* ignore */
    }
  };

  const loadItems = async () => {
    setLoading(true);
    try {
      const res = await knowledgeApi.list({
        q: q || undefined,
        tag,
        page: 1,
        pageSize: 50,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err: any) {
      message.error(err?.message || '加载知识库失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTags();
  }, []);
  useEffect(() => {
    loadItems();
  }, [q, tag]);

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', content: '', tags: [], source: 'manual' });
    setModalOpen(true);
  };

  const openEdit = (it: KnowledgeItem) => {
    setEditing(it);
    setForm({
      title: it.title,
      content: it.content,
      tags: it.tags || [],
      source: it.source,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      message.warning('请填写标题');
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        await knowledgeApi.update(editing.id, { ...form });
        message.success('已更新知识卡片');
      } else {
        await knowledgeApi.create({ ...form, content: form.content || '' });
        message.success('已新增知识卡片');
      }
      setModalOpen(false);
      loadItems();
      loadTags();
    } catch (err: any) {
      if (err?.message) message.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (it: KnowledgeItem) => {
    Modal.confirm({
      title: '删除知识卡片',
      content: `确定删除「${it.title}」？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await knowledgeApi.remove(it.id);
          message.success('已删除');
          loadItems();
          loadTags();
        } catch (err: any) {
          message.error(err?.message || '删除失败');
        }
      },
    });
  };

  return (
    <div>
      <PageHeader
        title="知识库"
        subtitle="沉淀研究洞察，支持搜索与标签筛选。"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增知识卡片
          </Button>
        }
      />

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input.Search
            placeholder="搜索标题或内容"
            allowClear
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 260 }}
          />
          <Select
            placeholder="按标签筛选"
            allowClear
            style={{ width: 200 }}
            value={tag}
            onChange={setTag}
            options={allTags.map((t) => ({ value: t, label: t }))}
          />
          <Typography.Text type="secondary">{total} 条</Typography.Text>
        </Space>
      </Card>

      {loading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : items.length === 0 ? (
        <Empty description="暂无知识卡片，点击右上角新增或到项目详情「存为知识」" />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {items.map((it) => (
            <Card
              key={it.id}
              size="small"
              title={it.title}
              extra={
                <Space size="small">
                  <Typography.Link onClick={() => openEdit(it)}>
                    <EditOutlined />
                  </Typography.Link>
                  <Typography.Link style={{ color: 'var(--err)' }} onClick={() => handleDelete(it)}>
                    <DeleteOutlined />
                  </Typography.Link>
                </Space>
              }
            >
              <div style={{ maxHeight: 120, overflow: 'hidden', whiteSpace: 'pre-wrap' }}>
                {it.content ? (
                  it.content
                ) : (
                  <Typography.Text type="secondary">（无内容）</Typography.Text>
                )}
              </div>
              <div style={{ marginTop: 8 }}>
                {(it.tags || []).map((t) => (
                  <Tag key={t} style={{ marginBottom: 4 }}>
                    {t}
                  </Tag>
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-2)' }}>
                <Tag color={sourceMap[it.source]?.color}>
                  {sourceMap[it.source]?.text || it.source}
                </Tag>
                {it.projectName && (
                  <Link to={`/projects/${it.projectId}`} style={{ marginLeft: 6 }}>
                    <LinkOutlined /> {it.projectName}
                  </Link>
                )}
                <span style={{ marginLeft: 8 }}>{fmtTime(it.createdAt)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        title={editing ? '编辑知识卡片' : '新增知识卡片'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Input
            placeholder="标题"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <Input.TextArea
            rows={5}
            placeholder="内容（可粘贴研究洞察、证据摘要等）"
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />
          <Select
            mode="tags"
            style={{ width: '100%' }}
            placeholder="标签（回车添加）"
            value={form.tags}
            onChange={(v) => setForm({ ...form, tags: v })}
            options={allTags.map((t) => ({ value: t, label: t }))}
          />
        </Space>
      </Modal>
    </div>
  );
}
