/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 闲鱼自动发货系统前端地址，默认 http://localhost:5173 */
  readonly VITE_SISTER_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
