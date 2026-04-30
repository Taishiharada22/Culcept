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
import type { DialogState } from "./dialog/types";
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
import {
  dispatchEventMerge,
  dedupCanonicalEvents,
} from "./planning/eventMergeDispatch";
// PR-50 Commit 14 (CEO 2026-04-30): canonical event invariant enforcement
//   ghost modify removal で「予定の残骸」 を persistedEvents から filter する。
import { isGhostModifyEvent } from "./planning/canonicalEventIdentity";
// PR-50 Commit 4 (CEO 2026-04-30): operations 経路の thin dispatch。
//   acceptedOperations を applyModifyPatchFromOperation / generateNonCollidingEventId /
//   bindAnswerToSlot / resolveTargetRef を再利用して effectiveEvents に反映する。
//   fallbackToEvents===false かつ acceptedOperations.length>0 のときのみ使用。
import { dispatchOperations } from "./planning/operationDispatcher";
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

  /**
   * PR-50 Commit 9 (CEO 2026-04-30): focus reconcile 用の前 turn dialogState。
   *
   * 用途:
   *   reconcileGapStateFromEffectiveEvents の Layer 3 (dialogState focus 同期)
   *   が pendingClarify=null + slot fixed の場合に focus を clear / advance する。
   *   既存仕様で priorDialogState=null を固定で渡しており、reconcileDialogState
   *   が early-return されて focus.where が残留する観測 (Preview 2026-04-30) の
   *   真因を解消する。
   *
   * 渡し方:
   *   - route.ts (Branch A / B): reducer 後の morningSession.dialogState を渡す
   *   - 省略 → null (Commit 9 以前と同等の挙動を保つ defensive)
   *
   * 出力:
   *   reconcile 後の dialogState は LegacyAdapterOutput.reconciledDialogState
   *   に含める (session には乗せない、route.ts 側で merge を判断する)。
   */
  priorDialogState?: DialogState | null;
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
  /**
   * PR-50 Commit 9 (CEO 2026-04-30): reconcile 後の dialogState。
   *
   * 用途:
   *   priorDialogState (input) を reconcileGapStateFromEffectiveEvents で
   *   effectiveEvents と再同期した結果。slot fixed → focus advance / clear。
   *   route.ts は morningSession.dialogState に反映するか判断する
   *   (現状: adapter 出力 ?? reducer 後 state の優先順)。
   *
   * undefined: priorDialogState が null だった場合、または reconcile が必要
   *   なかった (focus が元から null) 場合。caller は既存 dialogState を維持。
   */
  reconciledDialogState?: DialogState | null;
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
// PendingClarify 構築（W3-PR-7 Commit 2 / CEO 2026-04-29 hotfix で抽出）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO 2026-04-29 hotfix:
//   PR #41b-0 で reconcileEffectiveEvents.ts が legacyAdapter から
//   buildPendingClarifyFromResolution を import → 循環参照に。
//   production webpack build が 45 分 hang → timeout error。
//   pendingClarifyBuilder.ts に抽出して循環を断つ。
//
//   後方互換のため legacyAdapter からも re-export し続ける
//   (既存の import { buildPendingClarifyFromResolution } from "@/lib/alter-morning/legacyAdapter"
//    を壊さない)。
export {
  buildPendingClarifyFromResolution,
  toPendingSlot,
} from "./planning/pendingClarifyBuilder";

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Operations trace builder (PR-50 Commit 5+6 / CEO 2026-04-30)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * comprehension result から operations 経路 trace 用 summary を構築する。
 *
 * 出力条件 (PR-50 Commit 6 / CEO 2026-04-30 修正):
 *   **常に summary を返す**。旧仕様で全部 0 のとき null を返していたが、
 *   観測の盲点 (LLM 不出力 / parser drop / fallback / synth どこで止まったか
 *   trace に出ない) になっていたため、常時出力に変更。
 *
 *   - comprehension が null (= 異常状態) のときのみ null
 *   - それ以外は { received: 0, ... synthesisSource: "none" } を含めて常に出す
 *
 * 含む field:
 *   - received:         comprehension.operations.length (parsePlanOperations 通過後)
 *   - accepted:         comprehension.acceptedOperations.length
 *   - rejected:         comprehension.operationRejections.length
 *   - fallbackToEvents: comprehension.fallbackToEvents (default true)
 *   - appliedTypes:     accepted operations の type 配列 (LLM 出力 order を保持)
 *   - rejectReasons:    reject 理由の string 配列 (重複可)
 *   - synthesisSource:  Commit 7-8 で synth 層が埋める。Commit 6 段階では
 *                       受け皿のみ提供 (既存 comprehension で値が無ければ "none" 既定)
 */
function buildOperationsTrace(
  comprehension: MorningPipelineResult["comprehension"],
): {
  received: number;
  accepted: number;
  rejected: number;
  fallbackToEvents: boolean;
  appliedTypes: string[];
  rejectReasons: string[];
  synthesisSource:
    | "llm"
    | "llm_transformed"
    | "deterministic"
    | "deterministic_overrides_llm"
    | "none";
} | null {
  if (!comprehension) return null;
  const received = comprehension.operations?.length ?? 0;
  const accepted = comprehension.acceptedOperations?.length ?? 0;
  const rejections = comprehension.operationRejections ?? [];
  const rejected = rejections.length;
  return {
    received,
    accepted,
    rejected,
    fallbackToEvents: comprehension.fallbackToEvents ?? true,
    appliedTypes: (comprehension.acceptedOperations ?? []).map((op) => op.type),
    rejectReasons: rejections.map((r) => r.reason),
    synthesisSource: comprehension.operationsSynthesisSource ?? "none",
  };
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

  // ── Events 継承（CEO 2026-04-29 PR #41b-1a: turn_mode dispatch）──
  //   旧 mergeEventFields の課題:
  //     1. length-mismatch (cur.length !== prior.length) で全 cur を discard
  //        → 予定追加 (LLM が 2 events 出力) で新規 event が消える (CEO Case 3 真因)
  //     2. mergeIntoPrior は null-fill semantics で intentional update を表現できない
  //        → 「9時を10時に変更」 で event_1.when.startTime が更新されない (CEO Case 1 真因)
  //     3. position fallback が turn_mode 不問で fire
  //        → modify event が誤合流するリスク
  //
  //   新 dispatchEventMerge:
  //     A. length-mismatch でも各 event 独立処理 (discard 廃止)
  //     B. turn_mode 別 dispatch (modify / create / append)
  //     C. modify apply (applyModifyPatch で intentional update)
  //     D. position fallback を turn_mode="create" + length match に限定
  //
  //   詳細: lib/alter-morning/planning/eventMergeDispatch.ts
  //
  // ── PR-50 Commit 4 (CEO 2026-04-30): operations 経路 分岐 ──
  //   morningPipeline (Commit 3) が ComprehensionResult.fallbackToEvents を
  //   立てる: false なら全 operations が validation 通過、true なら operations
  //   空 or 1+ reject。前者のみ operationDispatcher で effectiveEvents 構築、
  //   後者は既存 dispatchEventMerge に倒す (regression baseline 維持)。
  //
  //   分岐条件 (両方満たす):
  //     - comprehension.fallbackToEvents === false
  //     - comprehension.acceptedOperations が non-empty
  //
  //   どちらの経路でも下流 reconcileGapStateFromEffectiveEvents は同じ呼び出し。
  //   trace 集計 (L924-) は dispatchResult.dispatch を見るので、両分岐で同 shape
  //   を保つ。operation 経路では dispatch は空配列にして「turn_mode ベース集計
  //   に該当なし」を表現する (operation 別 trace は Commit 5 で扱う)。
  const fallbackToEvents = result.comprehension?.fallbackToEvents ?? true;
  const acceptedOperations = result.comprehension?.acceptedOperations ?? [];
  const useOperationsPath =
    !fallbackToEvents && acceptedOperations.length > 0;
  let effectiveEvents: ComprehensionEvent[];
  let dispatchResult: ReturnType<typeof dispatchEventMerge>;
  if (useOperationsPath) {
    const opResult = dispatchOperations({
      acceptedOperations,
      priorPersistedEvents: input.priorPersistedEvents ?? [],
      priorPendingClarify: input.priorPendingClarify ?? null,
    });
    effectiveEvents = opResult.effectiveEvents;
    dispatchResult = { effectiveEvents: opResult.effectiveEvents, dispatch: [] };
  } else {
    dispatchResult = dispatchEventMerge({
      currentEvents,
      priorPersistedEvents: input.priorPersistedEvents ?? [],
      // PR-50 Commit 12 (CEO 2026-04-30): utterance を dispatchEventMerge に渡す。
      //   priorEvents non-empty 時、create event が「current utterance 由来」 か
      //   「prior の re-extraction」 かを判定するため。re-extraction なら drop。
      utterance: input.utterance,
    });
    effectiveEvents = dispatchResult.effectiveEvents;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PR-50 Commit 14 (CEO 2026-04-30): canonical event invariant enforcement
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 合言葉: 「増殖は止める。でも、本物の別予定は潰さない」
  //
  // dispatchEventMerge / dispatchOperations の **後段** で effectiveEvents の
  // 不変条件を修復する pure pass。雑な dedup ではなく状態機械の不変条件:
  //
  //   1. ghost modify removal: turn_mode=modify + 全 slot missing な event を
  //      filter (Commit 12 で発生源は断ったが既存 polluted session の defensive)
  //   2. same canonical event merge: same startTime + same activity + same
  //      place identity の event を 1 件に統合 (LLM の re-extraction が
  //      Commit 12 を貫通した場合の最終防御)
  //
  // 含まない (= future PR):
  //   - different startTime をまたぐ transport-only duplicate cleanup
  //     (本物別予定を潰すリスク高)
  //
  // merge 方向 (CEO + GPT 確定):
  //   先にある event (= base) を維持、duplicate から non-null 情報だけ補完。
  //   event_id は base 維持 → capturedHistory / dialogState.focus.event_id の
  //   参照が壊れない。
  const beforeInvariantCount = effectiveEvents.length;
  effectiveEvents = effectiveEvents.filter((e) => !isGhostModifyEvent(e));
  const afterGhostFilterCount = effectiveEvents.length;
  effectiveEvents = dedupCanonicalEvents(effectiveEvents);
  const afterDedupCount = effectiveEvents.length;
  if (beforeInvariantCount !== afterDedupCount) {
    console.info(
      `[alter-morning:invariant] events ${beforeInvariantCount} → ${afterGhostFilterCount} (ghost filter) → ${afterDedupCount} (canonical dedup)`,
    );
  }

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
      // PR-50 Commit 9 (CEO 2026-04-30):
      //   route.ts は reducer 後の morningSession.dialogState を input.priorDialogState
      //   に渡す。null なら reconcileDialogState は early-return する (= 既存挙動維持)。
      //   非 null なら focus / sharpness を effectiveEvents と再同期し、
      //   pendingClarify=null + slot fixed → focus clear / advance に至る。
      input.priorDialogState ?? null,
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
  //
  //   PR #41a: 観察のみ (apply 未実装)
  //   PR #41b-1a: dispatchEventMerge.applyModifyPatch で apply 実装 → trace に
  //              applied=true/false を追加し、CEO が「modify が effective に反映された」 を pin できるようにする。
  //
  //   currentEvents は guard 経由なので、補正適用済みの状態。
  const priorBaseEvents = input.priorPersistedEvents ?? [];
  const modifyResolutionsSnapshots: ModifyResolutionSnapshot[] = currentEvents
    .filter((ev) => ev.turn_mode === "modify")
    .map((ev) => {
      const resolution = ev.target_ref
        ? resolveTargetRef(ev.target_ref, priorBaseEvents)
        : { event_id: null, confidence: null as null, strategy: "none" as const };
      // dispatch result から本 modify event の applied 判定を取得
      const decision = dispatchResult.dispatch.find(
        (d) => d.cur_event_id === ev.event_id && d.cur_turn_mode === "modify",
      );
      const applied = decision?.action === "modify_applied";
      return {
        event_id: ev.event_id,
        target_ref_present:
          typeof ev.target_ref === "string" && ev.target_ref.length > 0,
        resolved: {
          target_event_id: resolution.event_id,
          confidence: resolution.confidence,
          strategy: resolution.strategy,
        },
        applied,
      };
    });

  // ── CEO 2026-04-29 PR #41b-1a: dispatch summary aggregation ──
  //   各 cur event の dispatch 判断を集計し trace に乗せる。
  //   PR-50 Commit 12 (CEO 2026-04-30): unsafe fallback 廃止で新 action 追加:
  //     - modify_unresolved_dropped: 未解決 modify を drop (旧 _fallback_create の代替)
  //     - create_re_extraction_dropped: priorEvents 由来の events を drop (duplicate 防止)
  //     - create_insufficient_slots_dropped: 2 slot 未満の create は drop
  const dispatchSummary = {
    modify_applied: 0,
    modify_unresolved_fallback_create: 0,
    modify_unresolved_dropped: 0,
    merged_into_prior: 0,
    kept_as_new: 0,
    create_re_extraction_dropped: 0,
    create_insufficient_slots_dropped: 0,
  };
  for (const d of dispatchResult.dispatch) {
    dispatchSummary[d.action] += 1;
  }

  // ── CEO 2026-04-28 PR #41a Layer 0: turnTrace emission ──
  //   PII 配慮 + env gating は emitTurnTrace 内で完結。
  //   turn 反復 / merge 真因 pin に使う diagnostic。
  //   verbose mode は ALTER_MORNING_TRACE_VERBOSE=true で content 含む。
  //
  // PR #41a Commit 6: emitTurnTrace の戻り値を caller に返却することで、
  //   route handler が response の `_debug.trace` に乗せられるようにする。
  //   CEO が browser DevTools Network tab から trace を観測可能になる。
  // PR-50 Commit 5: operations 経路の集計値を 1 回だけ計算して trace に乗せる。
  const operationsTrace = buildOperationsTrace(result.comprehension);
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
      // CEO 2026-04-29 PR #41b-1a Commit 3: dispatch summary 観測
      //   dispatchSummary.modify_applied >= 1 で「modify が effective に反映」 を pin。
      //   CEO Case 1, Case 2 の merge 条件として使う。
      dispatchSummary,
      // PR-50 Commit 5 (CEO 2026-04-30): operations 経路 観測
      //   morningPipeline (Commit 3) で comprehension に積まれた集計値を trace に
      //   乗せる。operation 解釈率 ≥ 90% KPI の判定材料。
      //   operations が 1 件も出ていない turn では field 自体を omit (undefined)。
      ...(operationsTrace ? { operations: operationsTrace } : {}),
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
    // PR-50 Commit 9: reconcile 後の dialogState を caller に返す。
    //   priorDialogState が non-null かつ reconcile で focus が変わった場合、
    //   route.ts はこれを morningSession.dialogState に反映する。
    //   priorDialogState が null だった場合は reconcile.reconciledDialogState
    //   も null なので、route.ts は既存 dialogState を維持する。
    ...(input.priorDialogState !== undefined
      ? { reconciledDialogState: reconcile.reconciledDialogState }
      : {}),
  };
}
