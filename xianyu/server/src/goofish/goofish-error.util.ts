/**
 * 闲鱼错误分类。
 *
 * 注意区分：
 * - FAIL_SYS_USER_VALIDATE / 滑块：闲鱼常见风控响应，不等于 Cookie 失效
 * - FAIL_SYS_SESSION_EXPIRED / NEED_LOGIN 等：真正需要重新登录
 */

/** 真正 Session 失效（需重新扫码），不含 USER_VALIDATE */
export function isGoofishSessionExpiredFromRet(ret?: string[]): boolean {
  if (!ret?.length) return false;
  const retStr = ret.join(' ');
  // USER_VALIDATE 单独走 captcha，避免误标过期
  if (isGoofishCaptchaFromRet(ret)) return false;
  return (
    retStr.includes('FAIL_SYS_SESSION_EXPIRED') ||
    retStr.includes('Session过期') ||
    retStr.includes('AUTH_REJECT') ||
    retStr.includes('NEED_LOGIN') ||
    retStr.includes('FAIL_SYS_TOKEN_EMPTY') ||
    retStr.includes('请重新登录') ||
    retStr.includes('已掉线') ||
    retStr.includes('非法请求') ||
    retStr.includes('PERMISSION_EXCEPTION')
  );
}

/** Cookie 会话已失效 */
export function isGoofishSessionExpired(error: unknown): boolean {
  if (!error) return false;
  // 滑块优先，避免被 message 里的关键字误判为过期
  if (isGoofishCaptchaChallenge(error)) return false;

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

/** 令牌过期（可刷新，不等于 Session 失效） */
export function isGoofishTokenExpired(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('令牌过期') ||
    msg.includes('FAIL_SYS_TOKEN_EXOIRED') ||
    msg.includes('TOKEN_EXOIRED')
  );
}

/**
 * 闲鱼风控/滑块类响应（常见、可重试，不应当成掉线）。
 * 仅用于日志提醒，不用于停业务/冷静期。
 */
export function isGoofishCaptchaChallenge(error: unknown): boolean {
  if (!error) return false;
  const parts: string[] = [];
  if (typeof error === 'object' && error !== null) {
    const obj = error as { ret?: string[]; code?: string; message?: string };
    if (obj.ret?.length) parts.push(...obj.ret);
    if (obj.code) parts.push(String(obj.code));
    if (obj.message) parts.push(String(obj.message));
  }
  parts.push(error instanceof Error ? error.message : String(error));
  const text = parts.join(' ').toLowerCase();
  return (
    text.includes('rgv527') ||
    text.includes('x5sec') ||
    text.includes('punish') ||
    text.includes('captcha') ||
    text.includes('滑块') ||
    text.includes('验证码') ||
    text.includes('人机验证') ||
    text.includes('fail_sys_user_validate') ||
    text.includes('user_validate') ||
    text.includes('sm-captcha') ||
    text.includes('bixi')
  );
}

export function isGoofishCaptchaFromRet(ret?: string[]): boolean {
  if (!ret?.length) return false;
  return isGoofishCaptchaChallenge({ ret });
}
