/**
 * 研究系统 API 服务层。
 * - 开发：默认 /api（Vite 代理到本地后端）
 * - 生产：构建时注入 VITE_API_BASE_URL（如 https://xy-api.skyed.dpdns.org/api）
 *   浏览器直连 API；CF Pages 的 _redirects 无法可靠反代外部源。
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

export const authApi = {
  login: async (username: string, password: string) => {
    const response = await fetch(apiUrl('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      throw new Error('登录失败');
    }
    const json = await response.json();
    // 解包 TransformInterceptor 的 { code, message, data } 包装
    const data = json && typeof json === 'object' && 'data' in json ? json.data : json;
    localStorage.setItem('research_token', data.accessToken);
    return data;
  },

  logout: () => {
    localStorage.removeItem('research_token');
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
  list: (params?: {
    verdict?: string;
    clusterId?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.verdict) query.set('verdict', params.verdict);
    if (params?.clusterId) query.set('clusterId', params.clusterId);
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    return request<{ items: Project[]; total: number; page: number; pageSize: number }>(
      `/projects?${query.toString()}`,
    );
  },

  get: (id: string) => request<ProjectDetail>(`/projects/${id}`),

  reverify: (id: string) =>
    request<{ message: string }>(`/projects/${id}/reverify`, { method: 'POST' }),

  rescore: (id: string) =>
    request<{ message: string }>(`/projects/${id}/rescore`, { method: 'POST' }),
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
