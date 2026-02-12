export class SessionDO {
  private currentTxid: bigint = 0n;
  private activeTxs = new Map<string, bigint>();

  async allocateTxid(): Promise<bigint> {
    this.currentTxid = this.currentTxid + 1n;
    return this.currentTxid;
  }

  async beginTransaction(owner: string): Promise<{
    sid: string;
    owner: string;
    currentTxid: bigint;
  }> {
    const sid = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
    const txid = await this.allocateTxid();
    this.activeTxs.set(sid, txid);
    return { sid, owner, currentTxid: txid };
  }

  async commit(sid: string): Promise<void> {
    this.activeTxs.delete(sid);
  }

  get minActiveTxid(): bigint {
    if (this.activeTxs.size === 0) return this.currentTxid;
    let min = undefined as bigint | undefined;
    for (const v of this.activeTxs.values()) {
      if (min === undefined || v < min) min = v;
    }
    return min!;
  }
}
