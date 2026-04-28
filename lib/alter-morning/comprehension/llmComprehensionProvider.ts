/**
 * L1.1 LLM Comprehension Provider — Comprehension-First v1.3+ Wave 3 (W3-PR-3)
 *
 * 設計書: docs/alter-morning-comprehension-first-wave3-design.md §7
 *
 * 責務:
 *   runMorningPipeline に差し込む `ComprehensionProvider` の実 LLM 実装。
 *   OpenAI Structured Outputs (L1_RESPONSE_FORMAT) を使って LLM に
 *   `{ targetDate, events[], startPoint, departureTime, goOut }` を生成させる。
 *
 * 設計原則:
 *   - LLM は event_id を付けない（L1.2 で deterministic に採番される）
 *   - 失敗時は **null を返す**（throw しない）。orchestrator が graceful fail
 *   - 成功時でも shape validation を行い、不正なら null
 *   - preParseUtterance の hints を system prompt に反映（LLM は override 可能）
 */

import "server-only";

import { runAI } from "@/lib/ai";
import type { ComprehensionProvider } from "../morningPipeline";
import type { L1PipelineInput } from "./l1Pipeline";
import type { RulePreParseHints } from "./rulePreParse";
import { formatHintsForPrompt } from "./rulePreParse";
import { L1_COMPREHENSION_SCHEMA } from "./structuredSchema";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prompt
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SYSTEM_PROMPT = `あなたは日本語のスケジュール解析 AI です。
ユーザー発話から「その日の予定（events）」を抽出し、必ず指定 JSON スキーマに従って出力してください。

重要ルール:
- 言及されていない slot は null にする（推測で埋めない）
- source_type="utterance" にするのは、発話に根拠文字列がある slot のみ
  - 該当する生片を source_span に入れる
- 発話から明示的に導けない補完は source_type="inferred" にする（=後段でチェックされる）
- 時刻は "HH:mm"（24h）形式。「朝」「昼」等は timeHint で表す
- 場所名は発話に出てきた記号をそのまま入れる（実解決は後段）
- who は人名・「友達」「同僚」等を配列で。言及なしは空配列
- turn_mode は "create"（この API は modify を扱わない）
- certainty: 断定なら asserted、「〜かも」「〜予定」は tentative、補完は inferred
- missing_semantic_critical は空配列でよい（後段 checker が再計算する）
- departureTime: 「8時に家を出る」等プラン全体の出発時刻を拾う
- goOut: 外出するかの boolean（不明なら null）

events 分割ルール（CEO 2026-04-28 重要）:
- 1 つの明示時刻に対して **1 つの event** が原則
  例: 「9時に渋谷のスタバ」→ events 1 件のみ
       誤: [{startTime:"09:00", place:"スタバ"}, {startTime:null, place:"渋谷"}]
       正: [{startTime:"09:00", place_ref:"渋谷のスタバ", placeType:"chain_brand"}]
- 「[地域]の[店舗/場所]」の複合表現は **1 つの where に統合** する
  例: 「渋谷のスタバ」「東京駅の丸善」「品川のドトール」→ place_ref に複合形を入れる
- 複数 events に分割するのは、明示的に **異なる時刻** が指示されたケースに限る
  例: 「9時にスタバ、12時にランチ」→ 2 events
- where 不明だが明らかに 1 event の発話で「移動」「立ち寄り」のための **時刻なし event を勝手に追加しない**
- when.startTime も when.timeHint も両方 null の event を作る場合、
  その event は「ユーザーが意図的に時刻を述べていない 2 件目以降の予定」である必要がある`;

function buildUserPrompt(utterance: string, hints: RulePreParseHints): string {
  const hintBlock = formatHintsForPrompt(hints);
  return [
    `発話:\n"${utterance}"`,
    hintBlock,
  ]
    .filter((s) => s && s.length > 0)
    .join("\n\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Shape validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * LLM structured output が L1_RESPONSE_FORMAT の shape を満たすかを最低限チェック。
 * strict: true でも念のため narrow する（後段で as 乱発を避ける）。
 */
function validateRawShape(x: unknown): x is L1PipelineInput["raw"] {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (typeof o.targetDate !== "string") return false;
  if (!Array.isArray(o.events)) return false;
  // startPoint / departureTime は null or object（schema が required: で列挙している）
  if (o.startPoint !== null && typeof o.startPoint !== "object") return false;
  if (o.departureTime !== null && typeof o.departureTime !== "object") return false;
  if (o.goOut !== null && typeof o.goOut !== "boolean") return false;
  return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Factory
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface LLMComprehensionProviderOptions {
  taskType?: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  userId?: string;
  sessionId?: string;
}

const DEFAULT_OPTS: Required<
  Pick<
    LLMComprehensionProviderOptions,
    "taskType" | "temperature" | "maxOutputTokens" | "timeoutMs"
  >
> = {
  taskType: "alter_morning_comprehension",
  // CEO 2026-04-28: temperature を 0.1 → 0 へ。「9時に渋谷のスタバ」のような
  // 単純な発話で LLM が確率的に events を過剰分割する観測あり。決定論を優先。
  // 多様性が必要な箇所は別 layer で確保（comprehension は分類タスク）。
  temperature: 0,
  maxOutputTokens: 2048,
  timeoutMs: 15_000,
};

/**
 * 実 LLM を使う ComprehensionProvider。
 *
 * 失敗パターン:
 *   - runAI throw / result.success=false    → null
 *   - structured 応答が shape 不正           → null
 *
 * orchestrator は null を受けたら status="comprehension_failed" で返すだけ。
 */
export function createLLMComprehensionProvider(
  options: LLMComprehensionProviderOptions = {},
): ComprehensionProvider {
  const opts = { ...DEFAULT_OPTS, ...options };

  return {
    async extract(utterance, hints) {
      const userPrompt = buildUserPrompt(utterance, hints);

      let result;
      try {
        result = await runAI({
          taskType: opts.taskType,
          prompt: userPrompt,
          systemPrompt: SYSTEM_PROMPT,
          jsonSchema: L1_COMPREHENSION_SCHEMA as Record<string, unknown>,
          requireJson: true,
          temperature: opts.temperature,
          maxOutputTokens: opts.maxOutputTokens,
          timeoutMs: opts.timeoutMs,
          userId: options.userId,
          sessionId: options.sessionId,
          metadata: {
            alterMorning: {
              layer: "L1.1",
              utteranceLength: utterance.length,
            },
          },
        });
      } catch (err) {
        console.warn("[alter-morning/comprehension] runAI threw", {
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }

      if (!result.success) {
        console.warn("[alter-morning/comprehension] runAI failed", {
          errorMessage: result.errorMessage,
          model: result.model,
        });
        return null;
      }

      const structured = result.structured;
      if (!validateRawShape(structured)) {
        console.warn("[alter-morning/comprehension] invalid shape", {
          model: result.model,
          hasStructured: Boolean(structured),
        });
        return null;
      }

      return structured;
    },
  };
}
