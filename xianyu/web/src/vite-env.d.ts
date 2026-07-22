/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** 项目研究系统前端地址，默认 http://localhost:5174 */
  readonly VITE_SISTER_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
