# Cookbook — API Documentation Generation

The cookbook compiler extracts doc comments and type information from `@backend` functions and generates VitePress-compatible API documentation.

## Concept

Instead of writing API docs by hand, annotate your backend functions with doc comments. The cookbook compiler reads these comments, infers parameter and return types from the TypeScript source, and outputs structured markdown.

Inspired by [Milkio's Cookbook](https://milkio.fun).

## Doc Comment Syntax

Two styles are supported:

### Triple-slash (`///`) — Rust-style

```typescript
/// Creates a new user account.
/// Supports **markdown** formatting.
///
/// ## Example
/// ```ts
/// const user = await createUser("alice");
/// ```
@backend({ ugroup: 'admin', perm: perms.RWX, egroup: 'api-v1' })
async function createUser(name: string, email: string): Promise<User> {
  // ...
}
```

Each `///` line is concatenated (stripping the `/// ` prefix) into a single markdown block.

### JSDoc (`/** */`)

```typescript
/**
 * Fetches a user by ID.
 * Returns null if not found.
 */
@backend({ perm: perms.R__, egroup: 'api-v1' })
async function getUser(id: string): Promise<User | null> {
  // ...
}
```

Standard JSDoc blocks are also extracted. The `*` prefix on each line is stripped.

### Functions with No Comments

If a function has no doc comment, the `description` field is an empty string. The function still appears in the generated docs with its type information.

## Type Inference

The cookbook compiler extracts types directly from function signatures — no extra annotations needed.

### Parameters

```typescript
async function search(query: string, limit?: number): Promise<User[]>
```

Extracted as:

| Name | Type | Required |
|------|------|----------|
| query | `string` | Yes |
| limit | `number` | No |

### Return Type

The return type annotation is extracted as-is:

```
Promise<User[]>
```

If no return type is annotated, it defaults to `void`.

## Generated Output

### CookbookEntry

Each `@backend` function produces a `CookbookEntry`:

```typescript
interface CookbookEntry {
  name: string;               // function name
  description: string;        // markdown from doc comments
  params: ParamInfo[];        // extracted parameter types
  returnType: string;         // extracted return type
  meta: Record<string, unknown>; // @backend decorator args
  sourcePath: string;         // original file path
}
```

### VitePress Pages

`cookbookToVitepress()` converts a `CookbookOutput` into a `Map<filename, markdown>`:

```
docs/api/
  index.md          ← API overview with links to each function
  createUser.md     ← One page per @backend function
  getUser.md
  deleteUser.md
```

Each page contains:

1. Function name as title
2. Description from doc comments
3. Parameters table (name, type, required)
4. Return type
5. Metadata (egroup, permission, user group)
6. Source file reference

### Example Generated Page

For the `createUser` function above:

```markdown
# createUser

Creates a new user account.
Supports **markdown** formatting.

## Parameters

| Name | Type | Required |
|------|------|----------|
| name | `string` | Yes |
| email | `string` | Yes |

## Returns

`Promise<User>`

## Metadata

- **Group**: `api-v1`
- **Permission**: `RWX (0b111)`
- **User Group**: `admin`

*Source: `src/routes/users.ts`*
```

## Usage

```typescript
import { generateCookbook, cookbookToVitepress } from 'kontract';

// Provide source files with their extracted routes
const cookbook = generateCookbook([
  {
    path: 'src/routes/users.ts',
    content: sourceCode,
    routes: [
      { name: 'createUser', meta: { egroup: 'api-v1', perm: 7 } },
      { name: 'getUser', meta: { egroup: 'api-v1', perm: 4 } },
    ],
  },
]);

// Generate VitePress markdown pages
const pages = cookbookToVitepress(cookbook);
// pages.get('index.md')       → API index
// pages.get('createUser.md')  → createUser page
```

The generated markdown can be written to `docs/api/` and served by `npm run docs:dev`.
