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
// CEO/GPT 2026-05-02 PR B-1: JourneyAnchorState converter
//   既存 resolver の戻り値 (HomeAnchor | null / JourneyEndAnchor | null) を
//   converter で MorningPlan.journeyOrigin / journeyEnd に変換。kind 3 値の
//   discriminated union で unknown を構造的に表現する (silent fail 排除)。
//
// CEO/GPT 2026-05-02 PR B-2a: applyAnchorFallback で turn 跨ぎ continuity
//   fresh resolve が unknown のとき、priorPlan の anchor を fallback として
//   継承する。samePlanDate (priorPlan.date === currentPlanDate) 判定で
//   stale current/default_round_trip を抑制する。
//
// CEO/GPT 2026-05-02 PR B-2c: Layer 2 (前日終点 inheritance)
//   previousEndToOrigin で前日 plan.journeyEnd を翌朝 origin の inference 材料に変換。
//   preserveStrongPriorOrigin で同 plan 内の STRONG prior (USER_EXPLICIT or
//   previous_day_*) を Layer 2 上書きから守る。
//   推論優先順位: explicit > strong prior > previous_day > resolver+weak fallback
import {
  toOriginState,
  toEndState,
  applyAnchorFallback,
  previousEndToOrigin,
  preserveStrongPriorOrigin,
  type AnchorUnknownReason,
  type JourneyAnchorState,
} from "./journey/anchorState";
// CEO/GPT 2026-05-02 PR B-2b: explicitAnchorExtractor (Layer 1 detector)
//   発話から origin / end を deterministic に抽出。USER_EXPLICIT_SOURCES として
//   prior known_exact を上書きできる強権を持つ (applyAnchorFallback Case #2-bis)。
import {
  extractStartPointAnchor,
  extractEndpointAnchor,
} from "./journey/explicitAnchorExtractor";
// CEO/GPT 2026-05-02 PR B-2d-a: geolocation permission state contract
//   permissionState は origin の主役ではない。
//   currentLat/Lng も baseline home も解決できず origin が unknown になる時の
//   理由説明として AnchorUnknownReason を決定する。
import type { GeolocationPermissionState } from "./journey/permissionState";
// CEO/GPT 2026-05-02 PR B-2d-c: current location inference gating
import { evaluateCurrentLocation } from "./journey/currentLocationGating";
// CEO/GPT 2026-05-02 PR B-2e' wire-up: origin clarify 統合
import { shouldAskOriginClarify } from "./journey/originGap";
import { PLAN_ORIGIN_SENTINEL_EVENT_ID } from "./planning/gapResolver";
// CEO/GPT 2026-05-03 PR B-3b'-2: label classification (pure)
import {
  classifyLabel,
  type LabelClassification,
} from "./search/labelClassification";
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
import { dispatchEventMerge } from "./planning/eventMergeDispatch";
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
   * CEO/GPT 2026-05-02 PR B-2d-a: geolocation permission state contract
   *
   * frontend `navigator.permissions.query` 由来の 5 値 raw 状態。
   *   - "granted":     user 許可済 (currentLat/Lng が来る前提)
   *   - "denied":      user 明示拒否
   *   - "prompt":      まだ user に聞いていない
   *   - "unsupported": Permissions API 非対応
   *   - "unavailable": query が throw
   *
   * 規律 (CEO 補正 + GPT 補強):
   *   1. permissionState は **origin の主役ではない**
   *   2. currentLat/Lng がある → permissionState 不問で current location 採用
   *   3. currentLat/Lng なし、userHomeLat/Lng あり → registered_home 採用、
   *      AnchorUnknownReason 不要
   *   4. current/baseline 両方なし → permissionState から AnchorUnknownReason 決定
   *      denied → "denied"
   *      prompt → "unrequested"
   *      unsupported → "unrequested" (raw 値は debug log に保持、GPT 補強 1)
   *      unavailable → "unrequested" (raw 値は debug log に保持、GPT 補強 1)
   *      granted (coords なしの場合) → "no_baseline"
   *   5. raw 5 値は debug log に出力、enum 集約に丸め込まない
   *
   * 用途: events>0 path で homeAnchor=null のときに reason を決定する。
   */
  permissionState?: GeolocationPermissionState | null;

  /**
   * CEO/GPT 2026-05-02 PR B-2d-c: current location inference gating fields
   *
   * accuracy:
   *   pos.coords.accuracy (m)。低精度 (> 1000m) を reject する判定材料。
   *   省略時は accuracy check を skip (= legacy backward compat、寛容)。
   *
   * capturedAt:
   *   ISO 8601 timestamp。new Date(pos.timestamp).toISOString() 由来。
   *   maximumAge=5min により cached position が返った場合の正しい取得時刻を
   *   保持する (= new Date() を使うと cached 時に stale 判定が破綻するので不可)。
   *   省略時は freshness check を skip (= legacy backward compat、寛容)。
   *
   * actualTodayYmdJst:
   *   JST 固定の「実際の今日」 (YYYY-MM-DD)。route.ts の getActualTodayYmdJst() で生成。
   *   既存 `today` field (= target plan date) と **混同禁止**。命名で前提を明示する。
   *   user timezone / travel timezone / semantic date 解釈は PR B-4 で扱う。
   *   省略時は not_today check を skip (= legacy backward compat)。
   *
   * 用途: evaluateCurrentLocation で current location を origin 推論に使うか判定。
   *   reject 時は registered_home / unknown 体系に fallback。新 reason は追加しない。
   *   debug log に rejectReason のみ出力 (lat/lng/住所/userId/plan は出さない)。
   */
  accuracy?: number | null;
  capturedAt?: string | null;
  actualTodayYmdJst?: string | null;

  /**
   * CEO/GPT 2026-05-02 PR B-2e' wire-up: 当 turn origin clarify 回答 label。
   *
   * 用途:
   *   route.ts で `priorPendingClarify.slot === "origin"` を検出した時、
   *   `bindOriginAnswer(message)` で正規化した label をここに渡す。
   *   legacyAdapter は journeyOrigin の **最優先 Layer** で plug する:
   *     - kind: "known_label_only"
   *     - label: 本 field の値 (= "ホテル" 等、suffix 除去済み)
   *     - source: "user_override"
   *
   * 優先順位 (CEO/GPT 確定):
   *   1. userOverrideOriginLabel (= 当 turn clarify 回答、最優先)
   *   2. Layer 1: USER_EXPLICIT_SOURCES (= deterministic detector の自然発話)
   *   3. Layer 2: same-plan STRONG prior
   *   4. Layer 3: previous_day_endpoint inheritance
   *   5. Layer 4: resolveHomeAnchor (current → registered_home → null)
   *   6. Layer 5: unknown
   *
   * 重要規律:
   *   - 当 turn の明示回答であり、prior より新しい情報なので **STRONG prior より上**
   *   - coords は付けない (= known_label_only、coords grounding は B-3 の責務)
   *   - 次 turn 以降は priorPlan.journeyOrigin に persist され、user_override は
   *     STRONG_PRIOR_ORIGIN_SOURCES に含まれているので samePlanDate=true で守られる
   *
   * 省略時 (= 通常 turn):
   *   既存 flow と完全に同じ挙動 (= backward compat)。
   */
  userOverrideOriginLabel?: string | null;

  /**
   * CEO/GPT 2026-05-02 PR B-2c: Layer 2 (前日終点 inheritance) 用の前日 plan。
   *
   * 渡し方 (caller responsibility、CEO/GPT 規律):
   *   - route.ts (chat 経路) で fetchPreviousDayPlan(supabase, userId, today) を呼び、
   *     結果 (MorningPlan | null) を本 field に渡す
   *   - DB query は legacyAdapter 内で行わない (legacyAdapter は pure に保つ)
   *   - 失敗 / null のときは undefined を渡す → Layer 2 skip → Layer 3 fallback
   *
   * 用途:
   *   events>0 path で previousEndToOrigin(input.previousDayPlan?.journeyEnd) を
   *   呼び、Layer 2 として推論 chain に組み込む。
   *   優先順位: explicit > strong prior > previous_day > resolver+weak fallback
   */
  previousDayPlan?: MorningPlan | null;

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
  /**
   * CEO/GPT 2026-05-03 PR B-3b'-2 (forward-fix for #69 review):
   *   journey_origin grounding の **意図 (= intent)** を caller (route.ts) に
   *   渡す。legacyAdapter は pure に intent を作るだけで、副作用 (= Places API,
   *   reducer dispatch) を起こさない。route.ts が flag 判定 + classification
   *   == public_poi_proper_noun の確認後に orchestrateJourneyAnchorHandoff を
   *   呼ぶ。
   *
   * undefined: journeyOrigin が known_label_only でない (= 既に known_exact、
   *   または unknown)、もしくは label が空文字。
   *
   * 詳細は L1535 付近の生成ロジックと L1595 の type 定義 (= JourneyOriginGroundingIntent)
   * を参照。
   */
  journeyOriginGroundingIntent?: {
    label: string;
    classification: LabelClassification;
  };
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
    });
    effectiveEvents = dispatchResult.effectiveEvents;
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

  // CEO/GPT 2026-05-02 PR B-2e' wire-up:
  //   journeyOrigin が unknown 確定 + origin clarify 条件全て満たす場合、
  //   plan 構築後に pendingClarify / phase / message / planStatus を上書きする。
  //   そのため `let` で宣言して post-process での再代入を許す。
  let phase = reconcile.reconciledPhase;
  let pendingClarify = reconcile.reconciledPendingClarify;

  // ── Message 決定（W3-PR-7 Commit 4: items=0 禁則 + 厳格 fallback）──
  //   clarifying: primary_clarify.question → scope/kind 再生成 → prior.question → generic
  //   plan_presented: narration.text → events から deterministic 再構築 → generic
  let message =
    phase === "plan_presented"
      ? buildPlanPresentedMessage(result, effectiveEvents)
      : buildClarifyingMessage(result, input, pendingClarify);

  // ── Plan 構築（W3-PR-7 Commit 4: clarifying 時も provisional として保持）──
  //   status: plan_presented → confirmed
  //           pendingClarify あり → needs_answer
  //           else (events あるが ASK 無し / comprehension_failed 継承) → provisional
  //   events が完全に空の場合は priorPlan を provisional として継承する。
  let planStatus: MorningPlanStatus =
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

    // ── CEO/GPT 2026-05-02 PR B-2d-c: current location inference gating ──
    //   currentLat/Lng が **存在する** 場合のみ evaluateCurrentLocation を呼ぶ。
    //   null は「無い」状態であり invalid 扱いしない (= caller responsibility per
    //   evaluateCurrentLocation の precondition)。
    //
    //   reject 時は currentLat/Lng を null に rewrite し、resolveHomeAnchor で
    //   userHomeLat/Lng (= registered_home) に fallback させる。
    //
    //   debug log は rejectReason のみ (lat/lng/住所/userId/plan は出さない、PII 規律)。
    //   AnchorUnknownReason は新規追加せず、既存体系 (no_baseline) に集約する。
    let effectiveCurrentLat = input.currentLat ?? null;
    let effectiveCurrentLng = input.currentLng ?? null;
    if (effectiveCurrentLat != null && effectiveCurrentLng != null) {
      const evalResult = evaluateCurrentLocation(
        {
          currentLat: effectiveCurrentLat,
          currentLng: effectiveCurrentLng,
          accuracy: input.accuracy,
          capturedAt: input.capturedAt,
          actualTodayYmdJst: input.actualTodayYmdJst,
        },
        today, // legacyAdapter の `today` = target plan date (= currentPlanDate)
      );
      if (!evalResult.usable) {
        console.info("[alter-morning] current location rejected", {
          rejectReason: evalResult.rejectReason,
          // PII 排除 (CEO 規律): lat/lng/accuracy/capturedAt/userId/plan は出さない
          //   accuracy / capturedAt は数値だけだが、推定経由で行動再現に使われる
          //   リスクがあるため、debug log にも出さない
        });
        effectiveCurrentLat = null;
        effectiveCurrentLng = null;
      }
    }

    const homeAnchor = resolveHomeAnchor({
      currentLat: effectiveCurrentLat,
      currentLng: effectiveCurrentLng,
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
    // CEO/GPT 2026-05-02 PR B-1: plan-level anchor state contract
    //   MorningPlanCard が plan.items の上下に「現在地」「帰宅」ノードを render するため。
    //
    //   PR B-1 不変条件:
    //     events.length > 0 (本 branch) では journeyOrigin / journeyEnd が必ず設定される。
    //     - homeAnchor 有 → kind="known_exact"
    //     - homeAnchor 無 → kind="unknown" + reason (silent fail 排除)
    //
    //   reason 決定:
    //     - currentLat/Lng + userHomeLat/Lng いずれも null → "no_baseline"
    //     - 上記以外で homeAnchor=null となるケースは現状 resolveHomeAnchor の仕様上
    //       発生しない (両者とも finite なら採用される)。「denied」 / 「unrequested」 は
    //       PR B-2 以降で caller (route) から explicit に渡せるよう拡張予定。
    //   journeyEnd の reason:
    //     - homeAnchor=null → round-trip default も引けない → "no_endpoint_signal"
    //
    // CEO/GPT 2026-05-02 PR B-2a: turn 跨ぎ anchor continuity
    //   fresh resolve が unknown のとき、priorPlan の anchor を fallback として継承。
    //
    //   samePlanDate 判定 (GPT 規律 修正 1):
    //     samePlanDate = priorPlan.date === currentPlanDate
    //
    //   本 file では `today` 変数 (legacyAdapter.ts:637 で `input.today ?? todayYmd()`
    //   から取得) が **plan.date に使われる「対象日」** = currentPlanDate と同義。
    //   caller (route.ts) が「明日のプラン」 を作るときは input.today に "2026-05-03"
    //   等を渡すため、todayYmd() (OS の今日) ではなく対象日が入る。
    //
    //   ただし変数名 `today` が紛らわしい点に注意:
    //     - 「今日」 と読めるが、実は「組み立てる plan の対象日 = currentPlanDate」
    //     - caller が input.today を **渡し忘れる** と todayYmd() (OS の今日) が
    //       使われ、明日プランの継続編集で samePlanDate=false の誤判定が起きる
    //     - caller responsibility: route.ts は明日プランを作るとき必ず input.today
    //       を渡すこと (Commit 4 で integration test に T9 を追加して固定)
    //
    //   STALE_SOURCES (current / default_round_trip) は samePlanDate=false で抑制。
    //
    // TODO (PR B-3): JourneyEndAnchor.derivedFrom field を追加し、
    //   default_round_trip が registered_home 由来のとき STALE 判定を緩和する。
    //   現状は「derivedFrom 不在 → 安全側で全 default_round_trip を STALE 扱い」。
    //
    // TODO (PR B-2b/c): inference hierarchy 拡張で、本 fallback の前に:
    //   - layer 1: extractStartPointAnchor (発話「自宅から」 等) で fresh を埋める
    //   - layer 2: 前日 plan.journeyEnd を本日 plan.journeyOrigin の inference 材料に
    //   - layer 4-5: location_history 観測 (Stargazer Human OS 接続)
    //
    // TODO (PR B-4): targetDate semantic (今日/明日/明後日) を考慮した
    //   current_location 適用範囲の time-aware redesign。
    //
    // TODO (selection route 統合):
    //   app/api/stargazer/alter/selection/route.ts:390-395 の simple ternary を
    //   applyAnchorFallback に統一する。selection は同じ plan 日付なので
    //   samePlanDate=true 固定で良い。PR B-3 で fresh known_label_only ケースが
    //   入ったときに統合する (現状 selection は label_only ケースを生成しない)。
    // CEO/GPT 2026-05-02 PR B-2d-a: permissionState から originReason を決定
    //
    // 優先順位 (CEO 補正規律):
    //   1. homeAnchor !== null (= currentLat/Lng or userHomeLat/Lng が解決された)
    //      → originReason は使われない (toOriginState で kind="known_exact" になる)
    //      ただし type 上 reason は要るので "no_baseline" を仮設定
    //   2. homeAnchor === null かつ permissionState から決定:
    //      "denied" → reason = "denied"
    //      "prompt" / "unsupported" / "unavailable" → reason = "unrequested"
    //        (raw permissionState は下記 debug log で保持、GPT 補強 1)
    //      "granted" or null → reason = "no_baseline" (granted だが coords なし)
    //
    // permissionState は origin の主役ではない。
    // homeAnchor が null になった時の理由説明として使うだけ。
    const originReason: AnchorUnknownReason = (() => {
      if (homeAnchor !== null) {
        // 使われない (toOriginState で known_exact になる)、type 上のみ
        return "no_baseline";
      }
      // homeAnchor === null = currentLat/Lng も baseline home も解決できず
      const ps = input.permissionState;
      if (ps === "denied") return "denied";
      if (ps === "prompt" || ps === "unsupported" || ps === "unavailable") {
        return "unrequested";
      }
      // granted but no coords (permission なのに coords が来ない)、または ps == null
      return "no_baseline";
    })();
    // CEO/GPT 2026-05-02 PR B-2d-a Commit 4 (debug log): GPT 補強 1
    //   raw permissionState を debug log に出力。lat/lng/住所/userId/plan は
    //   出さない (CEO/GPT 規律: PII 排除)。
    //   homeAnchor が null になった (= origin が unknown に落ちる) ときだけ出力。
    if (homeAnchor === null) {
      console.info("[alter-morning] origin unresolved", {
        permissionStateRaw: input.permissionState ?? "not_provided",
        derivedReason: originReason,
        // GPT 規律: PII (lat/lng/住所/userId/plan) は出さない
      });
    }
    const endReason: AnchorUnknownReason = "no_endpoint_signal";

    // CEO/GPT 2026-05-02 PR B-2b: Layer 1 explicit detector を resolver より優先
    //   発話に「自宅から」「ホテルに泊まる」 等の明示文言があれば、
    //   user_declared / user_explicit_endpoint source の label_only state を作る。
    //   resolver の結果 (current / registered_home 等) より「ユーザー文言尊重」 が上位。
    //   ただし detector が hit しなければ、従来通り resolver 結果を fresh として使う。
    const explicitOrigin: JourneyAnchorState | null =
      extractStartPointAnchor(input.utterance);
    const explicitEnd: JourneyAnchorState | null =
      extractEndpointAnchor(input.utterance);

    // PR B-2a: priorPlan を fallback として参照
    //   `today` 変数 = plan.date に使われる「対象日 (currentPlanDate)」 (上記コメント参照)
    //   priorPlan.date === today (= currentPlanDate) なら samePlanDate=true (同じ plan 継続編集)
    //   priorPlan.date !== today なら samePlanDate=false (stale 抑制対象)
    const samePlanDate = input.priorPlan?.date === today;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CEO/GPT 2026-05-02 PR B-2c: Layer 2 (前日終点 inheritance)
    //
    // 推論優先順位 (CEO/GPT 規律):
    //   1. explicit (Layer 1)         — 当 turn のユーザー明示発話
    //   2. strong prior               — 同 plan 内の USER_EXPLICIT or previous_day_*
    //   3. previous day endpoint (Layer 2) — 前日 plan の journeyEnd を翌朝 origin に
    //   4. resolver + weak fallback (Layer 3-4) — baseline_home / current + applyAnchorFallback
    //   5. unknown
    //
    // 重要: previous day endpoint は baseline home より強い (= Layer 2 > Layer 3)。
    // 前日ホテル泊まり + baseline_home あり → 翌朝 origin = ホテル
    // (CEO 思想: 推論優先順位を構造的に維持)
    //
    // ただし当 turn の明示発話と同 plan 内の strong prior よりは弱い:
    // - 当 turn 「自宅から」 + 前日 hotel → origin = 自宅 (explicit wins)
    // - prior user_declared + 前日 hotel + samePlanDate=true → prior wins (STRONG prior 守る)
    //
    // PR B-5a の fetchPreviousDayPlan は cascade なし (直前 1 日のみ参照)。
    // 本 PR でも cascade guard (previousEndToOrigin で previous_day_* を null) で
    // 「前日の前日 plan からの継承」 を構造的に防ぐ。
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const previousDayOriginCandidate: JourneyAnchorState | null =
      previousEndToOrigin(input.previousDayPlan?.journeyEnd);
    const strongPriorOrigin: JourneyAnchorState | null = preserveStrongPriorOrigin(
      input.priorPlan?.journeyOrigin,
      { samePlanDate },
    );

    // ── CEO/GPT 2026-05-02 PR B-2e' wire-up: origin clarify 回答を最優先で plug ──
    //   userOverrideOriginLabel は当 turn の origin clarify への明示回答。
    //   STRONG prior より上位 (= 当 turn の明示は prior より新しい情報、論理的に正しい)。
    //
    //   優先順位 (CEO/GPT 確定、修正版):
    //     1. originClarifyAnswer (= 当 turn clarify 回答)  ← 本 layer
    //     2. Layer 1 explicit (= deterministic detector)
    //     3. STRONG prior (= same-plan 内 prior 保護)
    //     4. previous day endpoint (Layer 2)
    //     5. resolver + weak fallback (Layer 3-4)
    //     6. unknown (Layer 5)
    //
    //   形式: known_label_only / source = "user_override"
    //     coords は付けない (= B-3 で grounding する)
    //     user_override は STRONG_PRIOR_ORIGIN_SOURCES に含まれているので、
    //     次 turn 以降は priorPlan.journeyOrigin = user_override が STRONG prior として
    //     samePlanDate=true で守られる (= persistence の自動継承)
    const originClarifyAnswer: JourneyAnchorState | null =
      input.userOverrideOriginLabel != null && input.userOverrideOriginLabel !== ""
        ? {
            kind: "known_label_only",
            label: input.userOverrideOriginLabel,
            source: "user_override",
          }
        : null;

    // 推論 chain (origin、PR B-2e' で originClarifyAnswer を最優先に追加):
    //   originClarifyAnswer → Layer 1 explicit → strong prior → Layer 2 previous_day → Layer 3-4 resolver+weak
    const journeyOrigin: JourneyAnchorState =
      originClarifyAnswer
      ?? explicitOrigin
      ?? strongPriorOrigin
      ?? previousDayOriginCandidate
      ?? applyAnchorFallback(
        toOriginState(homeAnchor, originReason),
        input.priorPlan?.journeyOrigin,
        { samePlanDate },
      );

    // end は PR B-2c の scope 外 (Layer 1 + resolver + applyAnchorFallback のみ、PR B-2b 維持)
    const freshEnd: JourneyAnchorState =
      explicitEnd ?? toEndState(journeyEnd, endReason);
    const journeyEndForPlan = applyAnchorFallback(
      freshEnd,
      input.priorPlan?.journeyEnd,
      { samePlanDate },
    );
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
      // PR B-1: events>0 の場合は必ず set (kind="unknown" を含む)
      // PR B-2a: applyAnchorFallback 経由で turn 跨ぎ continuity 確保
      journeyOrigin,
      journeyEnd: journeyEndForPlan,
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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO/GPT 2026-05-02 PR B-2e' wire-up: origin clarify を **三重保証** で inject
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //   journeyOrigin が unknown かつ origin clarify 条件全て満たす場合、
  //   pendingClarify / phase / message / plan.status を上書きする。
  //
  // 三重保証 (CEO/GPT 2026-05-02 規律 + B-2e' 補強):
  //   ① phase !== "plan_presented"
  //      (= 既に plan 確定状態の時は origin clarify で再降格しない、保守的 rollout)
  //   ② pendingClarify == null  (= reconcile が他 clarify を立てていない)
  //   ③ result.gapResolution.actions に clarify type の action がない (= 既存 clarify 0)
  //   ④ shouldAskOriginClarify() が 8 条件全て true (= 質問アプリ化防止)
  //
  // priority=50 で構造的に最低優先 + runtime で三重保証 → 「予定本体の解決を邪魔しない」
  // が複層的に保証される。
  //
  // 注意: input.userOverrideOriginLabel が指定されている場合は、journeyOrigin が
  //   既に user_override で plug されているため kind === "unknown" ではない →
  //   shouldAskOriginClarify が false を返す → 本 block は skip される (= 構造的に正しい)。
  //
  // 既存 test fixture との互換性 (CEO/GPT 2026-05-02):
  //   既存 test の多くは home/current 不指定で plan_presented を期待する fixture。
  //   B-2e' で origin clarify を fire させると test が破綻するが、
  //   ① phase !== "plan_presented" の guard で既存挙動を保護する (= 保守的 rollout)。
  //   将来的に「plan_presented + origin unknown」 パターンへの対応は別 PR で判断。
  if (
    plan != null &&
    plan.journeyOrigin?.kind === "unknown" &&
    phase !== "plan_presented" &&
    pendingClarify == null &&
    !(result.gapResolution?.actions?.some((a) => a.type === "clarify") ?? false)
  ) {
    const shouldAsk = shouldAskOriginClarify({
      journeyOrigin: plan.journeyOrigin,
      events: effectiveEvents,
      dialogState: input.priorDialogState ?? null,
      priorPendingClarify: input.priorPendingClarify ?? null,
    });
    if (shouldAsk) {
      // origin clarify question を生成 (clarifyQuestionBuilder template)
      const originQuestion = buildClarifyQuestion({ kind: "origin" });
      // pendingClarify を origin clarify で上書き
      pendingClarify = {
        event_id: PLAN_ORIGIN_SENTINEL_EVENT_ID,
        slot: "origin",
        kind: "origin",
        scope: { timeLabel: null, activityLabel: null, eventOrdinal: 0 },
        question: originQuestion,
        askedAt: new Date().toISOString(),
      };
      // phase を clarifying に降格、message と plan.status を同期
      phase = "clarifying";
      message = originQuestion;
      planStatus = "needs_answer";
      plan = { ...plan, status: "needs_answer" };
    }
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
  const dispatchSummary = {
    modify_applied: 0,
    modify_unresolved_fallback_create: 0,
    merged_into_prior: 0,
    kept_as_new: 0,
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

  // CEO/GPT 2026-05-03 PR B-3b'-2: journey_origin grounding intent 生成 (pure)
  //
  // 責務分離 (CEO 2026-05-03 補正):
  //   - legacyAdapter: state 変換 + intent 生成 のみ (= pure 関数、副作用なし)
  //   - route.ts: flag 判定 + orchestrator 実行 + Places API 副作用 (= 集約)
  //
  // intent は journeyOrigin が known_label_only の時のみ生成される。
  // route.ts 側で以下条件を満たすときに orchestrateJourneyAnchorHandoff を呼ぶ:
  //   - journeyOriginGroundingIntent !== undefined
  //   - intent.classification === "public_poi_proper_noun"
  //   - ALTER_MORNING_FLAGS.journeyOriginGrounding(userId) === true (Layer 1)
  //   - dialogStateV2 / placesSearch も true (= AND gate)
  //
  // 注: classification === "generic_category" / "private_semantic" / "ambiguous"
  //     の場合は intent が生成されても route.ts 側で skip する (Q1 確定方針)。
  let journeyOriginGroundingIntent:
    | { label: string; classification: LabelClassification }
    | undefined;
  if (
    plan?.journeyOrigin?.kind === "known_label_only" &&
    plan.journeyOrigin.label
  ) {
    journeyOriginGroundingIntent = {
      label: plan.journeyOrigin.label,
      classification: classifyLabel(plan.journeyOrigin.label),
    };
  }

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
    // CEO/GPT 2026-05-03 PR B-3b'-2: journey_origin grounding intent (pure)
    //   route.ts が flag 判定 + orchestrator 実行する材料として使う。
    ...(journeyOriginGroundingIntent !== undefined
      ? { journeyOriginGroundingIntent }
      : {}),
  };
}

/**
 * CEO/GPT 2026-05-03 PR B-3b'-2: journey_origin grounding intent type export。
 *
 * legacyAdapter (= pure) が生成し、route.ts (= 副作用集約) が消費する。
 *   route.ts で:
 *     - flag 判定 (journeyOriginGrounding + dialogStateV2 + placesSearch)
 *     - classification === "public_poi_proper_noun" 確認
 *     - 全条件 true で orchestrateJourneyAnchorHandoff を呼ぶ
 *     - それ以外 (generic_category / private_semantic / ambiguous) は何もしない
 */
export type JourneyOriginGroundingIntent = {
  /** journeyOrigin.label (= "ホテル", "東京駅" 等) */
  label: string;
  /** classifyLabel(label) の結果 (= 4 分類のいずれか) */
  classification: LabelClassification;
};
