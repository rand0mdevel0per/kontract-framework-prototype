// Kontract Demo — Gateway Worker Entry Point
//
// This is the Cloudflare Worker that receives all incoming requests,
// runs the middleware chain, dispatches to @backend handlers, and
// returns encrypted responses.

import {
  HttpResp,
  HttpError,
  NotFoundError,
  filterApplicable,
  inlineMiddlewareChain,
  formatSSE,
} from 'kontract';
import type { Context } from 'kontract';
import { middleware } from './middleware';
import { routes } from './routes';

// ── Env bindings (from wrangler.toml + secrets) ─────────
export interface Env {
  DATABASE_URL: string;
  KONTRACT_SECRET: string;
  SESSION_DO: DurableObjectNamespace;
}

// ── Re-export Durable Object so wrangler can find it ────
export { KontractSessionDO } from './session-do';

// ── Worker fetch handler ────────────────────────────────
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-Id',
        },
      });
    }

    // ── SSE stream endpoint ───────────────────────────
    if (path === '/stream') {
      return handleSSEStream();
    }

    // ── RPC dispatch ──────────────────────────────────
    if (path.startsWith('/rpc/')) {
      return handleRPC(request, env, path);
    }

    return new Response('Kontract Gateway', { status: 200 });
  },
};

// ── RPC handler ─────────────────────────────────────────
async function handleRPC(request: Request, env: Env, path: string): Promise<Response> {
  const fnName = path.slice('/rpc/'.length);
  const route = routes.get(fnName);

  if (!route) {
    return jsonResponse(new NotFoundError(`Unknown function: ${fnName}`));
  }

  try {
    // Build context from session
    const sid = request.headers.get('X-Session-Id') ?? crypto.randomUUID();
    const ctx: Context = {
      sid,
      owner: 'demo-tenant',
      currentTxid: BigInt(Date.now()),
      perm: route.meta.perm,
      method: request.method,
      path,
      headers: Object.fromEntries(request.headers),
      route: { name: fnName, egroup: route.meta.egroup },
    };

    // Filter and run applicable middleware
    const applicable = filterApplicable(middleware, path, route.meta.egroup, fnName);
    const chain = inlineMiddlewareChain(applicable);

    let result: unknown;
    await chain(ctx, async () => {
      const args = request.method === 'POST'
        ? await request.json() as unknown[]
        : [];
      result = await route.handler(ctx, args);
    });

    // Return response
    if (result instanceof HttpResp) {
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', ...result.headers },
      });
    }
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return jsonResponse(err);
  }
}

// ── SSE stream ──────────────────────────────────────────
function handleSSEStream(): Response {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Send heartbeat every 30s to keep connection alive
  const interval = setInterval(async () => {
    try {
      await writer.write(encoder.encode(formatSSE({ type: 'heartbeat', ts: Date.now() })));
    } catch {
      clearInterval(interval);
    }
  }, 30_000);

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// ── Helpers ─────────────────────────────────────────────
function jsonResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return new Response(JSON.stringify({ error: err.message, code: err.code }), {
      status: err.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const message = err instanceof Error ? err.message : 'Internal error';
  return new Response(JSON.stringify({ error: message }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}
