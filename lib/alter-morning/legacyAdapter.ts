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
}

export interface LegacyAdapterOutput {
  session: MorningSession;
  response: MorningProtocolResponse;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Event → PlanItem
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEFAULT_DURATION_MIN = 45;

function eventToPlanItem(event: ComprehensionEvent, orderHint: number): PlanItem {
  const startTime = event.when.startTime ?? undefined;
  const hasFixedStart = Boolean(startTime);
  const whatText = event.what.activity || event.what.activityCanonical || "予定";
  const whereText = event.where.place_ref ?? "";
  const whenText = startTime ?? "";
  // 表示テキストは「HH:mm 場所 活動」の簡易結合。narration.text が本命なので
  // こちらは最低限の fallback 用途。
  const text = [whenText, whereText, whatText].filter((s) => s.length > 0).join(" ");

  return {
    id: event.event_id,
    kind: hasFixedStart ? "fixed" : "todo",
    text,
    what: whatText,
    startTime,
    durationMin: DEFAULT_DURATION_MIN,
    durationSource: "inferred",
    fixedStart: hasFixedStart,
    orderHint,
    sourceTurnIndex: 0,
    completed: false,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// phase 決定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Phase 決定 — W3-PR-7 Commit 4 で再シンプル化（CEO 2026-04-22 確定）:
 *
 *   1. status !== "ok"                       → clarifying
 *   2. gapResolution.primary_clarify != null → clarifying（clarify-first hard gate）
 *   3. else                                  → plan_presented
 *
 * 旧 safety net（narration 空 / missing_semantic_critical 二重化）は削除。
 *   - narration 空は message 決定側で deterministic fallback を使う
 *   - gapResolver が primary_clarify を正しく立てる責務を負う（sharpness 駆動）
 *
 * このシンプル化は commit 3 までで sharpness → clarifyRequest の配線が
 * 完成したことを前提にしている。
 */
function decidePhase(result: MorningPipelineResult): MorningPhase {
  if (result.status !== "ok") return "clarifying";
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
  const phase = decidePhase(result);
  const today = input.today ?? todayYmd();

  // ── Events 継承（W3-PR-7 Commit 4）──
  //   今ターンの pipeline が events を返せなかった（comprehension_failed 等）場合は
  //   priorPersistedEvents から引き継いで UI 側の plan を消さない。
  const currentEvents = result.comprehension?.events ?? [];
  const effectiveEvents: ComprehensionEvent[] =
    currentEvents.length > 0
      ? currentEvents
      : input.priorPersistedEvents ?? [];

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
    const items: PlanItem[] = effectiveEvents.map((ev, idx) =>
      eventToPlanItem(ev, idx),
    );
    plan = {
      date: today,
      items,
      dayConditions: {},
      createdAt: new Date().toISOString(),
      confirmed: false,
      status: planStatus,
    };
  } else if (input.priorPlan) {
    // events が無い（今ターン失敗 & prior も空）場合、最後の手段として
    // priorPlan を provisional 扱いで継承する。
    plan = {
      ...input.priorPlan,
      status:
        phase === "plan_presented" ? "confirmed" : planStatus,
    };
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
