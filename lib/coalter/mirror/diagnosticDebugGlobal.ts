/**
 * CoAlter AOO Phase B B-5a + Phase C C-1 — Diagnostic Debug Global (window expose)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §10.8
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §8.3
 *   - Phase A 7-layer defense: docs/coalter-aoo-phase-a-completion.md §3.5 / §3.7
 *   - Phase B 完了 docs §7.1 (NODE_ENV guard 学び取り込み漏れの記録)
 *   - Phase C C-0 design: docs/coalter-aoo-phase-c-integration-design.md §4.1 (Appendix D)
 *
 * 役割:
 *   `window.__coalterMirrorDiagnostic` に **read-only diagnostic API** を expose する。
 *   CEO が canary smoke 中に developer tools から observation するための debug 経路。
 *
 *   Phase A の `__coalterObserverDebug` パターン (15-min expire + 7-layer defense)
 *   を継承し、Mirror 用に拡張:
 *     - **二重 flag gating** (B-5a flags.ts):
 *       1. `mirrorChannelEnabled === true`
 *       2. `mirrorDiagnosticExposeEnabled === true`
 *     - **15-min auto-expire** (setTimeout 不使用、各 read で elapsed time check)
 *     - **read-only API only** (push / clear は expose しない、internal only)
 *     - PII firewall (snapshot 自体が PII を持たない、types.ts 型レベル)
 *
 * Phase C C-1 修正 (本 file の本体修正):
 *   - **`process.env.NODE_ENV === "production"` guard を削除** (Phase A §3.5 学び反映)
 *   - 理由: Vercel Preview build は Next.js production build (`NODE_ENV=production`)
 *     のため、NODE_ENV guard が Preview canary 観測を**意図せず block** する事象が
 *     Phase B B-5c smoke で発覚した (Phase B 完了 docs §7.1)
 *   - Phase A §3.5 で「NODE_ENV gate は Vercel Preview build (= production build) で
 *     canary を無効化するため採用禁止 (A-2e 補正)」と明示されていたが、Phase B B-5a
 *     設計時に取り込めていなかった → Phase C C-1 で正しく取り込む
 *   - 削除しても安全な根拠: Phase A §3.7 確立済の 7-layer defense が多重防御を構成
 *
 * Phase A §3.7 7-layer defense (本 file の運用前提、削除した NODE_ENV guard の代替):
 *   1. env flag default false (`mirrorChannelEnabled` / `mirrorDiagnosticExposeEnabled` 両方)
 *   2. env scope = **branch-scoped Preview only** (CEO 手動投入、Production / 全 Preview 禁止)
 *   3. PR merge 絶対禁止 (canary smoke は draft PR、merge しない)
 *   4. canary branch 短命 (smoke 完了後に削除)
 *   5. 15-min 時限 expire (本 file `EXPIRE_MS`、install 後 auto invalidate)
 *   6. smoke 後 env 削除 (CEO 手動)
 *   7. raw 露出禁止 (redacted snapshot only、`MirrorDiagnosticEntry` 型レベル PII firewall)
 *
 * 本 file 内 runtime defense (Phase A 7-layer に加えて多重化):
 *   - 二重 flag gate (mirrorChannel AND mirrorDiagnosticExpose、両方 ON のみ install)
 *   - SSR ガード (typeof window === "undefined" → install しない)
 *   - idempotent install (二重呼出で 1 度のみ install)
 *   - selfDestroy API (CEO 手動で即時破棄可能)
 *
 * No-Effect Contract:
 *   - flag OFF → 完全 no-op (install されない / window touch なし)
 *   - flag ON でも install は read-only API のみ
 *   - setTimeout / setInterval / addEventListener 不使用
 *   - DOM event listener 一切登録しない
 *
 * Test isolation:
 *   - `__resetForTest()` で _installed state クリア
 *   - vitest beforeEach で reset 必須
 *
 * 不可侵境界:
 *   - 既存 presence layer / observer / chat layer touch なし
 *   - B-1 〜 B-5b zero diff (read-only import のみ)
 *   - Phase C C-1 は本 file のみ touch (lib/coalter/mirror/diagnosticDebugGlobal.ts)
 */

import { COALTER_FLAGS } from "@/lib/coalter/flags";
import { getDiagnosticSnapshot } from "./diagnosticSnapshot";
import type { MirrorDiagnosticEntry } from "./types";

/** 15 分 = 15 * 60 * 1000 ms。install 後この時間経過で getSnapshot は expired を返す。 */
const EXPIRE_MS: number = 15 * 60 * 1000;

/**
 * Debug global key on window object。
 *
 * Phase A の `__coalterObserverDebug` と並列、prefix で名前空間衝突を防ぐ。
 */
const DEBUG_GLOBAL_KEY = "__coalterMirrorDiagnostic" as const;

/** Install 時刻 (Date.now())。null = 未 install。 */
let _installedAt: number | null = null;

/** Install 済 flag (二重 install 防止 + test 用)。 */
let _installed = false;

/**
 * Window global の API 形状。
 *
 * Read-only methods only。push / clear は internal、外部 expose しない。
 */
interface MirrorDiagnosticDebugAPI {
  /**
   * 現在の snapshot を返す。
   * - install 後 15 min 経過なら "expired" を返す
   * - flag ON のときのみ install されているので、本 API が呼べる時点で flag ON
   */
  getSnapshot(): ReadonlyArray<MirrorDiagnosticEntry> | { error: "expired"; installedAt: number | null };
  /**
   * Install 時刻 (Date.now() 単位、tab 起点相対) を返す。
   */
  getInstalledAt(): number | null;
  /**
   * 残り有効時間 ms (expired の場合は 0)。
   */
  getRemainingMs(): number;
  /**
   * window global を即座に破棄 (CEO 手動 cleanup)。
   */
  selfDestroy(): void;
}

/**
 * Debug global を install する (二重 flag check + SSR guard + idempotent)。
 *
 * 動作:
 *   - flag いずれか OFF → install しない (no-op)
 *   - SSR 環境 (typeof window === "undefined") → install しない
 *   - すでに install 済 → 再 install しない (idempotent)
 *
 * **Phase C C-1 で `NODE_ENV === "production"` guard を削除**:
 *   Vercel Preview build は Next.js production build であり NODE_ENV が
 *   "production" になるため、本 guard があると Preview canary 観測が
 *   block されていた (Phase B B-5c smoke で発覚、Phase B 完了 docs §7.1)。
 *   Phase A §3.5 学び (NODE_ENV gate 採用禁止) を正しく取り込む。
 *   削除しても安全な根拠は本 file 冒頭 docstring「Phase A §3.7 7-layer defense」
 *   参照 (env scope branch-scoped only + 15-min expire + canary draft + cleanup
 *   + redacted only が多重防御を構成)。
 *
 * 呼び出し: `useMirrorEngine` hook 内 useEffect で 1 回 (mount 時)。
 */
export function installDiagnosticDebugGlobalIfEnabled(): void {
  // (1) 二重 flag gate
  if (!COALTER_FLAGS.mirrorChannelEnabled) return;
  if (!COALTER_FLAGS.mirrorDiagnosticExposeEnabled) return;

  // (2) SSR ガード
  if (typeof window === "undefined") return;

  // (3) 二重 install 防止 (idempotent)
  if (_installed) return;

  _installedAt = Date.now();
  _installed = true;

  const api: MirrorDiagnosticDebugAPI = {
    getSnapshot() {
      const elapsed = _installedAt !== null ? Date.now() - _installedAt : EXPIRE_MS + 1;
      if (elapsed > EXPIRE_MS) {
        return { error: "expired", installedAt: _installedAt };
      }
      return getDiagnosticSnapshot();
    },
    getInstalledAt() {
      return _installedAt;
    },
    getRemainingMs() {
      if (_installedAt === null) return 0;
      const elapsed = Date.now() - _installedAt;
      return Math.max(0, EXPIRE_MS - elapsed);
    },
    selfDestroy() {
      destroyDiagnosticDebugGlobal();
    },
  };

  // Cast to unknown then to any-shaped window — TS 厳格モード回避
  (window as unknown as Record<string, unknown>)[DEBUG_GLOBAL_KEY] = api;
}

/**
 * Window global を破棄する (CEO 手動 cleanup / test isolation 兼用)。
 */
export function destroyDiagnosticDebugGlobal(): void {
  if (typeof window !== "undefined") {
    delete (window as unknown as Record<string, unknown>)[DEBUG_GLOBAL_KEY];
  }
  _installedAt = null;
  _installed = false;
}

/**
 * **Test only**: 内部 state を初期化。
 *
 * vitest の beforeEach で呼ぶ。Production code では使わない。
 *
 * @internal
 */
export function __resetForTest(): void {
  _installedAt = null;
  _installed = false;
  if (typeof window !== "undefined") {
    delete (window as unknown as Record<string, unknown>)[DEBUG_GLOBAL_KEY];
  }
}

/**
 * **Test only**: install 済 flag を確認。
 *
 * @internal
 */
export function __getInstalledForTest(): boolean {
  return _installed;
}

/**
 * **Test only**: install 時刻を直接 override (expire test 用)。
 *
 * @internal
 */
export function __setInstalledAtForTest(timestamp: number | null): void {
  _installedAt = timestamp;
}

/**
 * **Test only**: expire 時間 ms を取得。
 *
 * @internal
 */
export function __getExpireMsForTest(): number {
  return EXPIRE_MS;
}

/**
 * **Test only**: debug global key を取得。
 *
 * @internal
 */
export function __getDebugGlobalKeyForTest(): string {
  return DEBUG_GLOBAL_KEY;
}
