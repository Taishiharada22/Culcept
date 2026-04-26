/**
 * CoAlter M1 Candidate 2 — Stage 1 narration prefix builder
 *
 * ─────────────────────────────────────────────────────────────────────────
 * [CEO lock 2026-04-20 M1 C2]
 *   - proposalCard.summary / card.summary の **先頭に 1 行だけ** 付ける narrative。
 *   - 入力は Stage1Snapshot。outcome === "failed" のときは必ず null を返す
 *     （=「今日」を示唆しない）。
 *   - mode は TodayMode の 5 値に 1:1 対応。未知 mode は null を返す (fail-closed)。
 *   - implicitIntent は `modeLine + " — " + intent` の形で suffix として任意付与。
 *     UI 側の折返しを考慮して intent は 40 字を超える場合は付けない
 *     （原文を truncate しない = 事実改変しない方針）。
 *   - 副作用なし・pure。invoke route / test から同形で呼べる。
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Stage1Snapshot } from "./types";
import type { TodayMode } from "./understanding/types";
import type { EmotionTag } from "./emotion/types";

/** TodayMode → narrative 1 行（日本語）。mode を外から追加したときは必ずここに追記する。 */
const MODE_LINE: Record<TodayMode, string> = {
  recover: "今日はペース抑えめの流れ。",
  celebrate: "今日は気分を少し膨らませたい流れ。",
  connect: "今日は近づく時間を優先したい流れ。",
  challenge: "今日は少し踏み込みたい流れ。",
  maintain: "今日は平常運転の流れ。",
};

/** implicitIntent を suffix として付けるかの上限字数（超えたら mode line だけで止める）。 */
const INTENT_MAX_CHARS = 40;

/**
 * Stage1Snapshot から narration 先頭行を組む。
 *
 * 返り値:
 *   - null: failed / mode 欠損 / 未知 mode → 何も付けない（CEO lock）
 *   - string: 1 行。trailing 改行は呼び元が付ける。
 */
export function buildStage1Prefix(stage1: Stage1Snapshot | undefined): string | null {
  if (!stage1) return null;
  if (stage1.outcome === "failed") return null;

  const mode = stage1.todayReading?.mode;
  if (!mode) return null;
  const line = MODE_LINE[mode];
  if (!line) return null;

  const intent = stage1.todayReading.implicitIntent?.trim() ?? "";
  if (intent.length === 0) return line;
  if (intent.length > INTENT_MAX_CHARS) return line;
  return `${line} — ${intent}`;
}

/**
 * 既存 summary に narration を前置したものを返す。
 * prefix が null のときは元の summary をそのまま返す（mutation しない）。
 */
export function prependStage1Prefix(
  summary: string,
  stage1: Stage1Snapshot | undefined,
): string {
  const prefix = buildStage1Prefix(stage1);
  if (!prefix) return summary;
  return `${prefix}\n${summary}`;
}

/**
 * prependStage1Prefix の逆向き分解。
 *
 * [CEO lock 2026-04-20 M1 C2b] decision card 側で summary をレンダリングするとき、
 * clamp(summary, 100) が prefix と本文を区別せずに末尾から切ってしまうと
 * Stage 1 の 1 行が削れるケースが出る（prefix 最大 ≈60 字 + 本文で 100 字超過が起こる）。
 *
 * そこで `\n` を境界に prefix と body を分け、renderer は
 *   - prefix: 契約上 max ≈60 字で有界なので clamp しない
 *   - body: 既存 clamp(100) をそのまま適用
 * とすることで「prefix が削られる」事故を防ぐ。
 *
 * `\n` を含まない（= prepend が呼ばれていない / legacy flow）場合は
 * `prefix: null, body: 入力そのもの` を返すので、呼び元は prefix を見ずに
 * body を従来どおり clamp すれば behavior 互換。
 */
export function splitStage1Prefix(summary: string): {
  prefix: string | null;
  body: string;
} {
  const idx = summary.indexOf("\n");
  if (idx === -1) return { prefix: null, body: summary };
  return { prefix: summary.slice(0, idx), body: summary.slice(idx + 1) };
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 3B Layer 2-A — emotion_signals prompt block builder
//
// EmotionTag[] を LLM prompt 用の構造化テキスト block に変換する。
// 既存 stage1 narration prefix (CEO lock M1 C2、UI 表示用 1 行) とは
// 完全に独立した building block。orchestrator / proposalGenerator が
// prompt 内に挿入する想定（Layer 2-B 以降の caller）。
//
// 出力形式 (CEO 指定):
//   emotion_signals:
//   - speaker: user_a
//     category: mood
//   - speaker: both
//     category: friction
//
// 設計原則:
// - source_lexeme は出力に含めない (LLM が「気分」「すれ違い」等の具体語を
//   見て感情を決めつけるリスクを避ける、CEO Q-L2-2 α 方針)
// - speaker + category のみで「軽い補助信号」として LLM に渡す
// - 同一 (speaker, category) は dedupe
// - 出力順は入力順を維持 (test 安定性)
// - emotionTags が undefined / empty / 全 entry malformed → null
//   (= 何も挿入しない、CEO 指示「LLM の出力変化を最小化」)
// - 失敗独立条文 (§2.3) 遵守: 例外を投げない、不正 entry は skip
// ─────────────────────────────────────────────────────────────────────────

/** speaker enum の許可値（実行時 type guard 用） */
const VALID_SPEAKERS = ["user_a", "user_b", "both", "unknown"] as const;

/** category enum (= EmotionCategory) の許可値（実行時 type guard 用） */
const VALID_CATEGORIES = ["mood", "indecision", "relation", "friction"] as const;

/**
 * EmotionTag[] を prompt 用 emotion_signals block に変換する。
 *
 * @param emotionTags 入力の EmotionTag 配列。undefined / empty で null を返す。
 * @returns prompt 挿入用の構造化テキスト、または null（挿入しない）。
 */
export function buildEmotionSignalsBlock(
  emotionTags: EmotionTag[] | undefined,
): string | null {
  if (!Array.isArray(emotionTags) || emotionTags.length === 0) return null;

  const seen = new Set<string>();
  const lines: string[] = [];

  for (const tag of emotionTags) {
    if (!tag || typeof tag !== "object") continue;

    const speaker = (tag as EmotionTag).speaker;
    const category = (tag as EmotionTag).tag;

    if (typeof speaker !== "string" || typeof category !== "string") continue;
    if (!VALID_SPEAKERS.includes(speaker as (typeof VALID_SPEAKERS)[number])) continue;
    if (!VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number])) continue;

    const key = `${speaker}:${category}`;
    if (seen.has(key)) continue;
    seen.add(key);

    lines.push(`- speaker: ${speaker}`);
    lines.push(`  category: ${category}`);
  }

  if (lines.length === 0) return null;

  return ["emotion_signals:", ...lines].join("\n");
}
