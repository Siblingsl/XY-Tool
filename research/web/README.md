# 项目研究系统（UI 原型）

独立前端，与闲鱼控制台共用 NestJS 后端项目区（`/api/research/*`）。

- 功能规格：[`../docs/project-research-system.md`](../docs/project-research-system.md)
- 开发端口：`5174`
- 顶栏可切换回闲鱼系统（`VITE_SISTER_APP_URL`，默认 `http://localhost:5173`）

```bash
npm install
npm run dev
```

原型使用假登录与 Mock 数据，不调用真实 Gmail / Agent。
