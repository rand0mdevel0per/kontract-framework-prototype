# Security

Kontract implements a zero-trust security model with end-to-end encryption, multi-layer permission enforcement, and SQL injection prevention.

## raystream Protocol

### Key Exchange

Algorithm: ECDH with X25519 curve

```
Client                        Gateway
  |                              |
  |--- ClientHello ------------->|
  |    (client_pub, version)     |
  |                              |
  |<-- ServerHello --------------|
  |    (server_pub, session_id)  |
  |                              |
  [Both compute ECDH shared secret]
  |                              |
  [HKDF key derivation]          |
  |                              |
  |==== Encrypted Channel =======|
```

Key derivation:

```ts
const sharedSecret = ECDH(client_priv, server_pub);
const sessionKey = HKDF(sharedSecret, 'raystream-v1', session_id, 32);
```

### Message Encryption

Algorithm: ChaCha20-Poly1305 AEAD (with AES-256-GCM fallback)

```ts
encrypt(payload: Uint8Array, key: Uint8Array): { nonce, data, tag }
decrypt({ nonce, data, tag }, key: Uint8Array): Uint8Array
```

Message format:

```
┌──────────┬─────────────────┬──────────────────┐
│ nonce    │ ciphertext      │ auth tag         │
│ 12 bytes │ variable        │ 16 bytes         │
└──────────┴─────────────────┴──────────────────┘
```

Properties:
- **Confidentiality**: ChaCha20 stream cipher
- **Integrity**: Poly1305 MAC
- **Perfect Forward Secrecy**: ephemeral keys per session
- **Replay Protection**: nonce includes monotonic txid

### Wire Format

```
┌────────────────────────────────────────┐
│ Header (16 bytes)                      │
│ - Version (1 byte)                     │
│ - Message Type (1 byte)                │
│ - Flags (2 bytes)                      │
│ - Sequence Number (4 bytes)            │
│ - Payload Length (4 bytes)             │
│ - Reserved (4 bytes)                   │
├────────────────────────────────────────┤
│ Nonce (12 bytes)                       │
├────────────────────────────────────────┤
│ Encrypted Payload (variable)           │
├────────────────────────────────────────┤
│ Authentication Tag (16 bytes)          │
└────────────────────────────────────────┘
```

### Message Types

```ts
enum MessageType {
  HANDSHAKE_INIT     = 0x01,
  HANDSHAKE_RESPONSE = 0x02,
  RPC_CALL           = 0x10,
  RPC_RESPONSE       = 0x11,
  RPC_ERROR          = 0x12,
  SUBSCRIBE          = 0x20,
  EVENT              = 0x21,
  HEARTBEAT          = 0x30,
  CLOSE              = 0xFF,
}
```

## Permission Model

### Permission Bits

```ts
const perms = {
  R__: 0b100,  // Read
  _W_: 0b010,  // Write
  __X: 0b001,  // Execute/Delete
  RW_: 0b110,  // Read + Write
  R_X: 0b101,  // Read + Execute
  _WX: 0b011,  // Write + Execute
  RWX: 0b111,  // Full access
};
```

### Verification Flow

Every operation verifies:

1. **Session validity**: `trxs` table lookup
2. **Owner authentication**: JWT or session token match
3. **Permission bits**: decorator-defined requirements
4. **Field-level access**: per-field `@perm` decorators

```ts
function verifyAccess(ctx: PermContext, requiredPerm: number, owner?: string): void;
function checkTablePermission(perms: number, operation: 'read' | 'write' | 'delete'): void;
function checkFieldPermissions(data: Record<string, unknown>, fieldPerms: Record<string, number>, mask: number): void;
```

### Table-Level Permissions

Stored in the `storage` table:

```sql
CREATE TABLE storage (
  id TEXT PRIMARY KEY,
  ptr TEXT NOT NULL,
  owner TEXT NOT NULL,
  permissions INT NOT NULL  -- Bit mask: RWX
);
```

### Field-Level Permissions

Generated at compile-time from `@perm` decorators:

```ts
interface User {
  @primkey id: string;
  @perm(perms.R__) email: string;  // Read-only
  name: string;                     // Read-write (default)
}
```

Attempting to write a read-only field throws `PermissionError`.

## SQL Injection Prevention

### Parameterized Queries

All Storage Proxy operations use prepared statements:

```ts
await pg.query('SELECT * FROM tbl WHERE id = $1', [userId]);
```

### Identifier Sanitization

Table names (ptr values) are validated to contain only `[a-zA-Z0-9_]`.

### exec() Restrictions

The `exec()` escape hatch rewrites table names and validates that no cross-table access occurs:

```ts
// Allowed
await proxy.exec('SELECT data FROM users WHERE data->>\'age\' > $1', [25]);

// Blocked (references another table)
await proxy.exec('SELECT * FROM users JOIN orders ON ...', []);
// → Error: Cannot access other tables
```

## Threat Model

| Threat | Mitigation |
|--------|-----------|
| Untrusted client | Cannot forge permissions (server-side enforcement) |
| Network attacker | Cannot decrypt raystream (ECDH + AEAD) |
| Malicious tenant | Cannot access other tenants' data (ptr isolation) |
| Compromised gateway | Limited blast radius (per-tenant ptr isolation) |
| SQL injection | Parameterized queries + identifier sanitization |
| Stolen JWT | Short TTL + refresh rotation, HMAC-SHA256 signature |
| Brute-force password | PBKDF2 with 100,000 iterations (computational cost) |
| Token tampering | HMAC-SHA256 signature verification on every request |

## Authentication & Session Security

### JWT Tokens

- **Algorithm**: HMAC-SHA256 via `crypto.subtle` (Web Crypto API, zero external dependencies)
- **Format**: standard 3-part JWT (`header.payload.signature`)
- **Payload**: `sid`, `owner`, `isAnonymous`, `ugroups`, `iat`, `exp`
- **Expiry**: configurable TTL (default 3600s), verified on every request
- **Signing key**: `KONTRACT_SECRET` environment variable

### Password Hashing

- **Algorithm**: PBKDF2 via `crypto.subtle`
- **Iterations**: 100,000
- **Hash**: SHA-256
- **Salt**: 16 random bytes per password (via `crypto.getRandomValues`)
- **Storage format**: `<salt_hex>:<hash_hex>`

### Session Flow

```
Client                         Gateway
  |                              |
  |--- POST /auth/login ------→ |
  |    {email, password}         |
  |                              | PBKDF2 verify
  |                              | signJwt(payload, secret, ttl)
  |←-- {token, owner} ----------|
  |                              |
  |--- GET /api/data -----------→|
  |    Authorization: Bearer JWT |
  |                              | verifyJwt(token, secret)
  |                              | populate ctx.owner, ctx.ugroups
  |                              | dispatch to @backend handler
  |←-- response ---------------→|
```

### Auth Middleware Chain

1. `authMiddleware(config)` — extracts Bearer token, verifies JWT, populates `ctx`
2. `requireAuth()` — rejects anonymous users (401)
3. `requireGroup(ugroup)` — rejects users not in the specified group (403)

All three produce standard `Middleware` objects compatible with `filterApplicable` and `inlineMiddlewareChain`.
