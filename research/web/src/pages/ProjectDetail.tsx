import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Steps,
  Table,
  Tag,
  Timeline,
  Typography,
  message,
} from 'antd';
import {
  StarFilled,
  StarOutlined,
  PlusOutlined,
  ReadOutlined,
} from '@ant-design/icons';
import { useParams, Link } from 'react-router-dom';
import {
  projectsApi,
  tagsApi,
  notesApi,
  competitorApi,
  similarApi,
  knowledgeApi,
  ProjectDetail as ProjectDetailType,
  Tag as TagType,
  Note,
  type CompetitorHit,
  type SimilarProject,
} from '../services/api';
import PageHeader from '../components/PageHeader';
import ScoreRadar from '../components/ScoreRadar';
import TrendArea from '../components/TrendArea';

const dimensionLabels: Record<string, string> = {
  devDifficulty: '开发难度',
  capitalNeeded: '启动资金',
  teamRequired: '团队需求',
  competition: '竞争程度',
  modelCost: '模型成本',
  promoCost: '推广成本',
  chinaFeasible: '国内可行',
  licenseNeeded: '许可证',
  computeHeavy: '算力需求',
  apiDependency: 'API依赖',
  soloFeasible: '单人可行',
};

export default function ProjectDetail() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<ProjectDetailType | null>(null);

  // 增强：标签 / 笔记 / 收藏 / 生命周期
  const [tags, setTags] = useState<TagType[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [fav, setFav] = useState(false);

  // 增强：竞品命中（新增，独立加载，不破坏原 loadData）
  const [hits, setHits] = useState<CompetitorHit[]>([]);
  const [hitsLoading, setHitsLoading] = useState(false);

  // 增强：相似项目推荐（Batch-3）
  const [similar, setSimilar] = useState<SimilarProject[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [savingKnowledge, setSavingKnowledge] = useState(false);

  useEffect(() => {
    if (id) {
      loadProject();
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setHitsLoading(true);
    competitorApi
      .hits({ projectId: id, page: 1, pageSize: 20 })
      .then((res) => setHits(res.items))
      .catch(() => {})
      .finally(() => setHitsLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setSimilarLoading(true);
    similarApi
      .list(id, 5)
      .then((res) => setSimilar(res.items))
      .catch(() => {})
      .finally(() => setSimilarLoading(false));
  }, [id]);

  const handleSaveKnowledge = async () => {
    if (!id || !project) return;
    setSavingKnowledge(true);
    try {
      await knowledgeApi.create({
        title: card?.name || '未命名项目',
        content: project.summary || '',
        tags: tags.map((t) => t.tag),
        source: 'project',
        projectId: id,
      });
      message.success('已存为知识卡片');
    } catch (err: any) {
      message.error(err?.message || '保存失败');
    } finally {
      setSavingKnowledge(false);
    }
  };

  const loadProject = async () => {
    try {
      const data = await projectsApi.get(id!);
      setProject(data);
      // 并行加载标签与笔记（增强，不破坏原 loadData）
      const [tagList, noteList] = await Promise.all([
        tagsApi.list(id!).catch(() => [] as TagType[]),
        notesApi.list(id!).catch(() => [] as Note[]),
      ]);
      setTags(tagList);
      setNotes(noteList);
    } catch (err) {
      console.error('Failed to load project:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFavorite = async () => {
    if (!id) return;
    const prev = fav;
    setFav(!prev);
    try {
      const res = await projectsApi.favorite(id);
      setFav(res.favorited);
    } catch (err: any) {
      setFav(prev);
      message.error(err.message || '操作失败');
    }
  };

  const handleAddTag = async () => {
    if (!id) return;
    const t = tagDraft.trim();
    if (!t) return;
    try {
      const created = await tagsApi.add(id, t);
      setTags((prev) => [...prev, created as TagType]);
      setTagDraft('');
    } catch (err: any) {
      message.error(err.message || '添加标签失败');
    }
  };

  const handleRemoveTag = async (t: string) => {
    if (!id) return;
    try {
      await tagsApi.remove(id, t);
      setTags((prev) => prev.filter((x) => x.tag !== t));
    } catch (err: any) {
      message.error(err.message || '删除标签失败');
    }
  };

  const handleAddNote = async () => {
    if (!id) return;
    const c = noteDraft.trim();
    if (!c) return;
    try {
      const created = await notesApi.add(id, c);
      setNotes((prev) => [...prev, created]);
      setNoteDraft('');
    } catch (err: any) {
      message.error(err.message || '保存笔记失败');
    }
  };

  const handleSaveNote = async () => {
    if (!editingNote) return;
    try {
      const updated = await notesApi.update(editingNote.id, editingNote.content);
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      setEditingNote(null);
      message.success('笔记已更新');
    } catch (err: any) {
      message.error(err.message || '更新失败');
    }
  };

  const handleRemoveNote = async (noteId: string) => {
    try {
      await notesApi.remove(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (err: any) {
      message.error(err.message || '删除失败');
    }
  };

  const handleLifecycle = async (next: string) => {
    if (!id) return;
    const prev = project?.lifecycle ?? null;
    setProject((p) => (p ? { ...p, lifecycle: next } : p));
    try {
      await projectsApi.setLifecycle(id, next);
    } catch (err: any) {
      setProject((p) => (p ? { ...p, lifecycle: prev } : p));
      message.error(err.message || '更新失败');
    }
  };

  // 热度趋势：按日期聚合 heatSeries 为单序列
  const heatTrend =
    project?.heatSeries && project.heatSeries.length > 0
      ? (() => {
          const byDate = new Map<string, number>();
          project.heatSeries.forEach((h) => {
            byDate.set(h.date, (byDate.get(h.date) || 0) + h.value);
          });
          return Array.from(byDate.entries())
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));
        })()
      : [];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!project) {
    return (
      <Empty description="未找到项目">
        <Link to="/projects">返回列表</Link>
      </Empty>
    );
  }

  const card = project.cardJson;
  const isVerifying = project.verifyStatus === 'pending' || project.verifyStatus === 'verifying';

  const verdictTag = project.verdict ? (
    <Tag color={project.verdict === 'do' ? 'success' : project.verdict === 'watch' ? 'warning' : 'error'}>
      {project.verdict === 'do' ? '建议做' : project.verdict === 'watch' ? '观察' : '放弃'}
    </Tag>
  ) : null;

  return (
    <div>
      <PageHeader
        title={card?.name || '未知项目'}
        extra={
          <Space>
            <Button
              icon={fav ? <StarFilled style={{ color: 'var(--warn)' }} /> : <StarOutlined />}
              onClick={handleFavorite}
            >
              {fav ? '已收藏' : '收藏'}
            </Button>
            <Select
              placeholder="生命周期"
              style={{ width: 140 }}
              value={project.lifecycle || undefined}
              onChange={handleLifecycle}
              options={[
                'idea',
                'validating',
                'building',
                'launched',
                'scaling',
                'paused',
                'archived',
              ].map((l) => ({ value: l, label: l }))}
            />
            {verdictTag}
            <Button
              icon={<ReadOutlined />}
              onClick={handleSaveKnowledge}
              loading={savingKnowledge}
            >
              存为知识
            </Button>
          </Space>
        }
        breadcrumb={<Link to="/projects">← 项目库</Link>}
      />
      {project.summary && <Typography.Paragraph>{project.summary}</Typography.Paragraph>}

      <Card title="② 项目识别 · Project Card" style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} bordered size="small">
          <Descriptions.Item label="Name">{card?.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="Type">{card?.type || '-'}</Descriptions.Item>
          <Descriptions.Item label="Price">{card?.price || '-'}</Descriptions.Item>
          <Descriptions.Item label="Audience">{card?.audience || '-'}</Descriptions.Item>
          <Descriptions.Item label="Model">{card?.model || '—'}</Descriptions.Item>
          <Descriptions.Item label="Open Source">
            {card?.openSource === true ? '是' : card?.openSource === false ? '否' : '未知'}
          </Descriptions.Item>
          <Descriptions.Item label="Launch">{card?.launchYear || '-'}</Descriptions.Item>
          <Descriptions.Item label="Author">{card?.author || '-'}</Descriptions.Item>
          <Descriptions.Item label="Website">
            {card?.website ? (
              <Typography.Link href={card.website} target="_blank" rel="noreferrer">
                {card.website}
              </Typography.Link>
            ) : (
              '-'
            )}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={14}>
          <Card title="③ 真伪验证 · 证据（禁止臆造）">
            {isVerifying ? (
              <Typography.Text type="secondary">证据收集中...</Typography.Text>
            ) : (
              <>
                <p>
                  真实性 {'★'.repeat(project.authenticityStars || 1)}
                  {'☆'.repeat(5 - (project.authenticityStars || 1))} · 生命周期{' '}
                  <Tag>{project.lifecycle || '未知'}</Tag>
                  {project.verifyStatus === 'degraded' && (
                    <Tag color="error">验证降级</Tag>
                  )}
                </p>
                <Table
                  size="small"
                  pagination={false}
                  rowKey="id"
                  dataSource={project.evidences}
                  locale={{ emptyText: '无证据' }}
                  columns={[
                    { title: '来源', dataIndex: 'source', width: 110 },
                    { title: '声明', dataIndex: 'claim', width: 120 },
                    { title: '值', dataIndex: 'value', width: 140 },
                    {
                      title: '链接',
                      dataIndex: 'url',
                      ellipsis: true,
                      render: (u: string) => (
                        <Typography.Link href={u} target="_blank" rel="noreferrer">
                          {u}
                        </Typography.Link>
                      ),
                    },
                  ]}
                />
                <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
                  数据来源：{[...new Set(project.evidences.map((e) => e.source))].join(' · ') || '无'}
                </Typography.Paragraph>
              </>
            )}
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card title="竞争分析" style={{ marginBottom: 16 }}>
            <p>
              竞争者 <Typography.Text strong>{project.competitors?.count || 0}</Typography.Text>
            </p>
            <Timeline
              items={(project.competitors?.topPlayers || []).map((name, i) => ({
                children: `${i === 0 ? '最大玩家' : i === 1 ? '第二' : '第三'} · ${name}`,
              }))}
            />
          </Card>
          <Card title="市场热度">
            {project.heatSeries && project.heatSeries.length > 0 ? (
              project.heatSeries.slice(0, 5).map((h) => (
                <div key={h.id} style={{ marginBottom: 8 }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <span>{h.metric}</span>
                    <span>{h.value}</span>
                  </Space>
                  <Progress
                    percent={Math.min(100, h.value)}
                    showInfo={false}
                    strokeColor="var(--ok)"
                    size="small"
                  />
                </div>
              ))
            ) : (
              <Typography.Text type="secondary">暂无热度数据</Typography.Text>
            )}
          </Card>
        </Col>
      </Row>

      <Card title="④ 可落地评分 · 我能不能做" style={{ marginBottom: 16 }}>
        <Row gutter={24}>
          <Col xs={24} md={8}>
            <Typography.Title level={2} style={{ margin: 0, color: 'var(--ok)' }}>
              {project.feasibilityIndex ?? '-'}
              <Typography.Text type="secondary" style={{ fontSize: 16 }}>
                /100
              </Typography.Text>
            </Typography.Title>
            <div style={{ marginTop: 8, fontSize: 20 }}>
              {'★'.repeat(project.stars || Math.round((project.feasibilityIndex || 0) / 20))}
            </div>
          </Col>
          <Col xs={24} md={16}>
            {project.scoreJson &&
              Object.entries(project.scoreJson).map(([key, score]) => (
                <div key={key} style={{ marginBottom: 8 }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <span>{dimensionLabels[key] || key}</span>
                    <span>{score}/10</span>
                  </Space>
                  <Progress percent={score * 10} showInfo={false} strokeColor="var(--ok)" />
                </div>
              ))}
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={10}>
          <Card title="评分雷达 · 我能不能做">
            <ScoreRadar dimensions={project.scoreJson || {}} labels={dimensionLabels} size={260} />
          </Card>
        </Col>
        <Col xs={24} md={14}>
          <Card title="市场热度趋势">
            {heatTrend.length > 0 ? (
              <TrendArea data={heatTrend} />
            ) : (
              <Typography.Text type="secondary">暂无热度数据</Typography.Text>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="标签管理">
            <Space wrap style={{ marginBottom: 12 }}>
              {tags.length === 0 ? (
                <Typography.Text type="secondary">暂无标签</Typography.Text>
              ) : (
                tags.map((t) => (
                  <Tag key={t.id} closable onClose={() => handleRemoveTag(t.tag)}>
                    {t.tag}
                  </Tag>
                ))
              )}
            </Space>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder="新增标签"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onPressEnter={handleAddTag}
              />
              <Button icon={<PlusOutlined />} onClick={handleAddTag}>
                添加
              </Button>
            </Space.Compact>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="笔记">
            <Space direction="vertical" style={{ width: '100%' }}>
              {notes.map((n) =>
                editingNote?.id === n.id ? (
                  <div key={n.id}>
                    <Input.TextArea
                      rows={3}
                      value={editingNote.content}
                      onChange={(e) =>
                        setEditingNote({ ...editingNote, content: e.target.value })
                      }
                    />
                    <Space style={{ marginTop: 6 }}>
                      <Button type="primary" size="small" onClick={handleSaveNote}>
                        保存
                      </Button>
                      <Button size="small" onClick={() => setEditingNote(null)}>
                        取消
                      </Button>
                    </Space>
                  </div>
                ) : (
                  <div
                    key={n.id}
                    style={{
                      padding: '8px 0',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ whiteSpace: 'pre-wrap' }}>{n.content}</div>
                    <Space size="small" style={{ marginTop: 4 }}>
                      <Typography.Link onClick={() => setEditingNote(n)}>编辑</Typography.Link>
                      <Typography.Link
                        style={{ color: 'var(--err)' }}
                        onClick={() => handleRemoveNote(n.id)}
                      >
                        删除
                      </Typography.Link>
                    </Space>
                  </div>
                ),
              )}
              <Input.TextArea
                rows={3}
                placeholder="写一条笔记…"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddNote}
                disabled={!noteDraft.trim()}
              >
                添加笔记
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>

      <Card title="⑥ MVP 周计划">
        {project.mvpPlanJson && project.mvpPlanJson.length > 0 ? (
          <Steps
            direction="vertical"
            size="small"
            current={project.mvpPlanJson.length}
            items={project.mvpPlanJson.map((w) => ({
              title: `第 ${w.week} 周`,
              description: w.items.join('；'),
            }))}
          />
        ) : (
          <Typography.Text type="secondary">暂无 MVP 计划</Typography.Text>
        )}
      </Card>

      <Card title="⑦ 竞品命中（监控词命中本项目）" style={{ marginTop: 16 }}>
        {hitsLoading ? (
          <Typography.Text type="secondary">加载中…</Typography.Text>
        ) : hits.length === 0 ? (
          <Typography.Text type="secondary">暂无监控词命中本项目</Typography.Text>
        ) : (
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={hits}
            columns={[
              { title: '监控词', dataIndex: 'keyword', render: (v) => <Tag color="processing">{v}</Tag> },
              { title: '命中字段', dataIndex: 'matchedField', render: (v) => v || '-' },
              {
                title: '时间',
                dataIndex: 'createdAt',
                width: 180,
                render: (v: string) => {
                  const d = new Date(v);
                  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('zh-CN', { hour12: false });
                },
              },
            ]}
            locale={{ emptyText: '暂无命中' }}
          />
        )}
      </Card>

      <Card title="⑧ 相似项目推荐" style={{ marginTop: 16 }}>
        {similarLoading ? (
          <Typography.Text type="secondary">加载中…</Typography.Text>
        ) : similar.length === 0 ? (
          <Typography.Text type="secondary">
            暂无相似项目（基于聚类与标签匹配，给项目打标签后更准确）
          </Typography.Text>
        ) : (
          <Row gutter={[12, 12]}>
            {similar.map((s) => (
              <Col xs={24} sm={12} md={8} key={s.id}>
                <Card
                  size="small"
                  title={s.name}
                  extra={
                    <Link to={`/projects/${s.id}`}>
                      <Typography.Link>查看</Typography.Link>
                    </Link>
                  }
                >
                  <div style={{ marginBottom: 8 }}>
                    {s.sharedTags.length === 0 ? (
                      <Typography.Text type="secondary">同聚类</Typography.Text>
                    ) : (
                      s.sharedTags.map((t) => (
                        <Tag color="blue" key={t} style={{ marginBottom: 4 }}>
                          {t}
                        </Tag>
                      ))
                    )}
                  </div>
                  <Space size={4} wrap>
                    <Tag
                      color={
                        s.verdict === 'do'
                          ? 'success'
                          : s.verdict === 'watch'
                            ? 'warning'
                            : s.verdict === 'skip'
                              ? 'error'
                              : 'default'
                      }
                    >
                      {s.verdict === 'do'
                        ? '建议做'
                        : s.verdict === 'watch'
                          ? '观察'
                          : s.verdict === 'skip'
                            ? '放弃'
                            : '未定'}
                    </Tag>
                    <Typography.Text type="secondary">
                      可行性 {s.feasibilityIndex ?? '-'}
                    </Typography.Text>
                  </Space>
                  <div style={{ marginTop: 6 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      相似度 {s.score}
                    </Typography.Text>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Card>
    </div>
  );
}
