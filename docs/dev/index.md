# Developer Documentation

This section provides implementation‑level details for contributors and integrators: installation, configuration, API references, and contribution workflow.

## Architecture Snapshot

```
Client
  │  RPC / SSE
  ▼
Runtime ── Middleware ── @backend Routes
  │
  ▼
Storage Proxy (ptr) ── MVCC ── Database
```

## Request Flow

```
Client Call
  │
  ▼
RPC Stub (__kontract_rpc)
  │
  ▼
Route Map (@backend meta)
  │
  ▼
Middleware Filter
  │
  ▼
Handler Execution
  │
  ▼
Storage Proxy → MVCC → Database
  │
  ▼
SSE Event Emit
```

## Core Concepts

- Minimal privilege: Storage access is gated by ptr resolution and MVCC rules
- Explicit boundary: @backend is the compiler entry point for remote calls
- Consistent events: SSE payloads align on a single shape
- Deterministic middleware: filtered and inlined into a single handler

## Sections

- [Installation](/dev/installation)
- [Configuration](/dev/configuration)
- [API Reference](/dev/api)
- [Contributing](/dev/contributing)
