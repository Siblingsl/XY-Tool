import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsString,
  MaxLength,
  MinLength,
  validateSync,
} from 'class-validator';

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

export class EnvironmentVariables {
  @IsString()
  NODE_ENV: string;

  @IsNumber()
  PORT: number;

  @IsString()
  DB_HOST: string;

  @IsNumber()
  DB_PORT: number;

  @IsString()
  DB_USERNAME: string;

  @IsString()
  DB_PASSWORD: string;

  @IsString()
  DB_DATABASE: string;

  @IsString()
  REDIS_HOST: string;

  @IsNumber()
  REDIS_PORT: number;

  @IsString()
  @MinLength(16)
  JWT_SECRET: string;

  @IsString()
  JWT_EXPIRES_IN: string;

  @IsString()
  @MinLength(64)
  @MaxLength(64)
  COOKIE_ENCRYPTION_KEY: string;

  @IsEnum(SignProviderType)
  SIGN_PROVIDER: SignProviderType;

  @IsNumber()
  ORDER_POLL_INTERVAL_MS: number;

  /**
   * 校验 process.env，启动时调用。
   * 返回错误列表；为空表示通过。
   */
  static validate(config: Record<string, unknown>): string[] {
    const validated = plainToInstance(EnvironmentVariables, config, {
      enableImplicitConversion: true,
    });
    const errors = validateSync(validated, { skipMissingProperties: false });
    return errors.map((e) => Object.values(e.constraints || {}).join(', '));
  }
}
