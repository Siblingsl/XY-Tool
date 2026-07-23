import { useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Drawer, Empty, Spin, Tooltip, message } from 'antd';
import {
  BellOutlined,
  WarningOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { notificationsApi, type AppNotification } from '../services/api';

/** 相对时间（中文，粗略） */
function relativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

const TYPE_META: Record<string, { color: string; icon: ReactNode; label: string }> = {
  competitor_hit: { color: 'var(--err)', icon: <WarningOutlined />, label: '竞品命中' },
  rule_notify: { color: 'var(--brand-600)', icon: <RobotOutlined />, label: '规则通知' },
  rule_triggered: { color: 'var(--warn)', icon: <ThunderboltOutlined />, label: '规则触发' },
  daily_report_ready: { color: 'var(--info)', icon: <FileTextOutlined />, label: '日报就绪' },
  system: { color: 'var(--ink-2)', icon: <InfoCircleOutlined />, label: '系统' },
};

/**
 * 通知中心铃铛：Header 右侧。
 * - 挂载即拉一次未读数，之后每 30s 轮询（原生 setInterval）
 * - 点击展开右侧 Drawer，按 type 着色/图标，未读加左侧色条
 * - 点击条目标记已读并按 refType/refId 跳转
 */
export default function NotificationBell() {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);

  const refreshCount = () =>
    notificationsApi
      .unreadCount()
      .then((r) => setCount(r.count))
      .catch(() => {});

  useEffect(() => {
    refreshCount();
    const id = setInterval(refreshCount, 30000);
    return () => clearInterval(id);
  }, []);

  const loadList = async () => {
    setLoading(true);
    try {
      const res = await notificationsApi.list({ page: 1, pageSize: 20 });
      setItems(res.items);
    } catch (err: any) {
      message.error(err?.message || '加载通知失败');
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v) loadList();
  };

  const handleReadAll = async () => {
    try {
      await notificationsApi.readAll();
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setCount(0);
      message.success('已全部标记为已读');
    } catch (err: any) {
      message.error(err?.message || '操作失败');
    }
  };

  const handleItemClick = async (n: AppNotification) => {
    if (!n.read) {
      try {
        await notificationsApi.read(n.id);
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
        setCount((c) => Math.max(0, c - 1));
      } catch {
        /* 忽略标记失败，仍尝试跳转 */
      }
    }
    if (n.refType === 'project' && n.refId) {
      navigate(`/projects/${n.refId}`);
    } else if (n.refType === 'rule') {
      navigate('/automation-rules');
    } else if (n.refType === 'watch') {
      navigate('/competitor-watch');
    } else if (n.refType === 'report') {
      navigate('/reports');
    }
    setOpen(false);
  };

  return (
    <>
      <Tooltip title="通知">
        <Badge count={count} size="small" offset={[-2, 2]}>
          <Button
            type="text"
            aria-label="通知"
            icon={<BellOutlined />}
            onClick={() => handleOpen(true)}
            style={{ color: 'var(--ink-2)' }}
          />
        </Badge>
      </Tooltip>

      <Drawer
        title="通知"
        placement="right"
        open={open}
        onClose={() => setOpen(false)}
        width={384}
        styles={{ body: { padding: 0 } }}
        extra={
          <Button type="link" onClick={handleReadAll} disabled={count === 0}>
            全部已读
          </Button>
        }
      >
        <Spin spinning={loading}>
          {items.length === 0 ? (
            <Empty description="暂无通知" style={{ marginTop: 56 }} />
          ) : (
            <div className="notif-list">
              {items.map((n) => {
                const meta = TYPE_META[n.type] || TYPE_META.system;
                return (
                  <button
                    type="button"
                    key={n.id}
                    className="notif-item"
                    onClick={() => handleItemClick(n)}
                    style={{
                      borderLeftColor: n.read ? 'transparent' : meta.color,
                      opacity: n.read ? 0.7 : 1,
                    }}
                  >
                    <span className="notif-ic" style={{ color: meta.color }}>
                      {meta.icon}
                    </span>
                    <span className="notif-body">
                      <span className="notif-title" style={{ fontWeight: n.read ? 500 : 700 }}>
                        {n.title}
                      </span>
                      {n.body && <span className="notif-text">{n.body}</span>}
                      <span className="notif-time">{relativeTime(n.createdAt)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Spin>
      </Drawer>
    </>
  );
}
