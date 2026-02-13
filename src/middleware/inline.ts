export interface MiddlewareFilter {
  prefixurl?: string;
  egroup?: string;
  endpoints?: string[];
}

export type Middleware = {
  fn: (ctx: unknown, next: () => Promise<void>) => Promise<void>;
  filter?: MiddlewareFilter;
};

export function filterApplicable(mw: Middleware[], path: string, egroup?: string, endpoint?: string): Middleware[] {
  return mw.filter(m => {
    const f = m.filter;
    if (!f) return true;
    if (f.prefixurl && !path.startsWith(f.prefixurl)) return false;
    if (f.egroup && f.egroup !== egroup) return false;
    if (f.endpoints && (!endpoint || !f.endpoints.includes(endpoint))) return false;
    return true;
  });
}

export function inlineMiddlewareChain(mw: Middleware[]): ((ctx: unknown, final: () => Promise<void>) => Promise<void>) {
  return async (ctx: unknown, final: () => Promise<void>) => {
    let idx = -1;
    async function runner(i: number): Promise<void> {
      if (i <= idx) throw new Error('next() called multiple times');
      idx = i;
      const m = mw[i];
      if (!m) return await final();
      await m.fn(ctx, () => runner(i + 1));
    }
    await runner(0);
  };
}
