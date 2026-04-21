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
} from "./types";
import type { Event as ComprehensionEvent } from "./comprehension/eventSchema";

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
 * gapResolver は三層判定（FIXED / PROVISIONAL / ASK）を行い、ASK が 1 件でも
 * 残った場合のみ primary_clarify を立てる。ここはその判定を信じる。
 *
 * 判定順:
 *   1. status !== "ok"                         → clarifying
 *   2. narration が空                          → clarifying（防御的）
 *   3. gapResolution.primary_clarify != null   → clarifying（hard gate 本体）
 *   4. else                                    → plan_presented
 *
 * 重要: 以前あった「missing_semantic_critical が残っていれば clarifying」という
 * 二重化チェックは **削除した**。missing_semantic_critical は生欠損を表すだけで、
 * Where/When 三層判定が PROVISIONAL（borrow / category default）と判定した場合
 * でもフィールドには残る。二重化は PROVISIONAL ルートを誤って ASK に差し戻す
 * バグ経路になっていた（W3-PR-6 真機テストで発覚、2026-04-22）。
 * gapResolver.primary_clarify が唯一の権威。
 */
function decidePhase(result: MorningPipelineResult): MorningPhase {
  if (result.status !== "ok") return "clarifying";
  if (!result.narration || !result.narration.narration?.text) return "clarifying";
  if (result.gapResolution?.primary_clarify) return "clarifying";
  return "plan_presented";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// targetDate 決定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

  // ── Session 構築 ──
  const session: MorningSession = {
    sessionId: input.sessionId,
    pipelineVersion: "v2",
    phase,
    rawInputs: [input.utterance],
    personalizeHints: [],
    startedAt: new Date().toISOString(),
    plan,
    personalityContext: input.personalityContext,
    userPrefecture: input.userPrefecture,
    userCity: input.userCity,
    userHomeLabel: input.userHomeLabel ?? null,
    userHomeLat: input.userHomeLat ?? null,
    userHomeLng: input.userHomeLng ?? null,
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
