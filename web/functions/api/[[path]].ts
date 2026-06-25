/**
 * Cloudflare Pages Function：将 /api/* 反代到后端服务器。
 * BACKEND_URL 在 wrangler.toml [vars] 或 CF Pages 环境变量中配置。
 */
interface Env {
  BACKEND_URL: string;
}

export const onRequest = async (context: {
  request: Request;
  env: Env;
  params: Record<string, string | string[] | undefined>;
}): Promise<Response> => {
  const { request, env, params } = context;
  const backend = (env.BACKEND_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
  const subPath = (params.path as string | undefined) ?? '';
  const url = new URL(request.url);
  const target = `${backend}/api/${subPath}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete('host');

  // WebSocket（/api/ws）透传 Upgrade
  if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
    return fetch(target, { method: request.method, headers, body: request.body });
  }

  return fetch(target, {
    method: request.method,
    headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    redirect: 'manual',
  });
};
