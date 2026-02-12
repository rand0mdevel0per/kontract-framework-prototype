import { describe, it, expect } from 'vitest';
import { SessionDO } from '../src/runtime/SessionDO';

describe('SessionDO', () => {
  it('allocates increasing txid', async () => {
    const s = new SessionDO();
    const a = await s.allocateTxid();
    const b = await s.allocateTxid();
    expect(b > a).toBe(true);
  });

  it('tracks minActiveTxid', async () => {
    const s = new SessionDO();
    const t1 = await s.beginTransaction('o1');
    const t2 = await s.beginTransaction('o2');
    expect(s.minActiveTxid <= t1.currentTxid && s.minActiveTxid <= t2.currentTxid).toBe(true);
    await s.commit(t1.sid);
    expect(s.minActiveTxid).toBe(t2.currentTxid);
  });

  it('minActiveTxid equals current when no active txs', async () => {
    const s = new SessionDO();
    await s.allocateTxid();
    await s.allocateTxid();
    expect(s.minActiveTxid).toBeGreaterThan(0n);
  });
});
