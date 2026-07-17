import { Logger } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import {
  isGoofishCaptchaChallenge,
  isGoofishSessionExpired,
} from '../../goofish/goofish-error.util';

const logger = new Logger('AccountAuth');

export type AccountAuthSideEffect = (accountId: number) => Promise<void>;

const expiredHandlers: Set<AccountAuthSideEffect> = new Set();

/** 注册全局副作用：账号过期时停止 WS 等 */
export function registerAccountExpiredHandler(
  handler: AccountAuthSideEffect,
): void {
  expiredHandlers.add(handler);
}

async function runExpiredHandlers(accountId: number): Promise<void> {
  for (const handler of expiredHandlers) {
    try {
      await handler(accountId);
    } catch (e) {
      logger.error(
        `账号 ${accountId} 过期副作用失败: ${(e as Error).message}`,
      );
    }
  }
}

/**
 * 账号鉴权错误处理（尽量克制）：
 * - 滑块/USER_VALIDATE：仅 warn，不禁用、不冷静期
 * - 真正 Session 过期：markExpired + 停 WS
 */
export async function handleAccountAuthError(
  accounts: AccountsService,
  accountId: number,
  error: unknown,
): Promise<boolean> {
  // 闲鱼常见风控码：只提醒，不当作掉线
  if (isGoofishCaptchaChallenge(error)) {
    logger.warn(
      `账号 ${accountId} 闲鱼风控提示（滑块/USER_VALIDATE），不禁用账号，稍后自动重试`,
    );
    return true;
  }

  if (!isGoofishSessionExpired(error)) return false;

  const already = await accounts.findByIdUnsafe(accountId);
  if (already?.status === 'expired') {
    await runExpiredHandlers(accountId);
    return true;
  }

  await accounts.markExpired(accountId);
  logger.warn(`账号 ${accountId} Cookie 已过期，已自动标记为 expired`);

  await runExpiredHandlers(accountId);
  return true;
}
