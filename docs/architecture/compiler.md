# 编译器

编译器以 @backend 装饰器为入口，提取元信息并生成客户端 RPC 与服务端路由映射，确保调用链清晰、边界可控。

## 编译产物

- routes：服务端可执行的路由注册信息
- client stub：统一调用 __kontract_rpc
- server map：将函数名映射为 handler 与 meta

## 装饰器元信息

支持从装饰器参数读取 egroup、perm 等字段，用于路由分组、权限与中间件过滤。

## Middleware 内联

- 过滤条件：prefixurl / egroup / endpoints
- 内联方式：通过 next() 链式执行形成单一处理函数
