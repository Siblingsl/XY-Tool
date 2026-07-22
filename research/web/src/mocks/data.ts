export type EmailStatus = 'pending' | 'parsing' | 'filtered' | 'done' | 'failed';
export type Verdict = 'do' | 'watch' | 'skip';
export type JobStage = 'parse' | 'identify' | 'verify' | 'score' | 'report';
export type JobStatus = 'queued' | 'running' | 'done' | 'skipped' | 'failed';

export interface MockEmail {
  id: string;
  subject: string;
  from: string;
  receivedAt: string;
  categories: string[];
  status: EmailStatus;
  filterReason?: string;
  snippet: string;
  links: string[];
}

export interface MvpWeek {
  week: number;
  items: string[];
}

export interface Evidence {
  source: string;
  url: string;
  claim: string;
  value: string;
  snippet: string;
}

export interface MockProject {
  id: string;
  emailId: string;
  clusterId?: string;
  clusterLabel?: string;
  card: {
    name: string;
    type: string;
    price: string;
    audience: string;
    model?: string;
    openSource: boolean | 'unknown';
    website: string;
    launchYear: number;
    author: string;
  };
  authenticityStars: number;
  feasibilityIndex: number;
  verdict: Verdict;
  lifecycle: 'emerging' | 'growing' | 'saturated' | 'declining';
  summary: string;
  evidences: Evidence[];
  competitors: { count: number; topPlayers: string[] };
  heatSeries: { date: string; score: number }[];
  scoreDimensions: { key: string; label: string; score: number }[];
  mvpPlan: MvpWeek[];
  sources: string[];
}

export interface MockReport {
  date: string;
  analyzed: number;
  worth: number;
  skip: number;
  watch: number;
  newDirections: number;
  bodyMd: string;
  highlightProjectIds: string[];
}

export interface MockJob {
  id: string;
  subject: string;
  stage: JobStage;
  status: JobStatus;
  updatedAt: string;
  note?: string;
}

export const mockEmails: MockEmail[] = [
  {
    id: 'em_1',
    subject: 'ClipMagic — AI video clips for YouTube creators',
    from: 'digest@producthunt.com',
    receivedAt: '2026-07-21 08:12',
    categories: ['AI_SaaS', 'ProductHunt', 'Tool'],
    status: 'done',
    snippet: 'New AI video SaaS that turns long videos into shorts. $29/mo.',
    links: ['https://example.com/clipmagic', 'https://github.com/example/clipmagic'],
  },
  {
    id: 'em_2',
    subject: 'Earn $10000 with AI Millionaire system — Passive Income',
    from: 'spam@getrich.example',
    receivedAt: '2026-07-21 07:40',
    categories: ['Other'],
    status: 'filtered',
    filterReason: '垃圾营销：命中 Get Rich / Passive Income',
    snippet: 'No Code required. Get Rich this weekend…',
    links: [],
  },
  {
    id: 'em_3',
    subject: 'AI PPT generator that writes decks in seconds',
    from: 'news@saasweekly.example',
    receivedAt: '2026-07-21 09:05',
    categories: ['AI_SaaS', 'Tool'],
    status: 'done',
    snippet: 'Another AI slides tool competing with Gamma.',
    links: ['https://example.com/aippt'],
  },
  {
    id: 'em_4',
    subject: 'Presentation AI / Pitch Deck AI — weekly roundup',
    from: 'hello@newsletter.example',
    receivedAt: '2026-07-21 09:20',
    categories: ['AI_SaaS', 'Newsletter'],
    status: 'done',
    snippet: 'AI Slides and Pitch Deck AI both launched this week.',
    links: ['https://example.com/slides-ai', 'https://example.com/pitch-ai'],
  },
  {
    id: 'em_5',
    subject: 'YC W26 batch: niche CRM for freelancers',
    from: 'updates@ycombinator.com',
    receivedAt: '2026-07-21 10:01',
    categories: ['YC', 'Startup', 'Investment'],
    status: 'done',
    snippet: 'Solo-friendly CRM with Stripe billing baked in.',
    links: ['https://example.com/freecrm'],
  },
  {
    id: 'em_6',
    subject: 'Open-source agent framework hits 2k stars',
    from: 'trending@github.example',
    receivedAt: '2026-07-21 11:15',
    categories: ['GitHub', 'OpenSource', 'Tool'],
    status: 'parsing',
    snippet: 'New agent toolkit — verifying claims…',
    links: ['https://github.com/example/agentkit'],
  },
];

export const mockProjects: MockProject[] = [
  {
    id: 'proj_clipmagic',
    emailId: 'em_1',
    card: {
      name: 'ClipMagic',
      type: 'AI Video',
      price: '$29/月',
      audience: 'YouTube Creator',
      model: '多模态剪辑模型',
      openSource: false,
      website: 'https://example.com/clipmagic',
      launchYear: 2026,
      author: 'ClipMagic Inc.',
    },
    authenticityStars: 4,
    feasibilityIndex: 92,
    verdict: 'do',
    lifecycle: 'growing',
    summary: '适合一个人 · 约 3 个月可完成 · 启动资金约 3000 元 · 可 MVP · 建议做',
    sources: ['GitHub', 'Product Hunt', 'Google Trends', 'Reddit'],
    evidences: [
      {
        source: 'github',
        url: 'https://github.com/example/clipmagic',
        claim: 'stars',
        value: '320',
        snippet: 'Public repo with 320 stars; last commit 2 days ago.',
      },
      {
        source: 'producthunt',
        url: 'https://www.producthunt.com/posts/clipmagic',
        claim: 'ph_rank',
        value: '#4 Product of the Day',
        snippet: 'Listed on PH with visible upvote count.',
      },
      {
        source: 'reddit',
        url: 'https://reddit.com/r/SideProject/comments/example',
        claim: 'user_feedback',
        value: 'mixed but real',
        snippet: 'Creators discuss pricing; no Stripe revenue screenshot found.',
      },
    ],
    competitors: { count: 8, topPlayers: ['Opus Clip', 'Vizard', 'Kapwing'] },
    heatSeries: [
      { date: '2026-07-15', score: 42 },
      { date: '2026-07-16', score: 48 },
      { date: '2026-07-17', score: 51 },
      { date: '2026-07-18', score: 55 },
      { date: '2026-07-19', score: 60 },
      { date: '2026-07-20', score: 64 },
      { date: '2026-07-21', score: 70 },
    ],
    scoreDimensions: [
      { key: 'devDifficulty', label: '开发难度', score: 6 },
      { key: 'capitalNeeded', label: '启动资金', score: 8 },
      { key: 'soloFeasible', label: '一人可完成', score: 9 },
      { key: 'competition', label: '竞争（越高越宽松）', score: 5 },
      { key: 'modelCost', label: '模型成本可控', score: 6 },
      { key: 'chinaFeasible', label: '国内可做', score: 7 },
    ],
    mvpPlan: [
      { week: 1, items: ['完成登录与项目空间'] },
      { week: 2, items: ['完成支付与套餐'] },
      { week: 3, items: ['接入剪辑模型 API'] },
      { week: 4, items: ['上线首个导出流程'] },
    ],
  },
  {
    id: 'proj_aippt',
    emailId: 'em_3',
    clusterId: 'cluster_ai_ppt',
    clusterLabel: 'AI PPT',
    card: {
      name: 'DeckForge AI',
      type: 'AI PPT',
      price: '$19/月',
      audience: '商务汇报 / 创业者',
      openSource: false,
      website: 'https://example.com/aippt',
      launchYear: 2024,
      author: 'DeckForge',
    },
    authenticityStars: 5,
    feasibilityIndex: 28,
    verdict: 'skip',
    lifecycle: 'saturated',
    summary: '已经红海 · 竞争过大 · 需要大量推广预算 · 不建议',
    sources: ['Product Hunt', 'Google', 'GitHub', 'YouTube'],
    evidences: [
      {
        source: 'google',
        url: 'https://www.google.com/search?q=ai+ppt+generator',
        claim: 'market_density',
        value: 'very high',
        snippet: 'Dozens of incumbents since 2022–2025.',
      },
      {
        source: 'producthunt',
        url: 'https://www.producthunt.com/topics/presentation',
        claim: 'category_saturation',
        value: 'saturated',
        snippet: 'Multiple AI deck tools ranked historically.',
      },
    ],
    competitors: { count: 12, topPlayers: ['Gamma', 'Beautiful.ai', 'Canva'] },
    heatSeries: [
      { date: '2026-07-15', score: 88 },
      { date: '2026-07-16', score: 87 },
      { date: '2026-07-17', score: 86 },
      { date: '2026-07-18', score: 85 },
      { date: '2026-07-19', score: 84 },
      { date: '2026-07-20', score: 83 },
      { date: '2026-07-21', score: 82 },
    ],
    scoreDimensions: [
      { key: 'devDifficulty', label: '开发难度', score: 5 },
      { key: 'capitalNeeded', label: '启动资金', score: 3 },
      { key: 'soloFeasible', label: '一人可完成', score: 4 },
      { key: 'competition', label: '竞争（越高越宽松）', score: 1 },
      { key: 'promoCost', label: '推广成本可控', score: 2 },
      { key: 'chinaFeasible', label: '国内可做', score: 6 },
    ],
    mvpPlan: [
      { week: 1, items: ['（不建议投入）竞品差距评审'] },
      { week: 2, items: ['若执意：只做垂直模板差异'] },
    ],
  },
  {
    id: 'proj_freecrm',
    emailId: 'em_5',
    card: {
      name: 'SoloCRM',
      type: 'Niche CRM',
      price: '$12/月',
      audience: '自由职业者',
      openSource: 'unknown',
      website: 'https://example.com/freecrm',
      launchYear: 2026,
      author: 'YC W26',
    },
    authenticityStars: 3,
    feasibilityIndex: 74,
    verdict: 'watch',
    lifecycle: 'emerging',
    summary: '方向可做 · 融资叙事待验证 · 继续观察 2 周',
    sources: ['Crunchbase', 'LinkedIn', 'Hacker News'],
    evidences: [
      {
        source: 'crunchbase',
        url: 'https://www.crunchbase.com/organization/example',
        claim: 'funding',
        value: 'unverified seed rumor',
        snippet: 'No primary filing found; treat funding claim as unverified.',
      },
      {
        source: 'hackernews',
        url: 'https://news.ycombinator.com/item?id=example',
        claim: 'discussion',
        value: '48 comments',
        snippet: 'HN thread discusses freelancer CRM pain points.',
      },
    ],
    competitors: { count: 15, topPlayers: ['HubSpot', 'Notion', 'Attio'] },
    heatSeries: [
      { date: '2026-07-15', score: 30 },
      { date: '2026-07-16', score: 32 },
      { date: '2026-07-17', score: 35 },
      { date: '2026-07-18', score: 40 },
      { date: '2026-07-19', score: 44 },
      { date: '2026-07-20', score: 46 },
      { date: '2026-07-21', score: 50 },
    ],
    scoreDimensions: [
      { key: 'devDifficulty', label: '开发难度', score: 5 },
      { key: 'capitalNeeded', label: '启动资金', score: 7 },
      { key: 'soloFeasible', label: '一人可完成', score: 8 },
      { key: 'competition', label: '竞争（越高越宽松）', score: 4 },
      { key: 'chinaFeasible', label: '国内可做', score: 8 },
    ],
    mvpPlan: [
      { week: 1, items: ['联系人 + 跟进看板'] },
      { week: 2, items: ['简单账单提醒'] },
      { week: 3, items: ['Stripe 收款'] },
      { week: 4, items: ['邮件跟进模板'] },
    ],
  },
];

export const mockClusters = [
  {
    id: 'cluster_ai_ppt',
    label: 'AI PPT',
    aliases: ['AI PPT', 'AI Slides', 'Presentation AI', 'Pitch Deck AI'],
    projectIds: ['proj_aippt'],
    note: '今日多封邮件实为同一方向，聚类后计 1 个新方向',
  },
];

export const mockReports: MockReport[] = [
  {
    date: '2026-07-21',
    analyzed: 18,
    worth: 3,
    skip: 11,
    watch: 4,
    newDirections: 1,
    highlightProjectIds: ['proj_clipmagic', 'proj_freecrm', 'proj_aippt'],
    bodyMd: `## 今日项目投资报告（2026-07-21）

- 共分析：**18** 个项目
- 值得研究：**3**
- 建议放弃：**11**
- 继续观察：**4**
- 今日新增真正新方向：**1**（AI 短视频剪辑）；AI PPT 族已聚类不计新方向

### 值得研究

1. **ClipMagic** — 真实性 ★★★★☆ · 落地指数 92 · 建议做
2. **SoloCRM** — 真实性 ★★★☆☆ · 落地指数 74 · 继续观察

### 建议放弃

1. **DeckForge AI（AI PPT 簇）** — 已红海，竞品 Gamma / Beautiful.ai / Canva
`,
  },
  {
    date: '2026-07-20',
    analyzed: 12,
    worth: 2,
    skip: 8,
    watch: 2,
    newDirections: 2,
    highlightProjectIds: [],
    bodyMd: `## 今日项目投资报告（2026-07-20）\n\n（历史示例）共分析 12 个项目，值得研究 2 个。`,
  },
];

export const mockJobs: MockJob[] = [
  {
    id: 'job_1',
    subject: 'ClipMagic — AI video clips',
    stage: 'score',
    status: 'done',
    updatedAt: '2026-07-21 08:40',
    note: '五层完成',
  },
  {
    id: 'job_2',
    subject: 'Earn $10000… Passive Income',
    stage: 'parse',
    status: 'skipped',
    updatedAt: '2026-07-21 07:41',
    note: '营销过滤',
  },
  {
    id: 'job_3',
    subject: 'AI PPT generator…',
    stage: 'verify',
    status: 'done',
    updatedAt: '2026-07-21 09:30',
    note: '判定 saturated',
  },
  {
    id: 'job_4',
    subject: 'Open-source agent framework…',
    stage: 'verify',
    status: 'running',
    updatedAt: '2026-07-21 11:20',
    note: '正在检索 GitHub / HN',
  },
  {
    id: 'job_5',
    subject: 'YC W26 batch: niche CRM',
    stage: 'identify',
    status: 'queued',
    updatedAt: '2026-07-21 11:22',
  },
];

export const mockDashboard = {
  analyzed: 18,
  worth: 3,
  skip: 11,
  watch: 4,
  newDirections: 1,
  filteredMarketing: 5,
};

export const mockSettings = {
  gmailConnected: false,
  gmailEmail: '',
  marketingKeywords: [
    'Earn $',
    'Get Rich',
    'AI Millionaire',
    'No Code',
    'Passive Income',
  ],
  reportTime: '21:00',
  enabledVerifySources: [
    'google',
    'github',
    'producthunt',
    'reddit',
    'hackernews',
    'google_trends',
  ],
};

export function getProject(id: string) {
  return mockProjects.find((p) => p.id === id);
}
