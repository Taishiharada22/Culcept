/**
 * L3.1 Narration — Comprehension-First v1.3+ Wave 2
 *
 * 設計書: docs/alter-morning-comprehension-first-wave2-design.md §3
 *
 * 責務:
 *   plan graph（ComprehensionResult + TimeLine + GroundedPlace[]）を入力に、
 *   自然な日本語 narration を生成する。
 *
 * 設計原則（CEO 補足: Wave 2 で一番大事なのは Narration を plan graph に従属させること）:
 *   - plan graph にない予定を追加しない
 *   - plan graph にない時刻・場所を推測で補わない
 *   - tentative slot は「〜あたり」「〜かも」で揺らす
 *   - 時刻は HH:mm（24時間）固定
 *   - who は言及されている場合のみ
 *
 * Wave 2 スコープ（Q-2=B: contract + stub まで。LLM provider 配線は別 PR）:
 *   - NarrationInput / NarrationOutput の contract を確定
 *   - deterministic stub (`stubNarrator`) を提供
 *   - 実 LLM provider 配線は narrationProvider interface で注入可能な形
 */

import type { ComprehensionResult, Event } from "../comprehension/eventSchema";
import type { TimeLine } from "../planning/timeSolver";
import type { GroundedPlace } from "../planning/placeGrounder";
import { resolveDisplayName } from "../planning/placeGrounder";
import type { FaithfulnessViolation } from "./faithfulnessChecker";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface NarrationInput {
  comprehension: ComprehensionResult;
  timeline: TimeLine;
  grounded: GroundedPlace[];
  /**
   * retry 時に前回の faithfulness violations を渡す（LLM prompt に注入）。
   * stub narrator は無視してよい。
   */
  feedback?: FaithfulnessViolation[];
}

export interface NarrationOutput {
  /** 語られた本文 */
  text: string;
  /** narration 内で参照した event_id 列 */
  covered_event_ids: string[];
  /** provider metadata */
  metadata?: {
    model?: string;
    tokens?: number;
    strategy?: "llm" | "stub" | "deterministic_fallback";
  };
}

/**
 * LLM provider を注入するための interface。
 * Wave 2 では stub 実装のみ。Wave 2 末尾 PR で OpenAI 実装を差し込む。
 */
export interface NarrationProvider {
  narrate: (input: NarrationInput) => Promise<NarrationOutput>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Stub narrator (deterministic)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * plan graph を日本語文字列に機械的に畳み込む stub 実装。
 *
 * 形式:
 *   "9時にサドヤでコーヒー。"
 *   "12時にランチ、田中と。"
 *   "15時あたりにカフェ（予定）。"
 *
 * tentative には "あたり" + "（予定）" を付加して hedge を保証する。
 * Wave 2 contract test で使う安定 narrator。
 */
export function stubNarrate(input: NarrationInput): NarrationOutput {
  const { comprehension, timeline, grounded } = input;

  const groundedById = new Map(grounded.map((g) => [g.event_id, g]));
  const entryById = new Map(timeline.entries.map((e) => [e.event_id, e]));

  const parts: string[] = [];
  const covered: string[] = [];

  for (const ev of comprehension.events) {
    const entry = entryById.get(ev.event_id);
    const g = groundedById.get(ev.event_id);

    // 時刻
    const timePart = entry?.startTime ? formatTimeJa(entry.startTime) : null;

    // 場所
    const placePart = g ? resolveDisplayName(g) : ev.where.place_ref;

    // 活動
    const activityPart = ev.what.activity || ev.what.activityCanonical;

    // 同行者
    const companionPart =
      ev.who.length > 0 ? `${ev.who.join("、")}と` : null;

    // hedge
    const isTentative = ev.certainty === "tentative";
    const timeToken = timePart
      ? isTentative
        ? `${timePart}あたり`
        : `${timePart}`
      : null;

    // 組み立て
    const chunks: string[] = [];
    if (timeToken) chunks.push(`${timeToken}に`);
    if (placePart) chunks.push(`${placePart}で`);
    if (activityPart) chunks.push(activityPart);
    if (companionPart) chunks.push(`（${companionPart}）`);

    let sentence = chunks.join("");
    if (isTentative) sentence += "（予定）";
    sentence += "。";

    if (sentence.trim() && sentence !== "。") {
      parts.push(sentence);
      covered.push(ev.event_id);
    }
  }

  return {
    text: parts.join(""),
    covered_event_ids: covered,
    metadata: { strategy: "stub" },
  };
}

/**
 * "09:00" → "9時", "12:30" → "12時30分"
 */
function formatTimeJa(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (mm === 0) return `${hh}時`;
  if (mm === 30) return `${hh}時半`;
  return `${hh}時${mm}分`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Deterministic fallback (最終 fallback 用)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * L3 pipeline が 2 回 retry しても違反が残る場合の最終 fallback。
 * plan graph をミニマル直列化（誤解の余地がない最低限）。
 */
export function serializePlanDeterministic(
  input: NarrationInput,
): NarrationOutput {
  const { comprehension, timeline, grounded } = input;
  const groundedById = new Map(grounded.map((g) => [g.event_id, g]));
  const entryById = new Map(timeline.entries.map((e) => [e.event_id, e]));

  const parts: string[] = [];
  const covered: string[] = [];

  for (const ev of comprehension.events) {
    const entry = entryById.get(ev.event_id);
    const g = groundedById.get(ev.event_id);
    const chunks: string[] = [];
    if (entry?.startTime) chunks.push(entry.startTime);
    const place = g ? resolveDisplayName(g) : ev.where.place_ref;
    if (place) chunks.push(place);
    if (ev.what.activity) chunks.push(ev.what.activity);
    if (chunks.length > 0) {
      parts.push(chunks.join(" / "));
      covered.push(ev.event_id);
    }
  }

  return {
    text: parts.join(" / "),
    covered_event_ids: covered,
    metadata: { strategy: "deterministic_fallback" },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Provider factories
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * stub provider（Wave 2 デフォルト）。
 */
export const stubNarrationProvider: NarrationProvider = {
  narrate: async (input: NarrationInput) => stubNarrate(input),
};

/**
 * LLM 不要の unused-var 抑止
 */
void ({} as Event);
