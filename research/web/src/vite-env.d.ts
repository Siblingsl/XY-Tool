/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 闲鱼自动发货系统前端地址，默认 http://localhost:5173 */
  readonly VITE_SISTER_APP_URL?: string;
  /** 后端 API 根地址，生产如 https://research-api.skyed.dpdns.org/api；开发默认 /api */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
