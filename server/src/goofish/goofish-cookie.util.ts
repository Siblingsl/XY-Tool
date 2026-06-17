import { loadGoofishSdk } from './goofish-sdk.loader';

/** Cookie / 设备 ID / mid — 委托 goofish-sdk */
export function parseCookies(cookiesStr: string): Record<string, string> {
  return loadGoofishSdk().parseCookies(cookiesStr);
}

export function cookiesToString(cookies: Record<string, string>): string {
  return loadGoofishSdk().cookiesToString(cookies);
}

export function extractMtopToken(cookie: string): string {
  const jar = parseCookies(cookie);
  const tk = jar._m_h5_tk || '';
  return tk.split('_')[0];
}

export function generateDeviceId(userId: string): string {
  return loadGoofishSdk().generateDeviceId(userId);
}

export function generateMid(): string {
  return loadGoofishSdk().generateMid();
}

export function generateUuid(): string {
  return loadGoofishSdk().generateUuid();
}

/** 从 HTTP Set-Cookie 合并到 cookie jar */
export function mergeSetCookie(
  jar: Record<string, string>,
  setCookie: string | string[] | undefined,
): Record<string, string> {
  const out = { ...jar };
  if (!setCookie) return out;
  const lines = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const line of lines) {
    const part = line.split(';')[0]?.trim();
    if (!part || !part.includes('=')) continue;
    const eq = part.indexOf('=');
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}
