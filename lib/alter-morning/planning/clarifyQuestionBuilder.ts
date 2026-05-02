/**
 * L2.1 Clarify Question Builder — Comprehension-First v1.3+ Wave 3
 *
 * 責務:
 *   Gap Resolver が出した ClarifyRequest を、ユーザーに戻す日本語質問文に成形する。
 *
 * 設計原則（Wave 3）:
 *   - rule-based で固める（LLM 生成は Wave 4+）
 *   - 質問は短く・1 つだけ・選択肢を過剰に並べない
 *   - yes/no ではなく「どれ？」「何時頃？」など決断を促す形
 *
 * W3-PR-7 Commit 3（設計書 §5）:
 *   - **event scope prefix を必ず付ける**（どの event を指すか明示）
 *     例:「朝の仕事はどのあたり？」「ランチは何時頃？」
 *   - 語尾は直球 `?`。「かな？」「ですか？」等の緩衝語は採用しない
 *   - 同種 event が複数ある場合は `eventOrdinal` で区別（「1つ目の仕事は…」）
 *   - prefix 決定の優先順位:
 *       1) scope.timeLabel + scope.activityLabel → 「朝の仕事」
 *       2) scope.timeLabel のみ                 → 「朝の予定」
 *       3) scope.activityLabel のみ             → 「ランチ」
 *       4) scope 無し + hint あり               → 「カフェ」
 *       5) 全て無し                             → prefix なし generic
 *
 * この builder は pure function。副作用なし。LLM 呼び出しなし。
 */

import type { ClarifyKind, ClarifyScope } from "./gapResolver";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prefix 生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * scope と hint から event 指定 prefix を生成する。
 * 返り値は subject のみ（助詞「は」は各テンプレ側で付ける）。
 */
function buildPrefix(scope: ClarifyScope | undefined, hint: string | undefined): string | null {
  const time = scope?.timeLabel?.trim() || null;
  const act = scope?.activityLabel?.trim() || null;
  const ordinal =
    scope && scope.sameLabelCount >= 2 && scope.eventOrdinal >= 1
      ? `${scope.eventOrdinal}つ目の`
      : "";

  if (time && act) {
    // "朝の仕事" / "12:00のランチ"
    return `${ordinal}${time}の${act}`;
  }
  if (time) {
    // "朝の予定"（activity 未定 or generic）
    return `${ordinal}${time}の予定`;
  }
  if (act) {
    // "ランチ"
    return `${ordinal}${act}`;
  }
  if (hint && hint.trim()) {
    // scope 無しでも hint だけはある（後方互換）
    return `「${hint.trim()}」`;
  }
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Templates
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ClarifyKind → 質問文を生成する rule-based テンプレート。
 * prefix があれば「{prefix}は〜？」、無ければ generic 文。
 */
type Template = (prefix: string | null) => string;

const TEMPLATES: Record<ClarifyKind, Template> = {
  // |semantic| >= 2: 時刻も場所も活動も曖昧 → 粗い時間帯から聞く
  coarse_time_bucket: (prefix) =>
    prefix
      ? `${prefix}は朝・昼・夜のどれ頃？`
      : "朝・昼・夜のどれ頃？",

  // semantic==["when"]: 時刻だけ不明
  specific_time: (prefix) =>
    prefix ? `${prefix}は何時頃？` : "何時頃？",

  // semantic==["what"]: 活動だけ不明
  activity: (prefix) =>
    prefix
      ? `${prefix}は具体的には何をする予定？`
      : "何をする予定？",

  // tentative 連鎖: 前後が tentative で埋まっている → 時間帯の基準を 1 つ確定したい
  tentative_chain: (prefix) =>
    prefix
      ? `${prefix}は何時頃になりそう？`
      : "その予定は何時頃になりそう？",

  // turn_mode=modify で target_ref_confidence=low: どの予定を指しているか不明
  target_ref_low: (prefix) =>
    prefix
      ? `${prefix}というのは、どの予定？`
      : "どの予定のこと？",

  // place が完全欠損、近隣 event からも借用できない
  where_center: (prefix) =>
    prefix ? `${prefix}はどのあたり？` : "どのあたり？",

  // ambiguous 候補が多すぎて絞れない
  where_pick_from_candidates: (prefix) =>
    prefix
      ? `${prefix}はどこを指す？`
      : "どこを指す？",

  // solver_blocker: transport が決まらない
  transport: (prefix) =>
    prefix
      ? `${prefix}へは徒歩・電車・車のどれで移動？`
      : "徒歩・電車・車のどれで移動？",

  // solver_blocker: endpoint / end_time が決まらない
  endpoint: (prefix) =>
    prefix ? `${prefix}は何時まで？` : "何時まで？",

  // CEO/GPT 2026-05-02 PR B-2e: origin clarify (= 推論失敗時の最後の砦)
  //   - prefix は使わない (= origin は plan-level、event scope 不要)
  //   - 「今」 は使わない (= future plan 対応、tense neutral)
  //   - シンプルな 1 行 (= 質問アプリ化を防ぐ)
  origin: () => "出発地はどこにする？",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Entry
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ClarifyRequest から日本語質問文を rule-based で生成する。
 *
 * 設計メモ:
 *   - 未定義 kind が来た場合は generic fallback を返す（throw しない）
 *   - hint / scope.*Label は trim してから埋め込む。空は無し扱い
 *   - scope がある場合はそれを優先し、hint はフォールバックとして使う
 */
export function buildClarifyQuestion(req: {
  kind: ClarifyKind;
  hint?: string;
  scope?: ClarifyScope;
}): string {
  const template = TEMPLATES[req.kind];
  const prefix = buildPrefix(req.scope, req.hint);

  if (!template) {
    // 未知 kind（将来 kind が増えた時の fallback）
    return prefix
      ? `${prefix}について、もう少し詳しく教えて？`
      : "もう少し詳しく教えて？";
  }
  return template(prefix);
}

/**
 * ClarifyRequest に question を付与した resolved 版を返す。
 *
 * `resolveGaps` が返す action を UI に渡す直前にこの関数で question を解決する想定。
 * 元の ClarifyRequest は書き換えない（非破壊）。
 */
export function attachClarifyQuestion<T extends { kind: ClarifyKind; hint?: string; scope?: ClarifyScope }>(
  req: T,
): T & { question: string } {
  return { ...req, question: buildClarifyQuestion(req) };
}
