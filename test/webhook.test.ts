import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateNotifyFunction,
  generateTriggerDDL,
  generateCleanupFunction,
  parseWebhookEvent,
  SubscriptionRegistry,
} from '../src/events/webhook';
import type { WebhookEvent, WebhookChangeEvent } from '../src/events/webhook';

describe('generateNotifyFunction', () => {
  it('generates valid PL/pgSQL function', () => {
    const sql = generateNotifyFunction('https://api.example.com');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION kontract_notify_gateway()');
    expect(sql).toContain('RETURNS TRIGGER');
    expect(sql).toContain('LANGUAGE plpgsql');
    expect(sql).toContain("'https://api.example.com/webhook'");
    expect(sql).toContain('TG_TABLE_NAME');
    expect(sql).toContain('TG_OP');
  });

  it('includes NEW and OLD row handling', () => {
    const sql = generateNotifyFunction('http://localhost:8787');
    expect(sql).toContain('row_to_json(NEW)');
    expect(sql).toContain('row_to_json(OLD)');
    expect(sql).toContain('RETURN COALESCE(NEW, OLD)');
  });
});

describe('generateTriggerDDL', () => {
  it('generates trigger for a table', () => {
    const sql = generateTriggerDDL('users');
    expect(sql).toContain('CREATE TRIGGER users_kontract_notify');
    expect(sql).toContain('AFTER INSERT OR UPDATE OR DELETE ON users');
    expect(sql).toContain('FOR EACH ROW EXECUTE FUNCTION kontract_notify_gateway()');
  });

  it('sanitizes table name', () => {
    const sql = generateTriggerDDL('my-table; DROP TABLE users');
    expect(sql).toContain('mytableDROPTABLEusers_kontract_notify');
    expect(sql).not.toContain('my-table');
    expect(sql).not.toContain('DROP TABLE');
  });
});

describe('generateCleanupFunction', () => {
  it('generates MVCC cleanup function', () => {
    const sql = generateCleanupFunction();
    expect(sql).toContain('CREATE OR REPLACE FUNCTION kontract_cleanup_old_versions');
    expect(sql).toContain('min_txid BIGINT');
    expect(sql).toContain('DELETE FROM %I WHERE _txid < %L');
    expect(sql).toContain('GROUP BY id HAVING COUNT(*) > 1');
    expect(sql).toContain('LIMIT 1000');
    expect(sql).toContain('LANGUAGE plpgsql');
  });
});

describe('parseWebhookEvent', () => {
  it('parses INSERT event', () => {
    const event: WebhookEvent = {
      table: 'users',
      operation: 'INSERT',
      new: { id: '1', name: 'Alice' },
      old: null,
    };
    const result = parseWebhookEvent(event);
    expect(result.type).toBe('insert');
    expect(result.table).toBe('users');
    expect(result.id).toBe('1');
    expect(result.data).toEqual({ id: '1', name: 'Alice' });
    expect(result.oldData).toBeNull();
  });

  it('parses UPDATE event', () => {
    const event: WebhookEvent = {
      table: 'users',
      operation: 'UPDATE',
      new: { id: '1', name: 'Bob' },
      old: { id: '1', name: 'Alice' },
    };
    const result = parseWebhookEvent(event);
    expect(result.type).toBe('update');
    expect(result.id).toBe('1');
    expect(result.data).toEqual({ id: '1', name: 'Bob' });
    expect(result.oldData).toEqual({ id: '1', name: 'Alice' });
  });

  it('parses DELETE event', () => {
    const event: WebhookEvent = {
      table: 'users',
      operation: 'DELETE',
      new: null,
      old: { id: '1', name: 'Alice' },
    };
    const result = parseWebhookEvent(event);
    expect(result.type).toBe('delete');
    expect(result.id).toBe('1');
    expect(result.data).toBeNull();
    expect(result.oldData).toEqual({ id: '1', name: 'Alice' });
  });

  it('returns null id when no id field', () => {
    const event: WebhookEvent = {
      table: 'logs',
      operation: 'INSERT',
      new: { msg: 'hello' },
      old: null,
    };
    const result = parseWebhookEvent(event);
    expect(result.id).toBeNull();
  });
});

describe('SubscriptionRegistry', () => {
  let registry: SubscriptionRegistry;

  beforeEach(() => {
    registry = new SubscriptionRegistry();
  });

  it('starts with zero subscribers', () => {
    expect(registry.getSubscriberCount()).toBe(0);
  });

  it('subscribe and dispatch events', () => {
    const received: WebhookChangeEvent[] = [];
    registry.subscribe('sub1', ['users'], (e) => received.push(e));

    const count = registry.dispatch({
      type: 'insert',
      table: 'users',
      id: '1',
      data: { id: '1' },
      oldData: null,
    });
    expect(count).toBe(1);
    expect(received).toHaveLength(1);
    expect(received[0].id).toBe('1');
  });

  it('only dispatches to matching table subscribers', () => {
    const userEvents: WebhookChangeEvent[] = [];
    const postEvents: WebhookChangeEvent[] = [];
    registry.subscribe('sub1', ['users'], (e) => userEvents.push(e));
    registry.subscribe('sub2', ['posts'], (e) => postEvents.push(e));

    registry.dispatch({
      type: 'insert',
      table: 'users',
      id: '1',
      data: null,
      oldData: null,
    });

    expect(userEvents).toHaveLength(1);
    expect(postEvents).toHaveLength(0);
  });

  it('subscriber can listen to multiple tables', () => {
    const events: WebhookChangeEvent[] = [];
    registry.subscribe('sub1', ['users', 'posts'], (e) => events.push(e));

    registry.dispatch({ type: 'insert', table: 'users', id: '1', data: null, oldData: null });
    registry.dispatch({ type: 'insert', table: 'posts', id: '2', data: null, oldData: null });
    registry.dispatch({ type: 'insert', table: 'comments', id: '3', data: null, oldData: null });

    expect(events).toHaveLength(2);
  });

  it('unsubscribe removes subscriber', () => {
    const events: WebhookChangeEvent[] = [];
    const unsub = registry.subscribe('sub1', ['users'], (e) => events.push(e));
    expect(registry.getSubscriberCount()).toBe(1);

    unsub();
    expect(registry.getSubscriberCount()).toBe(0);

    registry.dispatch({ type: 'insert', table: 'users', id: '1', data: null, oldData: null });
    expect(events).toHaveLength(0);
  });

  it('getSubscriberCount filters by table', () => {
    registry.subscribe('sub1', ['users'], () => {});
    registry.subscribe('sub2', ['users', 'posts'], () => {});
    registry.subscribe('sub3', ['posts'], () => {});

    expect(registry.getSubscriberCount()).toBe(3);
    expect(registry.getSubscriberCount('users')).toBe(2);
    expect(registry.getSubscriberCount('posts')).toBe(2);
    expect(registry.getSubscriberCount('comments')).toBe(0);
  });

  it('dispatches to multiple subscribers on same table', () => {
    let count1 = 0;
    let count2 = 0;
    registry.subscribe('sub1', ['users'], () => { count1++; });
    registry.subscribe('sub2', ['users'], () => { count2++; });

    const dispatched = registry.dispatch({
      type: 'update',
      table: 'users',
      id: '1',
      data: null,
      oldData: null,
    });

    expect(dispatched).toBe(2);
    expect(count1).toBe(1);
    expect(count2).toBe(1);
  });
});
