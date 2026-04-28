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
- turn_mode は "create" / "append" / "modify" の 3-way（下記 turn_mode ルール参照）
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
  その event は「ユーザーが意図的に時刻を述べていない 2 件目以降の予定」である必要がある

turn_mode 判別ルール（CEO 2026-04-28 PR #41a 拡張）:
- **prior plan が空 / context が無い** → 全 events を turn_mode="create"
- **prior plan が存在する場合** (USER_PROMPT に [prior plan context] block あり):
  - 発話が **新しい予定を追加** する内容 → turn_mode="append"
    例: 「このあと武藤さんとディナー」「夕方に新宿で買い物追加」
  - 発話が **既存予定の変更** → turn_mode="modify" + target_ref を埋める
    target_ref は prior plan の event を指すヒント文字列（"朝の予定" / "ランチ" / "最後の予定" 等）
    change_scope を必ず指定（"replace" / "patch" / "append" / "remove"）
    例: 「9時を10時に変える」 → turn_mode="modify", target_ref="朝の予定", change_scope="patch"
- **重要な禁則**:
  - prior plan の event を **再抽出してはいけない**（duplicate 防止）
  - 今 turn の utterance に書かれた **新規 events のみ** 出力する
  - prior と同じ予定を再度 events に入れない（LLM がコピーすると plan が重複する）`;

function buildUserPrompt(
  utterance: string,
  hints: RulePreParseHints,
  priorContext?: ReadonlyArray<{
    event_id: string;
    startTime: string | null;
    place_ref: string | null;
    activity: string;
  }>,
): string {
  const hintBlock = formatHintsForPrompt(hints);
  // CEO 2026-04-28 PR #41a Layer 2: prior plan context を含める
  //   軽量化のため簡略化形 (event_id / startTime / place_ref / activity) のみ。
  //   LLM はこれを context として参照し、turn_mode を判別する。
  //   再抽出禁止は SYSTEM_PROMPT で明示。
  const priorBlock =
    priorContext && priorContext.length > 0
      ? [
          "[prior plan context]",
          "以下は既に確定済みの予定。**再抽出禁止**。今 turn の発話を classify する材料として使う:",
          ...priorContext.map((ev, idx) => {
            const time = ev.startTime ?? "(時刻未定)";
            const place = ev.place_ref ?? "(場所未定)";
            const activity = ev.activity || "(活動未定)";
            return `  ${idx + 1}. event_id=${ev.event_id} time=${time} place=${place} activity=${activity}`;
          }),
        ].join("\n")
      : "";
  return [
    `発話:\n"${utterance}"`,
    hintBlock,
    priorBlock,
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
    async extract(utterance, hints, priorContext) {
      // CEO 2026-04-28 PR #41a Layer 2: priorContext が渡された場合 prompt に
      //   [prior plan context] block を埋め込む。LLM が turn_mode を 3-way 判別する。
      const userPrompt = buildUserPrompt(utterance, hints, priorContext);

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
