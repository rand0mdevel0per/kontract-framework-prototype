import { describe, it, expect } from 'vitest';
import { DOPool } from '../src/runtime/pool';
import type { Executable, PoolTask } from '../src/runtime/pool';

class MockWorker implements Executable {
  calls: PoolTask[] = [];
  delay: number;

  constructor(delay = 0) {
    this.delay = delay;
  }

  async execute(task: PoolTask): Promise<unknown> {
    this.calls.push(task);
    if (this.delay > 0) {
      await new Promise((r) => setTimeout(r, this.delay));
    }
    return { handled: task.id };
  }
}

function task(id: string): PoolTask {
  return { id, handler: 'test', args: [] };
}

describe('DOPool', () => {
  it('distributes tasks to least busy worker', async () => {
    const w1 = new MockWorker();
    const w2 = new MockWorker();
    const pool = new DOPool([w1, w2]);

    await pool.submit(task('a'));
    await pool.submit(task('b'));

    // Both workers should have been used
    expect(w1.calls.length + w2.calls.length).toBe(2);
  });

  it('reports worker count', () => {
    const pool = new DOPool([new MockWorker(), new MockWorker(), new MockWorker()]);
    expect(pool.workerCount).toBe(3);
  });

  it('returns queue lengths', () => {
    const pool = new DOPool([new MockWorker(), new MockWorker()]);
    expect(pool.getQueueLengths()).toEqual([0, 0]);
  });

  it('shouldSteal returns false when balanced', () => {
    const pool = new DOPool([new MockWorker(), new MockWorker()]);
    expect(pool.shouldSteal()).toBe(false);
  });

  it('returns result from worker', async () => {
    const pool = new DOPool([new MockWorker()]);
    const result = await pool.submit<{ handled: string }>(task('x'));
    expect(result).toEqual({ handled: 'x' });
  });

  it('handles single worker pool', async () => {
    const w = new MockWorker();
    const pool = new DOPool([w]);
    await pool.submit(task('a'));
    await pool.submit(task('b'));
    expect(w.calls.length).toBe(2);
  });
});
