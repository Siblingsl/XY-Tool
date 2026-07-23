/**
 * 研究系统 API 服务层。
 * - 开发：默认 /api（Vite 代理到本地后端）
 * - 生产：构建时注入 VITE_API_BASE_URL（如 https://research-api.skyed.dpdns.org/api）
 *   浏览器直连海外 Go API；CF Pages 的 _redirects 无法可靠反代外部源。
 */

const API_ROOT =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  '/api';

const RESEARCH_BASE = `${API_ROOT}/research`;

function apiUrl(rootRelativePath: string): string {
  const path = rootRelativePath.startsWith('/')
    ? rootRelativePath
    : `/${rootRelativePath}`;
  if (API_ROOT === '/api') {
    return path.startsWith('/api') ? path : `/api${path}`;
  }
  const suffix = path.startsWith('/api') ? path.slice(4) : path;
  return `${API_ROOT}${suffix}`;
}

// 获取存储的 token
function getToken(): string | null {
  return localStorage.getItem('research_token');
}

// 通用请求封装（research 区）
async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${RESEARCH_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Token 过期，跳转登录
      localStorage.removeItem('research_token');
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  const json = await response.json();
  // 后端 TransformInterceptor 统一包装为 { code, message, data }，解包取真实数据
  return (json && typeof json === 'object' && 'data' in json ? json.data : json) as T;
}

// ============ Auth ============

async function postAuth(path: '/auth/login' | '/auth/register', username: string, password: string) {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.message || (path === '/auth/register' ? '注册失败' : '登录失败'));
  }
  const data = json && typeof json === 'object' && 'data' in json ? json.data : json;
  if (data?.accessToken) {
    localStorage.setItem('research_token', data.accessToken);
  }
  if (data?.refreshToken) {
    localStorage.setItem('research_refresh_token', data.refreshToken);
  }
  return data;
}

export const authApi = {
  login: (username: string, password: string) => postAuth('/auth/login', username, password),

  register: (username: string, password: string) =>
    postAuth('/auth/register', username, password),

  logout: () => {
    localStorage.removeItem('research_token');
    localStorage.removeItem('research_refresh_token');
  },

  isAuthenticated: () => {
    return !!getToken();
  },
};

// ============ Gmail ============

export const gmailApi = {
  getAuthUrl: () => request<{ url: string }>('/gmail/auth-url'),

  getStatus: () =>
    request<{ connected: boolean; email: string | null; lastSyncAt: string | null }>(
      '/gmail/status',
    ),

  triggerSync: () => request<{ jobId: string }>('/gmail/sync', { method: 'POST' }),
};

// ============ Emails ============

export interface Email {
  id: string;
  gmailMessageId: string;
  subject: string;
  fromAddr: string;
  receivedAt: string;
  bodyText: string | null;
  extractedJson: {
    links?: string[];
    githubUrls?: string[];
    youtubeUrls?: string[];
    productUrls?: string[];
    redditUrls?: string[];
    twitterUrls?: string[];
    attachments?: string[];
  } | null;
  categories: string[] | null;
  status: string;
  filterReason: string | null;
  createdAt: string;
}

export const emailsApi = {
  list: (params?: {
    status?: string;
    category?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.category) query.set('category', params.category);
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    return request<{ items: Email[]; total: number; page: number; pageSize: number }>(
      `/emails?${query.toString()}`,
    );
  },

  get: (id: string) => request<Email>(`/emails/${id}`),
};

// ============ Projects ============

export interface ProjectCard {
  name: string;
  type: string;
  price: string;
  audience: string;
  model?: string;
  openSource: boolean | 'unknown';
  website: string;
  launchYear: number;
  author: string;
  competitorsMentioned?: string[];
  market?: string;
  clusterKey?: string;
}

export interface Evidence {
  id: string;
  source: string;
  url: string;
  claim: string;
  value: string;
  snippet: string | null;
  fetchedAt: string;
}

export interface Competitor {
  id: string;
  name: string;
  url: string | null;
  notes: string | null;
}

export interface HeatPoint {
  id: string;
  date: string;
  metric: string;
  value: number;
}

export interface MvpWeek {
  week: number;
  items: string[];
}

export interface Project {
  id: string;
  emailId: string;
  clusterId: string | null;
  cardJson: ProjectCard | null;
  verifyStatus: string;
  feasibilityIndex: number | null;
  verdict: 'do' | 'watch' | 'skip' | null;
  authenticityStars: number | null;
  lifecycle: string | null;
  mvpPlanJson: MvpWeek[] | null;
  scoreJson: Record<string, number> | null;
  summary: string | null;
  stars: number | null;
  createdAt: string;
}

export interface ProjectDetail extends Project {
  evidences: Evidence[];
  competitors: {
    count: number;
    topPlayers: string[];
    list: Competitor[];
  };
  heatSeries: HeatPoint[];
}

export const projectsApi = {
  list: (params?: ProjectListParams) => {
    const qs = buildProjectQuery(params);
    return request<{ items: ProjectListItem[]; total: number; page: number; pageSize: number }>(
      `/projects${qs ? `?${qs}` : ''}`,
    );
  },

  get: (id: string) => request<ProjectDetail>(`/projects/${id}`),

  reverify: (id: string) =>
    request<{ message: string }>(`/projects/${id}/reverify`, { method: 'POST' }),

  rescore: (id: string) =>
    request<{ message: string }>(`/projects/${id}/rescore`, { method: 'POST' }),

  /** 修改建议（verdict） */
  setVerdict: (id: string, verdict: string) =>
    request<{ verdict: string }>(`/projects/${id}/verdict`, {
      method: 'PATCH',
      body: JSON.stringify({ verdict }),
    }),

  /** 切换收藏（乐观更新由调用方处理） */
  favorite: (id: string) =>
    request<{ favorited: boolean }>(`/projects/${id}/favorite`, { method: 'POST' }),

  /** 修改生命周期阶段 */
  setLifecycle: (id: string, lifecycle: string) =>
    request<{ lifecycle: string }>(`/projects/${id}/lifecycle`, {
      method: 'PATCH',
      body: JSON.stringify({ lifecycle }),
    }),

  /**
   * 构造导出下载 URL（不含 token）。
   * 调用方需用 fetch + Authorization 头获取 blob 后下载（见各页面用法）。
   */
  exportUrl: (format: 'csv' | 'json', params?: ProjectListParams) => {
    const query = new URLSearchParams();
    query.set('format', format);
    const qs = buildProjectQuery(params);
    if (qs) qs.split('&').forEach((p) => {
      const [k, v] = p.split('=');
      if (k) query.set(k, v);
    });
    return apiUrl(`/research/projects/export?${query.toString()}`);
  },

  /** 对比多个项目（P1-4） */
  compare: (ids: string[]) =>
    request<CompareItem[]>('/projects/compare', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
};

// ============ Reports ============

export interface DailyReport {
  id: string;
  reportDate: string;
  summaryJson: {
    total: number;
    do: number;
    watch: number;
    skip: number;
    newDirections: number;
    date: string;
  } | null;
  bodyMd: string | null;
  projectIds: string[] | null;
  createdAt: string;
}

export const reportsApi = {
  list: (params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    return request<DailyReport[]>(`/reports?${query.toString()}`);
  },

  getByDate: (date: string) => request<DailyReport | null>(`/reports/${date}`),

  generate: () => request<DailyReport>('/reports/generate', { method: 'POST' }),

  /** 日报分组：do / watch / skip（P1-8） */
  groups: (date: string) =>
    request<{ do: ReportGroupItem[]; watch: ReportGroupItem[]; skip: ReportGroupItem[] }>(
      `/reports/${date}/groups`,
    ),
};

// ============ Pipeline Jobs ============

export interface PipelineJob {
  id: string;
  emailId: string | null;
  projectId: string | null;
  stage: 'parse' | 'identify' | 'verify' | 'score' | 'report';
  status: 'queued' | 'running' | 'done' | 'failed' | 'skipped';
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export const jobsApi = {
  list: (params?: { status?: string; stage?: string }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.stage) query.set('stage', params.stage);
    return request<PipelineJob[]>(`/jobs?${query.toString()}`);
  },

  get: (id: string) => request<PipelineJob>(`/jobs/${id}`),

  retry: (id: string) => request<{ message: string }>(`/jobs/${id}/retry`, { method: 'POST' }),
};

// ============ Settings ============

export interface Settings {
  marketingKeywords: string[];
  reportCronLocal: string;
  enabledVerifySources: string[];
}

export const settingsApi = {
  get: () => request<Settings>('/settings'),

  update: (data: Partial<Settings>) =>
    request<Settings>('/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// ============ Skills ============

export interface Skill {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  configJson: Record<string, unknown> | null;
}

export interface SkillResult {
  id: string;
  emailId: string;
  skillKey: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  outputJson: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
}

export const skillsApi = {
  list: () => request<Skill[]>('/skills'),

  update: (key: string, data: { enabled?: boolean; priority?: number; configJson?: unknown }) =>
    request<{ message: string; skillKey: string; enabled: boolean }>(`/skills/${key}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  test: (key: string, data: { subject: string; bodyText: string }) =>
    request<Record<string, unknown>>(`/skills/${key}/test`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getResults: (emailId: string) => request<SkillResult[]>(`/skills/results/${emailId}`),
};

// ============ 扩展：Projects 参数与类型（逻辑见原 projectsApi 定义） ============

export interface ProjectListParams {
  verdict?: string;
  clusterId?: string;
  /** 全局模糊搜索（ILIKE name/cardJson） */
  q?: string;
  /** 标签过滤（多值，逗号或数组） */
  tags?: string[];
  /** 生命周期阶段 */
  lifecycle?: string;
  /** 仅收藏 */
  favorited?: boolean;
  /** 最少星标 */
  minStars?: number;
  /** 创建日期下限 YYYY-MM-DD */
  fromDate?: string;
  /** 创建日期上限 YYYY-MM-DD */
  toDate?: string;
  /** 评分下限 0~100 */
  scoreMin?: number;
  page?: number;
  pageSize?: number;
}

/** 列表项：Project 基础字段 + 标签 + 收藏态 */
export type ProjectListItem = Project & { tags: string[]; favorited: boolean };

function buildProjectQuery(params?: ProjectListParams): string {
  const query = new URLSearchParams();
  if (!params) return '';
  if (params.verdict) query.set('verdict', params.verdict);
  if (params.clusterId) query.set('clusterId', params.clusterId);
  if (params.q) query.set('q', params.q);
  if (params.tags && params.tags.length) query.set('tags', params.tags.join(','));
  if (params.lifecycle) query.set('lifecycle', params.lifecycle);
  if (params.favorited != null) query.set('favorited', String(params.favorited));
  if (params.minStars != null) query.set('minStars', String(params.minStars));
  if (params.fromDate) query.set('fromDate', params.fromDate);
  if (params.toDate) query.set('toDate', params.toDate);
  if (params.scoreMin != null) query.set('scoreMin', String(params.scoreMin));
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  return query.toString();
}

// ============ 扩展：Reports（日报分组） ============

export interface ReportGroupItem {
  id: string;
  name: string;
}

// ============ Clusters（聚类视图，P0-1） ============

export interface Cluster {
  key: string;
  label: string;
  projectCount: number;
  projectIds: string[];
}

export interface ClusterProject {
  id: string;
  name: string;
  verdict: string;
  feasibilityIndex: number | null;
  lifecycle: string | null;
}

export const clustersApi = {
  list: () => request<Cluster[]>('/clusters'),

  get: (key: string) =>
    request<{ key: string; label: string; projects: ClusterProject[] }>(`/clusters/${key}`),
};

// ============ Tags（项目标签，P0-3） ============

export interface Tag {
  id: string;
  tag: string;
  createdAt: string;
}

export const tagsApi = {
  list: (id: string) => request<Tag[]>(`/projects/${id}/tags`),

  add: (id: string, tag: string) =>
    request<{ id: string; tag: string }>(`/projects/${id}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag }),
    }),

  remove: (id: string, tag: string) =>
    request<{ ok: true }>(`/projects/${id}/tags/${encodeURIComponent(tag)}`, {
      method: 'DELETE',
    }),
};

// ============ Notes（项目笔记，P0-3） ============

export interface Note {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export const notesApi = {
  list: (id: string) => request<Note[]>(`/projects/${id}/notes`),

  add: (id: string, content: string) =>
    request<Note>(`/projects/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  update: (noteId: string, content: string) =>
    request<Note>(`/notes/${noteId}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),

  remove: (noteId: string) => request<{ ok: true }>(`/notes/${noteId}`, { method: 'DELETE' }),
};

// ============ Trends（趋势，P0-5） ============

export interface TrendPoint {
  date: string;
  value: number;
}

export interface TrendQuery {
  metric?: string;
  from?: string;
  to?: string;
  scope?: 'all' | 'favorite' | `tag:${string}`;
}

export const trendsApi = {
  get: (params?: TrendQuery) => {
    const query = new URLSearchParams();
    if (params?.metric) query.set('metric', params.metric);
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    if (params?.scope) query.set('scope', params.scope);
    return request<{ metrics: string[]; series: TrendPoint[] }>(
      `/trends?${query.toString()}`,
    );
  },
};

// ============ Analytics（成熟度/来源/评分，P2-4 / P2-5） ============

export interface MaturityBucket {
  lifecycle: string;
  count: number;
}

export interface SourceInsight {
  fromAddr: string;
  emailCount: number;
  projectCount: number;
  avgFeasibility: number | null;
}

export const analyticsApi = {
  maturity: () => request<MaturityBucket[]>('/analytics/maturity'),

  sources: (top = 10) => request<SourceInsight[]>(`/analytics/sources?top=${top}`),

  scores: () =>
    request<{ count: number; dimensions: Record<string, number> }>('/analytics/scores'),
};

// ============ Workbench（个人工作台，P1-3） ============

export interface ProjectSummary {
  id: string;
  name: string;
  verdict: string | null;
  feasibilityIndex: number | null;
  favorited: boolean;
  lifecycle: string | null;
}

export interface WorkbenchData {
  favorited: ProjectSummary[];
  recent: ProjectSummary[];
  maturity: MaturityBucket[];
  tagCount: number;
  noteCount: number;
}

export const workbenchApi = {
  get: () => request<WorkbenchData>('/workbench'),
};

// ============ Compare（项目对比，P1-4） ============

export interface CompareItem {
  id: string;
  name: string;
  scoreJson: Record<string, number> | null;
  feasibilityIndex: number | null;
  lifecycle: string | null;
  heatAvg: Record<string, number> | null;
}

export const compareApi = {
  post: (ids: string[]) => request<CompareItem[]>('/projects/compare', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  }),
};

// ============ Notifications（通知中心，P0-9） ============

export type NotificationType =
  | 'competitor_hit'
  | 'rule_notify'
  | 'rule_triggered'
  | 'daily_report_ready'
  | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  refType: 'project' | 'rule' | 'watch' | 'report' | string;
  refId: string | null;
  read: boolean;
  createdAt: string;
}

export const notificationsApi = {
  list: (params?: { page?: number; pageSize?: number; unread?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    if (params?.unread != null) query.set('unread', String(params.unread));
    return request<{ items: AppNotification[]; total: number; page: number; pageSize: number }>(
      `/notifications?${query.toString()}`,
    );
  },

  unreadCount: () => request<{ count: number }>('/notifications/unread-count'),

  read: (id: string) =>
    request<{ ok: true }>(`/notifications/${id}/read`, { method: 'POST' }),

  readAll: () => request<{ ok: true }>('/notifications/read-all', { method: 'POST' }),
};

// ============ Competitor Watches（竞品监控，P0-4） ============

export type MatchScope = 'name' | 'competitors' | 'all';

export interface CompetitorWatch {
  id: string;
  keyword: string;
  matchScope: MatchScope;
  enabled: boolean;
  createdAt: string;
}

export interface CompetitorHit {
  id: string;
  watchId: string;
  projectId: string;
  keyword: string;
  matchedField: string;
  createdAt: string;
}

export interface CompetitorAnalytic {
  watchId: string;
  keyword: string;
  matchScope: MatchScope;
  hitCount: number;
  projectCount: number;
  topProjects: { projectId: string; name: string; hitCount: number }[];
}

export const competitorApi = {
  list: () => request<CompetitorWatch[]>('/competitor-watches'),

  create: (body: { keyword: string; matchScope?: MatchScope; enabled?: boolean }) =>
    request<CompetitorWatch>('/competitor-watches', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  update: (
    id: string,
    body: { keyword?: string; matchScope?: MatchScope; enabled?: boolean },
  ) =>
    request<{ ok: true }>(`/competitor-watches/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  remove: (id: string) =>
    request<{ ok: true }>(`/competitor-watches/${id}`, { method: 'DELETE' }),

  hits: (params?: { page?: number; pageSize?: number; projectId?: string }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    if (params?.projectId) query.set('projectId', params.projectId);
    return request<{ items: CompetitorHit[]; total: number; page: number; pageSize: number }>(
      `/competitor-watches/hits?${query.toString()}`,
    );
  },

  analytics: () => request<{ items: CompetitorAnalytic[] }>('/competitor-watches/analytics'),
};

// ============ Automation Rules（自动化规则，P0-8） ============

export type RuleEventType =
  | 'project.created'
  | 'project.verified'
  | 'project.verdict.changed'
  | 'project.lifecycle.changed';

export type RuleConditionField =
  | 'verdict'
  | 'feasibilityIndex'
  | 'clusterId'
  | 'tag'
  | 'authenticityStars'
  | 'lifecycle';

export type RuleConditionOp = 'eq' | 'gte' | 'lte' | 'ne';

export interface RuleCondition {
  field: RuleConditionField;
  op: RuleConditionOp;
  value: string | number;
}

export type RuleActionType =
  | 'add_tag'
  | 'set_verdict'
  | 'favorite'
  | 'set_lifecycle'
  | 'notify';

export interface RuleAction {
  type: RuleActionType;
  payload: Record<string, unknown>;
}

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  eventType: RuleEventType;
  conditions: RuleCondition[];
  actions: RuleAction[];
  createdAt: string;
}

export interface RuleExecution {
  id: string;
  eventType: string;
  projectId: string;
  triggered: boolean;
  matched: boolean;
  actionResults: unknown;
  error: string | null;
  createdAt: string;
}

export const automationApi = {
  list: (enabled?: boolean) =>
    request<AutomationRule[]>(
      `/automation-rules${enabled !== undefined ? `?enabled=${enabled}` : ''}`,
    ),

  create: (body: Omit<AutomationRule, 'id' | 'createdAt'>) =>
    request<AutomationRule>('/automation-rules', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  update: (id: string, body: Partial<Omit<AutomationRule, 'id' | 'createdAt'>>) =>
    request<AutomationRule>(`/automation-rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  remove: (id: string) =>
    request<{ ok: true }>(`/automation-rules/${id}`, { method: 'DELETE' }),

  executions: (id: string, params?: { page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    return request<{ items: RuleExecution[]; total: number; page: number; pageSize: number }>(
      `/automation-rules/${id}/executions${query.toString() ? `?${query.toString()}` : ''}`,
    );
  },

  simulate: (body: { projectId: string; eventType?: RuleEventType }) =>
    request<unknown>('/automation-rules/_simulate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

// ============ Knowledge（知识库，Batch-3） ============

export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  tags: string[];
  source: string;
  projectId: string | null;
  projectName: string | null;
  createdAt: string;
  updatedAt: string;
}

export const knowledgeApi = {
  list: (params?: {
    q?: string;
    tag?: string;
    projectId?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.q) query.set('q', params.q);
    if (params?.tag) query.set('tag', params.tag);
    if (params?.projectId) query.set('projectId', params.projectId);
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    return request<{ items: KnowledgeItem[]; total: number; page: number; pageSize: number }>(
      `/knowledge?${query.toString()}`,
    );
  },

  tags: () => request<string[]>('/knowledge/tags'),

  create: (body: {
    title: string;
    content?: string;
    tags?: string[];
    source?: string;
    projectId?: string | null;
  }) =>
    request<KnowledgeItem>('/knowledge', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  update: (
    id: string,
    body: { title?: string; content?: string; tags?: string[]; source?: string },
  ) =>
    request<KnowledgeItem>(`/knowledge/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  remove: (id: string) =>
    request<{ ok: true }>(`/knowledge/${id}`, { method: 'DELETE' }),
};

// ============ Similar（相似项目推荐，Batch-3） ============

export interface SimilarProject {
  id: string;
  name: string;
  verdict: string | null;
  lifecycle: string | null;
  feasibilityIndex: number | null;
  sharedTags: string[];
  score: number;
  clusterId: string | null;
}

export const similarApi = {
  list: (projectId: string, limit = 5) =>
    request<{ items: SimilarProject[] }>(`/projects/${projectId}/similar?limit=${limit}`),
};

// ============ 信息采集（网页抓取，Batch-4） ============

export interface ScrapeResult {
  url: string;
  title: string;
  author?: string;
  siteName?: string;
  excerpt?: string;
  image?: string;
  text: string;
  length: number;
  fetchedAt: string;
}

export interface ScrapeJob {
  id: string;
  url: string;
  title?: string;
  intervalMinutes: number;
  enabled: boolean;
  lastRunAt?: string;
  lastStatus: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export const scrapeApi = {
  // save=false 时只返回预览，不落库；save=true 直接写入知识库(来源 web)
  scrape: (url: string, save = false) =>
    request<{ extracted: ScrapeResult; item?: KnowledgeItem }>('/knowledge/scrape', {
      method: 'POST',
      body: JSON.stringify({ url, save }),
    }),

  listJobs: () => request<{ items: ScrapeJob[] }>('/scrape-jobs'),

  createJob: (body: { url: string; title?: string; intervalMinutes?: number; enabled?: boolean }) =>
    request<ScrapeJob>('/scrape-jobs', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateJob: (
    id: string,
    body: { url?: string; title?: string; intervalMinutes?: number; enabled?: boolean },
  ) =>
    request<ScrapeJob>(`/scrape-jobs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteJob: (id: string) =>
    request<{ ok: boolean }>(`/scrape-jobs/${id}`, { method: 'DELETE' }),

  runJob: (id: string) =>
    request<{ ok: boolean }>(`/scrape-jobs/${id}/run`, { method: 'POST' }),
};

// ============ Dashboard (聚合) ============

export const dashboardApi = {
  getStats: async () => {
    // 聚合多个接口获取仪表盘数据
    const [emails, projects, reports] = await Promise.all([
      emailsApi.list({ pageSize: 1 }),
      projectsApi.list({ pageSize: 1 }),
      reportsApi.list(),
    ]);

    const todayReport = reports[0]; // 最新的报告

    return {
      totalEmails: emails.total,
      totalProjects: projects.total,
      todayReport: todayReport?.summaryJson || null,
      latestReport: todayReport,
    };
  },
};
