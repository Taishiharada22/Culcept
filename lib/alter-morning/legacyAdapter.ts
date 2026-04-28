/**
 * Legacy Adapter — W3-PR-4
 *
 * 新 pipeline (`runMorningPipeline`) の結果を、旧 Morning Protocol の
 * `{ session: MorningSession, response: MorningProtocolResponse }` shape に
 * 変換する最小アダプタ。
 *
 * 設計方針（CEO 固定制約 2026-04-21）:
 *   1. create-only（turn 1 のみ）。modify / clarifying 途中のターンは呼び出し側で
 *      はじき、旧 `processMorningMessage` にフォールバックする
 *   2. UI 非変更。既存の `morningProtocol: { sessionId, phase, plan, ... }`
 *      response shape をそのまま維持する
 *   3. flag default OFF。呼び出し側 route が flag チェックする
 *   4. 新 pipeline の annotation（body/weather/party）はここで plan graph には
 *      一切注入しない。Wave 4 以降の UI 対応を待つ
 *
 * phase マッピング:
 *   - pipeline.status === "comprehension_failed" → "clarifying"
 *   - pipeline.status === "ok"                   → "plan_presented"
 */
import type { MorningPipelineResult } from "./morningPipeline";
import type {
  MorningSession,
  MorningProtocolResponse,
  MorningPhase,
  MorningPlan,
  MorningPlanStatus,
  PlanItem,
  PersonalityContext,
  PendingClarify,
  PendingClarifyScope,
  PendingSlot,
} from "./types";
import type { Event as ComprehensionEvent } from "./comprehension/eventSchema";
import type { ClarifyRequest } from "./planning/gapResolver";
import { buildClarifyQuestion } from "./planning/clarifyQuestionBuilder";
import { hasBlockingUnresolvedSlots } from "./planning/blockingSlots";
import { normalizePlanItem } from "./normalizedPlanItem";
import { buildPlanAndSegmentsFromEvents } from "./planning/planRebuild";
// CEO 2026-04-28 Option B + Journey 構造: transport rendering 基盤の wiring
//   - deriveDayTransport: events[*].transport → dayConditions.mainTransport
//   - resolveHomeAnchor: currentLat/Lng > homeLat/Lng > null
//   - resolveJourneyEndAnchor: home anchor から round-trip default の endpoint
import {
  deriveDayTransport,
  resolveHomeAnchor,
  resolveJourneyEndAnchor,
} from "./planning/transportContext";
// CEO 2026-04-28 PR #41a Layer 0: turn 反復 / merge 真因 pin の diagnostic。
import {
  emitTurnTrace,
  eventToShapeSnapshot,
  buildVerboseExtension,
  isVerboseTraceEnabled,
  type ModifyResolutionSnapshot,
  type TurnTracePayload,
} from "./trace/turnTrace";
// CEO 2026-04-28 PR #41a Layer 3: modify event の target_ref 解決 (apply は L5)。
import { resolveTargetRef } from "./planning/modifyRouter";
// CEO 2026-04-28 PR #41b-0: effectiveEvents canonical reconcile (3 layer)。
//   PR #41a の UX bug (pendingClarify stuck on stale where) を構造的に修復。
import { reconcileGapStateFromEffectiveEvents } from "./planning/reconcileEffectiveEvents";
// CEO 2026-04-28 PR #41a Commit 10: deterministic modify guard。
//   LLM が turn_mode='create' を出した場合でも、utterance pattern から
//   modify 意図を検出して補正する safety net。
import { applyDeterministicModifyIntent } from "./comprehension/modifyIntentDetector";
import {
  synthesizeTravelItems,
  interleaveTravelItems,
} from "./planning/synthesizeTravelItems";
import {
  ALTER_MORNING_FLAGS,
  resolveTransportV2FlagSource,
} from "./dialog/flags";
import {
  computeSegmentsBuiltTelemetry,
  computeDisplayRenderedTelemetry,
} from "./transport/telemetry";
// NOTE: `@/lib/stargazer/analytics` transitively imports `@/lib/supabaseAdmin`,
// which eagerly reads `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` at
// module load. Vitest runs without those envs set, so any static import chain
// that reaches supabaseAdmin crashes during test module resolution. We defer
// analytics via dynamic import so the chain only resolves when we actually emit
// — a path guarded by flag_source, i.e. never reached in unit tests.

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// I/O
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface LegacyAdapterInput {
  /** 呼び出し側で生成したセッションID（旧 createSession 由来 or `ms_...`）。 */
  sessionId: string;
  /** 元のユーザー発話（rawInputs に積む） */
  utterance: string;
  /** 性格コンテキスト（旧セッションと同じ場所に載せる） */
  personalityContext?: PersonalityContext;
  /** ユーザー属性（旧セッションが保持していた値をそのまま流す） */
  userPrefecture?: string;
  userCity?: string;
  userHomeLabel?: string | null;
  userHomeLat?: number | null;
  userHomeLng?: number | null;
  /**
   * CEO 2026-04-28 Option B: home anchor 解決の優先 1（現在地）。
   * client (browser geolocation) から chat / selection request body 経由で渡る。
   * resolveHomeAnchor で homeLat/Lng より優先して採用される。
   */
  currentLat?: number | null;
  currentLng?: number | null;
  /** プラン作成日 fallback。省略時は今日（YYYY-MM-DD） */
  today?: string;
  /**
   * 前ターンから引き継ぐ rawInputs（sticky v2 用）。
   * 指定時は rawInputs = [...priorRawInputs, utterance] となる。
   * 指定がなければ [utterance] のみ。
   */
  priorRawInputs?: string[];
  /**
   * 前ターンから引き継ぐ pendingClarify の semanticMissCount 等
   * （answerBinder 経路で bind 失敗が続いたときのカウント伝搬に使う）。
   */
  priorPendingClarify?: PendingClarify | null;
  /**
   * W3-PR-7 Commit 4: comprehension_failed 時に今ターンの events が空でも、
   * 前ターンの persistedEvents から plan を再構築して UI に出し続けるための継承。
   * priorPersistedEvents があれば、result.comprehension?.events が空の時に代用される。
   */
  priorPersistedEvents?: ComprehensionEvent[];
  /**
   * W3-PR-7 Commit 4: 前ターンで確定済みの plan。
   * 今ターンに events も priorPersistedEvents も無い場合、この plan を
   * provisional 継承として UI に残す（「プランが蒸発する」UX 破壊の防止）。
   */
  priorPlan?: MorningPlan | null;
  /**
   * W3-PR-10 canary (2026-04-24): allowlist 判定用の userId。
   * 省略時は allowlist check を skip して global fallback のみ参照（safe OFF 方向）。
   * 呼び出し元（app/api/stargazer/alter/route.ts）は tierCheck / supabase auth から
   * 取得した user.id を lower-case 前のままここに渡す。正規化は flag getter 側で行う。
   */
  userId?: string;
}

export interface LegacyAdapterOutput {
  session: MorningSession;
  response: MorningProtocolResponse;
  /**
   * CEO 2026-04-28 PR #41a Commit 6: emit された trace snapshot。
   *
   * shouldEmitTrace() === true の env (preview / development) でのみ non-null。
   * caller (chat / selection route) はこの値を response の `_debug.trace` field
   * として乗せることで、CEO が browser DevTools Network tab から観測可能になる。
   *
   * production では emit されない → 必ず undefined → response にも乗らない。
   */
  lastTraceSnapshot?: TurnTracePayload;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// phase 決定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Phase 決定 — W3-PR-8 dialog-control 修復（CEO 2026-04-22 再確定）:
 *
 *   1. status !== "ok"                           → clarifying
 *   2. hasBlockingUnresolvedSlots(events)        → clarifying（**正本**）
 *   3. gapResolution.primary_clarify != null     → clarifying（二重防御）
 *   4. else                                      → plan_presented
 *
 * 中心原則（CEO 指示）:
 *   「質問が消えた」と「問題が解けた」を分ける。
 *   primary_clarify == null は UI 質問選定の結果であって、plan 昇格契約ではない。
 *   blocking slot が実データ上解決されているかを hasBlockingUnresolvedSlots が見る。
 *
 * 旧契約の問題:
 *   PR-7 時点では (1)+(2 旧: primary_clarify==null) で昇格していたため、
 *   whereClassifier が vague を provisional に倒すと primary_clarify が立たず、
 *   「質問が立たなかっただけで plan 確定」として phase=plan_presented に昇格した
 *   （契約違反 1 & 2 の震源）。
 *
 *   PR-8: blockingSlots を一次判定に据え、primary_clarify は二重防御に降格。
 */
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 2 scope 3 — field-level event merge (CEO + GPT 合意 2026-04-26)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 1 件の current event を prior event に **field-level merge** する。
 *
 * 規則 (CEO 確定 2026-04-26):
 *   - event_id は prior を維持（同一性 anchor の安定）
 *   - cur の **non-null / non-empty** フィールドは採用（意図的更新はできる）
 *   - cur の **null / undefined / 空文字** フィールドは prior を保持（消失防止）
 *   - missing_semantic_critical / missing_solver_blockers は prior を維持
 *     （current の partial event が空 missing を持っていても、prior の
 *      正確な missing を上書きしない）
 *
 * I6 (CEO + GPT): 「やっぱり 10 時で」のような意図的更新は cur が non-null を
 *   持つので採用される。null fill だけでなく overwrite も支援するが、
 *   段階2 では null fill のみを保証対象とする（overwrite は将来 turn）。
 */
function mergeIntoPrior(
  prior: ComprehensionEvent,
  cur: ComprehensionEvent,
): ComprehensionEvent {
  // ── Phase 2 scope 4-A (CEO 2026-04-26 / GPT 補強): where-lock ──
  //   prior.where.placeType === "exact_proper_noun" は applyPlaceSelection で
  //   selection 受理時にのみ設定される marker。これが立っている event の
  //   where slot は **後続 turn の comprehension 再抽出から保護する**。
  //
  //   観測の真因 (CEO 4/26 3:28):
  //     Turn 2 で TSUTAYA tap → events[0].where.placeType="exact_proper_noun"
  //     Turn 3「電車」入力 → comprehension が place を Markcity (chain_brand) に再 resolve
  //     → 旧 mergeIntoPrior は cur.where が non-null なら採用 → TSUTAYA が消失
  //
  //   修正: prior が selection 確定済なら where 全体を prior 維持。
  //   chain_brand / generic_place / known_base はこの保護対象外（通常 merge）。
  const priorWhereLocked = prior.where.placeType === "exact_proper_noun";

  const startTime = cur.when.startTime ?? prior.when.startTime;
  const activity =
    cur.what.activity && cur.what.activity.length > 0
      ? cur.what.activity
      : prior.what.activity;
  const activityCanonical =
    cur.what.activityCanonical && cur.what.activityCanonical.length > 0
      ? cur.what.activityCanonical
      : prior.what.activityCanonical;

  // where: priorWhereLocked なら完全保持、それ以外は field-level merge
  const mergedWhere = priorWhereLocked
    ? prior.where
    : {
        place_ref: cur.where.place_ref ?? prior.where.place_ref,
        placeType: cur.where.placeType ?? prior.where.placeType,
        coordinates: cur.where.coordinates ?? prior.where.coordinates,
        provenance:
          cur.where.place_ref != null || cur.where.coordinates != null
            ? cur.where.provenance
            : prior.where.provenance,
      };

  return {
    ...prior,
    event_id: prior.event_id,
    turn_mode: cur.turn_mode ?? prior.turn_mode,
    target_ref: cur.target_ref ?? prior.target_ref,
    target_ref_confidence:
      cur.target_ref_confidence ?? prior.target_ref_confidence,
    change_scope: cur.change_scope ?? prior.change_scope,
    when: {
      startTime,
      timeHint: cur.when.timeHint ?? prior.when.timeHint,
      // provenance は startTime が cur 由来なら cur、prior 維持なら prior
      provenance:
        cur.when.startTime != null ? cur.when.provenance : prior.when.provenance,
    },
    where: mergedWhere,
    what: {
      activity,
      activityCanonical,
      provenance:
        cur.what.activity && cur.what.activity.length > 0
          ? cur.what.provenance
          : prior.what.provenance,
    },
    who: cur.who.length > 0 ? cur.who : prior.who,
    transport: cur.transport ?? prior.transport,
    certainty: cur.certainty ?? prior.certainty,
    // missing_semantic_critical / missing_solver_blockers は prior 維持
    //   （current の partial event が "where" "what" を含んでいたとしても、
    //    prior が確定済 (= []) ならそちらを信頼する）
    missing_semantic_critical: prior.missing_semantic_critical,
    missing_solver_blockers: prior.missing_solver_blockers,
  };
}

/**
 * currentEvents と priorPersistedEvents を **同一性判定 + position fallback** で
 * field-level merge する。
 *
 * 同一性判定（順）:
 *   1. event_id 一致
 *   2. (when.startTime, where.place_ref) 両方 non-null かつ一致
 *   3. position fallback (events 数が一致するときのみ)
 *
 * defensive fallback (CEO Invariant 5):
 *   - currentEvents 空 → priorPersistedEvents をそのまま返す（既存挙動）
 *   - priorPersistedEvents 空 / undefined → currentEvents をそのまま返す
 *   - 数不一致 → priorPersistedEvents をそのまま返す（current は破棄、安全側）
 *
 * 動機（CEO 観測 2026-04-26）:
 *   Turn 3「電車」入力で comprehension が transport だけの partial event を
 *   返した時、旧 logic `currentEvents.length > 0 ? currentEvents : prior` は
 *   prior の startTime / coordinates / placeType を完全に discard していた。
 *   field-level merge でこれを防ぐ。
 *
 * @internal exported for unit tests (tests/unit/alter-morning/dialog/eventFieldMerge.test.ts)
 */
export function mergeEventFields(
  currentEvents: ComprehensionEvent[],
  priorPersistedEvents: ComprehensionEvent[] | undefined,
): ComprehensionEvent[] {
  if (currentEvents.length === 0) {
    return priorPersistedEvents ?? [];
  }
  if (!priorPersistedEvents || priorPersistedEvents.length === 0) {
    return currentEvents;
  }
  // 数不一致 → defensive: priorPersistedEvents 全保持、current 破棄
  //   （current は何かしら state 不整合な partial 状態の可能性。安全側で
  //    既存正本を保つ。CEO observation の「seg_1 + seg_2 確定後に turn 3 で
  //    transport だけ 1 件返る」ケースに該当）
  if (currentEvents.length !== priorPersistedEvents.length) {
    return priorPersistedEvents;
  }

  return currentEvents.map((cur, idx) => {
    // 1. event_id 一致
    let prior: ComprehensionEvent | undefined = priorPersistedEvents.find(
      (p) => p.event_id === cur.event_id,
    );

    // 2. (when.startTime, where.place_ref) 両方 non-null かつ一致
    if (!prior && cur.when.startTime != null && cur.where.place_ref != null) {
      prior = priorPersistedEvents.find(
        (p) =>
          p.when.startTime === cur.when.startTime &&
          p.where.place_ref === cur.where.place_ref,
      );
    }

    // 3. position fallback
    if (!prior) {
      prior = priorPersistedEvents[idx];
    }

    if (!prior) {
      return cur;
    }

    return mergeIntoPrior(prior, cur);
  });
}

function decidePhase(
  result: MorningPipelineResult,
  effectiveEvents: ComprehensionEvent[],
): MorningPhase {
  if (result.status !== "ok") return "clarifying";
  // 新契約: blocking slot が残っていれば昇格しない（正本）
  if (hasBlockingUnresolvedSlots(effectiveEvents)) return "clarifying";
  // 二重防御: gapResolver が primary_clarify を立てていれば clarifying
  if (result.gapResolution?.primary_clarify) return "clarifying";
  return "plan_presented";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// targetDate 決定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PendingClarify 構築（W3-PR-7 Commit 2）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ClarifyRequest.target_slot → PendingSlot へ正規化。
 * answerBinder は "when"/"where"/"what"/"transport"/"endpoint" のみ扱う。
 * "target_ref" は「どの予定のことか」なので answerBinder 対象外（null を返す）。
 */
function toPendingSlot(
  target: ClarifyRequest["target_slot"],
): PendingSlot | null {
  switch (target) {
    case "when":
    case "where":
    case "what":
    case "transport":
    case "endpoint":
      return target;
    default:
      return null;
  }
}

/**
 * resolveGaps の primary_clarify と comprehension events から
 * PendingClarify を組み立てる。
 *
 * W3-PR-7 Commit 3 以降: primary_clarify.scope が付与されていれば最優先で使う
 * （gapResolver が events + idx から計算済み）。後方互換のため、scope が欠けて
 * いる場合のみ event から再計算する fallback を持つ。
 *
 * 対象 event が見つからない、もしくは target_slot が answerBinder 対象外の場合は null。
 */
export function buildPendingClarifyFromResolution(
  primaryClarify: ClarifyRequest | null,
  events: ComprehensionEvent[],
  priorSemanticMissCount?: number,
): PendingClarify | null {
  if (!primaryClarify) return null;
  const slot = toPendingSlot(primaryClarify.target_slot);
  if (!slot) return null;

  const idx = events.findIndex((e) => e.event_id === primaryClarify.event_id);
  if (idx < 0) return null;

  // primary_clarify.scope が付いていればそれを使う（gapResolver が正本）
  let scope: PendingClarifyScope;
  if (primaryClarify.scope) {
    scope = {
      timeLabel: primaryClarify.scope.timeLabel,
      activityLabel: primaryClarify.scope.activityLabel,
      eventOrdinal: primaryClarify.scope.eventOrdinal,
    };
  } else {
    // fallback: events から自前で計算（W3-PR-7 Commit 2 以前の経路互換）
    const ev = events[idx];
    scope = {
      timeLabel:
        ev.when.startTime ??
        (ev.when.timeHint
          ? ({ morning: "朝", noon: "昼", afternoon: "午後", evening: "夜" } as const)[
              ev.when.timeHint
            ] ?? null
          : null),
      activityLabel: ev.what.activity || ev.what.activityCanonical || null,
      eventOrdinal: idx + 1,
    };
  }

  return {
    event_id: primaryClarify.event_id,
    slot,
    kind: primaryClarify.kind,
    scope,
    question: primaryClarify.question,
    askedAt: new Date().toISOString(),
    semanticMissCount: priorSemanticMissCount ?? 0,
  };
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Message 決定（W3-PR-7 Commit 4: items=0 禁則 + 厳格 fallback）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * events から deterministic narration を組み立てる（narration LLM 空時の fallback）。
 * 「08:00 カフェ 作業 → 12:00 渋谷 ランチ」のような簡易連結。
 */
function buildDeterministicNarration(events: ComprehensionEvent[]): string {
  return events
    .map((ev) => {
      const when = ev.when.startTime ?? "";
      const where = ev.where.place_ref ?? "";
      const what = ev.what.activity || ev.what.activityCanonical || "";
      return [when, where, what].filter((s) => s.length > 0).join(" ");
    })
    .filter((s) => s.length > 0)
    .join(" → ");
}

/**
 * plan_presented 時の message 決定。
 * narration が空なら events から deterministic に組み立てる。
 * それも空なら generic fallback。
 */
function buildPlanPresentedMessage(
  result: MorningPipelineResult,
  effectiveEvents: ComprehensionEvent[],
): string {
  const narrationText = result.narration?.narration?.text?.trim() ?? "";
  if (narrationText) return narrationText;

  const deterministic = buildDeterministicNarration(effectiveEvents);
  if (deterministic) return deterministic;

  return "予定がまとまりました。";
}

/**
 * clarifying 時の message 決定 — **items=0 禁則の本体**。
 *
 * 優先順:
 *   1. result.gapResolution.primary_clarify.question（rule-based で生成済み）
 *   2. scope+kind から buildClarifyQuestion を再実行（question が空だった場合の修復）
 *   3. input.priorPendingClarify.question（前ターンの質問を継承、system_miss 相当）
 *   4. scope+kind があれば最低限「{活動}は…？」を再生成
 *   5. 最終的に generic fallback
 *
 * 設計書: docs/alter-morning-comprehension-first-wave3-pr7-design.md §4.5 (message 決定)
 */
function buildClarifyingMessage(
  result: MorningPipelineResult,
  input: LegacyAdapterInput,
  pendingClarify: PendingClarify | null,
): string {
  const pc = result.gapResolution?.primary_clarify ?? null;

  // Level 1: primary_clarify.question をそのまま使う
  const direct = pc?.question?.trim() ?? "";
  if (direct) return direct;

  // Level 2: primary_clarify はあるが question が空 → scope/kind から再生成
  if (pc) {
    console.error(
      "[legacyAdapter] primary_clarify present but question is empty; regenerating from scope+kind",
      { kind: pc.kind, event_id: pc.event_id },
    );
    const regenerated = buildClarifyQuestion({
      kind: pc.kind,
      hint: pc.hint,
      scope: pc.scope,
    }).trim();
    if (regenerated) return regenerated;
  }

  // Level 3: 前ターンの pendingClarify を継承（system_miss 的 fallback）
  const priorQ = input.priorPendingClarify?.question?.trim() ?? "";
  if (priorQ) return priorQ;

  // Level 4: pendingClarify が構築できていれば、その question を使う
  const pendingQ = pendingClarify?.question?.trim() ?? "";
  if (pendingQ) return pendingQ;

  // Level 5: 最終 generic fallback
  console.error(
    "[legacyAdapter] clarifying phase with no question source — using generic fallback",
    {
      hasPrimaryClarify: pc != null,
      hasPriorPending: input.priorPendingClarify != null,
      pipelineStatus: result.status,
    },
  );
  return "もう少し詳しく教えてくれる？";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Synthetic failed result — W3-PR-7 Commit 5 (Provider failure 耐性)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Provider / pipeline が throw した場合に合成する `comprehension_failed` 結果。
 *
 * route.ts の catch ハンドラで使い、adapter の prior-state 継承機構（commit 4）
 * を通して plan/pending/events を維持する。
 *
 * 設計方針（CEO 2026-04-22 commit 5 指示）:
 *   - LLM 返却 null と pipeline throw を **同じ形** に畳む
 *     （status="comprehension_failed" = 「今ターンは何も掴めなかった」）
 *   - 今ターンの events も narration も無い扱い
 *   - priorPending / priorPlan / priorPersistedEvents がある場合は adapter 側で継承
 *   - この helper 自体は副作用なし。hints も空
 */
export function buildFailedPipelineResult(): MorningPipelineResult {
  return {
    status: "comprehension_failed",
    comprehension: null,
    timeline: null,
    grounded: [],
    gapResolution: null,
    annotations: { body: [], weather: [], party: [] },
    narration: null,
    hints: {
      explicit_times: [],
      explicit_start_points: [],
      slot_opt_outs: [],
    },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Entry
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function adaptPipelineToLegacy(
  result: MorningPipelineResult,
  input: LegacyAdapterInput,
): LegacyAdapterOutput {
  const today = input.today ?? todayYmd();

  // ── CEO 2026-04-28 PR #41a Commit 10: deterministic modify guard ──
  //   LLM が turn_mode='create' を出した場合でも、utterance pattern (「○時を△時に」等)
  //   から modify 意図を検出して補正する safety net。
  //   guard を mergeEventFields **より前** に走らせ、補正後の events を merge に渡す。
  //   こうすることで mergedEvents (= trace.mergedEvents) の turn_mode が modify を
  //   反映する (CEO の merge 条件を満たす)。
  //
  //   guard 安全条件 (applyDeterministicModifyIntent 内で全 AND check):
  //     - detectModifyIntent(utterance) が isModifyIntent=true
  //     - priorPersistedEvents.length > 0
  //     - events.length === 1
  //     - events[0].turn_mode === "create"
  //   満たさない場合は LLM 出力をそのまま通す (no-op)。
  const guardResult = applyDeterministicModifyIntent({
    events: result.comprehension?.events ?? [],
    priorPersistedEvents: input.priorPersistedEvents ?? [],
    utterance: input.utterance,
  });
  const currentEvents = guardResult.events;

  // ── Events 継承（W3-PR-7 Commit 4 + Phase 2 scope 3 / CEO 2026-04-26）──
  //   旧: `currentEvents.length > 0 ? currentEvents : priorPersistedEvents`
  //   新: field-level merge で priorPersistedEvents を全 discard しない。
  //
  //   Turn 3「電車」入力で comprehension が transport だけの partial event を
  //   返した時、startTime / where.coordinates / placeType を保持する。
  //   詳細: mergeEventFields (本ファイル上部 + tests/unit/alter-morning/dialog/eventFieldMerge.test.ts)
  const effectiveEvents: ComprehensionEvent[] = mergeEventFields(
    currentEvents,
    input.priorPersistedEvents,
  );

  // ── Phase 決定（W3-PR-8: blocking slots を正本、effectiveEvents が必要）──
  const originalPhase = decidePhase(result, effectiveEvents);

  // ── CEO 2026-04-28 PR #41b-0: 3-layer reconcile from effectiveEvents ──
  //   PR #41a で観測された UX bug の真因 fix:
  //     events fully fixed なのに pendingClarify が古い where_center で stuck し、
  //     Alter が「09:00のカフェはどのあたり？」 を聞き続けていた。
  //
  //   reconcile は effectiveEvents を canonical truth として:
  //     1. gapResolver を effectiveEvents で再実行 (currentEvents 基準でない)
  //     2. pendingClarify rebuild (eventsFullyFixed なら prior fallback しない)
  //     3. dialogState.focus を events 状態に同期 (fixed slot は clear/advance)
  //     4. phase を再決定 (eventsFullyFixed → plan_presented)
  //
  //   特殊 phase (comprehension_failed 等) は preserve (originalPhase 入力で識別)。
  const reconcile = reconcileGapStateFromEffectiveEvents({
    effectiveEvents,
    // pipeline が生成した GapResolution (currentEvents 基準) を filter する。
    // 再実行はしない (test fixture の人為的 missing_semantic_critical を尊重)。
    priorGapResolution: result.gapResolution ?? null,
    priorPendingClarify: input.priorPendingClarify ?? null,
    priorDialogState:
      // dialogState は currentEvents 基準で reducer により update 済み。
      // ここでは reducer 後の状態を入力として、effectiveEvents 基準で再評価する。
      // legacyAdapter の入力には dialogState が直接含まれていないため、
      // 上位 (chat route / selection route) が reducer を回した後の state を
      // 参照する必要がある。本 commit では一旦 null を渡し、
      // dialogState 同期は別途 (route 側 with reducer 統合) で対応する。
      null,
    originalPhase,
    // comprehension_failed の場合は楽観的に plan_presented に上げない。
    // priorPersistedEvents fallback で effectiveEvents が fully fixed でも、
    // 当 turn では何が起きたか不明なため originalPhase=clarifying を preserve。
    comprehensionOk: result.status === "ok",
  });

  const phase = reconcile.reconciledPhase;
  const pendingClarify = reconcile.reconciledPendingClarify;

  // ── Message 決定（W3-PR-7 Commit 4: items=0 禁則 + 厳格 fallback）──
  //   clarifying: primary_clarify.question → scope/kind 再生成 → prior.question → generic
  //   plan_presented: narration.text → events から deterministic 再構築 → generic
  const message =
    phase === "plan_presented"
      ? buildPlanPresentedMessage(result, effectiveEvents)
      : buildClarifyingMessage(result, input, pendingClarify);

  // ── Plan 構築（W3-PR-7 Commit 4: clarifying 時も provisional として保持）──
  //   status: plan_presented → confirmed
  //           pendingClarify あり → needs_answer
  //           else (events あるが ASK 無し / comprehension_failed 継承) → provisional
  //   events が完全に空の場合は priorPlan を provisional として継承する。
  const planStatus: MorningPlanStatus =
    phase === "plan_presented"
      ? "confirmed"
      : pendingClarify != null
        ? "needs_answer"
        : "provisional";

  let plan: MorningPlan | undefined;
  if (effectiveEvents.length > 0) {
    // ── CEO 2026-04-28 Option B + Journey 構造: transport context 解決 ──
    //   1. events[*].transport を scan して dayConditions.mainTransport を導出
    //   2. currentLat/Lng → userHomeLat/Lng → null の優先で homeAnchor を解決
    //   3. journeyEnd を home anchor の round-trip default で派生 (label="帰宅")
    const derivedTransport = deriveDayTransport(effectiveEvents);
    const homeAnchor = resolveHomeAnchor({
      currentLat: input.currentLat,
      currentLng: input.currentLng,
      homeLat: input.userHomeLat,
      homeLng: input.userHomeLng,
    });
    const journeyEnd = resolveJourneyEndAnchor(homeAnchor);

    // ── W3-PR-10: planRebuild 委譲 ──
    //   events → PlanItem[] と（flag ON 時のみ）TransportSegment[] を
    //   1 回だけ生成する pure function に委譲。flag OFF 時は transportSegments
    //   は result に含まれず、後段の plan 組み立てでも conditional spread により
    //   plan から落ちる（byte-diff ゼロ保証）。
    const built = buildPlanAndSegmentsFromEvents({
      events: effectiveEvents,
      enableTransportV2: ALTER_MORNING_FLAGS.transportV2(input.userId),
      mainTransport: derivedTransport?.plan,
      homeAnchor,
      journeyEnd,
    });

    // ── W3-PR-10 canary O2: transport_v2_segments_built emit ──
    //   flag ON（built.transportSegments !== undefined）かつ userId 判明時のみ
    //   fire-and-forget で analytics emit。純粋関数 build の外で副作用を起こす。
    //
    //   invariant:
    //   - userId 未指定（主に test fixture）では emit せず、既存テスト契約を維持
    //   - flag_source は resolveTransportV2FlagSource(userId) から取得（allowlist/global）
    //   - telemetry helper は pure — bin 分布 / sanity violation を計算するだけ
    //   - await しない。analytics 失敗が plan 構築に影響しない
    if (built.transportSegments !== undefined && input.userId) {
      const flagSource = resolveTransportV2FlagSource(input.userId);
      if (flagSource != null) {
        const telemetry = computeSegmentsBuiltTelemetry(
          effectiveEvents,
          built.transportSegments,
        );
        void import("@/lib/stargazer/analytics")
          .then(({ trackStargazerEvent }) =>
            trackStargazerEvent({
              userId: input.userId!,
              event: "transport_v2_segments_built",
              feature: "alter_morning",
              metadata: {
                schema_version: "2026-04-24",
                flag_source: flagSource,
                session_id: input.sessionId,
                plan_date: today,
                caller: "legacy_adapter",
                ...telemetry,
              },
              timestamp: new Date().toISOString(),
            }),
          )
          .catch(() => {
            /* analytics must never block plan build — swallow */
          });
      }
    }

    // ── W3-PR-10 Phase 2: travel display cache interleave ──
    //   flag ON（built.transportSegments !== undefined）の時のみ、canonical
    //   TransportSegment[] を display cache の travel PlanItem に射影し、
    //   event items との間に挿入する。
    //   flag OFF 時は built.transportSegments が key 自体不在 → 通さない。
    //   items[] は Phase 1 と byte-diff ゼロ。
    //
    //   invariant:
    //   - synthesize / interleave はいずれも pure。env / flag を読まない。
    //   - travel の id は deterministic（travel__<from>__<to>）。
    //   - needs_answer 上書きは event id にのみヒット（travel id は `travel__` prefix で衝突しない）。
    let interleavedItems: PlanItem[];
    if (built.transportSegments !== undefined) {
      // CEO 2026-04-28 Option B + Journey 構造:
      //   HOME_SENTINEL fromEventId の segment は homeAnchor.label を from に使う。
      //   ENDPOINT_SENTINEL toEventId の segment は journeyEnd.label を to に使う。
      const entries = synthesizeTravelItems(
        built.transportSegments,
        effectiveEvents,
        homeAnchor,
        journeyEnd,
      );
      interleavedItems = interleaveTravelItems(built.items, entries);

      // ── W3-PR-10 canary O3: transport_v2_display_rendered emit ──
      //   interleave 直後（display cache が決まった瞬間）で emit。
      //   segment_count / travel_rendered_count / skipped_null_count / fake_zero_travel_count。
      //
      //   invariant:
      //   - userId 未指定（主に test fixture）では emit せず、既存テスト契約を維持
      //   - flag_source は O2 と同じ resolveTransportV2FlagSource(userId) から
      //   - telemetry helper は pure — segments と interleavedItems を読むだけ
      //   - fire-and-forget — analytics 失敗が plan 構築に影響しない
      if (input.userId) {
        const flagSource = resolveTransportV2FlagSource(input.userId);
        if (flagSource != null) {
          const telemetry = computeDisplayRenderedTelemetry(
            built.transportSegments,
            interleavedItems,
          );
          void import("@/lib/stargazer/analytics")
            .then(({ trackStargazerEvent }) =>
              trackStargazerEvent({
                userId: input.userId!,
                event: "transport_v2_display_rendered",
                feature: "alter_morning",
                metadata: {
                  schema_version: "2026-04-24",
                  flag_source: flagSource,
                  session_id: input.sessionId,
                  plan_date: today,
                  caller: "legacy_adapter",
                  ...telemetry,
                },
                timestamp: new Date().toISOString(),
              }),
            )
            .catch(() => {
              /* analytics must never block plan build — swallow */
            });
        }
      }
    } else {
      interleavedItems = built.items;
    }

    // ── W3-PR-8: needs_answer 上書き + normalize（設計書 §6.2, §3.4）──
    //   pendingClarify.event_id が指す item だけ confirmationState="needs_answer"。
    //   その後 normalizePlanItem で optional → required に狭めて UI に渡す。
    //   travel items は id が `travel__` prefix で pendingEventId と衝突しない
    //   ため needs_answer は通過、normalize は kind-agnostic に通る（travel item の
    //   UI renderer は normalize 前提フィールドを参照しないため harmless）。
    const pendingEventId = pendingClarify?.event_id ?? null;
    const items = interleavedItems.map((item) => {
      const withNeedsAnswer: PlanItem =
        pendingEventId != null && item.id === pendingEventId
          ? { ...item, confirmationState: "needs_answer" }
          : item;
      return normalizePlanItem(withNeedsAnswer);
    });

    // CEO 2026-04-28 Option B: dayConditions.mainTransport を events[*].transport から
    //   lift。これがないと selection endpoint が再 rebuild する際に priorPlan から
    //   読めず、全 turn で「unknown」mode に落ちる。
    const dayConditions: import("./types").DayConditions = derivedTransport
      ? { mainTransport: derivedTransport.vc }
      : {};
    // CEO 2026-04-28 Journey 構造: plan-level metadata (journeyOrigin / journeyEnd)
    //   MorningPlanCard が plan.items の上下に「現在地」「帰宅」ノードを render するため。
    //   homeAnchor が null（座標が無い CEO 案 1 のケース）→ 両方 undefined → UI 何も出さない。
    const journeyOrigin = homeAnchor
      ? {
          label: homeAnchor.label,
          lat: homeAnchor.lat,
          lng: homeAnchor.lng,
          source: homeAnchor.source,
        }
      : undefined;
    const journeyEndForPlan = journeyEnd
      ? {
          label: journeyEnd.label,
          lat: journeyEnd.lat,
          lng: journeyEnd.lng,
          source: journeyEnd.source,
        }
      : undefined;
    plan = {
      date: today,
      items,
      dayConditions,
      createdAt: new Date().toISOString(),
      confirmed: false,
      status: planStatus,
      ...(built.transportSegments !== undefined
        ? { transportSegments: built.transportSegments }
        : {}),
      ...(journeyOrigin !== undefined ? { journeyOrigin } : {}),
      ...(journeyEndForPlan !== undefined ? { journeyEnd: journeyEndForPlan } : {}),
    };
  } else if (input.priorPlan) {
    // events が無い（今ターン失敗 & prior も空）場合、最後の手段として
    // priorPlan を provisional 扱いで継承する。
    // W3-PR-8: priorPlan の items も normalize 経由で strict 型に整える。
    plan = {
      ...input.priorPlan,
      status: phase === "plan_presented" ? "confirmed" : planStatus,
      items: input.priorPlan.items.map((item) => normalizePlanItem(item)),
    };
  }

  // ── W3-PR-8: items=0 禁則の二層化（CEO 2026-04-22）──
  //   phase=clarifying で items=0（plan が組めない / priorPlan も空）は
  //   契約違反。dev/test では throw、prod では error log + safe degrade
  //   （偽 plan 合成は禁止。UI 側が plan なし clarifying を描画する契約）。
  if (phase === "clarifying") {
    const hasPlanItems = plan != null && plan.items.length > 0;
    if (!hasPlanItems) {
      const msg =
        "[legacyAdapter] contract violation: phase=clarifying with empty items";
      const details = {
        hasEvents: effectiveEvents.length > 0,
        hasPriorPlan: input.priorPlan != null,
        pipelineStatus: result.status,
      };
      if (process.env.NODE_ENV !== "production") {
        throw new Error(`${msg} — ${JSON.stringify(details)}`);
      }
      console.error(msg, details);
      // prod safe degrade:
      //   plan は undefined のまま、message は非空（buildClarifyingMessage が担保）、
      //   偽 plan 合成は禁止。UI 側が plan なし clarifying を描画する。
    }
  }

  // rawInputs: sticky 時は追記、それ以外は utterance 単独
  const rawInputs = input.priorRawInputs && input.priorRawInputs.length > 0
    ? [...input.priorRawInputs, input.utterance]
    : [input.utterance];

  // ── Session 構築 ──
  const session: MorningSession = {
    sessionId: input.sessionId,
    pipelineVersion: "v2",
    phase,
    rawInputs,
    personalizeHints: [],
    startedAt: new Date().toISOString(),
    plan,
    personalityContext: input.personalityContext,
    userPrefecture: input.userPrefecture,
    userCity: input.userCity,
    userHomeLabel: input.userHomeLabel ?? null,
    userHomeLat: input.userHomeLat ?? null,
    userHomeLng: input.userHomeLng ?? null,
    pendingClarify,
    persistedEvents: effectiveEvents,
  };

  // ── Response 構築 ──
  const response: MorningProtocolResponse = {
    phase,
    message,
    plan,
    personalizeHints: [],
    ...(phase === "clarifying" ? { clarifyQuestion: message } : {}),
  };

  // ── CEO 2026-04-28 PR #41a Layer 3: modify event の target_ref 解決 ──
  //   LLM が turn_mode='modify' event を出力した、または guard が補正した場合、
  //   prior persisted events 中のどの event を指しているかを resolveTargetRef で解決。
  //   本 PR では trace に記録するのみ (apply は PR #41b L5 で実装)。
  //   currentEvents は guard 経由なので、補正適用済みの状態。
  const priorBaseEvents = input.priorPersistedEvents ?? [];
  const modifyResolutionsSnapshots: ModifyResolutionSnapshot[] = currentEvents
    .filter((ev) => ev.turn_mode === "modify")
    .map((ev) => {
      const resolution = ev.target_ref
        ? resolveTargetRef(ev.target_ref, priorBaseEvents)
        : { event_id: null, confidence: null as null, strategy: "none" as const };
      return {
        event_id: ev.event_id,
        target_ref_present:
          typeof ev.target_ref === "string" && ev.target_ref.length > 0,
        resolved: {
          target_event_id: resolution.event_id,
          confidence: resolution.confidence,
          strategy: resolution.strategy,
        },
      };
    });

  // ── CEO 2026-04-28 PR #41a Layer 0: turnTrace emission ──
  //   PII 配慮 + env gating は emitTurnTrace 内で完結。
  //   turn 反復 / merge 真因 pin に使う diagnostic。
  //   verbose mode は ALTER_MORNING_TRACE_VERBOSE=true で content 含む。
  //
  // PR #41a Commit 6: emitTurnTrace の戻り値を caller に返却することで、
  //   route handler が response の `_debug.trace` に乗せられるようにする。
  //   CEO が browser DevTools Network tab から trace を観測可能になる。
  const traceSnapshot = emitTurnTrace(
    {
      sessionId: input.sessionId,
      // turnIndex: rawInputs の長さで近似 (1始まり)
      turnIndex: rawInputs.length,
      caller: "legacy_adapter",
      utteranceLength: input.utterance.length,
      hasUtterance: input.utterance.trim().length > 0,
      currentEventCount: result.comprehension?.events.length ?? 0,
      priorEventCount: input.priorPersistedEvents?.length ?? 0,
      mergedEventCount: effectiveEvents.length,
      mergedEvents: effectiveEvents.map(eventToShapeSnapshot),
      primaryClarifyKind:
        result.gapResolution?.primary_clarify?.kind ?? null,
      primaryClarifyEventId:
        result.gapResolution?.primary_clarify?.event_id ?? null,
      pendingClarifySlot: pendingClarify?.slot ?? null,
      pendingClarifyKind: pendingClarify?.kind ?? null,
      pendingClarifyEventId: pendingClarify?.event_id ?? null,
      ...(modifyResolutionsSnapshots.length > 0
        ? { modifyResolutions: modifyResolutionsSnapshots }
        : {}),
      // CEO 2026-04-28 PR #41a Commit 10: deterministic modify guard 観測
      modifyCandidate: guardResult.modifyCandidate,
      modifyCandidateReason: guardResult.reason,
      // CEO 2026-04-28 PR #41b-0 Commit 3: 3-layer reconcile 観測
      //   reconcile.eventsFullyFixed=true + phaseChanged=true で「stuck pendingClarify
      //   bug が解消された」 を pin できる。primaryClarifyDropped=true は guard 補正で
      //   primary_clarify が stale になった経路の真因 pin。
      reconcile: {
        phaseChanged: reconcile.reconciled.phaseChanged,
        primaryClarifyDropped: reconcile.reconciled.primaryClarifyDropped,
        pendingClarifyChanged: reconcile.reconciled.pendingClarifyChanged,
        focusCleared: reconcile.reconciled.focusCleared,
        eventsFullyFixed: reconcile.reconciled.eventsFullyFixed,
      },
    },
    isVerboseTraceEnabled()
      ? buildVerboseExtension({
          utterance: input.utterance,
          mergedEvents: effectiveEvents,
          pendingClarify,
        })
      : undefined,
  );

  return {
    session,
    response,
    ...(traceSnapshot != null
      ? { lastTraceSnapshot: traceSnapshot satisfies TurnTracePayload }
      : {}),
  };
}
