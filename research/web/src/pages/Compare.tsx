import { useEffect, useState } from 'react';
import { Alert, Card, Col, Empty, Row, Select, Spin, Tag, Typography } from 'antd';
import { compareApi, projectsApi, ProjectListItem, CompareItem } from '../services/api';
import PageHeader from '../components/PageHeader';
import ScoreRadar from '../components/ScoreRadar';

const scoreLabels: Record<string, string> = {
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

export default function Compare() {
  const [options, setOptions] = useState<{ label: string; value: string }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [items, setItems] = useState<CompareItem[]>([]);

  useEffect(() => {
    loadOptions();
  }, []);

  const loadOptions = async () => {
    setLoadingOptions(true);
    try {
      const res = await projectsApi.list({ pageSize: 100 });
      setOptions(
        res.items.map((p: ProjectListItem) => ({
          label: p.cardJson?.name || '(未命名)',
          value: p.id,
        })),
      );
    } catch (err) {
      console.error('Failed to load project options:', err);
    } finally {
      setLoadingOptions(false);
    }
  };

  const handleChange = async (ids: string[]) => {
    setSelected(ids);
    if (ids.length < 2) {
      setItems([]);
      return;
    }
    setComparing(true);
    try {
      const data = await compareApi.post(ids);
      setItems(data);
    } catch (err) {
      console.error('Failed to compare:', err);
      setItems([]);
    } finally {
      setComparing(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="项目对比"
        subtitle="选择 2~4 个项目，并排比较落地指数、评分维度与热度均值。"
      />

      <Card style={{ marginBottom: 16 }}>
        <Select
          mode="multiple"
          allowClear
          style={{ width: '100%' }}
          placeholder="搜索并选择项目（2~4 个）"
          loading={loadingOptions}
          value={selected}
          onChange={handleChange}
          options={options}
          maxCount={4}
          optionFilterProp="label"
        />
        {selected.length > 0 && selected.length < 2 && (
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            再选择 {2 - selected.length} 个项目即可开始对比
          </Typography.Text>
        )}
      </Card>

      {comparing ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : items.length > 0 ? (
        <Row gutter={[16, 16]}>
          {items.map((it) => {
            const heat = it.heatAvg ? Object.entries(it.heatAvg) : [];
            const heatMax = heat.length ? Math.max(...heat.map(([, v]) => v), 1) : 1;
            return (
              <Col xs={24} sm={12} md={8} key={it.id}>
                <Card
                  title={it.name || '(未命名)'}
                  hoverable
                  extra={
                    <Tag color={it.lifecycle ? 'blue' : 'default'}>
                      {it.lifecycle || '未知阶段'}
                    </Tag>
                  }
                >
                  <div style={{ marginBottom: 8 }}>
                    <Typography.Text type="secondary">落地指数</Typography.Text>
                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ok)' }}>
                      {it.feasibilityIndex ?? '-'}
                      <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                        /100
                      </Typography.Text>
                    </div>
                  </div>

                  <ScoreRadar dimensions={it.scoreJson || {}} labels={scoreLabels} size={240} />

                  <Typography.Text type="secondary">热度均值</Typography.Text>
                  <div style={{ marginTop: 8 }}>
                    {heat.length === 0 ? (
                      <Typography.Text type="secondary">暂无热度数据</Typography.Text>
                    ) : (
                      heat.map(([k, v]) => (
                        <div key={k} style={{ marginBottom: 6 }}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: 12,
                              color: 'var(--ink-2)',
                            }}
                          >
                            <span>{k}</span>
                            <span className="num">{v}</span>
                          </div>
                          <div
                            style={{
                              height: 6,
                              background: 'var(--surface-2)',
                              borderRadius: 999,
                              overflow: 'hidden',
                            }}
                          >
                            <i
                              style={{
                                display: 'block',
                                height: '100%',
                                width: `${Math.max(4, (v / heatMax) * 100)}%`,
                                background:
                                  'linear-gradient(90deg, var(--brand-600), var(--brand-400))',
                                borderRadius: 999,
                              }}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      ) : selected.length >= 2 ? (
        <Empty description="未获取到对比数据" />
      ) : (
        <Alert
          type="info"
          showIcon
          message="从上方选择至少 2 个项目开始对比"
        />
      )}
    </div>
  );
}
