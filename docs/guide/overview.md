# 概览

Konstract 以事件驱动方式组织业务逻辑，强调编译期约束与运行时最小权限访问。核心目标是让前后端边界清晰、权限收敛，并通过统一的 RPC 与事件通道实现扩展。

## 设计要点

- 最小权限：Storage Proxy 仅访问 storage/transactions 表
- 可见性：MVCC 读写遵循当前 txid 与删除标记
- 编译期约束：@backend 统一入口，生成客户端 stub 与服务端路由
- 过滤执行：Middleware 按 prefix、egroup、endpoints 裁剪并内联执行
- 加密通道：Raystream 优先使用 chacha20-poly1305
- 事件格式：SSE 统一输出结构

## 执行链路

1. 开发者用 @backend 声明后端可调用函数
2. 编译器提取元信息并生成 RPC/路由
3. 运行时以最小权限访问存储，并通过 Middleware 链执行
4. 事件输出遵循统一格式，方便订阅与分发

## 你可以直接看

- [运行时设计](/architecture/runtime)
- [编译器设计](/architecture/compiler)
- [存储与迁移](/architecture/storage)
