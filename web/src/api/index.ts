import axios, { type InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL, apiPath } from './config';

/**
 * API 客户端封装。
 * - 自动从 localStorage 读取 JWT 并附加到请求头
 * - 401 时自动用 refreshToken 续期并重发原请求
 * - 统一处理后端返回的 { code, message, data } 格式
 */
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

// 防止多个 401 并发刷新
let refreshPromise: Promise<string | null> | null = null;

/** 尝试用 refreshToken 换取新 accessToken，失败返回 null */
async function tryRefresh(): Promise<string | null> {
  const rt = localStorage.getItem('refreshToken');
  if (!rt) return null;
  try {
    const res = await axios.post(apiPath('/auth/refresh'), { refreshToken: rt });
    const body = res.data;
    const token = body?.data?.accessToken ?? body?.accessToken;
    if (token) {
      localStorage.setItem('accessToken', token);
      return token;
    }
  } catch {
    // refresh 失败，清理并跳登录
  }
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
  return null;
}

/** 获取（或复用进行中的）refresh promise */
function getRefreshPromise(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = tryRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

// 请求拦截：附加 token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截：解包 data，401 自动 refresh + 重发
api.interceptors.response.use(
  (response) => {
    const body = response.data;
    // 后端统一格式 { code, message, data }
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 0) {
        return body.data;
      }
      // 业务错误
      return Promise.reject(new Error(body.message || '请求失败'));
    }
    return body;
  },
  async (error) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // 401 且未重试过 → 尝试 refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const newToken = await getRefreshPromise();
      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest); // 用新 token 重发
      }
    }

    // refresh 也失败或非 401 错误
    const msg =
      error.response?.data?.message || error.message || '网络错误';
    return Promise.reject(new Error(msg));
  },
);

export default api;
