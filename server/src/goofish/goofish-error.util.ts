/** 从 mtop ret 数组判断是否 Session 已失效（需重新登录） */
export function isGoofishSessionExpiredFromRet(ret?: string[]): boolean {
  if (!ret?.length) return false;
  const retStr = ret.join(' ');
  return (
    retStr.includes('FAIL_SYS_SESSION_EXPIRED') ||
    retStr.includes('Session过期') ||
    retStr.includes('FAIL_SYS_USER_VALIDATE') ||
    retStr.includes('AUTH_REJECT') ||
    retStr.includes('NEED_LOGIN') ||
    retStr.includes('FAIL_SYS_TOKEN_EMPTY') ||
    retStr.includes('请重新登录') ||
    retStr.includes('已掉线') ||
    retStr.includes('非法请求')
  );
}

/** 闲鱼 mtop / WS 错误是否表示 Cookie 会话已失效 */
export function isGoofishSessionExpired(error: unknown): boolean {
  if (!error) return false;

  if (typeof error === 'object' && error !== null) {
    const obj = error as { ret?: string[]; code?: string; detail?: unknown };
    if (isGoofishSessionExpiredFromRet(obj.ret)) return true;
    if (obj.code && isGoofishSessionExpiredFromRet([String(obj.code)])) {
      return true;
    }
    if (obj.detail && isGoofishSessionExpired(obj.detail)) return true;
  }

  const msg = error instanceof Error ? error.message : String(error);
  return (
    isGoofishSessionExpiredFromRet([msg]) ||
    msg.includes('登录过期') ||
    msg.includes('session expired') ||
    msg.includes('Cookie 缺少 unb')
  );
}

/** 令牌过期（可通过 Set-Cookie 刷新，不等于 Session 失效） */
export function isGoofishTokenExpired(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('令牌过期') ||
    msg.includes('FAIL_SYS_TOKEN_EXOIRED') ||
    msg.includes('TOKEN_EXOIRED')
  );
}
