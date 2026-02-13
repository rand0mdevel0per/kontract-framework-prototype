/**
 * PostgreSQL webhook trigger DDL generation + Queue consumer.
 * Spec §7.5.3
 */

export function generateNotifyFunction(gatewayUrl: string): string {
  return `CREATE OR REPLACE FUNCTION kontract_notify_gateway()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM http_post(
    '${gatewayUrl}/webhook',
    json_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'new', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE row_to_json(NEW) END,
      'old', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE row_to_json(OLD) END
    )::text,
    'application/json'
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;`;
}

export function generateTriggerDDL(tableName: string): string {
  const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
  return `CREATE TRIGGER ${safeName}_kontract_notify
AFTER INSERT OR UPDATE OR DELETE ON ${safeName}
FOR EACH ROW EXECUTE FUNCTION kontract_notify_gateway();`;
}

export function generateCleanupFunction(): string {
  return `CREATE OR REPLACE FUNCTION kontract_cleanup_old_versions(min_txid BIGINT)
RETURNS void AS $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN SELECT ptr FROM storage LOOP
    EXECUTE format(
      'DELETE FROM %I WHERE _txid < %L AND id IN (
        SELECT id FROM %I WHERE _txid < %L
        GROUP BY id HAVING COUNT(*) > 1
        ORDER BY _txid ASC
        LIMIT 1000
      )',
      tbl.ptr, min_txid, tbl.ptr, min_txid
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;`;
}

// ── Queue Consumer Types ─────────────────────────────────

export interface WebhookEvent {
  table: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
}

export interface WebhookChangeEvent {
  type: 'insert' | 'update' | 'delete';
  table: string;
  id: string | null;
  data: Record<string, unknown> | null;
  oldData: Record<string, unknown> | null;
}

export function parseWebhookEvent(event: WebhookEvent): WebhookChangeEvent {
  const newData = event.new as Record<string, unknown> | null;
  const oldData = event.old as Record<string, unknown> | null;
  return {
    type: event.operation.toLowerCase() as WebhookChangeEvent['type'],
    table: event.table,
    id: (newData?.id ?? oldData?.id ?? null) as string | null,
    data: newData,
    oldData: oldData,
  };
}

export interface Subscriber {
  id: string;
  tables: Set<string>;
  emit: (event: WebhookChangeEvent) => void;
}

export class SubscriptionRegistry {
  private subscribers = new Map<string, Subscriber>();

  subscribe(id: string, tables: string[], emit: (event: WebhookChangeEvent) => void): () => void {
    this.subscribers.set(id, { id, tables: new Set(tables), emit });
    return () => {
      this.subscribers.delete(id);
    };
  }

  dispatch(event: WebhookChangeEvent): number {
    let count = 0;
    for (const sub of this.subscribers.values()) {
      if (sub.tables.has(event.table)) {
        sub.emit(event);
        count++;
      }
    }
    return count;
  }

  getSubscriberCount(table?: string): number {
    if (!table) return this.subscribers.size;
    let count = 0;
    for (const sub of this.subscribers.values()) {
      if (sub.tables.has(table)) count++;
    }
    return count;
  }
}
