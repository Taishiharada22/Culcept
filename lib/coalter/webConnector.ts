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

  // Phase A.7 D1 (2026-04-19): mentionedCandidates 汚染の切り分け用。
  //   preview 本カウント中に `系がいいの_ アニメ` 等の greedy 捕捉で query 第1本が
  //   汚染され listicle を呼び込む疑惑があり、pattern 2 `(.{2,10})(...)` の出力を
  //   観測する。behavior 非変更、log-only。
  try {
    console.info(
      "[CoAlter] webConnector.decision",
      JSON.stringify({
        theme: analysis.theme,
        mentionedCandidates: specificCandidates,
        combinedSample: combined.slice(0, 80),
        queriesCount: queries.length,
      }),
    );
  } catch {
    // log 失敗しても本体には影響させない
  }

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
      // Phase A.6 P0: 名指しされた作品でも「上映館 / 劇場 / 上映時刻」を
      //   含めて theater を引けるページ (映画館の上映作品ページ等) を誘引する。
      //   旧: `${candidate} 映画 評価 上映中` は Filmarks / 映画.com の
      //        作品ページばかり返し theater が取れない問題があった。
      queries.push(`${candidate} 上映館 劇場 上映時刻`);
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
      // Phase A.6 P0 — 「映画館ページを取りに行ける検索」への再設計。
      //
      // 症状 (本番観測): listicle (「今月の注目映画10選」型) ばかり返り、
      //   catalog の全作品 theater=null → A.5 の missing_where で全件 drop → 0 候補。
      //
      // 原因: 旧クエリ 3 本のうち q1 "映画.com 上映中" と q2 "Filmarks ランキング"
      //   が構造的に listicle を返す。q3 だけ映画館狙いだが location 依存で不発。
      //
      // 新方針: 3 本全部を「映画館 / 劇場 / TOHOシネマズ / 109シネマズ / 上映館」
      //   トークンを含む形に統一。location が無くても全クエリが発火する。
      //   映画館ページが取れれば movieCatalog.theaterFromSource() の URL slug
      //   matching + tier(3a) description theater 抽出が効き、theater 補完が通る。
      const areaPrefix = locationPart.trim() ? `${locationPart.trim()} ` : "";

      // q1: 「地域 × 映画館 × 今週末 × スケジュール」= 映画館ドメイン直撃
      //     (hlo.tohotheater.jp, 109cinemas.net, eiga.com/theater/* 等)
      queries.push(
        [
          areaPrefix.trim(),
          "映画館 今週末 上映スケジュール",
          yearMonth,
          styleHint,
          exclusionHint,
        ]
          .filter(Boolean)
          .join(" ")
          .trim(),
      );

      // q2: TOHOシネマズ / 109シネマズ の上映時刻ページ狙い。
      //     URL slug 解析 (theaterFromSource) が最強に効くドメイン。
      queries.push(
        [
          areaPrefix.trim(),
          "TOHOシネマズ 109シネマズ 上映時刻",
          yearMonth,
        ]
          .filter(Boolean)
          .join(" ")
          .trim(),
      );

      // q3: 保険。映画.com の「映画館別の上映中作品」ページ等、
      //     劇場名トークンを含むページ。listicle を完全排除はできないが
      //     「上映館 劇場」キーワードで theater 付きページが混ざる確率を上げる。
      queries.push(
        [
          areaPrefix.trim(),
          "上映中 映画 作品 上映館 劇場",
          yearMonth,
        ]
          .filter(Boolean)
          .join(" ")
          .trim(),
      );
      break;
    }
    case "food": {
      // Phase B Commit 3 (2026-04-19) — food query 再設計:
      //
      // 方針:
      //  - 食べログ / Retty / ぐるなび等の listing site は venue-bearing
      //    （ページ単位で店舗情報完備）なので保持
      //  - 「おすすめ10選」「まとめ」等の article-listing のみ除外
      //  - 公式導線を 1 本追加して bookingProviderDistribution の多様性を担保
      //
      // negative 過剰適用禁止:
      //  - "-まとめ" "-おすすめ10選" は listing-venue bearing クエリにのみ適用
      //  - 公式誘引クエリには negative を追加しない（公式トップや予約ページを
      //    抑制しないため）
      const articleListingNegatives = "-まとめ -おすすめ10選 -ランキング";

      // q1: venue-bearing listing クエリ（食べログ / Retty 等を主眼）
      //     article-listing 用語を negative で除外
      const q1 = [
        locationPart.trim(),
        budgetPart,
        styleHint,
        "レストラン 食べログ Retty",
        exclusionHint,
        articleListingNegatives,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();
      queries.push(q1 || "おすすめ レストラン デート");

      // q2: 公式導線誘引クエリ（provider 多様性のため）
      //     negative は**意図的に未適用**。公式トップや予約ページを除外しないため
      const q2Parts = [
        locationPart.trim(),
        styleHint,
        "公式サイト 予約",
      ].filter(Boolean);
      if (q2Parts.length > 0) {
        queries.push(q2Parts.join(" ").trim());
      }

      // q3: style 人気店 保険クエリ（styleHint があるときのみ）
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
  // Phase A.6 diagnostics: retrieval pipeline 3-stage visibility
  // (preview 本カウント中の catalogCount=0 連発の切り分け用)
  //
  // Phase A.7 D2 (2026-04-19): rawResults 先頭 3 件の title / url / desc[0:50] を
  //   観測用に追加。EXA snippet に theater 情報が物理的に載っていないか
  //   (可能性 A/D) を目視確認するため。behavior 非変更、log-only。
  const diag: {
    shouldSearch: boolean;
    queriesCount: number;
    queriesSample: string[];
    rawResultsCount: number;
    candidatesCount: number;
    rawSamples?: Array<{
      title: string;
      url: string;
      descHead: string;
      hasHighlights: boolean;
      highlightHead: string;
    }>;
  } = {
    shouldSearch: decision.shouldSearch,
    queriesCount: decision.queries.length,
    queriesSample: decision.queries.slice(0, 3),
    rawResultsCount: 0,
    candidatesCount: 0,
  };

  if (!decision.shouldSearch || decision.queries.length === 0) {
    console.info("[CoAlter] webConnector.retrieval", diag);
    return [];
  }

  // Perspective Engine の executeSearch を利用
  const rawResults = await executeSearch(decision.queries, 5000);
  diag.rawResultsCount = rawResults.length;

  // Phase A.7 D2: rawResults 先頭 3 件のサンプルを diag に詰める
  diag.rawSamples = rawResults.slice(0, 3).map((r) => {
    const highlights = Array.isArray(r.highlights) ? r.highlights : [];
    return {
      title: (r.title ?? "").slice(0, 60),
      url: r.url ?? "",
      descHead: (r.text ?? "").slice(0, 50),
      hasHighlights: highlights.length > 0,
      highlightHead: highlights.join(" / ").slice(0, 80),
    };
  });

  if (rawResults.length === 0) {
    console.info("[CoAlter] webConnector.retrieval", diag);
    return [];
  }

  // Phase A.7 D4 実験 (2026-04-19): highlights を description に連結する。
  //
  // 仮説 G: EXA の `r.highlights` (sentence-level 重要文) を webConnector が捨てており、
  //   theater 情報がそこに含まれている場合に parseMovieScreenings が拾えない。
  //   `r.text` 先頭 200 字だけでは listicle 記事の meta 部分しか入らず、theater 情報が
  //   欠落しやすい。highlights を末尾に連結することで combinedText の情報量が増え、
  //   extractTheaters / theaterNearTitle が theater を拾える確率が上がる可能性がある。
  //
  // 試作方針:
  //   description = [r.text.slice(0, 200), ...highlights].join(" / ").slice(0, 500)
  //   500 字上限で LLM プロンプト側の trimming (140 字 snippet) を壊さないよう配慮。
  //   highlights が空なら従来どおり 200 字 slice。
  //
  // ブランチ: feat/coalter-highlights-experiment (merge しない、効果測定専用)
  const candidates: SearchCandidate[] = rawResults
    .filter((r) => r.title && r.text)
    .map((r) => {
      const highlights = Array.isArray(r.highlights) ? r.highlights : [];
      const baseDesc = r.text.slice(0, 200);
      const descWithHighlights =
        highlights.length > 0
          ? [baseDesc, ...highlights].join(" / ").slice(0, 500)
          : baseDesc;
      return {
        title: r.title,
        description: descWithHighlights,
        externalRating: extractRating(r.text),
        practicalInfo: extractPracticalInfo(r.text),
        source: new URL(r.url).hostname,
        url: r.url,
      };
    })
    // 重複タイトルを除去
    .filter(
      (c, i, arr) =>
        arr.findIndex((x) => x.title === c.title) === i,
    )
    .slice(0, 10); // 最大10件（LLMが絞る）

  diag.candidatesCount = candidates.length;
  console.info("[CoAlter] webConnector.retrieval", diag);
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
