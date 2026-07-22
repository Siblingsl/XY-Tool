/**
 * Cloudflare Worker：Google API 反向代理。
 *
 * 背景：后端部署在国内云服务器，无法直连 Google。本 Worker 跑在 Cloudflare
 * 全球网络上，可自由访问 Google，后端把 OAuth 换 token 与 Gmail 拉取的请求
 * 转发到这里，再由 Worker 代为请求 Google。
 *
 * 路由规则：https://<worker-host>/<目标host>/<原始路径>?<query>
 *   例：
 *     https://gproxy.example.com/oauth2.googleapis.com/token
 *       → https://oauth2.googleapis.com/token
 *     https://gproxy.example.com/gmail.googleapis.com/gmail/v1/users/me/messages
 *       → https://gmail.googleapis.com/gmail/v1/users/me/messages
 *
 * 安全：
 *   1. 仅允许白名单内的 Google 域名，杜绝被当作开放代理滥用；
 *   2. 若设置了 PROXY_ACCESS_KEY（wrangler secret），则要求请求携带
 *      x-proxy-key 头且值匹配，否则一律 401。
 */

const ALLOWED_HOSTS = new Set([
  'oauth2.googleapis.com',
  'gmail.googleapis.com',
  'www.googleapis.com',
  'googleapis.com',
]);

// 不应转发的逐跳 / 代理自身相关头部
const STRIP_HEADERS = [
  'host',
  'x-proxy-key',
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'cf-visitor',
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-real-ip',
];

export default {
  async fetch(request, env) {
    const reqUrl = new URL(request.url);

    // 健康检查
    if (reqUrl.pathname === '/' || reqUrl.pathname === '/health') {
      return new Response('google-proxy ok', { status: 200 });
    }

    // 访问密钥校验（可选，但生产强烈建议设置）
    if (env.PROXY_ACCESS_KEY) {
      const key = request.headers.get('x-proxy-key');
      if (key !== env.PROXY_ACCESS_KEY) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    // 解析目标 host：取第一段路径
    const segments = reqUrl.pathname.split('/').filter(Boolean);
    const targetHost = segments[0];
    if (!targetHost || !ALLOWED_HOSTS.has(targetHost)) {
      return new Response('Forbidden host', { status: 403 });
    }

    const restPath = '/' + segments.slice(1).join('/');
    const targetUrl = new URL(restPath + reqUrl.search, `https://${targetHost}`);

    // 组装转发头部（剔除逐跳与代理自身头部）
    const headers = new Headers(request.headers);
    for (const h of STRIP_HEADERS) headers.delete(h);

    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

    let resp;
    try {
      resp = await fetch(targetUrl.toString(), {
        method: request.method,
        headers,
        body: hasBody ? request.body : undefined,
        redirect: 'manual',
      });
    } catch (err) {
      return new Response('Upstream error: ' + (err && err.message), {
        status: 502,
      });
    }

    // 透传响应，补一个 CORS 头方便调用方读取
    const respHeaders = new Headers(resp.headers);
    respHeaders.set('access-control-allow-origin', '*');

    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders,
    });
  },
};
