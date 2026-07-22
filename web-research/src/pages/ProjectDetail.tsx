import { useEffect, useState } from 'react';
import {
  Card,
  Col,
  Descriptions,
  Empty,
  Progress,
  Row,
  Space,
  Spin,
  Steps,
  Table,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import { useParams, Link } from 'react-router-dom';
import { projectsApi, ProjectDetail as ProjectDetailType } from '../services/api';

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

  useEffect(() => {
    if (id) {
      loadProject();
    }
  }, [id]);

  const loadProject = async () => {
    try {
      const data = await projectsApi.get(id!);
      setProject(data);
    } catch (err) {
      console.error('Failed to load project:', err);
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <div>
      <Space style={{ marginBottom: 8 }}>
        <Link to="/projects">← 项目库</Link>
      </Space>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        {card?.name || '未知项目'}{' '}
        {project.verdict && (
          <Tag color={project.verdict === 'do' ? 'success' : project.verdict === 'watch' ? 'warning' : 'error'}>
            {project.verdict === 'do' ? '建议做' : project.verdict === 'watch' ? '观察' : '放弃'}
          </Tag>
        )}
      </Typography.Title>
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
                    strokeColor="#0f766e"
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
            <Typography.Title level={2} style={{ margin: 0, color: '#0f766e' }}>
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
                  <Progress percent={score * 10} showInfo={false} strokeColor="#0f766e" />
                </div>
              ))}
          </Col>
        </Row>
      </Card>

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
    </div>
  );
}
