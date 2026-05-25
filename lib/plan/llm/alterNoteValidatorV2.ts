/**
 * Phase 3-N Plan P2 Step 2 v3.1 — alterNote 出力 validator V2 (= 8 段検証)
 *
 * 設計書: docs/alter-plan-p2-llm-step2-readiness-v3.md §4.2.3 (= v3.1 更新)
 *
 * 設計原則 (= CEO + GPT 2026-05-25 Q5 補正反映):
 *   - **pure module** (= LLM / API / DB / network 不使用、 入力 mutate なし)
 *   - **V1 の 5 段 + V2 の 3 段 = 計 8 段** (= empty / length / forbidden_word / forbidden_tone /
 *     forbidden_char + generic_self_help + missing_fact_acknowledgment + missing_interpretation)
 *   - **fail-open** (= 違反検出時は呼出側で deterministic fallback)
 *
 * V1 validator との差:
 *   - V1: 5 段 (= empty / length / forbidden_word / forbidden_tone / forbidden_char)
 *   - V2: + 3 段 (= generic_self_help + missing_fact_acknowledgment + missing_interpretation)
 *
 * GPT Q5 補正:
 *   - 「自然だけど平均的」 文を弾く generic_self_help detector
 *   - ALTER_NOTE_CONTRACT_V2.genericSelfHelpPatterns を流用
 *
 * 設計書 references:
 *   - lib/plan/llm/alterNoteValidator.ts (= V1 validator、 invariant 共有)
 *   - lib/plan/llm/outputContract.ts (= ALTER_NOTE_CONTRACT_V2 + genericSelfHelpPatterns)
 */

import { ALTER_NOTE_CONTRACT_V2 } from "./outputContract";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// V1 と invariant 共有 (= 禁止語 / tone / char)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const FORBIDDEN_WORDS: ReadonlyArray<string> = [
  "おすすめ",
  "これをした方がいい",
  "最適",
  "推奨",
  "改善",
  "警告",
  "危険",
  "注意",
  "リスク",
  "最適化",
];

const FORBIDDEN_TONE: ReadonlyArray<string> = [
  "しなさい",
  "すべき",
  "してください",
  "するな",
  "するべからず",
  "重要",
  "大事な",
  "ベスト",
  "良いプラン",
  "良い予定",
  "悪い",
];

const NUMERIC_PATTERN = /[0-9０-９]+\s*(?:%|％|分|時間|日|秒|円)/;
const FORBIDDEN_CHAR_PATTERN = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\n\r\t]/u;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Validation 結果型 (= V2、 V1 の reason に 3 種追加)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type AlterNoteValidationResultV2 =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: AlterNoteValidationReasonV2 };

export type AlterNoteValidationReasonV2 =
  | "empty"
  | "length_out_of_range"
  | "forbidden_word"
  | "forbidden_tone"
  | "forbidden_char"
  | "generic_self_help"           // ← V2 新規 (GPT Q5 補正)
  | "missing_fact_acknowledgment" // ← V2 新規
  | "missing_interpretation";     // ← V2 新規

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 検証 (= 8 段、 readiness §4.2.3 v3.1 順序通り)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * V2 出力検証 (= 8 段)
 *
 * 検証順序 (= readiness v3.1 final):
 *   1. forbidden_char (= 数値 / 絵文字 / 改行)
 *   2. empty
 *   3. length 6-30 字
 *   4. forbidden_word
 *   5. forbidden_tone
 *   6. generic_self_help (= 新規、 平均文 pattern)
 *   7. missing_fact_acknowledgment (= contract field detector)
 *   8. missing_interpretation (= contract field detector)
 *
 * - 全 PASS → ok=true、 trim 済 text return
 * - 違反 → ok=false、 reason
 */
export function validateAlterNoteOutputV2(rawText: string): AlterNoteValidationResultV2 {
  // 1. forbidden_char (= raw のままで check、 改行検出のため事前)
  if (FORBIDDEN_CHAR_PATTERN.test(rawText)) {
    return { ok: false, reason: "forbidden_char" };
  }

  const text = rawText.trim();

  // 2. empty
  if (text.length === 0) {
    return { ok: false, reason: "empty" };
  }

  // 3. length 6-30
  if (
    text.length < ALTER_NOTE_CONTRACT_V2.minLength ||
    text.length > ALTER_NOTE_CONTRACT_V2.maxLength
  ) {
    return { ok: false, reason: "length_out_of_range" };
  }

  // 4. forbidden_word
  for (const word of FORBIDDEN_WORDS) {
    if (text.includes(word)) {
      return { ok: false, reason: "forbidden_word" };
    }
  }

  // 5. forbidden_tone
  for (const tone of FORBIDDEN_TONE) {
    if (text.includes(tone)) {
      return { ok: false, reason: "forbidden_tone" };
    }
  }

  // 5b. 数値 (= forbidden_char の補強)
  if (NUMERIC_PATTERN.test(text)) {
    return { ok: false, reason: "forbidden_char" };
  }

  // 6. generic_self_help (= V2 新規、 GPT Q5 補正)
  for (const pattern of ALTER_NOTE_CONTRACT_V2.genericSelfHelpPatterns) {
    if (pattern.test(text)) {
      return { ok: false, reason: "generic_self_help" };
    }
  }

  // 7. missing_fact_acknowledgment (= contract field detector)
  const factField = ALTER_NOTE_CONTRACT_V2.fields.find((f) => f.name === "fact_acknowledgment");
  if (factField && factField.required && !factField.detector.test(text)) {
    return { ok: false, reason: "missing_fact_acknowledgment" };
  }

  // 8. missing_interpretation
  const interpField = ALTER_NOTE_CONTRACT_V2.fields.find((f) => f.name === "interpretation");
  if (interpField && interpField.required && !interpField.detector.test(text)) {
    return { ok: false, reason: "missing_interpretation" };
  }

  // 全 PASS
  return { ok: true, text };
}
