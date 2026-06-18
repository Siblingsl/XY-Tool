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
    pollIntervalMs: parseInt(
      process.env.ORDER_POLL_INTERVAL_MS || '15000',
      10,
    ),
    mockMode:
      process.env.ORDER_MOCK_MODE != null
        ? String(process.env.ORDER_MOCK_MODE) === 'true'
        : (process.env.SIGN_PROVIDER || 'mock') === 'mock',
  },

  /** IM WebSocket 付款消息监听 */
  im: {
    paymentListenEnabled:
      process.env.IM_PAYMENT_LISTEN_ENABLED == null
        ? (process.env.SIGN_PROVIDER || 'mock') === 'goofish'
        : String(process.env.IM_PAYMENT_LISTEN_ENABLED) === 'true',
  },

  /** Cookie 主动健康检查 */
  cookieHealth: {
    enabled: process.env.COOKIE_HEALTH_CHECK_ENABLED !== 'false',
    intervalMs: parseInt(
      process.env.COOKIE_HEALTH_CHECK_INTERVAL_MS || '300000',
      10,
    ),
  },

  /** 虚拟商品 IM 发送后是否调用闲鱼「确认发货」 */
  delivery: {
    confirmEnabled: String(process.env.CONFIRM_DELIVERY_ENABLED) === 'true',
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
});
