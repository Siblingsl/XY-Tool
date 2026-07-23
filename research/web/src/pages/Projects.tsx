import { useEffect, useState } from 'react';
import {
  Button,
  DatePicker,
  Drawer,
  Input,
  InputNumber,
  Popover,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  StarFilled,
  StarOutlined,
  DownloadOutlined,
  FilterOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  projectsApi,
  tagsApi,
  ProjectListItem,
  ProjectListParams,
  Tag as TagType,
} from '../services/api';
import PageHeader from '../components/PageHeader';

const verdictMap: Record<string, { color: string; text: string }> = {
  do: { color: 'success', text: '建议做' },
  watch: { color: 'warning', text: '观察' },
  skip: { color: 'error', text: '放弃' },
};

/** 行内标签管理气泡：加载/增删项目标签 */
function TagPopover({ projectId }: { projectId: string }) {
  const [tags, setTags] = useState<TagType[]>([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState('');

  const load = async () => {
    try {
      const list = await tagsApi.list(projectId);
      setTags(list);
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  };

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v) load();
  };

  const handleAdd = async () => {
    const t = adding.trim();
    if (!t) return;
    try {
      const created = await tagsApi.add(projectId, t);
      setTags((prev) => [...prev, created as TagType]);
      setAdding('');
    } catch (err: any) {
      message.error(err.message || '添加失败');
    }
  };

  const handleRemove = async (t: string) => {
    try {
      await tagsApi.remove(projectId, t);
      setTags((prev) => prev.filter((x) => x.tag !== t));
    } catch (err: any) {
      message.error(err.message || '删除失败');
    }
  };

  const content = (
    <div style={{ width: 240 }}>
      <div style={{ marginBottom: 8 }}>
        {tags.length === 0 ? (
          <Typography.Text type="secondary">暂无标签</Typography.Text>
        ) : (
          tags.map((t) => (
            <Tag
              key={t.id}
              closable
              onClose={() => handleRemove(t.tag)}
              style={{ marginBottom: 6 }}
            >
              {t.tag}
            </Tag>
          ))
        )}
      </div>
      <Space.Compact style={{ width: '100%' }}>
        <Input
          size="small"
          placeholder="新标签"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onPressEnter={handleAdd}
        />
        <Button size="small" icon={<PlusOutlined />} onClick={handleAdd}>
          添加
        </Button>
      </Space.Compact>
    </div>
  );

  return (
    <Popover content={content} trigger="click" open={open} onOpenChange={handleOpen}>
      <Link to="#" onClick={(e) => e.preventDefault()}>
        {tags.length > 0 ? `${tags.length} 个标签` : '加标签'}
      </Link>
    </Popover>
  );
}

export default function Projects() {
  const [loading, setLoading] = useState(true);
  const [verdict, setVerdict] = useState<string | undefined>();
  const [data, setData] = useState<ProjectListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // 新增过滤态
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lifecycle, setLifecycle] = useState<string | undefined>();
  const [tagFilter, setTagFilter] = useState<string>('');
  const [favOnly, setFavOnly] = useState(false);
  const [minStars, setMinStars] = useState<number | null>(null);
  const [scoreMin, setScoreMin] = useState<number | null>(null);
  const [range, setRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [favSet, setFavSet] = useState<Record<string, boolean>>({});
  const [exporting, setExporting] = useState<'csv' | 'json' | null>(null);

  useEffect(() => {
    loadData();
  }, [verdict, page, q, lifecycle, tagFilter, favOnly, minStars, scoreMin, range]);

  const buildFilters = (): ProjectListParams => ({
    verdict,
    q: q || undefined,
    lifecycle,
    tags: tagFilter ? tagFilter.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    favorited: favOnly || undefined,
    minStars: minStars ?? undefined,
    scoreMin: scoreMin ?? undefined,
    fromDate: range?.[0] ? range[0].format('YYYY-MM-DD') : undefined,
    toDate: range?.[1] ? range[1].format('YYYY-MM-DD') : undefined,
    page,
    pageSize: 20,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await projectsApi.list(buildFilters());
      setData(result.items);
      setTotal(result.total);
      const map: Record<string, boolean> = {};
      result.items.forEach((p) => (map[p.id] = p.favorited));
      setFavSet(map);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFavorite = async (id: string) => {
    const prev = favSet[id];
    setFavSet((m) => ({ ...m, [id]: !prev }));
    try {
      const res = await projectsApi.favorite(id);
      setFavSet((m) => ({ ...m, [id]: res.favorited }));
    } catch (err: any) {
      setFavSet((m) => ({ ...m, [id]: prev }));
      message.error(err.message || '操作失败');
    }
  };

  const handleExport = async (format: 'csv' | 'json') => {
    setExporting(format);
    try {
      const url = projectsApi.exportUrl(format, buildFilters());
      const token = localStorage.getItem('research_token');
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error('导出失败');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `projects.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
      message.success('导出已开始');
    } catch (err: any) {
      message.error(err.message || '导出失败');
    } finally {
      setExporting(null);
    }
  };

  const columns: ColumnsType<ProjectListItem> = [
    {
      title: '收藏',
      key: 'fav',
      width: 56,
      render: (_: unknown, row) => (
        <Button
          type="text"
          aria-label="收藏"
          icon={
            favSet[row.id] ? (
              <StarFilled style={{ color: 'var(--warn)' }} />
            ) : (
              <StarOutlined style={{ color: 'var(--ink-2)' }} />
            )
          }
          onClick={() => handleFavorite(row.id)}
        />
      ),
    },
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
    {
      title: '标签',
      key: 'tags',
      width: 110,
      render: (_: unknown, row) => <TagPopover projectId={row.id} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="项目卡片库"
        subtitle="已识别并评分的项目集合，支持搜索、筛选、收藏、打标签与导出。"
      />

      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search
          allowClear
          placeholder="搜索项目名 / 关键词"
          style={{ width: 240 }}
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          onSearch={(v) => {
            setQ(v);
            setPage(1);
          }}
        />
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
        <Button icon={<FilterOutlined />} onClick={() => setDrawerOpen(true)}>
          高级过滤
        </Button>
        <Button
          icon={<DownloadOutlined />}
          loading={exporting === 'csv'}
          onClick={() => handleExport('csv')}
        >
          导出 CSV
        </Button>
        <Button
          icon={<DownloadOutlined />}
          loading={exporting === 'json'}
          onClick={() => handleExport('json')}
        >
          导出 JSON
        </Button>
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

      <Drawer
        title="高级过滤"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={360}
        extra={
          <Button
            type="primary"
            onClick={() => {
              setPage(1);
              setDrawerOpen(false);
            }}
          >
            应用
          </Button>
        }
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <div className="stat-key" style={{ marginBottom: 6 }}>
              生命周期
            </div>
            <Input
              placeholder="如 idea / launched / scaling"
              value={lifecycle}
              onChange={(e) => setLifecycle(e.target.value || undefined)}
            />
          </div>
          <div>
            <div className="stat-key" style={{ marginBottom: 6 }}>
              标签（逗号分隔）
            </div>
            <Input
              placeholder="tag1,tag2"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
            />
          </div>
          <div>
            <div className="stat-key" style={{ marginBottom: 6 }}>
              仅看收藏
            </div>
            <Switch checked={favOnly} onChange={setFavOnly} />
          </div>
          <div>
            <div className="stat-key" style={{ marginBottom: 6 }}>
              最少星标
            </div>
            <InputNumber
              min={0}
              max={5}
              style={{ width: '100%' }}
              value={minStars}
              onChange={(v) => setMinStars(v)}
            />
          </div>
          <div>
            <div className="stat-key" style={{ marginBottom: 6 }}>
              评分下限（0~100）
            </div>
            <InputNumber
              min={0}
              max={100}
              style={{ width: '100%' }}
              value={scoreMin}
              onChange={(v) => setScoreMin(v)}
            />
          </div>
          <div>
            <div className="stat-key" style={{ marginBottom: 6 }}>
              创建日期范围
            </div>
            <DatePicker.RangePicker
              style={{ width: '100%' }}
              value={range as any}
              onChange={(v) => setRange(v as any)}
            />
          </div>
        </Space>
      </Drawer>
    </div>
  );
}
