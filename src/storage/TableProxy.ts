export interface PGClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface Context {
  sid: string;
  owner: string;
  currentTxid: bigint;
  perm: number;
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  route?: { name: string; egroup?: string };
  isAnonymous?: boolean;
  ugroups?: string[];
}

function sanitizeIdentifier(name: string): string {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error('Invalid identifier');
  }
  return name;
}

function containsOtherTables(sql: string, ptr: string): boolean {
  const re = /\bfrom\s+([a-zA-Z0-9_]+)|\bjoin\s+([a-zA-Z0-9_]+)/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const t = (m[1] || m[2]) || '';
    if (t && t.toLowerCase() !== ptr.toLowerCase()) return true;
  }
  return false;
}

export class TableProxy<T> {
  private ptrCache?: string;
  constructor(
    private pg: PGClient,
    private name: string,
    private ctx: Context
  ) {}

  async getPtr(): Promise<string> {
    if (this.ptrCache) return this.ptrCache;
    const result = await this.pg.query(
      'SELECT ptr FROM storage WHERE id = $1 AND owner = $2',
      [this.name, this.ctx.owner]
    );
    const row = result.rows[0];
    if (!row) throw new Error(`Table ${this.name} not found`);
    this.ptrCache = sanitizeIdentifier(String(row.ptr));
    return this.ptrCache;
  }

  async get(id: string): Promise<T | null> {
    const ptr = await this.getPtr();
    const result = await this.pg.query(
      `SELECT data FROM ${ptr}
       WHERE id = $1 
         AND _txid < $2
         AND (_deleted_txid IS NULL OR _deleted_txid >= $2)`,
      [id, this.ctx.currentTxid]
    );
    return (result.rows[0]?.data as T) ?? null;
  }

  async set(id: string, value: T): Promise<void> {
    const ptr = await this.getPtr();
    await this.pg.query(
      `INSERT INTO ${ptr} (id, data, _txid, _owner)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
       SET data = EXCLUDED.data, _txid = EXCLUDED._txid`,
      [id, JSON.stringify(value), this.ctx.currentTxid, this.ctx.owner]
    );
  }

  async delete(id: string): Promise<boolean> {
    const ptr = await this.getPtr();
    const result = await this.pg.query(
      `UPDATE ${ptr} SET _deleted_txid = $2 WHERE id = $1 RETURNING id`,
      [id, this.ctx.currentTxid]
    );
    return !!result.rows[0];
  }

  async update(id: string, partial: Partial<T>): Promise<void> {
    const current = await this.get(id);
    const base = (current ?? {}) as Record<string, unknown>;
    const next = Object.assign({}, base, partial as Record<string, unknown>) as T;
    await this.set(id, next);
  }

  async push(value: T): Promise<string> {
    const id = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
    const ptr = await this.getPtr();
    await this.pg.query(
      `INSERT INTO ${ptr} (id, data, _order, _txid, _owner)
       VALUES ($1, $2, 
         (SELECT COALESCE(MAX(_order), 0) + 1 FROM ${ptr}),
         $3, $4)`,
      [id, JSON.stringify(value), this.ctx.currentTxid, this.ctx.owner]
    );
    return id;
  }

  async pop(): Promise<T | null> {
    const ptr = await this.getPtr();
    const result = await this.pg.query(
      `DELETE FROM ${ptr}
       WHERE _order = (SELECT MAX(_order) FROM ${ptr})
         AND _txid < $1
       RETURNING data`,
      [this.ctx.currentTxid]
    );
    return (result.rows[0]?.data as T) ?? null;
  }

  async shift(): Promise<T | null> {
    const ptr = await this.getPtr();
    const result = await this.pg.query(
      `DELETE FROM ${ptr}
       WHERE _order = (SELECT MIN(_order) FROM ${ptr})
         AND _txid < $1
       RETURNING data`,
      [this.ctx.currentTxid]
    );
    return (result.rows[0]?.data as T) ?? null;
  }

  async *query(filter: Partial<T>): AsyncIterableIterator<T> {
    const ptr = await this.getPtr();
    const sql = `SELECT data FROM ${ptr}
      WHERE data @> $1::jsonb AND _txid < $2
      ORDER BY _order`;
    const res = await this.pg.query(sql, [JSON.stringify(filter), this.ctx.currentTxid]);
    for (const r of res.rows) {
      yield r.data as T;
    }
  }

  async exec(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> {
    const ptr = await this.getPtr();
    const rewritten = sql.replace(
      new RegExp(`\\b${this.name}\\b`, 'g'),
      ptr
    );
    if (containsOtherTables(rewritten, ptr)) {
      throw new Error('Cannot access other tables');
    }
    return await this.pg.query(rewritten, params);
  }
}
