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
  PlanItem,
  PersonalityContext,
  PendingClarify,
  PendingClarifyScope,
  PendingSlot,
} from "./types";
import type { Event as ComprehensionEvent } from "./comprehension/eventSchema";
import type { ClarifyRequest } from "./planning/gapResolver";

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
 * Phase 決定 — W3-PR-6 CEO 方針: clarify-first **hard gate**
 *
 * 「ASK が 1 つでも残るなら plan_presented に進ませない」が最重要制約。
 * 従前は status===ok && narration.text のみだったが、gapResolution.primary_clarify
 * と missing_semantic_critical を AND で検査することで、条件不足状態での
 * plan 提示を構造的に禁止する。
 *
 * 判定順:
 *   1. status !== "ok"                         → clarifying
 *   2. narration が空                          → clarifying（防御的）
 *   3. gapResolution.primary_clarify != null   → clarifying（hard gate 本体）
 *   4. 任意の event に missing_semantic_critical が残る → clarifying（二重化）
 *   5. else                                    → plan_presented
 */
function decidePhase(result: MorningPipelineResult): MorningPhase {
  if (result.status !== "ok") return "clarifying";
  if (!result.narration || !result.narration.narration?.text) return "clarifying";

  // hard gate 本体
  if (result.gapResolution?.primary_clarify) return "clarifying";

  // 二重化: primary_clarify が null でも missing_semantic_critical が残る
  // event があれば clarifying に倒す（gapResolver の漏れへの safety net）
  const hasMissingSemantic = result.comprehension?.events.some(
    (ev) => ev.missing_semantic_critical.length > 0,
  );
  if (hasMissingSemantic) return "clarifying";

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
 * scope 情報（timeLabel / activityLabel / eventOrdinal）は対象 event から拾う。
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
  const ev = events[idx];

  const scope: PendingClarifyScope = {
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
// Entry
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function adaptPipelineToLegacy(
  result: MorningPipelineResult,
  input: LegacyAdapterInput,
): LegacyAdapterOutput {
  const phase = decidePhase(result);
  const today = input.today ?? todayYmd();

  // ── Message 決定 ──
  // narration.text が本命。clarifying 時は gapResolution.primary_clarify.question を
  // 最優先で採用（rule-based で生成済み、W3-PR-1）。無ければ generic fallback。
  const narrationText = result.narration?.narration?.text ?? "";
  const clarifyText =
    result.gapResolution?.primary_clarify?.question?.trim() || "";
  const message =
    phase === "plan_presented"
      ? narrationText
      : clarifyText || "もう少し詳しく教えてくれる？";

  // ── Plan 構築 ──
  const events = result.comprehension?.events ?? [];
  const items: PlanItem[] = events.map((ev, idx) => eventToPlanItem(ev, idx));
  const plan: MorningPlan | undefined =
    phase === "plan_presented"
      ? {
          date: today,
          items,
          dayConditions: {},
          createdAt: new Date().toISOString(),
          confirmed: false,
        }
      : undefined;

  // ── PendingClarify / persistedEvents 構築（W3-PR-7 Commit 2）──
  //   clarifying phase のときだけ pendingClarify を立てる。
  //   priorPendingClarify が同一 event_id/slot を指していた場合 semanticMissCount を継承する。
  let pendingClarify: PendingClarify | null = null;
  if (phase === "clarifying") {
    const prior = input.priorPendingClarify ?? null;
    pendingClarify = buildPendingClarifyFromResolution(
      result.gapResolution?.primary_clarify ?? null,
      events,
      prior ? prior.semanticMissCount ?? 0 : 0,
    );
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
    persistedEvents: events,
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
