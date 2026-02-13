# Troubleshooting

## Tests fail on branch coverage

Ensure all branches remain above the configured threshold. Add tests for additional branches in compiler, middleware, or storage where needed.

## Docs do not build on Cloudflare Pages

- Build command: npm run docs:build
- Output directory: docs/.vitepress/dist
- Node version: 20+
 - Wrangler project name matches Cloudflare Pages project

## Decorators parsing errors

Ensure @backend decorators are used on class methods with the configured TypeScript parser plugin.

## Storage access errors

Check ptr mapping in the storage table and confirm the table name matches expected registry keys.

## Middleware not executing

Verify filter fields:

- prefixurl matches the request path
- egroup matches route metadata
- endpoints includes the function name

## exec rejects SQL

exec only allows statements for the current table. If you see rejections, remove cross‑table references or joins.

## SSE event output is empty

Ensure the emitter uses the expected payload shape:

- type
- id
- data

Check that events are flushed to the client and the connection is not closed prematurely.

## Deployment fails with wrangler

Check:

- wrangler is installed or invoked via npx
- project name matches the Cloudflare Pages project
- build output directory exists
