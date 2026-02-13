# Quickstart

## Requirements

- Node.js 20+
- npm 9+

## Install

```bash
npm install
```

## Run Quality Checks

```bash
npm run lint
npm run typecheck
npm run test
```

## Define a Backend Function

```ts
class UserService {
  @backend({ egroup: 'api-v1', perm: 0b110 })
  async getUser(id: string) {
    return await env.storage.users.get(id);
  }
}
```

The compiler extracts `@backend` functions into the server bundle and generates typed RPC stubs for the client.

## Use Storage Proxy

```ts
const proxy = new TableProxy(pg, 'users', ctx);

// CRUD
const user = await proxy.get('user-1');
await proxy.set('user-1', { name: 'Alice', email: 'alice@example.com' });
await proxy.update('user-1', { name: 'Bob' });
await proxy.delete('user-1');

// List operations
await proxy.push({ name: 'Carol' });
const last = await proxy.pop();

// Query
for await (const u of proxy.query({ active: true })) {
  console.log(u);
}
```

## Subscribe to Events

```ts
const bus = new EventBus();

const unsubscribe = bus.subscribe('users', (event) => {
  console.log(event.type, event.id, event.data);
});

// Emit from server
bus.emit('users', { type: 'insert', id: 'user-1', data: { name: 'Alice' } });
```

## Add Authentication

Configure auth in your gateway to enable anonymous login, password registration, and JWT sessions:

```ts
import { AuthConfig, AnonymousProvider, PasswordProvider, authMiddleware } from 'kontract';

const authConfig: AuthConfig = {
  secret: env.KONTRACT_SECRET,
  sessionTtlSeconds: 3600,
  allowAnonymous: true,
  providers: [
    new AnonymousProvider(),
    new PasswordProvider((email) => getUserByEmail(pg, email)),
  ],
};

// Add to middleware pipeline
const mw = authMiddleware(authConfig);
```

Auth endpoints are available at `/auth/anonymous`, `/auth/register`, `/auth/login`, `/auth/link`, `/auth/refresh`, `/auth/logout`, and `/auth/me`.

See the [Authentication guide](/guide/authentication) for full details.

## Next Steps

- [Architecture overview](/guide/overview) for the full system diagram
- [Authentication](/guide/authentication) for auth providers, JWT sessions, and account linking
- [Cookbook](/guide/cookbook) for API documentation generation from doc comments
- [Compiler](/architecture/compiler) for `@backend` decorator details
- [Security](/architecture/security) for the raystream encryption protocol
