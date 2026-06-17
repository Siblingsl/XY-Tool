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
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'insecure_default_secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
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
});
