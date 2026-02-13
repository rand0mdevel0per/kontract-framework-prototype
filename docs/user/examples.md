# Usage Examples

## End‑to‑End Tutorial

1. Define a backend function
2. Generate client stubs and routes
3. Call the function from the client
4. Read or update data with Storage Proxy
5. Emit events for subscribers

Backend:

```ts
class UserService {
  @backend({ egroup: 'api', perm: 0b111 })
  async createUser(id: string) {
    return { id };
  }
}
```

Client call:

```ts
const result = await __kontract_rpc('createUser', ['user-1'], { egroup: 'api', perm: 7 });
```

Storage:

```ts
const proxy = new TableProxy(pg, 'users', ctx);
await proxy.set({ id: 'user-1', name: 'A' });
```

Event:

```ts
const payload = formatSSE({ type: 'insert', id: 'user-1', data: { name: 'A' } });
```

## Define a Backend Function

```ts
class UserService {
  @backend({ egroup: 'api', perm: 0b111 })
  async getUser(id: string) {
    return { id };
  }
}
```

## Compile Output (Conceptual)

```ts
export async function getUser(...args) {
  return await __kontract_rpc('getUser', args, { egroup: 'api', perm: 7 });
}
__kontract_routes.set('getUser', { handler: async (ctx, args) => new UserService()['getUser'](...args), meta: { egroup: 'api', perm: 7 } });
```

## Use Storage Proxy

```ts
const proxy = new TableProxy(pg, 'users', ctx);
const user = await proxy.get('user-1');
```

## Update With MVCC

```ts
await proxy.update('user-1', { nickname: 'new-name' });
```

## Middleware Chain

```ts
const middleware = [
  { fn: async (ctx, next) => { await next(); }, filter: { prefixurl: '/api' } },
  { fn: async (ctx, next) => { await next(); }, filter: { egroup: 'api' } }
];
const run = inlineMiddlewareChain(middleware);
await run(ctx, handler);
```

## Middleware Filter by Endpoint

```ts
const middleware = [
  { fn: async (ctx, next) => { await next(); }, filter: { endpoints: ['getUser'] } }
];
```

## SSE Event Output

```ts
const payload = formatSSE({ type: 'insert', id: '1', data: { name: 'A' } });
```
