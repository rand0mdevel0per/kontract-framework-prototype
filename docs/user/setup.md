# Setup

## Prerequisites

- Node.js 20+
- npm 9+

## Install

```bash
npm install
```

## Verify the Build

```bash
npm run lint
npm run typecheck
npm run test
```

## Start Docs

```bash
npm run docs:dev
```

## Build for Cloudflare Pages

```bash
npm run docs:build
```

Output directory: docs/.vitepress/dist

## Wrangler Deploy

```bash
npm run docs:build
npx wrangler pages deploy docs/.vitepress/dist --project-name konstract
```

## Deployment Checklist

- Node.js 20+ in build environment
- npm 9+ available
- Build command set to npm run docs:build
- Output directory set to docs/.vitepress/dist
- Wrangler project name matches Cloudflare Pages project
