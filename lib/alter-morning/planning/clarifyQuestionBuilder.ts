/**
 * L2.1 Clarify Question Builder — Comprehension-First v1.3+ Wave 3 (W3-PR-1)
 *
 * 責務:
 *   Gap Resolver が出した ClarifyRequest を、ユーザーに戻す日本語質問文に成形する。
 *
 * 設計原則（Wave 3）:
 *   - rule-based で固める（LLM 生成は Wave 4+）
 *   - 質問は短く・1 つだけ・選択肢を過剰に並べない
 *   - hint がある場合はユーザーの発話由来の語を埋め込む（再質問感を下げる）
 *   - 曖昧さを残さない（yes/no ではなく「どれ？」「何時頃？」など決断を促す形）
 *
 * この builder は pure function。副作用なし。LLM 呼び出しなし。
 */

import type { ClarifyRequest, ClarifyKind } from "./gapResolver";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Templates
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ClarifyKind → 質問文を生成する rule-based テンプレート。
 *
 * hint が渡された時は hint を文脈に織り込む。
 * hint 無しの時は generic 文になる。
 */
type Template = (hint?: string) => string;

const TEMPLATES: Record<ClarifyKind, Template> = {
  // |semantic| >= 2: 時刻も場所も活動も曖昧 → 粗い時間帯から聞く
  coarse_time_bucket: (hint) =>
    hint
      ? `「${hint}」は朝・昼・夜のどれ頃ですか？`
      : "朝・昼・夜のどれ頃ですか？",

  // semantic==["when"]: 時刻だけ不明
  specific_time: (hint) =>
    hint
      ? `「${hint}」は何時頃ですか？`
      : "何時頃ですか？",

  // semantic==["what"]: 活動だけ不明
  activity: (hint) =>
    hint
      ? `「${hint}」では何をする予定ですか？`
      : "何をする予定ですか？",

  // tentative 連鎖: 前後が tentative で埋まっている → 時間帯の基準を 1 つ確定したい
  tentative_chain: (hint) =>
    hint
      ? `「${hint}」あたりは何時頃になりそうですか？`
      : "その予定は何時頃になりそうですか？",

  // turn_mode=modify で target_ref_confidence=low: どの予定を指しているか不明
  target_ref_low: (hint) =>
    hint
      ? `「${hint}」というのは、どの予定のことですか？`
      : "どの予定のことですか？",

  // W3-PR-6: place が完全欠損、近隣 event からも借用できない
  where_center: (hint) =>
    hint
      ? `「${hint}」はどのあたりでしたいですか？`
      : "どのあたりでしたいですか？",

  // W3-PR-6: ambiguous 候補が多すぎて絞れない
  where_pick_from_candidates: (hint) =>
    hint
      ? `「${hint}」はどこを指していますか？（絞り込みたいです）`
      : "どこを指していますか？（絞り込みたいです）",

  // solver_blocker: transport が決まらない
  transport: (hint) =>
    hint
      ? `「${hint}」へはどう移動しますか？（徒歩・電車・車など）`
      : "どう移動しますか？（徒歩・電車・車など）",

  // solver_blocker: endpoint / end_time が決まらない
  endpoint: (hint) =>
    hint
      ? `「${hint}」は何時までの予定ですか？`
      : "何時までの予定ですか？",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Entry
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ClarifyRequest から日本語質問文を rule-based で生成する。
 *
 * 設計メモ:
 *   - 未定義 kind が来た場合は generic fallback を返す（throw しない）
 *   - hint は trim してから埋め込む。空文字列は hint なし扱い
 */
export function buildClarifyQuestion(req: {
  kind: ClarifyKind;
  hint?: string;
}): string {
  const template = TEMPLATES[req.kind];
  const safeHint = req.hint?.trim() || undefined;
  if (!template) {
    // 未知 kind（将来 kind が増えた時の fallback）
    return safeHint
      ? `「${safeHint}」について、もう少し詳しく教えてください。`
      : "もう少し詳しく教えてください。";
  }
  return template(safeHint);
}

/**
 * ClarifyRequest に question を付与した resolved 版を返す。
 *
 * `resolveGaps` が返す action を UI に渡す直前にこの関数で question を解決する想定。
 * 元の ClarifyRequest は書き換えない（非破壊）。
 */
export function attachClarifyQuestion<T extends ClarifyRequest>(
  req: T,
): T & { question: string } {
  return { ...req, question: buildClarifyQuestion(req) };
}
