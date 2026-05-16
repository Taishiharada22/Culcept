/**
 * CoAlter Movie Understanding — Diagnostics Fan-out (A3 phase)
 *
 * 正本:
 *   - lib/coalter/understanding/diagnostics.ts (既存 `emitUnderstandingDiagnostics`、
 *     console emit only、CEO lock A 2026-04-20)
 *   - lib/coalter/understanding/redactedDiagnosticsBuffer.ts (A2、PR #146、
 *     `appendRedactedUnderstandingDiagnosticsEvent` + bucketing helpers)
 *   - lib/coalter/understanding/types.ts (`UnderstandingDiagnostics` raw shape)
 *   - lib/coalter/flags.ts (`understandingBufferFanoutEnabled` flag、本 PR で追加)
 *
 * 役割:
 *   既存 `emitUnderstandingDiagnostics` 経路の **二次 channel** として、
 *   raw `UnderstandingDiagnostics` を A2 redacted buffer に **memory-only fan-out**
 *   する helper を提供する。
 *
 *   **本 A3 phase の目的は fan-out wiring の最小追加**:
 *     - 既存 console emit path **完全不変** (`COALTER_UNDERSTANDING_DIAGNOSTICS`
 *       依存なし、独立 flag)
 *     - 新 flag `COALTER_UNDERSTANDING_BUFFER_FANOUT` で gate (default OFF)
 *     - flag OFF → 1 行で早期 return、既存 emit 経路 1 bit も変化なし
 *     - flag ON → raw → redacted transform → buffer append (memory-only)
 *     - 失敗は二重 try/catch で swallow (fail-open)
 *
 * **重要 (CEO 2026-05-16 補正)**:
 *   - 本 PR は **Stop-before-merge lane** (既存 diagnostics emit path に touch)
 *   - read-only retrieval API は **追加しない** (A4 別 PR、CEO 戦略判断必須)
 *   - console / telemetry / Sentry / storage / DB / fetch 一切 **追加しない**
 *   - production behavior unchanged when OFF
 *
 * 構造的安全設計 (A2 継承 + A3 強化):
 *   1. **PII firewall at transformer** (人間超越 Idea D):
 *      - raw `UnderstandingDiagnostics` の field のうち、A2 buffer に渡すのは
 *        outcome / lensVersion / understanding_confidence / completeness /
 *        source_coverage (count) / latency_ms / missing_domains.length のみ
 *      - **pairHash / computedAt / todayReaderComparison は 構造的 drop**
 *        (A2 buffer の PII_FORBIDDEN_FIELD_NAMES と整合)
 *   2. **Twin-channel emit (人間超越 Idea A)**:
 *      - 既存 console emit (`COALTER_UNDERSTANDING_DIAGNOSTICS`) と
 *        新 buffer fan-out (`COALTER_UNDERSTANDING_BUFFER_FANOUT`) が **完全独立**
 *      - 4 patterns 全対応 (console OFF/ON × buffer OFF/ON)
 *   3. **No-op when flag OFF** (CEO 必須、人間超越 Idea F):
 *      - flag 判定で早期 return、既存 emit path 完全不変
 *   4. **Twin try-catch (人間超越 Idea C)**:
 *      - transformer 内 try-catch (transform error swallow)
 *      - append 内 try-catch (append error swallow)
 *      - 外側 caller (emitUnderstandingDiagnostics) で更に try-catch (二重防御)
 *   5. **No external side effect** (CEO 必須):
 *      - console.log / console.warn / console.error 追加なし
 *      - localStorage / sessionStorage / cookie / Sentry / fetch / Supabase / DB 一切なし
 *      - A2 buffer の memory append のみ
 *   6. **Deterministic transformer** (pure):
 *      - transformer は pure function、同 input → 同 output
 *      - append は A2 buffer の stateful helper を呼ぶだけ
 *   7. **Fanout outcome enum** (人間超越 Idea L、診断容易化):
 *      - skipped_flag_off / skipped_invalid_input / skipped_transform_error /
 *        skipped_append_error / appended の 5 値 enum
 *      - test では outcome を確認可能、production code は戻り値を使わない (no-op)
 *
 * 後続 phase (本 PR scope 外):
 *   - A4: read-only diagnostics retrieval API (route touch、Stop-before-merge lane、
 *     auth 戦略必須、CEO 戦略判断)
 *   - A5+: production rollout (Step E-1 開始判断、CEO 戦略判断必須)
 *
 * 本 PR の不可触 (CEO 2026-05-16 制約):
 *   - read-only retrieval API
 *   - route / API / ChatClient / UpperLayerMount touch
 *   - console.log / console.warn / console.error
 *   - localStorage / sessionStorage / cookie
 *   - Sentry / telemetry / fetch / Supabase / DB / migration
 *   - production env / Vercel env 変更
 *   - COALTER_UNDERSTANDING_DIAGNOSTICS / COALTER_MOVIE_CURATOR_LIVE /
 *     COALTER_THREE_STAGE 変更
 *   - bug1 / Stargazer pivot
 */

import type { UnderstandingDiagnostics } from "./types";
import {
  appendRedactedUnderstandingDiagnosticsEvent,
  createRedactedUnderstandingDiagnosticsEvent,
  type CreateRedactedUnderstandingDiagnosticsEventInput,
  type RedactedUnderstandingDiagnosticsEvent,
} from "./redactedDiagnosticsBuffer";

// ─────────────────────────────────────────────
// const exports (env var / version)
// ─────────────────────────────────────────────

/**
 * Env var name for buffer fan-out enable.
 *
 * **本 PR では env file / Vercel env / Production env 変更なし**。
 * Preview env 設定は別 CEO 判断 (A4 phase 以降)。
 */
export const BUFFER_FANOUT_ENV_VAR = "COALTER_UNDERSTANDING_BUFFER_FANOUT" as const;

/**
 * Fan-out helper version (semver、独立).
 *
 * 本 A3 初版 = "0.1.0"。
 * helper logic 変更時 increment。
 */
export const BUFFER_FANOUT_VERSION = "0.1.0";

// ─────────────────────────────────────────────
// Fanout outcome enum (人間超越 Idea L、診断容易化)
// ─────────────────────────────────────────────

/**
 * Fan-out outcome (test で確認、production code では使わない).
 *
 *   - "skipped_flag_off": flag OFF (or unknown fallback OFF) で早期 return
 *   - "skipped_invalid_input": raw input が malformed / null / undefined
 *   - "skipped_transform_error": transformer が throw (内部 try/catch で swallow)
 *   - "skipped_append_error": A2 buffer append が undefined 返却 (reject)
 *   - "appended": 正常に A2 buffer に append された
 */
export type FanoutOutcome =
  | "skipped_flag_off"
  | "skipped_invalid_input"
  | "skipped_transform_error"
  | "skipped_append_error"
  | "appended";

// ─────────────────────────────────────────────
// Flag check (pure、人間超越 Idea G: 独立 flag)
// ─────────────────────────────────────────────

/**
 * Check if buffer fan-out is enabled via env var.
 *
 * **Whitelist + fail-closed** (D3 contextDetectionMode pattern 継承):
 *   - "true" / "1" / "on" / "yes" (case-insensitive、trim) → true
 *   - "false" / "0" / "off" / "no" / "" → false
 *   - unknown / undefined / null → false (fail-closed)
 *
 * **Independent of `COALTER_UNDERSTANDING_DIAGNOSTICS`** (console emit flag):
 *   - 本 helper は独立 env を判定
 *   - console emit と buffer fan-out が独立 ON/OFF 可能
 *
 * @returns true only if env is explicitly truthy whitelist value
 */
export function isBufferFanoutEnabled(): boolean {
  // process は Node 実行時のみ。browser polyfill では env={} に落ちて false。
  if (typeof process === "undefined" || !process.env) return false;
  const rawValue = process.env[BUFFER_FANOUT_ENV_VAR];
  if (rawValue === undefined || rawValue === null) return false;
  const normalized = String(rawValue).trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "on" || normalized === "yes") {
    return true;
  }
  // 未知値 / "false" / "0" / "off" / "no" / 空文字 → 全て false (fail-closed)
  return false;
}

// ─────────────────────────────────────────────
// Transformer: raw → redacted CreateInput (pure、人間超越 Idea B + D)
// ─────────────────────────────────────────────

/**
 * Transform raw `UnderstandingDiagnostics` to A2 buffer's CreateInput shape.
 *
 * **Pure function**: 同 input → 同 output、副作用なし、`Math.random` / `Date.now`
 * 不使用。
 *
 * **PII firewall (構造的 drop)** — 以下の raw field を **A2 buffer に渡さない**:
 *   - `pairHash` (匿名 hash だが A2 buffer scope 外、correlation 防止)
 *   - `computedAt` (timestamp、deterministic / privacy 保護のため)
 *   - `todayReaderComparison` (LLM shadow 比較 metric、A3 scope 外)
 *
 * **Bucketing は A2 buffer 内部の helper が実施** (本 transformer は raw 数値を
 * そのまま CreateInput に渡す、A2 が bucket 化)。
 *
 * **Fail-closed**: malformed raw → undefined を返す (throw しない)。
 *
 * @param raw UnderstandingDiagnostics (CEO lock A 経由で既に PII-free 型)
 * @returns CreateRedactedUnderstandingDiagnosticsEventInput または undefined
 */
export function transformUnderstandingDiagnosticsToRedactedInput(
  raw: UnderstandingDiagnostics | null | undefined,
): CreateRedactedUnderstandingDiagnosticsEventInput | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw !== "object") return undefined;
  if (typeof raw.outcome !== "string") return undefined;
  if (typeof raw.understanding_confidence !== "number") return undefined;

  // raw shape の dot-key を camelCase に変換 + PII field を drop
  // (pairHash / computedAt / todayReaderComparison は 渡さない)
  const sc = raw.source_coverage;
  return {
    outcome: raw.outcome,
    lensVersion: typeof raw.lensVersion === "string" ? raw.lensVersion : undefined,
    understandingConfidence: raw.understanding_confidence,
    // completeness は BundleCompleteness object、A2 input は number (0-1)
    //   → completeness 全体 (relationship + conversation + environmental + 各 person 平均) を
    //     bucket 化用 number に集約するロジックは複雑なので、本 PR では undefined を渡し
    //     A4 phase で精緻化 (本 A3 では bucket 不在で OK、forward compat)
    completeness: undefined,
    latencyMs: {
      total: raw.latency_ms?.total,
      collect: raw.latency_ms?.collect,
      fusion: raw.latency_ms?.fusion,
      todayReader: raw.latency_ms?.todayReader,
      fairness: raw.latency_ms?.fairness,
    },
    sourceCoverageCounts: sc !== undefined ? {
      personAStargazerCount: sc.a?.stargazerCount,
      personAAlterCount: sc.a?.alterCount,
      personABehavioralCount: sc.a?.behavioralCount,
      personBStargazerCount: sc.b?.stargazerCount,
      personBAlterCount: sc.b?.alterCount,
      personBBehavioralCount: sc.b?.behavioralCount,
    } : undefined,
    missingDomainCount: Array.isArray(raw.missing_domains) ? raw.missing_domains.length : undefined,
  };
}

// ─────────────────────────────────────────────
// Fan-out result (test 用、production code は使わない)
// ─────────────────────────────────────────────

export interface FanOutResult {
  outcome: FanoutOutcome;
  /** Appended event (only if outcome === "appended") */
  appendedEvent?: RedactedUnderstandingDiagnosticsEvent;
}

// ─────────────────────────────────────────────
// Main: fan-out to A2 buffer (twin try-catch、人間超越 Idea C + F + G)
// ─────────────────────────────────────────────

/**
 * Fan-out raw `UnderstandingDiagnostics` to A2 buffer (memory-only append).
 *
 * **Behavior matrix**:
 *
 * | flag | raw input | outcome | A2 buffer change |
 * |------|-----------|---------|------------------|
 * | OFF | (any) | skipped_flag_off | no |
 * | ON | null/undefined/invalid | skipped_invalid_input | no |
 * | ON | valid raw | (transform fail) skipped_transform_error | no |
 * | ON | valid raw | (append reject) skipped_append_error | no |
 * | ON | valid raw | appended | yes (memory append) |
 *
 * **重要 (CEO 必須)**:
 *   - flag OFF → 早期 return、既存 emit path 完全不変
 *   - throw しない (production stability、本流 emit 経路を倒さない)
 *   - 戻り値は test 用、production code は **無視** (caller は `void` で消費)
 *
 * **No external side effect**:
 *   - console.log / console.warn / console.error 呼ばない
 *   - localStorage / sessionStorage / cookie 触らない
 *   - Sentry / telemetry / fetch / Supabase / DB 一切なし
 *   - A2 buffer の memory append のみ
 *
 * @param raw UnderstandingDiagnostics or invalid input
 * @returns FanOutResult (test 用、production code は無視)
 */
export function fanOutUnderstandingDiagnosticsToBuffer(
  raw: UnderstandingDiagnostics | null | undefined | unknown,
): FanOutResult {
  // Step 1: flag check (CEO 必須、早期 return)
  if (!isBufferFanoutEnabled()) {
    return { outcome: "skipped_flag_off" };
  }

  // Step 2: transform (try-catch、二重防御の内側)
  let createInput: CreateRedactedUnderstandingDiagnosticsEventInput | undefined;
  try {
    createInput = transformUnderstandingDiagnosticsToRedactedInput(
      raw as UnderstandingDiagnostics | null | undefined,
    );
  } catch {
    // transformer が throw した (想定外、現状は throw しないが二重防御)
    return { outcome: "skipped_transform_error" };
  }

  if (createInput === undefined) {
    return { outcome: "skipped_invalid_input" };
  }

  // Step 3: create + append (A2 buffer)
  let event: RedactedUnderstandingDiagnosticsEvent | undefined;
  try {
    event = createRedactedUnderstandingDiagnosticsEvent(createInput);
    if (event === undefined) {
      return { outcome: "skipped_transform_error" };
    }
  } catch {
    return { outcome: "skipped_transform_error" };
  }

  let appended: RedactedUnderstandingDiagnosticsEvent | undefined;
  try {
    appended = appendRedactedUnderstandingDiagnosticsEvent(event);
    if (appended === undefined) {
      return { outcome: "skipped_append_error" };
    }
  } catch {
    return { outcome: "skipped_append_error" };
  }

  return { outcome: "appended", appendedEvent: appended };
}

// ─────────────────────────────────────────────
// Re-export (caller convenience)
// ─────────────────────────────────────────────

export type {
  CreateRedactedUnderstandingDiagnosticsEventInput,
  RedactedUnderstandingDiagnosticsEvent,
};
