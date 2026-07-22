/**
 * 配置映射：把 process.env 转为强类型的 Config 对象。
 * 在 ConfigModule.forRoot({ load: [configuration] }) 中加载后，
 * 即可通过 ConfigService.get<T>('xxx') 强类型访问。
 */
export default () => ({
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'xianyu_autodeliver',
    sync: String(process.env.DB_SYNC) === 'true',
    logging: process.env.DB_LOGGING === 'true',
    /**
     * 启动时是否自动执行未运行的 migration。
     * 生产推荐 true（配合 DB_SYNC=false）；开发默认 false（用 sync 建表）。
     */
    migrationsRun:
      process.env.DB_MIGRATIONS_RUN == null
        ? process.env.NODE_ENV === 'production'
        : String(process.env.DB_MIGRATIONS_RUN) === 'true',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    /**
     * Refresh Token 配置。
     * - refreshSecret 默认派生自主 secret（加后缀），生产建议单独设置
     * - refreshExpiresIn 默认 30 天，覆盖 access 过期后无感续期
     */
    refreshSecret:
      process.env.JWT_REFRESH_SECRET || (process.env.JWT_SECRET ? process.env.JWT_SECRET + '_refresh' : undefined),
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  /**
   * 账号 Cookie 加密主密钥（hex 编码的 32 字节）。
   * 必须通过环境变量提供，不要硬编码。
   */
  cookieEncryptionKey: process.env.COOKIE_ENCRYPTION_KEY || '',

  sign: {
    provider: process.env.SIGN_PROVIDER || 'mock',
    httpUrl: process.env.SIGN_HTTP_URL || '',
    httpToken: process.env.SIGN_HTTP_TOKEN || '',
    nativeEndpoint: process.env.SIGN_NATIVE_ENDPOINT || 'http://127.0.0.1:9090',
  },

  order: {
    /**
     * 轮询 mtop「待发货订单」——自动发货主建单路径（不依赖 IM token）。
     * WS 付款监听仅加速感知；token 被风控时仍可靠轮询建单。
     */
    pollEnabled:
      process.env.ORDER_POLL_ENABLED != null
        ? String(process.env.ORDER_POLL_ENABLED) === 'true'
        : true,
    /** 轮询间隔，默认 1 分钟 */
    pollIntervalMs: parseInt(
      process.env.ORDER_POLL_INTERVAL_MS || '60000',
      10,
    ),
    mockMode:
      process.env.ORDER_MOCK_MODE != null
        ? String(process.env.ORDER_MOCK_MODE) === 'true'
        : (process.env.SIGN_PROVIDER || 'mock') === 'mock',
  },

  /**
   * IM WebSocket 付款监听（可选加速）。
   * 需要 login.token；被 USER_VALIDATE 时自动退避，不打断轮询发货。
   */
  im: {
    paymentListenEnabled:
      process.env.IM_PAYMENT_LISTEN_ENABLED == null
        ? (process.env.SIGN_PROVIDER || 'mock') === 'goofish'
        : String(process.env.IM_PAYMENT_LISTEN_ENABLED) === 'true',
    /** login.token 风控后多久再试连 WS（毫秒），默认 30 分钟 */
    captchaBackoffMs: parseInt(
      process.env.IM_WS_CAPTCHA_BACKOFF_MS || '1800000',
      10,
    ),
  },

  /** Cookie 主动健康检查 */
  cookieHealth: {
    enabled: process.env.COOKIE_HEALTH_CHECK_ENABLED !== 'false',
    intervalMs: parseInt(
      process.env.COOKIE_HEALTH_CHECK_INTERVAL_MS || '300000',
      10,
    ),
  },

  /**
   * Cookie 长登录保活（hasLogin.do 接口续期）。
   * 解决扫码登录一天就过期：定时刷新核心登录态，延长到 7-30 天。
   * 仅 goofish 签名模式生效。
   */
  cookieRenew: {
    enabled: process.env.COOKIE_RENEW_ENABLED !== 'false',
    cron: process.env.COOKIE_RENEW_CRON || '0 */6 * * *',
  },

  /** 虚拟商品 IM 发送后是否调用闲鱼「确认发货」 */
  delivery: {
    confirmEnabled: String(process.env.CONFIRM_DELIVERY_ENABLED) === 'true',
  },

  /** 商品草稿本地图片目录（相对 server 工作目录） */
  itemDraft: {
    uploadDir: process.env.ITEM_DRAFT_UPLOAD_DIR || 'uploads/item-drafts',
  },

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },

  /** 全局限流（毫秒窗口 + 最大请求数）。auth 路由另在 Controller 收紧。 */
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '120', 10),
  },

  /**
   * 激活码中台配置。
   * apiKey: 对外验证 API 的密钥（外部工具用 X-API-Key 头鉴权）。
   *         生成：openssl rand -hex 24
   */
  license: {
    apiKey: process.env.LICENSE_API_KEY || '',
  },

  /**
   * 告警通道配置。
   * 当发货失败 / 账号过期 / 库存不足 / 订单卡住时推送到外部 IM。
   * - dingtalk: Webhook URL（可选加签 secret）
   * - wechat: 企业微信机器人 Webhook URL
   * 至少配置一个通道告警才能生效。
   */
  alert: {
    enabled: process.env.ALERT_ENABLED !== 'false',
    dingtalk: {
      webhook: process.env.ALERT_DINGTALK_WEBHOOK || '',
      secret: process.env.ALERT_DINGTALK_SECRET || '',
    },
    wechat: {
      webhook: process.env.ALERT_WECHAT_WEBHOOK || '',
    },
    onFinalFailure: process.env.ALERT_ON_FINAL_FAILURE !== 'false',
    onAccountExpired: process.env.ALERT_ON_ACCOUNT_EXPIRED !== 'false',
    onLowStock: process.env.ALERT_ON_LOW_STOCK !== 'false',
    onStuckOrders: process.env.ALERT_ON_STUCK_ORDERS !== 'false',
  },

  /**
   * 项目研究系统配置。
   * Gmail OAuth 凭证 + 搜索适配器 + 日报定时。
   */
  research: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri:
        process.env.GOOGLE_REDIRECT_URI ||
        'http://localhost:3000/api/research/gmail/callback',
      /**
       * Google API 代理 Worker 地址（国内服务器无法直连 Google 时必填）。
       * 形如 https://gproxy.example.com，留空则直连 Google。
       */
      proxyUrl: process.env.GOOGLE_PROXY_URL || '',
      /** 代理 Worker 的访问密钥（对应 Worker 的 PROXY_ACCESS_KEY，可选） */
      proxyKey: process.env.GOOGLE_PROXY_KEY || '',
    },
    /** 搜索适配器: serp | mock */
    searchProvider: process.env.SEARCH_PROVIDER || 'mock',
    serpapiKey: process.env.SERPAPI_KEY || '',
    /** 日报生成 cron（默认每天 21:00） */
    reportCron: process.env.RESEARCH_REPORT_CRON || '0 21 * * *',
    /** 日报时区 */
    reportTz: process.env.RESEARCH_TZ || 'Asia/Shanghai',
    /** 研究前端地址（OAuth 回调后重定向） */
    frontendUrl: process.env.RESEARCH_FRONTEND_URL || 'http://localhost:5174',
  },
});
