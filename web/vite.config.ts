import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite 配置：开发服务器代理 /api 到后端，避免跨域
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
