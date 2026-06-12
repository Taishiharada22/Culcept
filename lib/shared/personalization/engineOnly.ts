/**
 * M2-B-1 EngineOnly brand + leak guard（pure・runtime 依存なし）
 *
 * 設計: docs/m2-b-pair-read-design.md §3 T3 / §10
 *
 * 目的: 「サーバ側エンジンだけが両者の private state を読む」ため、エンジン専用
 * オブジェクトに**実行時ブランド**を付与し、client payload へ誤って混入した場合に
 * 出口ガード `assertNoEngineOnlyLeak` が検出して throw できるようにする。
 *
 * 重要な前提（symbol ブランドの限界）:
 *   - ブランドは **non-enumerable な symbol プロパティ**。`JSON.stringify` は symbol も
 *     non-enumerable も出力しない → ブランド付きオブジェクトを**素朴に serialize すると
 *     ブランドが消え、private 値だけが残る**。
 *   - したがってガードは「**serialize 前のライブオブジェクトに対して**」呼ぶ契約。
 *     client へ何かを返す直前に `assertNoEngineOnlyLeak(payload)` を通すこと。
 *   - 安全な client 出力は「ブランドを剥いだ新しい plain object（per-viewer 射影）」で
 *     あり、エンジンオブジェクトをそのまま整形しない。
 */

/** エンジン専用ブランド（unique symbol）。型と実行時の両方で機能する。 */
export const ENGINE_ONLY_BRAND = Symbol("personalization.engineOnly");

/** T にエンジン専用ブランドを型レベルで付与 */
export type EngineOnly<T> = T & { readonly [ENGINE_ONLY_BRAND]: true };

/**
 * value にエンジン専用ブランドを **in-place** で付与する（non-enumerable）。
 * 戻り値は同一参照。JSON 出力・Object.keys には現れない。
 */
export function markEngineOnly<T extends object>(value: T): EngineOnly<T> {
  Object.defineProperty(value, ENGINE_ONLY_BRAND, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return value as EngineOnly<T>;
}

/** value がエンジン専用ブランドを持つか */
export function isEngineOnly(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[ENGINE_ONLY_BRAND] === true
  );
}

export class EngineOnlyLeakError extends Error {
  constructor(public readonly path: string) {
    super(`engine-only value leaked into payload at ${path}`);
    this.name = "EngineOnlyLeakError";
  }
}

/**
 * payload のオブジェクトグラフを再帰的に走査し、エンジン専用ブランドを持つ
 * オブジェクトが **どの深さにも存在しない**ことを保証する。存在すれば throw。
 * 循環参照は seen set で安全に処理。
 *
 * 使い方: client へ返す直前のライブオブジェクトに対して呼ぶ（serialize 前）。
 */
export function assertNoEngineOnlyLeak(payload: unknown, rootPath = "$"): void {
  walk(payload, rootPath, new Set<object>());
}

function walk(node: unknown, path: string, seen: Set<object>): void {
  if (node === null || typeof node !== "object") return;
  if (seen.has(node)) return;
  seen.add(node);

  if (isEngineOnly(node)) {
    throw new EngineOnlyLeakError(path);
  }

  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, `${path}[${i}]`, seen));
    return;
  }
  // enumerable string キーのみ走査（ブランド symbol 自体は isEngineOnly で個別判定済み）
  for (const [k, v] of Object.entries(node)) {
    walk(v, `${path}.${k}`, seen);
  }
}
