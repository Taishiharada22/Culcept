/**
 * L3.1 LLM Narration Provider — Comprehension-First v1.3+ Wave 2 末尾 PR
 *
 * 責務:
 *   NarrationProvider interface に実 LLM (runAI) を差し込む。
 *
 * 設計原則（Wave 2 北極星 / CEO 承認 A の成功条件）:
 *   1. plan graph にない時刻・場所を narration が増やさない
 *      → prompt で明示禁止 + L3.2 Faithfulness Checker で事後検証
 *   2. tentative を断定しない
 *      → prompt で hedge 要求 + L3.2 で hedge 検出
 *   3. L3.2 で弾かれた時に retry → deterministic fallback が機能する
 *      → pipeline が feedback 付きで再度 narrate を呼ぶ。provider は feedback を prompt に注入
 *   4. 実機で "通じている感" が最低限出る
 *      → LLM の自然言語生成 + strict JSON schema
 *
 * provider 自体は LLM 失敗時に throw せず、空 narration を返す。
 * pipeline が violations ベースで retry→fallback を判断する。
 */

import "server-only";

import { runAI } from "@/lib/ai";
import type {
  NarrationInput,
  NarrationOutput,
  NarrationProvider,
} from "./narration";
import {
  NARRATION_RESPONSE_SCHEMA,
  buildNarrationPrompt,
} from "./llmNarrationPrompt";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Config
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface LLMNarrationProviderOptions {
  /** runAI に渡す taskType（telemetry / routing 用） */
  taskType?: string;
  /** 温度（低めに。narration は創作ではなく読み上げ） */
  temperature?: number;
  /** 出力上限トークン */
  maxOutputTokens?: number;
  /** タイムアウト (ms) */
  timeoutMs?: number;
  /** テレメトリ: userId */
  userId?: string;
  /** テレメトリ: sessionId */
  sessionId?: string;
}

const DEFAULT_OPTIONS: Required<Pick<LLMNarrationProviderOptions, "taskType" | "temperature" | "maxOutputTokens" | "timeoutMs">> = {
  taskType: "alter_morning_narration",
  temperature: 0.3,
  maxOutputTokens: 512,
  timeoutMs: 15_000,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Response parser
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ParsedNarration {
  text: string;
  covered_event_ids: string[];
}

/**
 * structured 出力または text 出力から NarrationOutput フィールドを取り出す。
 * - structured が object かつ期待形状なら優先
 * - text が JSON 文字列ならそれを parse
 * - どちらもダメなら null
 */
export function parseNarrationResponse(
  structured: unknown,
  text: string,
): ParsedNarration | null {
  const tryShape = (raw: unknown): ParsedNarration | null => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const obj = raw as Record<string, unknown>;
    const t = obj.text;
    const ids = obj.covered_event_ids;
    if (typeof t !== "string") return null;
    if (!Array.isArray(ids)) return null;
    const idStrings = ids.filter((v): v is string => typeof v === "string");
    return { text: t, covered_event_ids: idStrings };
  };

  const fromStructured = tryShape(structured);
  if (fromStructured) return fromStructured;

  // text が JSON 文字列のケース（Gemini など structured を常に出さない場合）
  if (text && typeof text === "string") {
    const trimmed = text.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed);
        const fromText = tryShape(parsed);
        if (fromText) return fromText;
      } catch {
        // fall through
      }
    }
  }

  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Provider factory
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 実 LLM narrator を返すファクトリ。
 *
 * 失敗時の挙動（pipeline と契約）:
 *   - LLM が throw: catch して空 narration を返す → pipeline が retry / fallback
 *   - structured 応答が不正: 空 narration を返す → 同上
 *   - 成功: { text, covered_event_ids, metadata: { strategy: "llm", model } }
 *
 * pipeline が deterministic fallback の最終責任を持つため、provider は
 * 「できる限り自然な narration を試みる」以上の責務を負わない。
 */
export function createLLMNarrationProvider(
  options: LLMNarrationProviderOptions = {},
): NarrationProvider {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return {
    narrate: async (input: NarrationInput): Promise<NarrationOutput> => {
      const { systemPrompt, userPrompt } = buildNarrationPrompt(input);

      let result;
      try {
        result = await runAI({
          taskType: opts.taskType,
          prompt: userPrompt,
          systemPrompt,
          jsonSchema: NARRATION_RESPONSE_SCHEMA,
          requireJson: true,
          temperature: opts.temperature,
          maxOutputTokens: opts.maxOutputTokens,
          timeoutMs: opts.timeoutMs,
          userId: options.userId,
          sessionId: options.sessionId,
          metadata: {
            alterMorning: {
              layer: "L3.1",
              retryAttempt: input.feedback ? "retry" : "initial",
              eventCount: input.comprehension.events.length,
            },
          },
        });
      } catch (err) {
        // runAI は通常 throw しないが念のため
        return emptyNarration(
          "llm_error",
          err instanceof Error ? err.message : String(err),
        );
      }

      if (!result.success) {
        return emptyNarration(
          "llm_failed",
          result.errorMessage ?? null,
          result.model,
        );
      }

      const parsed = parseNarrationResponse(result.structured, result.text);
      if (!parsed) {
        return emptyNarration("invalid_response_shape", null, result.model);
      }

      return {
        text: parsed.text,
        covered_event_ids: parsed.covered_event_ids,
        metadata: {
          strategy: "llm",
          model: result.model,
          // tokens は runAI の result には直接含まれないため割愛
        },
      };
    },
  };
}

/**
 * LLM 失敗時の empty output。
 * pipeline が violation 検出 → retry → deterministic fallback で救う前提。
 *
 * 注: reason / errorMessage は NarrationOutput.metadata の型が固定のため
 *     現時点では捨てている（Wave 3 で metadata 拡張する場合に検討）。
 *     console.warn で観測可能にしておく。
 */
function emptyNarration(
  reason: string,
  errorMessage: string | null = null,
  model?: string,
): NarrationOutput {
  if (errorMessage) {
    console.warn("[alter-morning/narration] llm provider empty output", {
      reason,
      errorMessage,
      model,
    });
  } else {
    console.warn("[alter-morning/narration] llm provider empty output", {
      reason,
      model,
    });
  }
  return {
    text: "",
    covered_event_ids: [],
    metadata: {
      strategy: "llm",
      model,
    },
  };
}
