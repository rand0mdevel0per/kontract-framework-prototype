/**
 * SWC optimization passes for compiled output.
 * Spec §6.3.4 — Phase 4: dead code elimination, constant folding,
 * function inlining, variable reduction, expression simplification.
 */

import { minify as swcMinify, type JsMinifyOptions } from '@swc/core';

export interface SwcOptimizeOptions {
  /** Dead code elimination (default: true) */
  dce?: boolean;
  /** Constant folding and propagation (default: true) */
  constantFolding?: boolean;
  /** Function inlining level: 0 = off, 1 = simple, 2 = with args, 3 = aggressive (default: 2) */
  inlineLevel?: 0 | 1 | 2 | 3;
  /** Variable reduction (default: true) */
  reduceVars?: boolean;
  /** Expression simplification / collapse (default: true) */
  simplify?: boolean;
  /** Number of optimization passes (default: 3, matching spec "O3") */
  passes?: number;
  /** Mangle variable names (default: false — keep readable for debugging) */
  mangle?: boolean;
}

const DEFAULT_OPTIONS: Required<SwcOptimizeOptions> = {
  dce: true,
  constantFolding: true,
  inlineLevel: 2,
  reduceVars: true,
  simplify: true,
  passes: 3,
  mangle: false,
};

/**
 * Run SWC optimization passes on JavaScript code.
 * Applies DCE, constant folding, function inlining, variable reduction,
 * and expression simplification per spec §6.3.4.
 */
export async function optimize(
  code: string,
  options?: SwcOptimizeOptions,
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const minifyOpts: JsMinifyOptions = {
    compress: {
      dead_code: opts.dce,
      evaluate: opts.constantFolding,
      inline: opts.inlineLevel,
      reduce_vars: opts.reduceVars,
      collapse_vars: opts.simplify,
      passes: opts.passes,
      toplevel: true,
      unused: opts.dce,
    },
    mangle: opts.mangle,
    sourceMap: false,
  };

  const result = await swcMinify(code, minifyOpts);
  return result.code;
}

/**
 * Convenience: optimize with all passes disabled (passthrough).
 * Useful as a baseline for benchmarks.
 */
export async function optimizePassthrough(code: string): Promise<string> {
  return optimize(code, {
    dce: false,
    constantFolding: false,
    inlineLevel: 0,
    reduceVars: false,
    simplify: false,
    passes: 1,
    mangle: false,
  });
}
