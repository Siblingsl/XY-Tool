import axios from 'axios';

/**
 * API 客户端封装。
 * - 自动从 localStorage 读取 JWT 并附加到请求头
 * - 401 时自动跳转登录页
 * - 统一处理后端返回的 { code, message, data } 格式
 */
const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

// 请求拦截：附加 token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截：解包 data，处理 401
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
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    const msg =
      error.response?.data?.message || error.message || '网络错误';
    return Promise.reject(new Error(msg));
  },
);

export default api;
