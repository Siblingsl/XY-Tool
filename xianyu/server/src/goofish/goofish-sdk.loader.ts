import { createRequire } from 'module';
import { existsSync } from 'fs';
import { join } from 'path';
import type { GoofishSdkModule } from './goofish-sdk.types';

let cached: GoofishSdkModule | null = null;

/** 加载同目录下的 goofish-sdk.js（dev: src/goofish，prod: dist/goofish） */
export function loadGoofishSdk(): GoofishSdkModule {
  if (cached) return cached;

  const require = createRequire(__filename);
  const candidates = [
    join(__dirname, 'goofish-sdk.js'),
    join(process.cwd(), 'src', 'goofish', 'goofish-sdk.js'),
    join(process.cwd(), 'dist', 'goofish', 'goofish-sdk.js'),
  ];

  for (const p of candidates) {
    if (existsSync(p)) {
      cached = require(p) as GoofishSdkModule;
      return cached;
    }
  }

  throw new Error(
    '找不到 goofish-sdk.js，请确认 server/src/goofish/goofish-sdk.js 已复制且 nest build 已包含 goofish/**/*.js',
  );
}

export function isMtopSuccess(res: { ret?: string[] }): boolean {
  return Array.isArray(res.ret) && res.ret.some((r) => r.startsWith('SUCCESS::'));
}
