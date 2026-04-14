/**
 * CoAlter L4: 外部世界接続 — Adaptive RAG
 *
 * Perspective Engine の executeSearch を転用。
 * CoAlter固有の処理:
 * 1. 検索が必要かどうかの自律判断（Adaptive RAG）
 * 2. 二人の好みを考慮した検索クエリ生成
 * 3. 検索結果のCoAlter向けフィルタリング
 */

import type {
  ConversationAnalysis,
  CoAlterPersonProfile,
  SearchCandidate,
  SearchDecision,
} from "./types";

// Perspective Engine の検索関数を転用
import { executeSearch } from "@/lib/stargazer/perspectiveEngine";

// ─────────────────────────────────────────────
// Adaptive RAG: 検索が必要かどうかの判断
// ─────────────────────────────────────────────

/** 検索が必要なテーマ */
const SEARCH_REQUIRED_THEMES = new Set(["movie", "food", "travel", "activity"]);

/** 検索不要の明示的パターン */
const NO_SEARCH_PATTERNS = [
  /気持ち|感情|気分/,          // 感情の話は検索不要
  /関係|仲|距離感/,           // 関係性の話は検索不要
  /すれ違い|誤解|喧嘩/,       // すれ違いは内部処理
];

/**
 * 検索が必要かどうかを判断する。
 */
export function decideSearch(
  analysis: ConversationAnalysis,
): SearchDecision {
  // テーマが検索不要の場合
  if (!SEARCH_REQUIRED_THEMES.has(analysis.theme)) {
    return {
      shouldSearch: false,
      reason: `テーマ「${analysis.theme}」は検索不要`,
      queries: [],
    };
  }

  // 感情・関係性の話は検索しない
  const combined = analysis.recentMessages.map((m) => m.body).join(" ");
  for (const pattern of NO_SEARCH_PATTERNS) {
    if (pattern.test(combined)) {
      return {
        shouldSearch: false,
        reason: "感情・関係性の話題のため検索不要",
        queries: [],
      };
    }
  }

  // 具体的な候補が既に挙がっている場合 → その候補を検索
  const specificCandidates = extractMentionedCandidates(combined);

  // 検索クエリを生成
  const queries = buildSearchQueries(analysis, specificCandidates);

  return {
    shouldSearch: queries.length > 0,
    reason: queries.length > 0
      ? `テーマ「${analysis.theme}」の現実情報を取得`
      : "検索クエリを生成できなかった",
    queries,
  };
}

// ─────────────────────────────────────────────
// 検索クエリ生成
// ─────────────────────────────────────────────

/** 会話中で既に言及された具体的な候補名を抽出 */
function extractMentionedCandidates(text: string): string[] {
  // 「〜はどう？」「〜とかは？」「〜に行かない？」パターン
  const candidates: string[] = [];
  const patterns = [
    /「(.+?)」/g,                     // カギカッコ内
    /(.{2,10})(はどう|とかは|に行か|見に行|行ってみ)/g,  // 候補提示パターン
  ];

  for (const p of patterns) {
    let match;
    while ((match = p.exec(text)) !== null) {
      const candidate = match[1].trim();
      if (candidate.length >= 2 && candidate.length <= 20) {
        candidates.push(candidate);
      }
    }
  }

  return [...new Set(candidates)];
}

/** テーマと制約から検索クエリを生成 */
function buildSearchQueries(
  analysis: ConversationAnalysis,
  mentionedCandidates: string[],
): string[] {
  const queries: string[] = [];
  const { theme, extractedConstraints: c } = analysis;

  // 具体的な候補が言及されていたらそれを検索
  for (const candidate of mentionedCandidates.slice(0, 2)) {
    if (theme === "movie") {
      queries.push(`${candidate} 映画 評価 上映`);
    } else if (theme === "food") {
      queries.push(`${candidate} レストラン 口コミ 予約`);
    } else {
      queries.push(`${candidate} 口コミ おすすめ`);
    }
  }

  // テーマベースの汎用クエリ
  const locationPart = c.location ? `${c.location} ` : "";
  const datePart = c.date ? `${c.date} ` : "";
  const budgetPart = c.budget ? `${c.budget} ` : "";

  switch (theme) {
    case "movie":
      queries.push(`${datePart}${locationPart}映画 上映中 おすすめ 2026`.trim());
      break;
    case "food":
      queries.push(
        `${locationPart}${budgetPart}レストラン おすすめ デート`.trim() || "おすすめ レストラン デート",
      );
      break;
    case "travel":
      queries.push(
        `${datePart}${locationPart}旅行 おすすめ カップル`.trim() || "おすすめ 旅行先 カップル",
      );
      break;
    case "activity":
      queries.push(
        `${datePart}${locationPart}デート おすすめ`.trim() || "おすすめ デートスポット",
      );
      break;
  }

  // 重複除去、最大3クエリ
  return [...new Set(queries)].slice(0, 3);
}

// ─────────────────────────────────────────────
// 検索実行 + CoAlter向けフィルタリング
// ─────────────────────────────────────────────

/**
 * Web検索を実行し、CoAlter向けの候補リストに変換する。
 *
 * @param decision - decideSearch の結果
 * @param profileA - ユーザーAのプロフィール（将来のパーソナライズ用）
 * @param profileB - ユーザーBのプロフィール（将来のパーソナライズ用）
 */
export async function searchAndFilter(
  decision: SearchDecision,
  _profileA: CoAlterPersonProfile,
  _profileB: CoAlterPersonProfile,
): Promise<SearchCandidate[]> {
  if (!decision.shouldSearch || decision.queries.length === 0) {
    return [];
  }

  // Perspective Engine の executeSearch を利用
  const rawResults = await executeSearch(decision.queries, 5000);

  if (rawResults.length === 0) {
    return [];
  }

  // 検索結果を CoAlter の SearchCandidate に変換
  const candidates: SearchCandidate[] = rawResults
    .filter((r) => r.title && r.text)
    .map((r) => ({
      title: r.title,
      description: r.text.slice(0, 200),
      externalRating: extractRating(r.text),
      practicalInfo: extractPracticalInfo(r.text),
      source: new URL(r.url).hostname,
    }))
    // 重複タイトルを除去
    .filter(
      (c, i, arr) =>
        arr.findIndex((x) => x.title === c.title) === i,
    )
    .slice(0, 10); // 最大10件（LLMが絞る）

  return candidates;
}

/** テキストから評価スコアを抽出 */
function extractRating(text: string): string | null {
  // 食べログ形式: 3.45 等
  const tabelog = text.match(/(\d\.\d{1,2})\s*点|評価\s*(\d\.\d{1,2})/);
  if (tabelog) return `${tabelog[1] || tabelog[2]}`;

  // 星評価
  const stars = text.match(/★\s*(\d(?:\.\d)?)|(\d(?:\.\d)?)\s*\/\s*5/);
  if (stars) return `${stars[1] || stars[2]}/5`;

  return null;
}

/** テキストから実用情報（場所・時間・価格）を抽出 */
function extractPracticalInfo(text: string): string | null {
  const parts: string[] = [];

  // 価格帯
  const price = text.match(
    /(\d{3,5}円|¥\d{3,5}|ランチ\s*\d{3,5}|ディナー\s*\d{3,5})/,
  );
  if (price) parts.push(price[1]);

  // 営業時間
  const hours = text.match(/(\d{1,2}:\d{2}\s*[〜～\-]\s*\d{1,2}:\d{2})/);
  if (hours) parts.push(hours[1]);

  // 上映時間
  const runtime = text.match(/(\d{2,3}分)/);
  if (runtime) parts.push(runtime[1]);

  return parts.length > 0 ? parts.join(" / ") : null;
}
