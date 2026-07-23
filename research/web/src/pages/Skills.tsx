import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Input,
  Modal,
  Row,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
  message,
  InputNumber,
  Descriptions,
} from 'antd';
import {
  ExperimentOutlined,
  ThunderboltOutlined,
  TagOutlined,
  FileTextOutlined,
  SmileOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import { skillsApi, Skill } from '../services/api';
import PageHeader from '../components/PageHeader';

const skillIcons: Record<string, React.ReactNode> = {
  classify: <TagOutlined style={{ fontSize: 24, color: 'var(--brand-600)' }} />,
  summarize: <FileTextOutlined style={{ fontSize: 24, color: 'var(--brand-600)' }} />,
  sentiment: <SmileOutlined style={{ fontSize: 24, color: 'var(--brand-600)' }} />,
  keyword_extract: <KeyOutlined style={{ fontSize: 24, color: 'var(--brand-600)' }} />,
};

export default function Skills() {
  const [loading, setLoading] = useState(true);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [testModal, setTestModal] = useState<{ visible: boolean; skill: Skill | null }>({
    visible: false,
    skill: null,
  });
  const [testSubject, setTestSubject] = useState('');
  const [testBody, setTestBody] = useState('');
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = async () => {
    try {
      const data = await skillsApi.list();
      setSkills(data);
    } catch (err) {
      console.error('Failed to load skills:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (skill: Skill, enabled: boolean) => {
    try {
      await skillsApi.update(skill.key, { enabled });
      setSkills((prev) => prev.map((s) => (s.key === skill.key ? { ...s, enabled } : s)));
      message.success(`${skill.name} 已${enabled ? '启用' : '禁用'}`);
    } catch (err: any) {
      message.error(err.message || '操作失败');
    }
  };

  const handlePriorityChange = async (skill: Skill, priority: number) => {
    try {
      await skillsApi.update(skill.key, { priority });
      setSkills((prev) => prev.map((s) => (s.key === skill.key ? { ...s, priority } : s)));
    } catch (err: any) {
      message.error(err.message || '操作失败');
    }
  };

  const handleTest = async () => {
    if (!testModal.skill) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await skillsApi.test(testModal.skill.key, {
        subject: testSubject,
        bodyText: testBody,
      });
      setTestResult(result);
    } catch (err: any) {
      message.error(err.message || '测试失败');
    } finally {
      setTesting(false);
    }
  };

  const openTestModal = (skill: Skill) => {
    setTestModal({ visible: true, skill });
    setTestSubject('');
    setTestBody('');
    setTestResult(null);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  const enabledCount = skills.filter((s) => s.enabled).length;

  return (
    <div>
      <PageHeader
        title={
          <span>
            <ExperimentOutlined style={{ marginRight: 8 }} />
            AI 技能管理
          </span>
        }
        subtitle={`邮件同步后自动执行已启用的技能。当前已启用 ${enabledCount}/${skills.length} 个技能。`}
      />

      <Row gutter={[16, 16]}>
        {skills.map((skill) => (
          <Col xs={24} md={12} key={skill.key}>
            <Card
              hoverable
              style={{
                borderColor: skill.enabled ? 'var(--brand-600)' : undefined,
                opacity: skill.enabled ? 1 : 0.7,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Space align="start">
                  {skillIcons[skill.key] || <ThunderboltOutlined style={{ fontSize: 24, color: 'var(--brand-600)' }} />}
                  <div>
                    <Typography.Text strong style={{ fontSize: 16 }}>
                      {skill.name}
                    </Typography.Text>
                    <br />
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      {skill.description}
                    </Typography.Text>
                    <br />
                    <Space style={{ marginTop: 8 }}>
                      <Tag>{skill.key}</Tag>
                      {skill.enabled ? (
                        <Tag color="success">已启用</Tag>
                      ) : (
                        <Tag>已禁用</Tag>
                      )}
                    </Space>
                  </div>
                </Space>
                <Switch
                  checked={skill.enabled}
                  onChange={(v) => handleToggle(skill, v)}
                />
              </div>

              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    优先级:
                  </Typography.Text>
                  <InputNumber
                    size="small"
                    min={0}
                    max={100}
                    value={skill.priority}
                    onChange={(v) => v !== null && handlePriorityChange(skill, v)}
                    style={{ width: 60 }}
                  />
                </Space>
                <Button size="small" onClick={() => openTestModal(skill)}>
                  测试
                </Button>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Modal
        title={`测试技能：${testModal.skill?.name || ''}`}
        open={testModal.visible}
        onCancel={() => setTestModal({ visible: false, skill: null })}
        footer={null}
        width={600}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Typography.Text>邮件标题</Typography.Text>
            <Input
              placeholder="输入测试邮件标题"
              value={testSubject}
              onChange={(e) => setTestSubject(e.target.value)}
            />
          </div>
          <div>
            <Typography.Text>邮件正文</Typography.Text>
            <Input.TextArea
              rows={4}
              placeholder="输入测试邮件正文"
              value={testBody}
              onChange={(e) => setTestBody(e.target.value)}
            />
          </div>
          <Button type="primary" onClick={handleTest} loading={testing}>
            执行测试
          </Button>
          {testResult && (
            <Card size="small" title="执行结果">
              <Descriptions column={1} size="small">
                {Object.entries(testResult).map(([k, v]) => (
                  <Descriptions.Item key={k} label={k}>
                    {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </Descriptions.Item>
                ))}
              </Descriptions>
            </Card>
          )}
        </Space>
      </Modal>
    </div>
  );
}
