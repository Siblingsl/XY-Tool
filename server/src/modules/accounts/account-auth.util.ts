import { Logger } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { isGoofishSessionExpired } from '../../goofish/goofish-error.util';

const logger = new Logger('AccountAuth');

export type AccountAuthSideEffect = (accountId: number) => Promise<void>;

let onExpiredSideEffect: AccountAuthSideEffect | null = null;

/** 注册全局副作用：账号过期时停止 WS 等 */
export function registerAccountExpiredHandler(
  handler: AccountAuthSideEffect,
): void {
  onExpiredSideEffect = handler;
}

/**
 * 检测到 Session 过期时：
 * 1. 标记账号 expired + 禁用
 * 2. 触发副作用（停止 WS 监听等）
 */
export async function handleAccountAuthError(
  accounts: AccountsService,
  accountId: number,
  error: unknown,
): Promise<boolean> {
  if (!isGoofishSessionExpired(error)) return false;

  const already = await accounts.findByIdUnsafe(accountId);
  if (already?.status === 'expired') {
    if (onExpiredSideEffect) {
      try {
        await onExpiredSideEffect(accountId);
      } catch (e) {
        logger.error(
          `账号 ${accountId} 过期副作用失败: ${(e as Error).message}`,
        );
      }
    }
    return true;
  }

  await accounts.markExpired(accountId);
  logger.warn(`账号 ${accountId} Cookie 已过期，已自动标记为 expired`);

  if (onExpiredSideEffect) {
    try {
      await onExpiredSideEffect(accountId);
    } catch (e) {
      logger.error(
        `账号 ${accountId} 过期副作用失败: ${(e as Error).message}`,
      );
    }
  }
  return true;
}
