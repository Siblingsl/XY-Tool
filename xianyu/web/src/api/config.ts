/**
 * API 根地址。
 * - 开发：默认 /api（Vite 代理到本地后端）
 * - 生产：构建时设 VITE_API_BASE_URL=https://api.example.com/api
 *   浏览器直连 API（不经 Pages Functions），适合国内服务器 + CF 橙云回源
 */
export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  '/api';

/** 拼出带 /api 前缀的完整 URL（用于 fetch、WebSocket 等） */
export function apiPath(subpath: string): string {
  const path = subpath.startsWith('/') ? subpath : `/${subpath}`;
  if (API_BASE_URL === '/api') {
    return path.startsWith('/api') ? path : `/api${path}`;
  }
  const suffix = path.startsWith('/api') ? path.slice(4) : path;
  return `${API_BASE_URL}${suffix}`;
}

/** WebSocket 地址 */
export function wsUrl(token: string): string {
  if (API_BASE_URL === '/api') {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.host}/api/ws?token=${encodeURIComponent(token)}`;
  }
  const base = new URL(API_BASE_URL);
  const proto = base.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${base.host}/api/ws?token=${encodeURIComponent(token)}`;
}
