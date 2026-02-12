# 运行时

运行时负责会话、权限、MVCC 读写与事件派发。核心目标是最小权限访问数据库，同时保证并发一致性与可追踪性。

## SessionDO

- 分配 txid，并维护当前会话上下文
- MVCC 查询使用 currentTxid 过滤可见版本
- 删除由 _deleted_txid 标记并纳入可见性判断

## Storage Proxy

- 以 ptr 作为真实表名的指针映射
- 仅访问 storage/transactions 表获取 ptr 与事务信息
- ptr 缓存减少元数据查询成本

## 事件通道

- 事件输出统一为 SSE 可消费格式
- 上层可复用同一事件结构进行订阅或转发
