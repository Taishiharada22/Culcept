/**
 * CoAlter AOO Phase B B-5b — Post-Speak Verification (pure 7-layer defense)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §10.4 / §10.5
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2.5 / §3
 *
 * 役割 (B-5b 段階):
 *   visible Mirror 出力直前に **7 layer check** を fail-fast に走らせる pure 検証層。
 *   1 つでも違反したら visible 出力を block (caller は STAY_SILENT 経路に倒す)。
 *
 * 7-layer check (順序固定、最初に fail したものを reason に返す):
 *   1. **PII pattern** — email / phone / URL / 数字 4 桁以上 / id-like を含むか
 *   2. **Imperative grammar** — 命令形 (「しろ」「して」「べき」「なさい」「ましょう」)
 *   3. **Question grammar** — 疑問 (「?」「？」「ですか」「ますか」「でしょうか」「のかな」)
 *   4. **Suggestion grammar** — 提案 (「みては」「みたら」「みよう」「するといい」「したらどう」「するべき」)
 *   5. **Empathy theater** — 共感演技 (「わかります」「気持ちわかる」「同じ」「私も」「共感」)
 *   6. **Length** — > 60 文字 (template は ≤ 40 文字想定、margin あり)
 *   7. **Duplicate in session** — 同 templateId が既出
 *
 * 設計原則:
 *   - **pure / deterministic / side-effect-free**
 *   - **persistence なし**: 履歴は input.recentlyEmittedTemplateIds (caller が session-local 持つ)
 *   - **remote 送信なし**: 違反検出しても network / log / Sentry 一切なし
 *   - **fail-fast**: 1 つでも fail なら即 return (後続の check 走らず、効率 + reason 一意化)
 *   - **defense-in-depth**: template は design-time で grammar 満たすが、本層が runtime に
 *     再確認することで template の design regression を検出
 *
 * 不可侵境界:
 *   - 既存 presence layer / observer layer / chat layer touch なし
 *   - B-1〜B-5a zero diff (本 file は新規)
 *   - fetch / Supabase / Sentry / console 一切なし
 *   - persistence 一切なし
 */

import type {
  PostSpeakVerificationInput,
  MirrorVerificationResult,
  MirrorVerificationFailReason,
} from "./visibleMirrorTypes";

// =============================================================================
// Pattern definitions (immutable regex / const string set)
// =============================================================================

/**
 * PII pattern set。
 *
 * 検出対象 (false positive 許容、false negative は不可):
 *   - email pattern: `<x>@<y>.<z>`
 *   - URL pattern: `http://` `https://` `www.` を含む
 *   - phone-like: 連続数字 4 桁以上 (国番号 / 携帯 / 住所番地 / id を一括 reject)
 *   - id-like: 連続英数記号 12 文字以上 (sessionId / messageId / userId / token)
 */
const PII_PATTERNS: ReadonlyArray<RegExp> = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, // email
  /https?:\/\//i, // URL
  /\bwww\./i, // URL (no scheme)
  /[0-9]{4,}/, // 連続数字 4 桁以上 (phone / 番地 / 数値 id)
  /[A-Za-z0-9_-]{12,}/, // 連続英数記号 12 文字以上 (token / id)
];

/**
 * 命令形 substring set (日本語の末尾 / 連用形 pattern)。
 *
 * design-time に template は含まないが、runtime regression を検出。
 */
const IMPERATIVE_PATTERNS: ReadonlyArray<string> = [
  "しろ",
  "して。",
  "してください",
  "ください",
  "なさい",
  "ましょう",
  "べきだ",
  "べきです",
  "せよ",
];

/**
 * 疑問形 substring / 文字 set。
 */
const QUESTION_PATTERNS: ReadonlyArray<string> = [
  "?",
  "？",
  "ですか",
  "ますか",
  "でしょうか",
  "のかな",
  "かしら",
];

/**
 * 提案形 substring set。
 *
 * 注: 「るといい」は「するといい / してみるといい / 話すといい」等の suggestion form を
 * 包括的に捕捉する broader pattern。template には含まれない (design-time 確認済み)。
 */
const SUGGESTION_PATTERNS: ReadonlyArray<string> = [
  "みては",
  "みたら",
  "みよう",
  "るといい",
  "したらどう",
  "してみては",
  "してみたら",
];

/**
 * 共感演技 substring set。
 */
const EMPATHY_THEATER_PATTERNS: ReadonlyArray<string> = [
  "わかります",
  "わかるよ",
  "気持ちわかる",
  "私も同じ",
  "私も",
  "共感します",
  "共感する",
];

/**
 * 最大許容文字数 (template は design-time に ≤ 40、runtime check は 60 で余裕を持つ)。
 */
const MAX_TEXT_LENGTH = 60;

// =============================================================================
// Individual checks (named for clarity / testability)
// =============================================================================

function hasPII(text: string): boolean {
  return PII_PATTERNS.some((re) => re.test(text));
}

function hasImperative(text: string): boolean {
  return IMPERATIVE_PATTERNS.some((p) => text.includes(p));
}

function hasQuestion(text: string): boolean {
  return QUESTION_PATTERNS.some((p) => text.includes(p));
}

function hasSuggestion(text: string): boolean {
  return SUGGESTION_PATTERNS.some((p) => text.includes(p));
}

function hasEmpathyTheater(text: string): boolean {
  return EMPATHY_THEATER_PATTERNS.some((p) => text.includes(p));
}

function isTooLong(text: string): boolean {
  // 注: 文字数は UTF-16 code unit (JS 標準)。surrogate pair の precise count は不要 (margin 設計)。
  return text.length > MAX_TEXT_LENGTH;
}

// =============================================================================
// Main verification (fail-fast 7-layer)
// =============================================================================

/**
 * Post-speak verification (visible 出力直前の最終 check)。
 *
 * 7 layer を順次評価、最初に fail した layer の reason を返す:
 *   1. PII → `pii_detected`
 *   2. imperative → `imperative_grammar`
 *   3. question → `question_grammar`
 *   4. suggestion → `suggestion_grammar`
 *   5. empathy theater → `empathy_theater`
 *   6. length > 60 → `text_too_long`
 *   7. duplicate templateId → `duplicate_in_session`
 *
 * 全 layer pass なら `{ ok: true }` を返す。
 *
 * **Pure / deterministic / side-effect-free**:
 *   - input mutation なし
 *   - persistence なし (recentlyEmittedTemplateIds は caller が管理)
 *   - remote 送信なし
 *   - log なし
 *
 * @param input - {@link PostSpeakVerificationInput}
 * @returns {@link MirrorVerificationResult} (`ok: true` or `ok: false` + reason)
 *
 * @example
 *   verifyMirrorText({
 *     text: "なにかを抱えているような、そんな気がしました",
 *     templateId: "state_mirror_holding",
 *     recentlyEmittedTemplateIds: [],
 *   })
 *   // → { ok: true }
 *
 *   verifyMirrorText({
 *     text: "どう思いますか？",
 *     templateId: "state_mirror_pause",
 *     recentlyEmittedTemplateIds: [],
 *   })
 *   // → { ok: false, reason: "question_grammar" }
 */
export function verifyMirrorText(
  input: PostSpeakVerificationInput,
): MirrorVerificationResult {
  // (1) PII
  if (hasPII(input.text)) {
    return { ok: false, reason: "pii_detected" };
  }

  // (2) imperative
  if (hasImperative(input.text)) {
    return { ok: false, reason: "imperative_grammar" };
  }

  // (3) question
  if (hasQuestion(input.text)) {
    return { ok: false, reason: "question_grammar" };
  }

  // (4) suggestion
  if (hasSuggestion(input.text)) {
    return { ok: false, reason: "suggestion_grammar" };
  }

  // (5) empathy theater
  if (hasEmpathyTheater(input.text)) {
    return { ok: false, reason: "empathy_theater" };
  }

  // (6) length
  if (isTooLong(input.text)) {
    return { ok: false, reason: "text_too_long" };
  }

  // (7) duplicate in session
  if (input.recentlyEmittedTemplateIds.includes(input.templateId)) {
    return { ok: false, reason: "duplicate_in_session" };
  }

  return { ok: true };
}

/**
 * **Test only**: 最大文字数を取得 (test 境界値検証用)。
 */
export function __getMaxTextLengthForTest(): number {
  return MAX_TEXT_LENGTH;
}

/**
 * **Test only**: fail reason 全集合を取得 (exhaustiveness check 用)。
 */
export function __getAllFailReasonsForTest(): ReadonlyArray<MirrorVerificationFailReason> {
  return [
    "pii_detected",
    "imperative_grammar",
    "question_grammar",
    "suggestion_grammar",
    "empathy_theater",
    "text_too_long",
    "duplicate_in_session",
  ] as const;
}
