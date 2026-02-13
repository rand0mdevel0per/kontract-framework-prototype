/**
 * DO Pool with work-stealing scheduler.
 * Spec §7.4.2
 */

export interface Executable<T = unknown> {
  execute(task: PoolTask): Promise<T>;
}

export interface PoolTask {
  id: string;
  handler: string;
  args: unknown[];
}

export class DOPool<W extends Executable = Executable> {
  private workers: W[];
  private queues: Map<number, PoolTask[]>;
  private stealThreshold: number;

  constructor(workers: W[], opts?: { stealThreshold?: number }) {
    this.workers = workers;
    this.stealThreshold = opts?.stealThreshold ?? 2;
    this.queues = new Map();
    for (let i = 0; i < workers.length; i++) {
      this.queues.set(i, []);
    }
  }

  get workerCount(): number {
    return this.workers.length;
  }

  getQueueLengths(): number[] {
    return Array.from(this.queues.values()).map((q) => q.length);
  }

  private getLeastBusyWorker(): number {
    let minIdx = 0;
    let minLen = Infinity;
    for (const [idx, queue] of this.queues) {
      if (queue.length < minLen) {
        minLen = queue.length;
        minIdx = idx;
      }
    }
    return minIdx;
  }

  shouldSteal(): boolean {
    const lengths = this.getQueueLengths();
    if (lengths.length < 2) return false;
    const max = Math.max(...lengths);
    const min = Math.min(...lengths);
    return max > min * this.stealThreshold;
  }

  stealWork(): number {
    const entries = Array.from(this.queues.entries())
      .sort((a, b) => a[1].length - b[1].length);

    const [, idlerQueue] = entries[0];
    const [, busiestQueue] = entries[entries.length - 1];

    const count = Math.floor(busiestQueue.length / 2);
    if (count === 0) return 0;

    const stolen = busiestQueue.splice(0, count);
    idlerQueue.push(...stolen);
    return count;
  }

  async submit<T = unknown>(task: PoolTask): Promise<T> {
    const workerId = this.getLeastBusyWorker();
    const worker = this.workers[workerId];
    const queue = this.queues.get(workerId)!;

    queue.push(task);

    if (this.shouldSteal()) {
      this.stealWork();
    }

    try {
      return await worker.execute(task) as T;
    } finally {
      const idx = queue.indexOf(task);
      if (idx >= 0) queue.splice(idx, 1);
    }
  }
}
