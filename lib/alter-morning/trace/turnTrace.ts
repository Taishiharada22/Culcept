/**
 * turnTrace — alter-morning turn ごとの状態遷移を構造化 log で観測する diagnostic。
 *
 * CEO 2026-04-28 PR #41a Layer 0:
 *   PR #41b で「自然文 plan grow 状態機械」を実装する前に、現状の merge / clarify
 *   挙動を **観測可能** にする土台。turn 反復 (1つ目 cafe 質問が変わらない) や
 *   merge length-mismatch discard などの真因 pin に使う。
 *
 * 設計原則 (PII / privacy):
 *   - **default redact**: raw 文字列 / lat/lng 数値 / 個人名は **絶対に出さない**
 *   - 出す: 型 enum / boolean / 配列 length / event_id (内部 ID は安全)
 *   - **verbose mode** (`ALTER_MORNING_TRACE_VERBOSE=true`): dev/preview のみ
 *     content を含む詳細出力に切り替え可能（CEO 実機 trace 用）
 *   - **env gate**: production 環境では emit しない (no-op)
 *
 * 設計原則 (pure / 副作用):
 *   - emitTurnTrace は console.info の呼び出しのみ。例外を throw しない
 *   - スナップショット組み立ては pure (events を read-only で参照)
 *   - 上位呼び出しの fail-open: trace 失敗で plan rebuild を壊さない
 *
 * 観測価値:
 *   - turn 反復 bug: 同じ pendingClarify が立ち続けるか
 *   - merge bug: priorEventCount → mergedEventCount の差分
 *   - LLM 過剰分割: events.length が想定外
 *   - modify pipeline (PR #41b) 完成検証: turn_mode 分布
 */

import type {
  Event as ComprehensionEvent,
  SemanticCriticalSlot,
  SolverBlocker,
  TurnMode,
  SlotSharpness,
} from "@/lib/alter-morning/comprehension/eventSchema";
import {
  computeWhenSharpness,
  computeWhereSharpness,
  computeWhatSharpness,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { ClarifyKind } from "@/lib/alter-morning/planning/gapResolver";
import type { PendingClarify, PendingSlot } from "@/lib/alter-morning/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Snapshot types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 1 event の構造的 snapshot（PII free）。
 * place_ref / coords / who 名 / activity 文字列は **出さない**。
 */
export interface EventShapeSnapshot {
  event_id: string;
  turn_mode: TurnMode;
  /** target_ref 文字列は出さない、有無のみ */
  target_ref_present: boolean;
  whenSharpness: SlotSharpness;
  whereSharpness: SlotSharpness;
  whatSharpness: SlotSharpness;
  /** placeType は enum なので安全 */
  placeType: string | null;
  /** who[] の **長さのみ**（名前は出さない） */
  whoCount: number;
  hasTransport: boolean;
  /** coordinates の**有無のみ**（lat/lng 数値は出さない） */
  hasCoordinates: boolean;
  missingSemanticCritical: SemanticCriticalSlot[];
  missingSolverBlockers: SolverBlocker[];
}

/**
 * CEO 2026-04-28 PR #41a Layer 3: modify 解決結果の trace 用 snapshot。
 *
 * legacyAdapter が turn_mode='modify' event に対して resolveTargetRef を
 * 呼んだ結果を記録。apply は PR #41b で実装するため、本 PR では
 * 「LLM が modify 意図を出すか」「target_ref が解決するか」 の観測のみ。
 */
export interface ModifyResolutionSnapshot {
  /** modify event の event_id (新規 LLM 出力 event の ID) */
  event_id: string;
  /** target_ref 文字列の有無のみ (内容は redact) */
  target_ref_present: boolean;
  /** resolveTargetRef の戻り値 */
  resolved: {
    /** 解決された prior event_id (or null) */
    target_event_id: string | null;
    /** 解決時の confidence */
    confidence: "low" | "medium" | "high" | null;
    /** どの戦略で解決したか */
    strategy: "time_bucket" | "activity" | "place" | "ordinal" | "none";
  };
}

/**
 * 1 turn 全体の構造的 snapshot。
 *
 * 観測対象:
 *   - input shape（utterance 内容ではなく長さ）
 *   - prior / current / merged events の数 + 型分布
 *   - gap resolution の outcome
 *   - pendingClarify の選定結果
 *   - modify 解決結果 (PR #41a Layer 3)
 */
export interface TurnTraceSnapshot {
  /** session 識別子 (hash 不要、内部 ID は安全)。デバッグ用に turn 連続性を追跡 */
  sessionId: string;
  /** turn 番号 (rawInputs.length 等から算出、caller 側で渡す) */
  turnIndex: number;
  /** caller の文脈識別 ("legacy_adapter" | "selection_route") */
  caller: "legacy_adapter" | "selection_route";
  // ── input shape ──
  utteranceLength: number;
  /** utterance が空でないか */
  hasUtterance: boolean;
  // ── events ──
  /** comprehension が今 turn で extract した events */
  currentEventCount: number;
  /** prior persisted events */
  priorEventCount: number;
  /** mergeEventFields 後の events */
  mergedEventCount: number;
  /** merged events の構造 snapshot (内容なし) */
  mergedEvents: EventShapeSnapshot[];
  // ── gap resolution ──
  /** gapResolver が選んだ primary_clarify の kind (or null) */
  primaryClarifyKind: ClarifyKind | null;
  /** primary_clarify が指す event_id */
  primaryClarifyEventId: string | null;
  /** 最終的に session に乗る pendingClarify の slot/kind */
  pendingClarifySlot: PendingSlot | null;
  pendingClarifyKind: string | null;
  pendingClarifyEventId: string | null;
  // ── modify 解決 (PR #41a Layer 3) ──
  /**
   * LLM が出力した turn_mode='modify' event を resolveTargetRef で解決した結果。
   * 空配列なら今 turn に modify event なし。本 PR では apply はしない。
   */
  modifyResolutions?: ModifyResolutionSnapshot[];

  // ── deterministic modify guard (PR #41a Commit 10) ──
  /**
   * applyDeterministicModifyIntent の発火フラグ。
   *
   * true:  utterance pattern (「○時を△時に」 等) から modify 意図が検出され、
   *        LLM 出力 (turn_mode=create) を補正で modify に書き換えた。
   * false (default): 補正なし。LLM が直接 modify を出したか、補正条件に
   *                  該当しなかった。
   *
   * CEO 観測用: 「LLM が弱くても guard で modify 判定が trace に出る」 を
   * pin できる。turn_mode='modify' の出所が LLM か guard かを区別する。
   */
  modifyCandidate?: boolean;
  /**
   * 補正の reason (modifyCandidate が undefined / false の場合の説明含む)。
   * - "no_intent": detectModifyIntent が false を返した
   * - "no_prior":  priorPersistedEvents 空
   * - "events_count_mismatch": comprehension events 数 !== 1
   * - "already_modify": LLM が既に modify を出していた / append だった
   * - "applied": 補正発火
   */
  modifyCandidateReason?:
    | "no_intent"
    | "no_prior"
    | "events_count_mismatch"
    | "already_modify"
    | "applied";
}

/**
 * verbose mode 時のみ含む拡張 snapshot。
 *
 * 包含するフィールド:
 *   - utterance 文字列（短く trim）
 *   - 各 event の place_ref / activity（trim 済み）
 *   - pendingClarify.question 全文
 *
 * **絶対に production で出さない**。env gate で完全 block。
 */
export interface TurnTraceVerboseExtension {
  /** trim 済 utterance（最大 200 字） */
  utterance: string;
  /** 各 merged event の content（簡略） */
  mergedEventContent: Array<{
    event_id: string;
    placeRef: string | null;
    activity: string;
    startTime: string | null;
    transport: string | null;
    /** who[] 名前（名前自体は redact せず raw、ただし dev 限定） */
    whoNames: string[];
  }>;
  /** pendingClarify.question 全文 */
  pendingClarifyQuestion: string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Snapshot builder (pure)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Event を構造 snapshot に圧縮（PII 排除）。
 */
export function eventToShapeSnapshot(ev: ComprehensionEvent): EventShapeSnapshot {
  return {
    event_id: ev.event_id,
    turn_mode: ev.turn_mode,
    target_ref_present:
      typeof ev.target_ref === "string" && ev.target_ref.length > 0,
    whenSharpness: computeWhenSharpness(ev.when),
    whereSharpness: computeWhereSharpness(ev.where),
    whatSharpness: computeWhatSharpness(ev.what),
    placeType: ev.where.placeType,
    whoCount: ev.who.length,
    hasTransport:
      typeof ev.transport === "string" && ev.transport.trim().length > 0,
    hasCoordinates:
      ev.where.coordinates != null &&
      typeof ev.where.coordinates.lat === "number" &&
      typeof ev.where.coordinates.lng === "number" &&
      Number.isFinite(ev.where.coordinates.lat) &&
      Number.isFinite(ev.where.coordinates.lng),
    missingSemanticCritical: ev.missing_semantic_critical,
    missingSolverBlockers: ev.missing_solver_blockers,
  };
}

/**
 * verbose 拡張を組み立てる（dev/preview + env flag 時のみ呼ばれる）。
 */
export function buildVerboseExtension(input: {
  utterance: string;
  mergedEvents: ComprehensionEvent[];
  pendingClarify: PendingClarify | null;
}): TurnTraceVerboseExtension {
  return {
    utterance: input.utterance.slice(0, 200),
    mergedEventContent: input.mergedEvents.map((ev) => ({
      event_id: ev.event_id,
      placeRef: ev.where.place_ref,
      activity: ev.what.activity,
      startTime: ev.when.startTime,
      transport: ev.transport,
      whoNames: ev.who,
    })),
    pendingClarifyQuestion: input.pendingClarify?.question ?? null,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Env gating
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * trace を emit してよい環境か。
 *   VERCEL_ENV: "development" | "preview" | "production"
 *   NODE_ENV:   "development" | "test" | "production"
 *
 * 許可される env:
 *   VERCEL_ENV=development | VERCEL_ENV=preview
 *   NODE_ENV=development（VERCEL_ENV 未設定 local 開発）
 *
 * production / test は emit しない（test は noisy 防止）。
 */
export function shouldEmitTrace(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === "preview" || vercelEnv === "development") return true;
  if (vercelEnv === "production") return false;
  // VERCEL_ENV 未設定 (local dev or test)
  return process.env.NODE_ENV === "development";
}

/**
 * verbose mode が有効か（content を含むか）。
 *
 * 二重 gate:
 *   1. shouldEmitTrace() で env 許可済み
 *   2. ALTER_MORNING_TRACE_VERBOSE === "true" で明示的に opt-in
 *
 * default は false（CEO 配慮で content 出さない）。CEO が dev で詳細を見たい時のみ flip。
 */
export function isVerboseTraceEnabled(): boolean {
  if (!shouldEmitTrace()) return false;
  return process.env.ALTER_MORNING_TRACE_VERBOSE === "true";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Emit
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * emit された trace の payload。verbose 拡張を含むかは isVerboseTraceEnabled() に依存。
 *
 * caller (legacyAdapter / selection_route) はこの payload を **response に
 * `_debug.trace` として乗せる** ことで、CEO が browser DevTools Network tab から
 * 観測可能になる (Vercel function logs に access できなくても trace を読める)。
 */
export type TurnTracePayload = TurnTraceSnapshot &
  Partial<{ verbose: TurnTraceVerboseExtension }>;

/**
 * structured turn snapshot を emit する。
 *
 * 副作用:
 *   - shouldEmitTrace() === true の時のみ console.info で 1 行出力
 *   - JSON.stringify 失敗時は silent skip (try/catch で fail-open)
 *
 * verbose extension が指定されており isVerboseTraceEnabled() === true なら
 * snapshot に extension を merge して出力する。
 *
 * 戻り値:
 *   - emit された場合: TurnTracePayload (verbose を merge 済み)
 *   - emit 不能 (env gate / serialize fail) の場合: null
 *
 * caller はこの戻り値を response に乗せることで browser から trace を確認可能にする。
 * production では shouldEmitTrace() が false → 必ず null → response にも乗らない。
 */
export function emitTurnTrace(
  snapshot: TurnTraceSnapshot,
  verboseExtension?: TurnTraceVerboseExtension,
): TurnTracePayload | null {
  if (!shouldEmitTrace()) return null;
  try {
    const payload: TurnTracePayload = { ...snapshot };
    if (verboseExtension && isVerboseTraceEnabled()) {
      payload.verbose = verboseExtension;
    }
    // serialize 試行 (循環参照を early-detect)
    const json = JSON.stringify(payload);
    console.info("[alter-morning:trace]", json);
    return payload;
  } catch {
    // JSON.stringify failure (循環参照等) → silent skip。trace 失敗で
    // 上位 plan rebuild を壊さない fail-open 設計。
    return null;
  }
}
