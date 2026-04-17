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
  AgreedConstraint,
  ConversationAnalysis,
  CoAlterPersonProfile,
  ConversationTheme,
  SearchCandidate,
  SearchDecision,
} from "./types";
import { getThemeRule } from "./slots";

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

  // 検索クエリを生成（Phase 1.5.4.5: theme × slot × agreedConstraints 駆動）
  const queries = buildSearchQueries(
    analysis,
    specificCandidates,
    analysis.agreedConstraints ?? [],
  );

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

/** 会話テキストからアクティビティのサブカテゴリを検出 */
function detectActivitySubcategory(text: string): string | null {
  const subcategories: Array<{ keywords: RegExp; label: string }> = [
    { keywords: /美術館|アート|ギャラリー|個展|企画展|現代アート|西洋|日本画|印象派/, label: "美術館 展覧会" },
    { keywords: /博物館|科学館|歴史/, label: "博物館" },
    { keywords: /水族館/, label: "水族館" },
    { keywords: /動物園|ズー/, label: "動物園" },
    { keywords: /遊園地|テーマパーク/, label: "遊園地" },
    { keywords: /ボウリング|カラオケ|ゲーセン/, label: "屋内アクティビティ" },
    { keywords: /運動|スポーツ|ジム|テニス|バドミントン/, label: "スポーツ" },
    { keywords: /ライブ|コンサート|フェス/, label: "ライブ コンサート" },
    { keywords: /舞台|演劇|ミュージカル/, label: "舞台 演劇" },
    { keywords: /散歩|公園|ピクニック/, label: "散歩 公園" },
  ];

  for (const { keywords, label } of subcategories) {
    if (keywords.test(text)) return label;
  }
  return null;
}

/**
 * テーマと制約から検索クエリを生成。
 *
 * Phase 1.5.4.5: theme × core slot × agreedConstraints 駆動。
 *  - movie の core=what → 「上映中」を含める
 *  - food の core=where → 店舗固有のキーワードを含める
 *  - travel の core=where → 体験・観光地キーワード
 *  - agreedConstraints の exclusion/style/budget をクエリに反映
 */
function buildSearchQueries(
  analysis: ConversationAnalysis,
  mentionedCandidates: string[],
  agreedConstraints: AgreedConstraint[] = [],
): string[] {
  const queries: string[] = [];
  const { theme, extractedConstraints: c } = analysis;
  const combined = analysis.recentMessages.map((m) => m.body).join(" ");

  // ── agreedConstraints を検索語に ──
  const hardConstraints = agreedConstraints.filter((cc) => cc.strength === "hard");
  const stylePositives: string[] = [];
  const exclusionNegatives: string[] = [];
  let budgetHint = "";

  for (const cc of hardConstraints) {
    if (cc.kind === "style") {
      if (cc.normalizedValue.startsWith("style_or:")) {
        // style_or:イタリアン|フレンチ → 先頭を使う
        const first = cc.normalizedValue.slice("style_or:".length).split("|")[0];
        if (first) stylePositives.push(first);
      } else if (cc.normalizedValue.startsWith("style:")) {
        const s = cc.normalizedValue.slice("style:".length);
        if (s) stylePositives.push(s);
      }
    } else if (cc.kind === "exclusion") {
      if (cc.normalizedValue.startsWith("exclude:")) {
        const t = cc.normalizedValue.slice("exclude:".length);
        if (t && t !== "attached_venue" && t.length <= 8) {
          exclusionNegatives.push(`-${t}`);
        }
      }
    } else if (cc.kind === "budget") {
      if (cc.normalizedValue.startsWith("budget_max:")) {
        const v = cc.normalizedValue.split(":")[1];
        if (v) budgetHint = `${v}円以下`;
      } else if (cc.normalizedValue.startsWith("budget_around:")) {
        const v = cc.normalizedValue.split(":")[1];
        if (v) budgetHint = `${v}円前後`;
      } else if (cc.normalizedValue.startsWith("budget_per_person:")) {
        const v = cc.normalizedValue.split(":")[1];
        if (v) budgetHint = `1人${v}円`;
      }
    }
  }

  const styleHint = stylePositives.slice(0, 1).join(" ");
  const exclusionHint = exclusionNegatives.slice(0, 2).join(" ");

  // ── mentioned candidates を優先的に検索 ──
  for (const candidate of mentionedCandidates.slice(0, 2)) {
    if (theme === "movie") {
      queries.push(`${candidate} 映画 評価 上映中`);
    } else if (theme === "food") {
      queries.push(`${candidate} レストラン 口コミ 予約`);
    } else if (theme === "travel") {
      queries.push(`${candidate} 旅行 体験 おすすめ`);
    } else {
      queries.push(`${candidate} 口コミ おすすめ`);
    }
  }

  // ── theme × core slot × constraints ──
  const rule = getThemeRule(theme as ConversationTheme);
  const locationPart = c.location ? `${c.location} ` : "";
  // date: 曜日だけ（「木曜日」「来週木曜」）は映画検索の役に立たないので捨てる
  const rawDate = c.date ?? "";
  const dateIsUseful = rawDate && !/^(来週|今週|来月|今月)?(月|火|水|木|金|土|日)曜日?$/.test(rawDate.trim());
  const datePart = dateIsUseful ? `${rawDate} ` : "";
  const budgetPart = budgetHint || (c.budget ? `${c.budget} ` : "");

  // 現在の年月（検索で最新作を拾うため）
  const now = new Date();
  const yearMonth = `${now.getFullYear()}年${now.getMonth() + 1}月`;

  switch (theme) {
    case "movie": {
      // core=what → 複数角度から「上映中の具体作品」を引き出す
      //  (1) 映画.com の上映中ページ相当
      //  (2) Filmarks 新作ランキング
      //  (3) 地域 × 映画館スケジュール（場所がある場合のみ）
      const q1 = [
        styleHint,
        "映画.com 上映中",
        yearMonth,
        "作品",
        exclusionHint,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();
      queries.push(q1);

      const q2 = [
        styleHint,
        "Filmarks ランキング",
        yearMonth,
        "新作 評価",
      ]
        .filter(Boolean)
        .join(" ")
        .trim();
      queries.push(q2);

      if (locationPart.trim()) {
        queries.push(
          `${locationPart.trim()} 映画館 上映スケジュール ${yearMonth}`.trim(),
        );
      } else {
        // location が無い場合は公開中の話題作に寄せる
        queries.push(`公開中 映画 話題作 ${yearMonth} 評価`);
      }
      break;
    }
    case "food": {
      // core=where → 店舗名を引き出すため「食べログ」「レストラン」「個室」等のキーワード
      const q = [
        locationPart.trim(),
        budgetPart,
        styleHint,
        "レストラン 食べログ デート",
        exclusionHint,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();
      queries.push(q || "おすすめ レストラン デート");

      // 2本目: 雰囲気/style 単独
      if (styleHint) {
        queries.push(`${locationPart}${styleHint} 人気店`.trim());
      }
      break;
    }
    case "travel": {
      // core=where → 観光地 / 体験 + when（時期）
      const q = [
        datePart.trim(),
        locationPart.trim(),
        styleHint,
        "旅行 観光 モデルコース カップル",
        exclusionHint,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();
      queries.push(q || "おすすめ 旅行先 カップル");
      break;
    }
    case "activity": {
      const subcategory = detectActivitySubcategory(combined);
      if (subcategory) {
        queries.push(
          `${datePart}${locationPart}${subcategory} おすすめ 開催中 2026`.trim(),
        );
        for (const pref of c.preferences.slice(0, 1)) {
          queries.push(`${locationPart}${subcategory} ${pref}`.trim());
        }
      } else {
        queries.push(
          `${datePart}${locationPart}デート おすすめ`.trim() || "おすすめ デートスポット",
        );
      }
      break;
    }
  }

  // rule 未定義テーマでも空にならないよう保険
  if (queries.length === 0 && rule) {
    queries.push(`${theme} おすすめ デート`);
  }

  // 重複除去、最大3クエリ
  return [...new Set(queries.map((q) => q.replace(/\s+/g, " ").trim()).filter(Boolean))].slice(0, 3);
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
      url: r.url,
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
