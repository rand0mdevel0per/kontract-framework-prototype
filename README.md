# Konstract

Konstract 是一个事件驱动的全栈 TypeScript 框架原型，聚焦最小数据库权限、安全的服务端执行模型以及清晰的编译期边界。仓库包含运行时、编译器原型、迁移与中间件机制，并配套高覆盖率测试与 CI。

## 核心特性

- Storage Proxy 与 MVCC：仅访问 storage/transactions 表，读写遵循可见性规则
- @backend 编译：提取装饰器元信息，生成客户端 RPC 与服务端路由
- Middleware 过滤与内联：按 prefix/egroup/endpoints 过滤并构建 next() 链
- Raystream 加密：优先 chacha20-poly1305，回退 aes-256-gcm
- 事件订阅与 SSE：统一事件格式输出
- 迁移与类型抽取：Schema diff 与 StorageRegistry 生成

## 快速开始

```bash
npm install
npm run lint
npm run typecheck
npm run test
```

## 文档与部署

```bash
npm run docs:dev
```

构建输出目录：docs/.vitepress/dist  
Cloudflare Pages 部署：构建命令 `npm run docs:build`，输出目录 `docs/.vitepress/dist`

## 目录结构

- src/runtime：会话与事务管理
- src/storage：Storage Proxy 与表指针访问
- src/compiler：@backend 提取与注册表生成
- src/middleware：过滤与内联执行
- src/protocol：加密与传输协议
- src/events：SSE 与事件输出
- src/cli：迁移逻辑
- test：单元测试与覆盖率
- docs：VitePress 文档站

## 常用脚本

- `npm run build`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run docs:dev`
- `npm run docs:build`
- `npm run docs:preview`

## CI

GitHub Actions 会在 PR 与主分支推送时运行 lint、typecheck、test，确保质量门槛与覆盖率达标。

## License

MIT
