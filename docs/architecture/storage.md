# 存储与迁移

StorageRegistry 由类型抽取生成，用于暴露存储表的类型入口。迁移系统通过 Schema diff 判断变更安全性，并生成可执行的 SQL 片段。

## StorageRegistry

- 从接口声明生成 registry 键
- 运行时通过 key 获取 TableProxy，保持类型安全

## 迁移策略

- 字段新增：安全变更
- 字段删除/类型变更：不安全变更
- SQL 生成：基于 ALTER TABLE ADD COLUMN

## 设计目标

- 收敛权限：真实表名通过 ptr 隐藏
- 降低风险：仅允许可控的 Schema 演进
