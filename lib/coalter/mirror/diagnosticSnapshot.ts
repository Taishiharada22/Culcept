/**
 * CoAlter AOO Phase B B-5a — Local In-Memory Diagnostic Snapshot
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §10.8 Transparent Reticence
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §8.3 / §10.8
 *
 * 役割 (B-5a 段階):
 *   `decideMirror()` の結果を **session-local in-memory** に蓄積する store。
 *   remote 送信なし / DB なし / fetch なし / persistence なし。
 *
 *   B-5c canary smoke で CEO が developer tools 経由で `window.__coalterMirrorDiagnostic`
 *   から read-only に観察する用途 (debug global は別 file)。
 *
 * 設計原則:
 *   - **session-local only**: module-level state、page reload で消失
 *   - **PII 非保持** (型レベル + runtime defensive):
 *     `MirrorDiagnosticEntry` 型に raw text / message id / user id / pair id /
 *     session id 等の PII field が存在しない (types.ts)
 *   - **max entries**: 古い entry を捨てる FIFO (overflow 防止、メモリリーク防止)
 *   - **getSnapshotCopy は frozen array を返す**: caller が mutation できない
 *   - **mutation 不可**: push 専用、外部から index 指定書き換え不可
 *
 * No-Effect Contract:
 *   - I/O / network / storage / DOM / event / timer / log 一切なし
 *   - module-level state のみ (session-local)
 *   - getSnapshotCopy は **frozen array (shallow)** を返す → mutation 不可
 *
 * Test isolation:
 *   - `__resetForTest()` で snapshot をクリア (test only、production には呼ばない)
 *   - vitest beforeEach で reset 必須
 *
 * 不可侵境界 (B-0 §9 / Phase A 継承):
 *   - 既存 presence layer / observer / chat layer touch なし
 *   - B-1 〜 B-4d zero diff (read-only import のみ)
 *   - localStorage / sessionStorage / cookie / IndexedDB 使用なし
 */

import type { MirrorDiagnosticEntry } from "./types";

/** Snapshot に保持する最大 entry 数。超えた分は FIFO で古いものから drop。 */
const MAX_ENTRIES = 100 as const;

/**
 * Snapshot の内部 store。
 *
 * Module-level state (session-local、page reload で消失)。
 * テスト時は `__resetForTest()` で初期化。
 */
let _store: MirrorDiagnosticEntry[] = [];

/**
 * Snapshot に 1 entry 追加する。
 *
 * - 上限 (MAX_ENTRIES) を超えたら先頭を drop (FIFO)
 * - entry は immutable (caller が後から書き換えても store 内には影響しない、
 *   shallow copy を作成して保存)
 *
 * @param entry - {@link MirrorDiagnosticEntry}
 */
export function pushDiagnosticEntry(entry: MirrorDiagnosticEntry): void {
  // Shallow copy で caller の mutation を遮断 (entry が後から変更されないよう保護)
  const frozen: MirrorDiagnosticEntry = {
    decision: entry.decision,
    reason: entry.reason,
    ervScore: entry.ervScore,
    modeContextStatus: entry.modeContextStatus,
    mode: entry.mode,
    alignmentBucket: entry.alignmentBucket,
    uncertaintyBucket: entry.uncertaintyBucket,
    silenceBudgetBucket: entry.silenceBudgetBucket,
    patternCategoryBucket: entry.patternCategoryBucket,
    timestamp: entry.timestamp,
  };
  _store.push(frozen);
  // FIFO overflow guard
  while (_store.length > MAX_ENTRIES) {
    _store.shift();
  }
}

/**
 * Snapshot 全 entry の copy を返す。
 *
 * - 返される配列は **新規 array** (caller が mutate しても store 不変)
 * - 各 entry も shallow copy 化 (内部 mutation 不可)
 *
 * @returns {@link MirrorDiagnosticEntry} の readonly array
 */
export function getDiagnosticSnapshot(): ReadonlyArray<MirrorDiagnosticEntry> {
  return _store.map((entry) => ({
    decision: entry.decision,
    reason: entry.reason,
    ervScore: entry.ervScore,
    modeContextStatus: entry.modeContextStatus,
    mode: entry.mode,
    alignmentBucket: entry.alignmentBucket,
    uncertaintyBucket: entry.uncertaintyBucket,
    silenceBudgetBucket: entry.silenceBudgetBucket,
    patternCategoryBucket: entry.patternCategoryBucket,
    timestamp: entry.timestamp,
  }));
}

/**
 * Snapshot の現在 entry 数を返す (test 用途 + UI 表示候補)。
 */
export function getDiagnosticSize(): number {
  return _store.length;
}

/**
 * Snapshot をクリアする (caller 主導の reset、session 終了相当)。
 *
 * 用途: B-5c で smoke 完了後に CEO が明示的にクリア (env 削除前 cleanup)。
 */
export function clearDiagnostic(): void {
  _store = [];
}

/**
 * **Test only**: 内部 state を初期化。
 *
 * vitest の beforeEach で呼ぶ。Production code では使わない。
 *
 * @internal
 */
export function __resetForTest(): void {
  _store = [];
}

/**
 * **Test only**: 内部 store の最大エントリ数を取得 (test verification 用)。
 *
 * @internal
 */
export function __getMaxEntriesForTest(): number {
  return MAX_ENTRIES;
}
