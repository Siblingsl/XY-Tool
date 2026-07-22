import { Card, Descriptions, Typography } from 'antd';

export default function Profile() {
  const user = JSON.parse(localStorage.getItem('research_user') || '{}');

  return (
    <div>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        个人中心
      </Typography.Title>
      <Card>
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="用户名">{user.username || 'demo'}</Descriptions.Item>
          <Descriptions.Item label="昵称">{user.nickname || 'demo'}</Descriptions.Item>
          <Descriptions.Item label="项目区">research</Descriptions.Item>
          <Descriptions.Item label="说明">
            原型使用独立 localStorage 键（research_token）。后续可与闲鱼共用 /api/auth
            与同域 SSO，见功能文档第十一章。
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}
