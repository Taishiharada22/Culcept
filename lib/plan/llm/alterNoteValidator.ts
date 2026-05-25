/**
 * Phase 3-N Plan P2 Step 1 — alterNote 出力 validator (= pure module)
 *
 * 設計書: docs/alter-plan-p2-llm-readiness.md v2
 *
 * 設計原則 (= CEO + GPT 合議 2026-05-25):
 *   - **pure module** (= LLM / API / DB / network 不使用、 入力 mutate なし)
 *   - **post-check の Last Mile** (= LLM 出力を user に届ける直前で機械的に safety 担保)
 *   - **fail-open** (= 違反検出時は呼出側で deterministic fallback、 UI は壊れない)
 *   - **既存 deterministic 文体と同 規約** (= List `categoryMeaning.ts` を baseline)
 *
 * 検証項目 (= 4 段):
 *   1. 空文字 / 空白のみ → 「読めない」 (= reject、 'unavailable' へ)
 *   2. 長さ (= 6-30 字、 List 既存 8-22 字 + 余裕)
 *   3. 禁止語 10 件 (= 押し付け / 推奨 / 警告 / 危険 / 注意 / リスク / 最適化 等)
 *   4. 強い命令形 / 評価形容詞 (= 「しなさい」 「最適」 「重要」 等)
 *   5. 数値 / 絵文字 / 改行 (= 規約 違反)
 *
 * 設計書 references:
 *   - docs/alter-plan-list-redesign-spec-audit.md (= 文体規約)
 *   - lib/plan/list/categoryMeaning.ts (= deterministic 既存文体)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 禁止語 / 強い命令形 / 評価形容詞 一覧
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 禁止語 10 件 (= 本セッション全体で確立した規約)
 *
 * 「最適化」 は substring match、 他は exact substring。
 */
const FORBIDDEN_WORDS: ReadonlyArray<string> = [
  "おすすめ",
  "これをした方がいい",
  "最適",       // 「最適な」 「最適化」 を catch
  "推奨",
  "改善",
  "警告",
  "危険",
  "注意",
  "リスク",
  "最適化",    // 重複だが明示
];

/**
 * 強い命令形 + 評価形容詞 (= 規約違反、 reject 対象)
 */
const FORBIDDEN_TONE: ReadonlyArray<string> = [
  "しなさい",
  "すべき",
  "してください",  // 強い命令、 「ましょう」 とは区別
  "するな",
  "するべからず",
  "重要",
  "大事な",     // 「大事な〜」 評価
  "ベスト",
  "良いプラン",
  "良い予定",
  "悪い",
];

/**
 * 数値 pattern (= 「% / 〜分 / 〜時間 / 〜日」 等、 出力規約違反)
 *
 * 「〜時間」 は 「集中時間」 等の語と区別したい → 数字 + 時間 のみ catch
 */
const NUMERIC_PATTERN = /[0-9０-９]+\s*(?:%|％|分|時間|日|秒|円)/;

/**
 * 絵文字 / 改行 / 制御文字 検出
 */
const FORBIDDEN_CHAR_PATTERN = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\n\r\t]/u;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Validation 結果型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * validator 結果 (= discriminated union)
 *
 * - ok=true: 検証通過、 text はそのまま user に届けて OK
 * - ok=false: reject、 reason は analytics + 切り分け用、 呼出側で deterministic fallback
 */
export type AlterNoteValidationResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: AlterNoteValidationReason };

/**
 * Reject 理由 (= 5 種、 analytics 用)
 */
export type AlterNoteValidationReason =
  | "empty"           // 空文字 / 空白のみ
  | "length_out_of_range"  // 6 字未満 or 30 字超
  | "forbidden_word"  // 禁止語 10 件 hit
  | "forbidden_tone"  // 強い命令形 / 評価形容詞 hit
  | "forbidden_char"; // 数値 / 絵文字 / 改行

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// validate (= public API)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * LLM 出力 text を 検証 (= pure、 deterministic)
 *
 * 検証順序:
 *   1. empty → 「読めない」 (= LLM が判断保留した場合の合図、 reject だが ok=false で reason 区別)
 *   2. length: trim 済の文字数で 6-30 字
 *   3. forbidden_word: FORBIDDEN_WORDS の substring 検出
 *   4. forbidden_tone: FORBIDDEN_TONE の substring 検出
 *   5. forbidden_char: 数値 / 絵文字 / 改行 検出
 *
 * 全 PASS → ok=true、 trim 済 text を return
 */
export function validateAlterNoteOutput(rawText: string): AlterNoteValidationResult {
  // 0. 入力 normalize (= 全角空白 / 改行 を trim、 ただし 改行は検出のため事前 check)
  if (FORBIDDEN_CHAR_PATTERN.test(rawText)) {
    return { ok: false, reason: "forbidden_char" };
  }

  const text = rawText.trim();

  // 1. empty
  if (text.length === 0) {
    return { ok: false, reason: "empty" };
  }

  // 2. length (= JS 「.length」 は UTF-16 code units、 日本語の漢字 / かな は 1 unit)
  if (text.length < 6 || text.length > 30) {
    return { ok: false, reason: "length_out_of_range" };
  }

  // 3. forbidden_word
  for (const word of FORBIDDEN_WORDS) {
    if (text.includes(word)) {
      return { ok: false, reason: "forbidden_word" };
    }
  }

  // 4. forbidden_tone
  for (const tone of FORBIDDEN_TONE) {
    if (text.includes(tone)) {
      return { ok: false, reason: "forbidden_tone" };
    }
  }

  // 5. forbidden_char (= 数値 「20%」 「30 分」 等、 改行は ↑ で済)
  if (NUMERIC_PATTERN.test(text)) {
    return { ok: false, reason: "forbidden_char" };
  }

  return { ok: true, text };
}
