/**
 * CoAlter Stage 2 — Speech Validator (L2-m)
 *
 * 正本:
 *   - speech template §1.2.1 発話トーン運用原則 6 項目 (発話文面 checker 対象)
 *   - speech template §2 共通禁止表現 (語彙レベル)
 *   - speech template §1.3 声の在り方 (絵文字・感嘆符禁止)
 *
 * 責務:
 *   - LLM 出力の文字列を §2 語彙禁止 + §1.3 世界観違反で機械判定
 *   - 6 項目 (§1.2.1 #1-#6) ごとに分類された違反検出
 *   - 文長制約 (LengthOverride) 違反検出
 *
 * 非責務:
 *   - LLM 呼び出し (本 phase は文字列 in / 結果 out の純検査)
 *   - §2.8 routing-level 違反 (本 validator は文面のみ、routing は patternSelector で分離)
 *   - mainstream plan の Bug-1 lexeme 整合は import 経由で参照 (dual source 禁止、
 *     本書で別途定義しない)
 */

import type { LengthOverride } from "./speechTypes";

// ─────────────────────────────────────────────
// §1.2.1 6 項目分類
// ─────────────────────────────────────────────

export type SpeechViolationKind =
  | "judgmental"        // §1.2.1 #1 裁定
  | "evaluative"        // §1.2.1 #2 評定
  | "speak_for_other"   // §1.2.1 #3 代弁
  | "premature_certainty" // §1.2.1 #4 勝手に確定
  | "interrogative"     // §1.2.1 #5 尋問化
  | "cornering"         // §1.2.1 #6 追い詰め
  | "worldview"         // §1.3 世界観違反 (絵文字・感嘆符等)
  | "length_violation"; // LengthOverride 違反

// ─────────────────────────────────────────────
// 禁止語彙リスト (speech template §2.2-§2.7 / §2.9)
// ─────────────────────────────────────────────

interface ViolationRule {
  kind: SpeechViolationKind;
  pattern: RegExp;
  example: string;
}

/**
 * §2.2 裁定語彙 (§1.2.1 #1)。
 */
const JUDGMENTAL_PATTERNS: ViolationRule[] = [
  { kind: "judgmental", pattern: /正しい|間違っている|間違い/, example: "正しい / 間違っている" },
  { kind: "judgmental", pattern: /正解|不正解/, example: "正解 / 不正解" },
  { kind: "judgmental", pattern: /すべき|べきでない|べきです/, example: "〜すべき" },
  { kind: "judgmental", pattern: /おかしい|変だ|変です/, example: "おかしい / 変だ" },
  { kind: "judgmental", pattern: /普通は|常識的に/, example: "普通は / 常識的に" },
];

/**
 * §2.3 代弁語彙 (§1.2.1 #3)。
 */
const SPEAK_FOR_OTHER_PATTERNS: ViolationRule[] = [
  { kind: "speak_for_other", pattern: /と思っているはず|に違いない/, example: "〜と思っているはず" },
  { kind: "speak_for_other", pattern: /きっと.*だろう/, example: "きっと〜だろう" },
  { kind: "speak_for_other", pattern: /本当は.*感じ/, example: "本当は〜と感じ" },
];

/**
 * §2.4 評定語彙 (§1.2.1 #2)。
 */
const EVALUATIVE_PATTERNS: ViolationRule[] = [
  { kind: "evaluative", pattern: /上手|下手/, example: "上手 / 下手" },
  { kind: "evaluative", pattern: /素晴らしい|ひどい/, example: "素晴らしい / ひどい" },
  { kind: "evaluative", pattern: /大人げない|子供っぽい/, example: "大人げない / 子供っぽい" },
  { kind: "evaluative", pattern: /偉い|えらくない/, example: "偉い / えらくない" },
];

/**
 * §2.5 尋問語彙 (§1.2.1 #5)。
 */
const INTERROGATIVE_PATTERNS: ViolationRule[] = [
  { kind: "interrogative", pattern: /^なぜ\?$|^なぜ？$/, example: "なぜ？単独" },
  { kind: "interrogative", pattern: /^どうして\?$|^どうして？$/, example: "どうして？単独" },
  { kind: "interrogative", pattern: /本当に\?|本当に？/, example: "本当に？" },
  { kind: "interrogative", pattern: /^それで\?|^それで？|^で\?$/, example: "それで？/ で？" },
  { kind: "interrogative", pattern: /ちゃんと.*しましたか/, example: "ちゃんと〜しましたか" },
];

/**
 * §2.6 追い詰め語彙 (§1.2.1 #6)。
 */
const CORNERING_PATTERNS: ViolationRule[] = [
  { kind: "cornering", pattern: /今決めてください/, example: "今決めてください" },
  { kind: "cornering", pattern: /他に選択肢はありません/, example: "他に選択肢はありません" },
  { kind: "cornering", pattern: /やるしかない|するしかない/, example: "やるしかない" },
  { kind: "cornering", pattern: /避けられない|不可避/, example: "避けられない" },
  { kind: "cornering", pattern: /誰のせい/, example: "誰のせい" },
];

/**
 * §1.3 世界観違反 (絵文字・顔文字・感嘆符・ハート)。
 */
const WORLDVIEW_PATTERNS: ViolationRule[] = [
  // 感嘆符 (ASCII / 全角)
  { kind: "worldview", pattern: /[!！]/, example: "感嘆符 ! / ！" },
  // ハート (♥ / ♡ / 🩷 等)
  { kind: "worldview", pattern: /[♥♡]/, example: "ハート ♥ / ♡" },
  // 絵文字範囲 (U+1F300-U+1FAFF surrogate pairs)
  // eslint-disable-next-line no-misleading-character-class
  { kind: "worldview", pattern: /[\uD83C-\uD83E][\uDC00-\uDFFF]/u, example: "絵文字" },
  // 一人称男性形
  { kind: "worldview", pattern: /(^|\s|「|『)僕(\s|は|が|の|と|を|に|で)/, example: "一人称「僕」" },
  { kind: "worldview", pattern: /(^|\s|「|『)俺(\s|は|が|の|と|を|に|で)/, example: "一人称「俺」" },
];

const ALL_RULES: ViolationRule[] = [
  ...JUDGMENTAL_PATTERNS,
  ...SPEAK_FOR_OTHER_PATTERNS,
  ...EVALUATIVE_PATTERNS,
  ...INTERROGATIVE_PATTERNS,
  ...CORNERING_PATTERNS,
  ...WORLDVIEW_PATTERNS,
];

// ─────────────────────────────────────────────
// 出力型
// ─────────────────────────────────────────────

export interface SpeechViolation {
  kind: SpeechViolationKind;
  example: string;
  matchedText: string;
}

export interface ValidateResult {
  ok: boolean;
  violations: SpeechViolation[];
}

// ─────────────────────────────────────────────
// Validator 本体
// ─────────────────────────────────────────────

/**
 * §2 共通禁止表現 + §1.3 世界観違反のチェック。
 *
 * すべてのルールを走査し、ヒットした違反を列挙する。
 */
export function validateSpeechLexicon(text: string): ValidateResult {
  const violations: SpeechViolation[] = [];
  for (const rule of ALL_RULES) {
    const m = text.match(rule.pattern);
    if (m) {
      violations.push({
        kind: rule.kind,
        example: rule.example,
        matchedText: m[0],
      });
    }
  }
  return { ok: violations.length === 0, violations };
}

/**
 * §2.5 尋問語彙: 連続疑問文 (1 発話 ?  2 個以上) を検出する。
 */
export function validateQuestionCount(
  text: string,
  maxQuestions: number,
): ValidateResult {
  const matches = text.match(/[?？]/g) ?? [];
  const count = matches.length;
  if (count > maxQuestions) {
    return {
      ok: false,
      violations: [
        {
          kind: "interrogative",
          example: `1 発話 ? は ${maxQuestions} 個まで`,
          matchedText: `${count} 個検出`,
        },
      ],
    };
  }
  return { ok: true, violations: [] };
}

/**
 * LengthOverride 違反 (文数 / 文字数)。
 */
export function validateLength(
  text: string,
  override: LengthOverride,
): ValidateResult {
  const sentences = splitSentences(text);
  const violations: SpeechViolation[] = [];
  if (sentences.length < override.minSentences) {
    violations.push({
      kind: "length_violation",
      example: `min ${override.minSentences} 文`,
      matchedText: `${sentences.length} 文`,
    });
  }
  if (sentences.length > override.maxSentences) {
    violations.push({
      kind: "length_violation",
      example: `max ${override.maxSentences} 文`,
      matchedText: `${sentences.length} 文`,
    });
  }
  for (const s of sentences) {
    if (s.length < override.minCharsPerSentence) {
      violations.push({
        kind: "length_violation",
        example: `1 文 ${override.minCharsPerSentence} 文字以上`,
        matchedText: `${s.length} 文字: "${s}"`,
      });
    }
    if (s.length > override.maxCharsPerSentence) {
      violations.push({
        kind: "length_violation",
        example: `1 文 ${override.maxCharsPerSentence} 文字以下`,
        matchedText: `${s.length} 文字`,
      });
    }
  }
  return { ok: violations.length === 0, violations };
}

/**
 * 全 validator を統合した checker (Stage 4 LLM 出力後の事後 validation entry point)。
 */
export function validateSpeech(
  text: string,
  override: LengthOverride,
): ValidateResult {
  const lex = validateSpeechLexicon(text);
  const q = validateQuestionCount(text, override.maxQuestions);
  const len = validateLength(text, override);
  const violations = [...lex.violations, ...q.violations, ...len.violations];
  return { ok: violations.length === 0, violations };
}

// ─────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────

/**
 * 文字列を文単位に分割。「。」「？」「！」「\n」を区切りとし、空文字を除去。
 */
function splitSentences(text: string): string[] {
  return text
    .split(/[。？\?！!\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
