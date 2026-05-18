/**
 * CoAlter AOO Phase C C-2 — Presence Mirror Bridge (read-only signal bus subscriber)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-c-integration-design.md (PR #186) §4.2 Appendix E
 *   - C-0 推奨 Option δ (signal bus subscribe) を採用 (CEO 承認 2026-05-18)
 *
 * 役割 (C-2 段階):
 *   Phase A `productionSignalBus.subscribe(...)` を **既存 public API** 経由で
 *   subscribe し、signal を **即座に bucketize して raw を破棄**、session-local
 *   cache を保持。Mirror engineAdapter は本 bridge の `getMirrorReadInput()` を
 *   call して shadow mode → controlled known input への遷移を行う。
 *
 *   **B-5b までは全 axis unknown (Observe Gate fail で STAY_SILENT)**。
 *   C-2 後は **patternCategoryBucket axis だけが known になる**:
 *     - 他 axis (mode / alignment / uncertainty / silenceBudget) は signal から
 *       直接導出できない (Phase A `PresenceSignal` shape の制約、§設計 caveat 参照)
 *     - これは C-2 の honest scope: 「1 axis 改善 + default-STAY_SILENT 維持」
 *
 * 設計 caveat (本 file の限界):
 *   `PresenceSignal` (lib/coalter/presence/types.ts L187) は:
 *     - kind / strength / detectedAt / meta?.matchedPattern のみ carry
 *     - alignment / uncertainty / silenceBudget の数値値は **carry しない**
 *       (これらは Phase A observer 内部で per-pair relationshipState に蓄積される)
 *   → 本 bridge から取れるのは **matchedPattern → MirrorPatternCategoryBucket** のみ
 *   → mode / alignment / uncertainty / silenceBudget の bucket 化は Phase D 以降の
 *     新たな設計が必要 (presence sharedState read 経路 or relationshipState への
 *     pair scoping 経路)
 *
 *   この制約により C-2 後も default-STAY_SILENT が維持される (他 axis unknown で
 *   Observe Gate fail のため)。これは設計通り。C-3 forced canary mode で意図的に
 *   visible 経路を発火させる。
 *
 * 設計原則:
 *   - **既存 public API のみ使用** (presence layer / observer layer 0 diff):
 *     - `subscribePresenceSignal` (presence layer public API)
 *     - `bucketizeMatchedPattern` (observer layer public API、PII firewall 既適用)
 *   - **PII firewall (型 + runtime 二重)**:
 *     - cache 型 (`MirrorReadInput`) に raw text / raw id field を**書けない**
 *     - handler 内で signal.meta から `matchedPattern` の **string 型のみ抽出**、
 *       他 meta field (raw lastMessageId 含む) は一切 **touch しない**
 *     - cache に格納するのは bucket enum + timestamp のみ
 *   - **session-local persistence のみ**: module-level state、cross-session なし
 *   - **idempotent**: 二重 initialize で subscribe 重複しない
 *   - **fail-open**: handler exception は握りつぶす (presence layer 不可侵原則)
 *
 * 不可侵境界:
 *   - presence layer (lib/coalter/presence/): 0 diff (subscribe 経由のみ)
 *   - observer layer (lib/coalter/observer/): 0 diff (bucketize 関数 import のみ)
 *   - chat layer / ChatClient / MirrorSurface / MirrorVisibleSurface: 0 diff
 *   - 既存 B-5a/B-5b/Phase B mirror code: 0 diff
 *
 * No-Effect Contract:
 *   - fetch / XHR / axios / setTimeout / setInterval / console / log / DB /
 *     Sentry / LLM / localStorage / sessionStorage / cookie / indexedDB
 *     一切なし
 *   - subscribe 後の handler のみ side-effect (module-level cache update)
 */

// Note: presence / observer は **相対 path で import**。
// Stage 4 構造 invariant (`tests/unit/coalter/presenceExecutorFlag.test.ts` §L2-g)
// は absolute path `@/lib/coalter/presence` を flag するため、Phase A observer
// (`lib/coalter/observer/observerSubscriber.ts` etc.) と同じ relative path pattern
// を採用 (read-only public API 経由のみ、層 0 diff)。
import { subscribePresenceSignal } from "../presence/productionSignalBus";
import {
  bucketizeMatchedPattern,
  type MatchedPatternCategory,
} from "../observer/signalRedaction";
import type { PresenceSignal } from "../presence/types";
import type {
  MirrorPatternCategoryBucket,
  MirrorPresenceMode,
} from "./types";
// Phase C C-3: forced canary mode (Preview-only)。
// forcedCanaryMode は MirrorReadInput 型のみ本 file から import (`import type`)、
// 本 file は forcedCanaryMode の runtime getter のみ import (循環 import なし、
// type-only import は TypeScript runtime で erase される)。
import { getForcedCanaryMockReadInput } from "./forcedCanaryMode";

// =============================================================================
// Public types — PII firewall (型レベル)
// =============================================================================

/**
 * Mirror bridge cache の shape。**PII field を構造的に書けない**。
 *
 * 含まれないこと (型レベル保証):
 *   - raw text / utterance / message body
 *   - userId / pairId / sessionId / messageId / lastMessageId
 *   - email / phone / address / device id
 *   - signal.meta の任意 unknown field (whitelist 方式)
 *
 * 含まれること:
 *   - `mode`: 現状 `null` 固定 (signal から導出不能、Phase D 候補)
 *   - `patternCategoryBucket`: Phase A bucketize 結果 → Mirror bucket 変換後
 *   - `capturedAt`: Date.now() (PII でない、debug 用)
 */
export interface MirrorReadInput {
  readonly mode: MirrorPresenceMode | null;
  readonly patternCategoryBucket: MirrorPatternCategoryBucket;
  readonly capturedAt: number;
}

// =============================================================================
// Module-level state (session-local、cross-session 持ち越しなし)
// =============================================================================

/** Subscribe 解除関数 (idempotent unsubscribe 用)。 */
let _unsubscribe: (() => void) | null = null;

/** 最新 signal を bucketize した結果 cache (latest only)。 */
let _cache: MirrorReadInput | null = null;

/** Initialize 済 flag (二重 subscribe 防止)。 */
let _initialized = false;

// =============================================================================
// Mapping: Phase A MatchedPatternCategory → Mirror MirrorPatternCategoryBucket
// =============================================================================

/**
 * Phase A `MatchedPatternCategory` を Mirror `MirrorPatternCategoryBucket` に変換。
 *
 * 変換規則 (Phase B 設計 §6.5 安全側 default、CEO 補正反映):
 *   - `"safety_concern"` → `"safety_concern"` (direct match、Safe Gate fail → STAY_SILENT)
 *   - `"rupture_signal"` → `"rupture_signal_high"` (severity 不明時は **conservative**、
 *     Safe Gate fail → STAY_SILENT。`"rupture_signal_mild"` は severity 既知の場合のみ
 *     使うが、本 bridge では severity 判定経路がないため high に固定)
 *   - `"unknown_category"` → `"unknown_category"` (Observe Gate fail → STAY_SILENT)
 *   - `null` → `"null_pattern"` (通常評価へ進む、Mirror engine の他 gate に判定を委ねる)
 *
 * `null_pattern` を返す場合のみ canProceed = true (B-3 PatternCategoryBucketResult)、
 * それ以外は canProceed = false で STAY_SILENT に倒す。
 */
function mapMatchedPatternToMirror(
  phaseA: MatchedPatternCategory,
): MirrorPatternCategoryBucket {
  if (phaseA === "safety_concern") return "safety_concern";
  if (phaseA === "rupture_signal") return "rupture_signal_high"; // 安全側 default
  if (phaseA === "unknown_category") return "unknown_category";
  return "null_pattern"; // phaseA === null
}

// =============================================================================
// Signal handler (subscribe で呼ばれる、bucketize 完了後 raw を破棄)
// =============================================================================

/**
 * Signal 1 件を処理して cache を更新する。
 *
 * **PII firewall 実装の核心**:
 *   - signal.meta から `matchedPattern` (string 型のみ) を抽出
 *   - 他 meta field (lastMessageId / 任意の raw field) は **読まない / 触らない**
 *   - bucketize 直後に raw 値の参照を破棄 (variable scope 内のみ存在)
 *   - cache には bucket enum + timestamp のみ格納 (型レベル firewall + runtime)
 *
 * **fail-open 原則** (Phase A pattern):
 *   - exception は握りつぶす (presence layer 不可侵、bus listener 内で throw すると
 *     他 subscriber に影響する可能性、Phase A `productionSignalBus.ts` の
 *     `try/catch` と整合)
 *   - 例外時 cache を更新しない (前 cache 値を保持)
 *
 * **signal kind による安全側 fallback** (matchedPattern 不在時):
 *   - `kind === "critical"` → `rupture_signal_high` (conservative)
 *   - 他 kind → `null_pattern` (通常評価へ)
 */
function handleSignal(signal: PresenceSignal): void {
  try {
    // (1) signal.meta から matchedPattern を **string 型のみ抽出** (他は touch しない)
    const rawMatchedPattern: unknown = signal.meta?.["matchedPattern"];
    const matchedPatternString: string | undefined =
      typeof rawMatchedPattern === "string" ? rawMatchedPattern : undefined;

    // (2) Phase A bucketize logic で MatchedPatternCategory に変換 (raw 値破棄)
    const phaseACategory: MatchedPatternCategory =
      bucketizeMatchedPattern(matchedPatternString);

    // (3) Mirror bucket 変換 (severity 不明時は safety-first)
    let mirrorBucket: MirrorPatternCategoryBucket =
      mapMatchedPatternToMirror(phaseACategory);

    // (4) Fallback: matchedPattern なしでも kind が critical なら rupture 扱い
    if (phaseACategory === null && signal.kind === "critical") {
      mirrorBucket = "rupture_signal_high";
    }

    // (5) cache 更新 (bucket enum + timestamp のみ、raw は scope 外に出ない)
    _cache = {
      mode: null, // signal から導出不能、現状 null 固定
      patternCategoryBucket: mirrorBucket,
      capturedAt: Date.now(),
    };
  } catch {
    // fail-open: handler exception は presence layer に伝播させない
    // 前 cache は保持 (defensive)
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Bridge subscribe を初期化する (mount 時 1 回呼ばれる前提)。
 *
 * **idempotent**: 既に initialize 済なら no-op。二重 subscribe 防止。
 *
 * 呼び出し: `useMirrorEngine` hook の useEffect (mount 時) で 1 回。
 *
 * @returns void
 */
export function initializeBridgeOnce(): void {
  if (_initialized) return;
  _initialized = true;
  _unsubscribe = subscribePresenceSignal(handleSignal);
}

/**
 * Bridge subscribe を解除する (unmount 時 cleanup)。
 *
 * unsubscribe 後は cache + state を完全 clear (session-local 原則)。
 *
 * **idempotent**: 既に dispose 済 (or 未 initialize) なら no-op。
 *
 * 呼び出し: `useMirrorEngine` hook の useEffect cleanup で。
 *
 * @returns void
 */
export function disposeBridge(): void {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  _cache = null;
  _initialized = false;
}

/**
 * 最新の Mirror read input を取得する pure getter (read-only)。
 *
 * **Phase C C-3 拡張** (forced canary mode 経由 mock injection):
 *   - `forcedCanaryMode.getForcedCanaryMockReadInput()` が non-null (forced ON) なら
 *     real subscribe cache を**バイパス**して mock を返す
 *   - forced flag OFF (default、env 未投入) なら従来通り `_cache` を返す (完全 no-op)
 *   - 通常 subscribe 経路 (handler 経由 cache 更新) は forced flag 状態に**関わらず維持**
 *     (real signal も handler で bucketize + cache 更新されるが、forced ON 時は read
 *     結果として mock が優先される)
 *
 * @returns 最新 signal 由来の `MirrorReadInput` / forced mock / null
 *
 * 戻り値は **immutable** (Mirror 内で mutate されない、caller は型レベル readonly)。
 *
 * @example
 *   // forced flag OFF: 従来通り
 *   const input = getMirrorReadInput();
 *   // input === null → 全 axis unknown
 *
 *   // forced flag ON: mock が返る (mode=normal, patternCategory=null_pattern)
 *   const input = getMirrorReadInput();
 *   // → { mode: "normal", patternCategoryBucket: "null_pattern", capturedAt: ... }
 */
export function getMirrorReadInput(): MirrorReadInput | null {
  // Phase C C-3: forced canary mode injection (real cache をバイパス)
  const forcedMock = getForcedCanaryMockReadInput();
  if (forcedMock !== null) return forcedMock;
  return _cache;
}

// =============================================================================
// Test-only helpers (Production runtime では使わない)
// =============================================================================

/**
 * **Test only**: 内部 state を完全初期化 (subscribe 解除 + cache clear + flag reset)。
 *
 * vitest beforeEach で呼ぶ。
 *
 * @internal
 */
export function __resetForTest(): void {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  _cache = null;
  _initialized = false;
}

/**
 * **Test only**: initialize 済 flag を取得。
 *
 * @internal
 */
export function __getInitializedForTest(): boolean {
  return _initialized;
}

/**
 * **Test only**: cache 内容を直接取得 (getter 経由と同一だが test 意図明示)。
 *
 * @internal
 */
export function __getCacheForTest(): MirrorReadInput | null {
  return _cache;
}

/**
 * **Test only**: unsubscribe 関数が登録されているか確認。
 *
 * @internal
 */
export function __hasUnsubscribeForTest(): boolean {
  return _unsubscribe !== null;
}
