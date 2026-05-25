/**
 * Phase 3-N Plan P2 Step 1 — alterNote prompt builder (= pure module)
 *
 * 設計書: docs/alter-plan-p2-llm-readiness.md v2
 *
 * 設計原則 (= CEO + GPT 合議 2026-05-25):
 *   - **pure module** (= LLM / API / DB / network 不使用、 入力 mutate なし)
 *   - **system prompt は Aneurasync 文体規約** (= 中立、 命令形 / 評価語 禁止、 8-22 字 目安)
 *   - **user prompt は context の構造化テキスト化** (= category / time / location / title を tag 形式)
 *   - **Step 2 拡張余地**: PersonalModelSummary を system prompt に追加可能なように分離
 *
 * 文体規約 (= List `categoryMeaning.ts` 既存 deterministic と整合):
 *   - 状態描写型 / 観測寄り
 *   - 「ましょう」 OK (= mock 文体準拠、 List 8b-8 で緩和済)
 *   - 強い命令形 (= 「しなさい」 「しろ」) 0
 *   - 評価形容詞 (= 「最適」 「重要」 「良いプラン」) 0
 *   - 押し付け / 推奨 / 警告 / 危険 / 注意 / リスク / 改善 系語彙 0 (= 禁止語 10 件)
 *   - 8-22 字 自然な長さ (= List 既存基準を踏襲)
 *
 * 設計書:
 *   - lib/plan/list/categoryMeaning.ts (= deterministic 既存 baseline)
 *   - lib/plan/llm/types.ts (= AlterNoteContext)
 *   - lib/plan/llm/alterNoteValidator.ts (= 出力 post-check で同 規約を機械検証)
 */

import type { AlterNoteContext } from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// System prompt (= Aneurasync 文体規約)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Base system prompt (= Step 1、 Personal Model なし)
 *
 * Step 2 で `buildSystemPromptWithPersonalModel` を追加し、 short tag を追記する。
 */
const SYSTEM_PROMPT_BASE = [
  "あなたは Aneurasync の予定解釈アシスタントです。",
  "ユーザーが教えてくれた 1 件の予定について、 8〜22 字の短い 「観測的な意味文」 を 1 文だけ返してください。",
  "",
  "目的:",
  "  - ユーザー自身が予定の流れを掴むための、 静かな 「状態描写」 を提供する。",
  "  - 評価や推奨はしない。 観測者の視点で、 場面 / ペース / 質感 を一言で添える。",
  "",
  "文体ルール:",
  "  - 自然な日本語、 8〜22 字程度。",
  "  - 「ましょう」 「しよう」 は OK (= 柔らかい誘い)。",
  "  - 強い命令形 (「しなさい」 「すべき」) は禁止。",
  "  - 評価形容詞 (「最適」 「重要」 「良い」 「悪い」 「ベスト」) は禁止。",
  "  - 押し付け語 (「おすすめ」 「推奨」 「改善」 「警告」 「危険」 「注意」 「リスク」 「最適化」) は禁止。",
  "  - 数値 (% / 〜時間 / 〜分) は出さない。",
  "  - 絵文字は出さない。",
  "  - 1 文のみ。 改行・箇条書きしない。",
  "",
  "出力形式:",
  "  - JSON: { \"text\": \"<8-22 字の意味文>\" }",
  "  - text 以外のフィールド禁止。",
  "  - 意味を読み取れない場合: { \"text\": \"\" } (= 空文字)。",
].join("\n");

/**
 * Step 1: system prompt 取得 (= Personal Model なし、 base のみ)
 *
 * Step 2 で PersonalModelSummary を受け取り、 base + short tag 文に拡張する関数を追加予定。
 * Step 1 では context.personalModel は無視する (= undefined 固定前提)。
 */
export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT_BASE;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// User prompt (= context の構造化)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Category 日本語ラベル (= prompt 用、 user prompt に category を natural な形で含める)
 */
const CATEGORY_LABEL: Record<AlterNoteContext["category"], string> = {
  cafe: "カフェ",
  meal: "食事",
  work: "仕事 / 学習 / 業務",
  home: "自宅",
  other: "その他",
};

/**
 * "HH:MM" → 時刻帯ラベル (= 「朝 / 昼 / 午後 / 夜 / 深夜」)
 */
function timeOfDayLabel(hhmm: string): string {
  const hour = Number.parseInt(hhmm.slice(0, 2), 10);
  if (Number.isNaN(hour)) return "(時刻不明)";
  if (hour >= 5 && hour < 11) return "朝";
  if (hour >= 11 && hour < 14) return "昼";
  if (hour >= 14 && hour < 18) return "午後";
  if (hour >= 18 && hour < 23) return "夜";
  return "深夜";
}

/**
 * User prompt 生成 (= context → 構造化テキスト、 LLM 入力)
 *
 * - tag 形式 (= 「カテゴリ:」 「時刻帯:」 等) で LLM に context を渡す
 * - title / location が未指定 (= undefined) なら該当行を出さない (= prompt token 節約)
 * - 1 件の anchor に対する 1 prompt
 *
 * 注: pure、 deterministic、 入力 mutate なし、 同 context → 同 prompt (= cache hit 期待)
 */
export function buildUserPrompt(ctx: AlterNoteContext): string {
  const lines: string[] = [];
  lines.push(`カテゴリ: ${CATEGORY_LABEL[ctx.category]}`);
  lines.push(`時刻帯: ${timeOfDayLabel(ctx.startTime)} (${ctx.startTime}${ctx.endTime ? `-${ctx.endTime}` : ""})`);
  if (ctx.title !== undefined && ctx.title.length > 0) {
    lines.push(`予定タイトル: ${ctx.title}`);
  }
  if (ctx.location !== undefined && ctx.location.length > 0) {
    lines.push(`場所: ${ctx.location}`);
  }
  lines.push("");
  lines.push("この 1 件の予定について、 8〜22 字の観測的な意味文を 1 文だけ JSON で返してください。");
  return lines.join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 統合 builder (= system + user の 1 度取得)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Build alterNote LLM prompt (= 統合 entry、 alterNoteGenerator から呼出)
 *
 * Step 2 で PersonalModelSummary を受けて system prompt 拡張可能 (= signature 拡張余地)。
 * Step 1 では context.personalModel は無視。
 */
export function buildAlterNotePrompt(ctx: AlterNoteContext): {
  readonly systemPrompt: string;
  readonly userPrompt: string;
} {
  return {
    systemPrompt: buildSystemPrompt(),
    userPrompt: buildUserPrompt(ctx),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// JSON schema (= requireJson 用、 runAI に渡す)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * LLM 出力の JSON schema (= runAI requireJson=true で使用)
 *
 * minLength=0 (= 「読めない」 時に空文字を許可、 validator で空文字を unavailable に変換)
 * maxLength=60 (= 余裕を持って 60 字、 validator で 6-30 字に絞り込み)
 */
export const ALTER_NOTE_JSON_SCHEMA = {
  type: "object",
  properties: {
    text: {
      type: "string",
      minLength: 0,
      maxLength: 60,
    },
  },
  required: ["text"],
  additionalProperties: false,
} as const;
