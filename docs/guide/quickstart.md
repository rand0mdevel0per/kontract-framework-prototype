# 快速开始

## 环境要求

- Node.js 20+
- npm 9+

## 安装依赖

```bash
npm install
```

## 质量检查与测试

```bash
npm run lint
npm run typecheck
npm run test
```

## 启动文档站点

```bash
npm run docs:dev
```

## 生产构建

```bash
npm run docs:build
```

构建输出目录为 docs/.vitepress/dist，适合部署到 Cloudflare Pages。

## Cloudflare Pages 部署要点

- 构建命令：`npm run docs:build`
- 输出目录：`docs/.vitepress/dist`
