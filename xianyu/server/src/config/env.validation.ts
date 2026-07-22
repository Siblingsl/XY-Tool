/**
 * 可用的签名服务提供者
 * - mock:  开发用，返回固定假签名
 * - http:  接入第三方签名 API
 * - native:自研 so 签名服务
 */
export enum SignProviderType {
  Mock = 'mock',
  Http = 'http',
  Native = 'native',
  Goofish = 'goofish',
}

interface ValidationRule {
  name: string;
  required?: boolean;
  validate: (val: unknown) => string | null; // null = 通过，string = 错误消息
  transform?: (val: unknown) => unknown;     // 转为目标类型
}

export class EnvironmentVariables {
  static validate(config: Record<string, unknown>): string[] {
    const errors: string[] = [];

    for (const rule of this.rules) {
      const val = config[rule.name];
      // 非必需且未设置 -> 跳过
      if (rule.required === false && (val === undefined || val === '')) {
        continue;
      }
      // 必需但缺失
      if (rule.required !== false && (val === undefined || val === '')) {
        errors.push(`${rule.name} is required`);
        continue;
      }
      // 校验值
      const err = rule.validate(val);
      if (err) {
        errors.push(`${rule.name}: ${err}`);
        continue;
      }
      // 转换类型
      if (rule.transform) {
        (config as Record<string, unknown>)[rule.name] = rule.transform(val);
      }
    }

    return errors;
  }

  private static rules: ValidationRule[] = [
    { name: 'NODE_ENV', validate: (v) => typeof v === 'string' ? null : 'must be a string' },
    { name: 'PORT', required: false, validate: (v) => v === undefined || v === '' || (typeof v === 'string' && /^\d+$/.test(v) && Number(v) > 0 && Number(v) < 65536) ? null : 'must be a port number (1-65535)', transform: (v) => Number(v) },
    { name: 'DB_HOST', validate: (v) => typeof v === 'string' ? null : 'must be a string' },
    { name: 'DB_PORT', required: false, validate: (v) => v === undefined || v === '' || (typeof v === 'string' && /^\d+$/.test(v) && Number(v) > 0 && Number(v) < 65536) ? null : 'must be a port number (1-65535)', transform: (v) => Number(v) },
    { name: 'DB_USERNAME', validate: (v) => typeof v === 'string' ? null : 'must be a string' },
    { name: 'DB_PASSWORD', validate: (v) => typeof v === 'string' ? null : 'must be a string' },
    { name: 'DB_DATABASE', validate: (v) => typeof v === 'string' ? null : 'must be a string' },
    { name: 'REDIS_HOST', validate: (v) => typeof v === 'string' ? null : 'must be a string' },
    { name: 'REDIS_PORT', required: false, validate: (v) => v === undefined || v === '' || (typeof v === 'string' && /^\d+$/.test(v) && Number(v) > 0 && Number(v) < 65536) ? null : 'must be a port number (1-65535)', transform: (v) => Number(v) },
    { name: 'JWT_SECRET', validate: (v) => typeof v === 'string' && v.length >= 16 ? null : 'must be a string with at least 16 characters' },
    { name: 'JWT_EXPIRES_IN', required: false, validate: (v) => v === undefined || v === '' || typeof v === 'string' ? null : 'must be a string' },
    { name: 'COOKIE_ENCRYPTION_KEY', required: false, validate: (v) => v === undefined || v === '' || (typeof v === 'string' && v.length >= 64 && v.length <= 64) ? null : 'must be a 64-character string', transform: (v) => typeof v === 'string' ? v.padEnd(64).slice(0, 64) : v },
    { name: 'SIGN_PROVIDER', required: false, validate: (v) => v === undefined || v === '' || Object.values(SignProviderType).includes(v as SignProviderType) ? null : `must be one of: ${Object.values(SignProviderType).join(', ')}` },
    { name: 'ORDER_POLL_INTERVAL_MS', required: false, validate: (v) => v === undefined || v === '' || (typeof v === 'string' && /^\d+$/.test(v) && Number(v) > 0) ? null : 'must be a positive integer', transform: (v) => Number(v) },
  ];
}
