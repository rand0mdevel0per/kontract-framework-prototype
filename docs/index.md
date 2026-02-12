# Konstract 文档

这份文档聚焦框架的核心能力、执行模型与运行时约束，目标是让你快速理解 Konstract 在“最小数据库权限 + 事件驱动执行”下的工程化路径。

## 核心概念

- Storage Proxy 与 MVCC：最小权限访问与可见性控制
- @backend 编译：元信息提取、RPC Stub 与服务端路由生成
- Middleware 过滤与内联：按条件裁剪并构造 next() 链
- Raystream 加密：优先 chacha20-poly1305 的端到端通道
- 迁移系统：Schema diff 与安全变更规则
- SSE 事件输出：统一格式便于订阅

## 快速导航

- [概览](/guide/overview)
- [快速开始](/guide/quickstart)
- [运行时设计](/architecture/runtime)
- [编译器设计](/architecture/compiler)
- [存储与迁移](/architecture/storage)
