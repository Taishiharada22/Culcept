/**
 * CoAlter Bug-1 §2.3 — 失敗独立 5 条文 guard
 *
 * 正本: docs/coalter-bug1-emotion-retrieval-design.md §2.3
 *
 * 本モジュールは extractEmotionTags（および将来の感情抽出器）が §2.3 の
 * 失敗独立 5 条文を守ることを、**テスト時**に動的検証するための guard 関数群。
 *
 * 本 guard は本番実行パスで呼ばない（test-only ユーティリティ）。
 *
 * 5 条文 (mainstream plan §2.2):
 *   1. assertNoSideEffect      — DB / network touch ゼロ
 *   2. assertPureDetection     — text のみに依存（外部 state 不参照、決定的）
 *   3. assertBoundedRuntime    — 1 実行 maxMs 以内
 *   4. assertFailOpen          — 不正入力で例外を投げず [] を返す
 *   5. assertNoDownstreamSignal — 返り値が caller 以外に信号を発しない
 */

/**
 * §2.3-1: fn の実行中に global fetch / XMLHttpRequest が呼ばれていないことを検証する。
 *
 * 呼び出された瞬間に throw するプロキシで覆い、違反があれば Error を投げる。
 */
export function assertNoSideEffect<T>(fn: () => T): T {
  const g = globalThis as Record<string, unknown>;
  const originalFetch = g.fetch;
  const originalXHR = g.XMLHttpRequest;

  g.fetch = () => {
    throw new Error("assertNoSideEffect: fetch was called");
  };
  g.XMLHttpRequest = class {
    constructor() {
      throw new Error("assertNoSideEffect: XMLHttpRequest was constructed");
    }
  };

  try {
    return fn();
  } finally {
    g.fetch = originalFetch;
    g.XMLHttpRequest = originalXHR;
  }
}

/**
 * §2.3-2: 同一 text に対して 2 回 fn を呼び、同一結果であることを検証する（決定性）。
 *
 * 返り値の deep equality は JSON.stringify で近似（EmotionTag は primitive only のため安全）。
 */
export function assertPureDetection<T>(
  fn: (text: string) => T,
  text: string,
): T {
  const r1 = fn(text);
  const r2 = fn(text);
  if (JSON.stringify(r1) !== JSON.stringify(r2)) {
    throw new Error("assertPureDetection: non-deterministic (r1 !== r2)");
  }
  return r1;
}

/**
 * §2.3-3: 実行時間 maxMs 以内であることを検証する wrapper。
 *
 * @throws 実行時間が maxMs を超えた場合 Error
 */
export function assertBoundedRuntime<T>(fn: () => T, maxMs: number): T {
  const start = performance.now();
  const result = fn();
  const elapsed = performance.now() - start;
  if (elapsed > maxMs) {
    throw new Error(
      `assertBoundedRuntime: ${elapsed.toFixed(2)}ms > ${maxMs}ms`,
    );
  }
  return result;
}

/**
 * §2.3-4: 失敗時に例外を throw せず空配列 [] を返す fail-open 保証を検証する。
 *
 * @throws fn が例外を投げた場合、または空配列以外を返した場合 Error
 */
export function assertFailOpen(fn: () => unknown): void {
  let result: unknown;
  try {
    result = fn();
  } catch (e) {
    throw new Error(
      `assertFailOpen: fn threw instead of returning [] (${String(e)})`,
    );
  }
  if (!Array.isArray(result) || result.length !== 0) {
    throw new Error(
      `assertFailOpen: expected [] but got ${JSON.stringify(result)}`,
    );
  }
}

/**
 * §2.3-5: 返り値が caller 以外に信号を発しない（副作用なし）ことを検証する。
 *
 * result に Promise / Observable / EventEmitter が含まれていないことを確認する。
 */
export function assertNoDownstreamSignal(result: unknown): void {
  if (result === null || typeof result !== "object") return;

  const maybe = result as {
    then?: unknown;
    subscribe?: unknown;
    on?: unknown;
  };
  if (typeof maybe.then === "function") {
    throw new Error("assertNoDownstreamSignal: result is Promise-like");
  }
  if (typeof maybe.subscribe === "function") {
    throw new Error(
      "assertNoDownstreamSignal: result has subscribe (Observable-like)",
    );
  }
  if (typeof maybe.on === "function") {
    throw new Error(
      "assertNoDownstreamSignal: result has on (EventEmitter-like)",
    );
  }
  if (Array.isArray(result)) {
    for (const item of result) {
      if (item && typeof item === "object") {
        assertNoDownstreamSignal(item);
      }
    }
  }
}
