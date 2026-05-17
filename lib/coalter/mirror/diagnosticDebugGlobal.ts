/**
 * CoAlter AOO Phase B B-5a — Diagnostic Debug Global (window expose, dev-only)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §10.8
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §8.3
 *
 * 役割 (B-5a 段階):
 *   `window.__coalterMirrorDiagnostic` に **read-only diagnostic API** を expose する。
 *   CEO が B-5c canary smoke 中に developer tools から observation するための debug 経路。
 *
 *   Phase A の `__coalterObserverDebug` パターン (15-min expire) を継承し、強化:
 *     - **二重 flag gating** (B-5a flags.ts):
 *       1. `mirrorChannelEnabled === true`
 *       2. `mirrorDiagnosticExposeEnabled === true`
 *     - **15-min auto-expire** (setTimeout 不使用、各 read で elapsed time check)
 *     - **read-only API only** (push / clear は expose しない、internal only)
 *     - PII firewall (snapshot 自体が PII を持たない、types.ts 型レベル)
 *
 * 7 層 defense (env 漏れ対策):
 *   1. env scope: `branch-scoped Preview only` (CEO 手動)
 *   2. env value strict parser: `=== "true"` exact match (flags.ts)
 *   3. **二重 flag**: mirror channel AND diagnostic expose (両方必要)
 *   4. install 時 typeof window check (SSR ガード)
 *   5. install 時 development NODE_ENV check (production はさらに install しない)
 *   6. 15-min auto-expire (install 後 15 min で API が "expired" を返す)
 *   7. selfDestroy API (CEO 手動で即時破棄可能)
 *
 * No-Effect Contract:
 *   - production runtime に副作用ゼロ (flag OFF → install されない)
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
 *   - B-1 〜 B-4d zero diff (read-only import のみ)
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
 * Debug global を install する (二重 flag check + window check + production guard 経由)。
 *
 * 動作:
 *   - flag いずれか OFF → install しない (no-op)
 *   - SSR 環境 (typeof window === "undefined") → install しない
 *   - production NODE_ENV → install しない (development / preview のみ)
 *   - すでに install 済 → 再 install しない (idempotent)
 *
 * 呼び出し: `useMirrorEngine` hook 内 useEffect で 1 回 (mount 時)。
 */
export function installDiagnosticDebugGlobalIfEnabled(): void {
  // (1) 二重 flag gate
  if (!COALTER_FLAGS.mirrorChannelEnabled) return;
  if (!COALTER_FLAGS.mirrorDiagnosticExposeEnabled) return;

  // (2) SSR ガード
  if (typeof window === "undefined") return;

  // (3) production NODE_ENV ガード (dev / preview のみ install)
  // production build で誤って flag ON になっても install しない defensive layer
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") {
    return;
  }

  // (4) 二重 install 防止 (idempotent)
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
