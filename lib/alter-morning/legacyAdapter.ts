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
import {
  synthesizeTravelItems,
  interleaveTravelItems,
} from "./planning/synthesizeTravelItems";
import {
  ALTER_MORNING_FLAGS,
  resolveTransportV2FlagSource,
} from "./dialog/flags";
import { computeSegmentsBuiltTelemetry } from "./transport/telemetry";
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

  // ── Events 継承（W3-PR-7 Commit 4）──
  //   今ターンの pipeline が events を返せなかった（comprehension_failed 等）場合は
  //   priorPersistedEvents から引き継いで UI 側の plan を消さない。
  const currentEvents = result.comprehension?.events ?? [];
  const effectiveEvents: ComprehensionEvent[] =
    currentEvents.length > 0
      ? currentEvents
      : input.priorPersistedEvents ?? [];

  // ── Phase 決定（W3-PR-8: blocking slots を正本、effectiveEvents が必要）──
  const phase = decidePhase(result, effectiveEvents);

  // ── PendingClarify / persistedEvents 構築（W3-PR-7 Commit 2）──
  //   clarifying phase のときだけ pendingClarify を立てる。
  //   priorPendingClarify が同一 event_id/slot を指していた場合 semanticMissCount を継承する。
  let pendingClarify: PendingClarify | null = null;
  if (phase === "clarifying") {
    const prior = input.priorPendingClarify ?? null;
    pendingClarify = buildPendingClarifyFromResolution(
      result.gapResolution?.primary_clarify ?? null,
      effectiveEvents,
      prior ? prior.semanticMissCount ?? 0 : 0,
    );
    // comprehension_failed 等で今ターンに primary_clarify が無い場合は、
    // priorPendingClarify をそのまま維持する（system_miss と同じ扱い）。
    if (!pendingClarify && prior) {
      pendingClarify = prior;
    }
  }

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
    // ── W3-PR-10: planRebuild 委譲 ──
    //   events → PlanItem[] と（flag ON 時のみ）TransportSegment[] を
    //   1 回だけ生成する pure function に委譲。flag OFF 時は transportSegments
    //   は result に含まれず、後段の plan 組み立てでも conditional spread により
    //   plan から落ちる（byte-diff ゼロ保証）。
    const built = buildPlanAndSegmentsFromEvents({
      events: effectiveEvents,
      enableTransportV2: ALTER_MORNING_FLAGS.transportV2(input.userId),
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
      const entries = synthesizeTravelItems(
        built.transportSegments,
        effectiveEvents,
      );
      interleavedItems = interleaveTravelItems(built.items, entries);
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

    plan = {
      date: today,
      items,
      dayConditions: {},
      createdAt: new Date().toISOString(),
      confirmed: false,
      status: planStatus,
      ...(built.transportSegments !== undefined
        ? { transportSegments: built.transportSegments }
        : {}),
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

  return { session, response };
}
