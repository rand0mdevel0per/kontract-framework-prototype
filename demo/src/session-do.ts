// Kontract Demo — Durable Object for session coordination
//
// Wraps the framework's SessionDO to provide MVCC txid allocation
// and session management on the Cloudflare edge.

import { SessionDO } from 'kontract';

export class KontractSessionDO implements DurableObject {
  private session: SessionDO;

  constructor(private state: DurableObjectState) {
    this.session = new SessionDO();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/txid') {
      const txid = this.session.allocateTxid();
      return new Response(JSON.stringify({ txid: txid.toString() }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/begin') {
      await request.json();
      const sid = crypto.randomUUID();
      const txid = this.session.allocateTxid();
      return new Response(JSON.stringify({ sid, txid: txid.toString() }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  }
}
