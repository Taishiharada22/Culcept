/**
 * Perspective Engine — Alter の多視点統合エンジン
 *
 * Alter の本人モデルを軸に、外界の視点を取り込んで判断の厚みを増す。
 * 検索結果は ForceBalance の重みを更新しうるが、結論を直接上書きしない。
 *
 * パイプライン:
 *   analyzeQueryContext → classifyQuestion → searchGate → retrieve → classify → personalize → inject
 *
 * @see docs/alter-perspective-engine-design.md v2
 */

import { runAI } from "@/lib/ai";
import { STARGAZER_FLAGS } from "./featureFlags";
import type { ForceBalance, QueryContext, QuestionCategory } from "./alterHomeAdapter";

// ─── Types ────────────────────────────────────────────────────────────────

export type EpistemicType =
  | "empirical_fact"
  | "statistical_claim"
  | "expert_analysis"
  | "normative_claim"
  | "opinion"
  | "personal_experience"
  | "anecdote";

export type SourceAuthority = "academic" | "government" | "industry" | "media" | "personal";

export type StanceDirection = "support" | "oppose" | "neutral" | "nuanced";

export type ResponseSourceType = "internal" | "external_augmented" | "mixed";

export interface PerspectiveFragment {
  text: string;
  sourceUrl: string;
  sourceTitle: string;
  epistemicType: EpistemicType;
  confidence: number;
  sourceAuthority: SourceAuthority;
  stanceTowardQuery: StanceDirection;
  forceRelevance: {
    opportunity: number;
    cost: number;
    relationship: number;
    value: number;
    fear: number;
    growth: number;
  };
}

export interface SearchResult {
  title: string;
  url: string;
  text: string;
  highlights?: string[];
  score?: number;
}

export interface PerspectiveBlock {
  fragments: PerspectiveFragment[];
  promptBlock: string;
  forceBalanceDelta: Partial<ForceBalance>;
  searchQueriesSent: string[];
  searchLatencyMs: number;
}

export interface PerspectiveAudit {
  sourceType: ResponseSourceType;
  fragmentsUsed: PerspectiveFragment[];
  forceBalanceDelta: Partial<ForceBalance>;
  searchQueriesSent: string[];
  searchLatencyMs: number;
  gateDecision: "fired" | "skipped";
  gateReason: string;
  /** L0 explicit ask が検出されたか */
  isExplicitAsk: boolean;
  /** explicit ask が検出されたが検索不可だったか（直答パス用） */
  explicitAskBlocked: boolean;
}

/** Quality Gate の判定結果 */
export type QualityAction = "use" | "supplement" | "discard" | "abstain";

export interface QualityGateResult {
  action: QualityAction;
  filteredFragments: PerspectiveFragment[];
  reason: string;
  /** 不十分な場合にAlterに「確信は持てないけど」修飾を付けるか */
  needsHedge: boolean;
  /** quality gate が discard/abstain の場合、clarify で1問聞く余地があるか */
  canClarify: boolean;
}

// ─── Search Gate ──────────────────────────────────────────────────────────

/**
 * 明示的検索要求を検出する。Phase/Trust の外で動作する。
 *
 * Acceptance Criteria:
 * 1. 「WEBで」「ネットで」「調べて」「検索して」が入ったら通常会話に流さない
 * 2. 検索可能なら、そのまま検索に入る
 * 3. 検索不可なら、短く能力直答して終える（「今は検索をまだ有効化していない」）
 *
 * @see UAR (Chen, EMNLP 2024) — explicit intent を独立レイヤーに
 * @see Know Your Limits (TACL 2025) — explicit ask を潰すのは over-abstention
 */
export function detectExplicitSearchIntent(message: string): boolean {
  const explicitPatterns =
    /調べ(て|たい|よう|る|てみ)|検索(し|して|する)|WEB(で|から|検索)|ウェブ(で|から)|ネット(で|から|検索)|探し(て|たい|てみ)|引っ張って|持って(き|来)|ググ(って|る|れ)|サーチ(し|して)/i;
  return explicitPatterns.test(message);
}

/**
 * 検索が必要かどうかを判定する（再設計版）。
 *
 * 7層アーキテクチャ:
 *   L0: Explicit Intent — Phase/Trust 不問で検索ルートへ
 *   L1: External Knowledge Need — 実在エンティティ/事実密度/比較
 *   L2: Freshness / Recency — 時間修飾/市場/制度
 *   L3: High-Stakes Domain — career/medical/legal/financial
 *   L4: Uncertainty — パーソナルモデル外/ニッチ情報
 *   L5: Suppression — 感情/内面完結/挨拶
 *   L6: Threshold — 合成スコアで SEARCH / SKIP / (gray zone)
 *
 * 文献基盤:
 *   - UAR (Chen, EMNLP 2024): 4軸直交基準（意図/知識/時間/不確実性）
 *   - Adaptive-RAG (Jeong, NAACL 2024): クエリ複雑度ルーティング
 *   - Self-RAG (Asai, NeurIPS 2023): 不要な検索は逆効果
 *   - Mallen (ACL 2023): ニッチ情報は検索必須、一般常識は不要
 *   - Know Your Limits (TACL 2025): explicit ask を潰すのは over-abstention
 */
export function evaluateSearchGate(
  message: string,
  queryContext: QueryContext,
  questionCategory: QuestionCategory,
  hdmPhase: number,
  trustLevel: number,
  responseMode: string,
): {
  shouldSearch: boolean;
  searchNeed: number;
  reason: string;
  isExplicitAsk: boolean;
  explicitAskBlocked: boolean;
} {
  const isExplicitAsk = detectExplicitSearchIntent(message);

  // ── L0: Explicit Search Intent ──────────────────────────────────
  // Phase/Trust の前に判定。明示要求は常に honor する。
  // 検索不可なら「今は検索をまだ有効化していない」と直答（通常会話に流さない）。
  if (isExplicitAsk) {
    if (!STARGAZER_FLAGS.explicitSearchLive) {
      // 検索不可 → 直答パスへ（route.ts で処理）
      return {
        shouldSearch: false,
        searchNeed: 1.0,
        reason: "explicit_ask_blocked",
        isExplicitAsk: true,
        explicitAskBlocked: true,
      };
    }
    // 検索可能 → Phase/Trust をバイパスして検索実行
    return {
      shouldSearch: true,
      searchNeed: 1.0,
      reason: "explicit_ask",
      isExplicitAsk: true,
      explicitAskBlocked: false,
    };
  }

  // ── Implicit Search: Kill switch ──────────────────────────────
  if (!STARGAZER_FLAGS.implicitSearchLive) {
    return { shouldSearch: false, searchNeed: 0, reason: "implicit_search_off", isExplicitAsk: false, explicitAskBlocked: false };
  }

  // ── L0b: Response mode / greeting exclusions ──────────────────
  if (responseMode === "clarify" || responseMode === "repair") {
    return { shouldSearch: false, searchNeed: 0, reason: `mode_${responseMode}`, isExplicitAsk: false, explicitAskBlocked: false };
  }

  const greetingPatterns = /^(おはよう|こんにちは|こんばんは|ただいま|やあ|よう|ひさしぶり)/;
  const askMePatterns = /(質問して|聞いて|何か聞いて)/;
  if (greetingPatterns.test(message)) {
    return { shouldSearch: false, searchNeed: 0, reason: "greeting", isExplicitAsk: false, explicitAskBlocked: false };
  }
  if (askMePatterns.test(message)) {
    return { shouldSearch: false, searchNeed: 0, reason: "ask_me", isExplicitAsk: false, explicitAskBlocked: false };
  }

  // ── Phase/Trust gate（暗黙判定にのみ適用）──────────────────────
  // 緩和: >= 2 → >= 1（Phase 1 から暗黙検索を許可）
  // 緩和: >= 3 → >= 2（Trust 2 から暗黙検索を許可）
  if (hdmPhase < 1) {
    return { shouldSearch: false, searchNeed: 0, reason: "phase_too_low", isExplicitAsk: false, explicitAskBlocked: false };
  }
  if (trustLevel < 2) {
    return { shouldSearch: false, searchNeed: 0, reason: "trust_too_low", isExplicitAsk: false, explicitAskBlocked: false };
  }

  // ── L1: External Knowledge Need ─────────────────────────────────
  let searchNeed = 0;

  // 実在エンティティ（固有名詞 + ニッチ度推定）
  // Mallen (ACL 2023): ニッチ情報は検索必須
  const entityPatterns = /[A-Z][a-z]+|[A-Z]{2,}|HSP|ADHD|MBTI|エニアグラム|ストレングスファインダー|株式会社|Inc\.|Co\./;
  if (entityPatterns.test(message)) searchNeed += 0.15;

  // 事実密度
  const factualPatterns = /って(本当|ほんと)|って(何|なに)|とは|意味|定義|割合|%|パーセント|統計|データ|研究|科学的|何(円|万|人|年|件|%)/;
  if (factualPatterns.test(message)) searchNeed += 0.25;

  // 比較・選択
  const comparisonPatterns = /どっち|どちらが|比較|他に(ある|ない)|おすすめ|選択肢|候補|一覧|ランキング|違い/;
  if (comparisonPatterns.test(message)) searchNeed += 0.2;

  // ── L2: Freshness / Recency ─────────────────────────────────────
  // UAR (Chen, EMNLP 2024): Time-Sensitive-aware
  const temporalPatterns = /今(の|は)|最近|2025|2026|最新|トレンド|動向|今後|将来|ニュース/;
  if (temporalPatterns.test(message)) searchNeed += 0.25;

  // 市場・業界（本質的に時間依存）
  const marketPatterns = /市場|相場|年収|給与|給料|求人|転職市場|業界(動向|事情)|採用|募集/;
  if (marketPatterns.test(message)) searchNeed += 0.2;

  // ── L3: High-Stakes Domain ──────────────────────────────────────
  const highExternalDomains: string[] = [
    "career_fit", "industry_fit", "creation", "lifestyle", "founder_team_fit",
  ];
  const mediumExternalDomains: string[] = ["work", "romance"];
  if (highExternalDomains.includes(queryContext.domain)) {
    searchNeed += 0.25;
  } else if (mediumExternalDomains.includes(queryContext.domain)) {
    searchNeed += 0.15;
  }

  // 医療・法律・金融キーワード
  const highStakesKeywords = /病気|症状|治療|診断|薬|法律|権利|義務|契約|保険|年金|税金|投資|ローン|慰謝料|損害賠償/;
  if (highStakesKeywords.test(message)) searchNeed += 0.25;

  // ── L4: Uncertainty ─────────────────────────────────────────────
  // パーソナルモデル外の質問（外部世界についての質問）
  const externalWorldPatterns = /会社|企業|サービス|アプリ|ツール|場所|お店|地域|国|制度|法改正|価格|料金|費用/;
  if (externalWorldPatterns.test(message)) searchNeed += 0.2;

  // 自分×外部視点（「自分の性質」+「普通かどうか」の外部基準）
  const selfExternalPatterns = /って(甘え|普通|おかしい|変|異常)|みんなは|一般的|他の人|タイプの人|こういう(性格|人|タイプ)|な人って|損してる|得してる/;
  if (queryContext.domain === "self" && selfExternalPatterns.test(message)) {
    searchNeed += 0.3;
  }

  // 判断支援
  const decisionPatterns = /すべき|した(ほう|方)がいい|どうすれば|何から始め|どう(受け止め|対処|対応|向き合)|迷って/;
  if (decisionPatterns.test(message)) {
    searchNeed += 0.15;
  }

  // 実用的（how-to）
  const practicalPatterns = /準備|方法|やり方|手順|コツ|ポイント|始め(たい|よう|る)|何を(準備|用意)/;
  if (practicalPatterns.test(message)) {
    searchNeed += 0.15;
  }

  // ── L5: Suppression ─────────────────────────────────────────────
  // Self-RAG (Asai, NeurIPS 2023): 不要な検索は逆効果
  const pureEmotionalPatterns = /^(しんどい|つらい|疲れた|泣きたい|もう(無理|だめ|やだ)|きつい|消えたい)/;
  if (pureEmotionalPatterns.test(message)) {
    searchNeed = Math.max(0, searchNeed - 0.4);
  }

  const pureInternalPatterns = /^(僕|私|俺|自分)(の|って)(強み|弱み|特徴|性格|いいところ|課題)/;
  if (pureInternalPatterns.test(message) && !selfExternalPatterns.test(message)) {
    searchNeed = Math.max(0, searchNeed - 0.3);
  }

  // ── L6: Threshold ───────────────────────────────────────────────
  // Adaptive-RAG (Jeong, NAACL 2024): 3段階ルーティング
  if (searchNeed >= 0.5) {
    return {
      shouldSearch: true,
      searchNeed,
      reason: `implicit_high_${searchNeed.toFixed(2)}_domain=${queryContext.domain}`,
      isExplicitAsk: false,
      explicitAskBlocked: false,
    };
  }
  if (searchNeed >= 0.3) {
    // グレーゾーン: 高リスクドメインなら検索する
    if (highExternalDomains.includes(queryContext.domain)) {
      return {
        shouldSearch: true,
        searchNeed,
        reason: `implicit_gray_domain_boost_${queryContext.domain}`,
        isExplicitAsk: false,
        explicitAskBlocked: false,
      };
    }
    return {
      shouldSearch: false,
      searchNeed,
      reason: `implicit_gray_skip_${searchNeed.toFixed(2)}`,
      isExplicitAsk: false,
      explicitAskBlocked: false,
    };
  }

  return {
    shouldSearch: false,
    searchNeed,
    reason: `below_threshold_${searchNeed.toFixed(2)}`,
    isExplicitAsk: false,
    explicitAskBlocked: false,
  };
}

// ─── Privacy Gate ─────────────────────────────────────────────────────────

/**
 * ユーザーの質問から、パーソナルモデル情報を除去した検索クエリを生成する。
 * 性格タイプ、感情状態、関係性情報は検索エンジンに送信しない。
 *
 * v3 変更: conversationSummary を追加。
 * 短い explicit ask（「WEBから見つけてきて」「調べて」等）の場合、
 * 直前の会話文脈からクエリを生成する。
 * これがないと「WEB検索」「情報検索」のようなメタクエリが生成されてしまう。
 */
export async function generateSafeSearchQueries(
  message: string,
  queryContext: QueryContext,
  userId?: string,
  conversationSummary?: string,
): Promise<string[]> {
  // 短い explicit ask の場合、会話文脈がないとまともなクエリを生成できない
  const isShortExplicit = message.length < 30 && detectExplicitSearchIntent(message);
  const contextSection = (isShortExplicit && conversationSummary)
    ? `\n## 直前の会話の話題（検索対象の特定に使用）\n${conversationSummary}`
    : "";

  const result = await runAI({
    taskType: "perspective_privacy_gate",
    prompt: `ユーザーの質問から、Web検索用のクエリを1〜2個生成してください。

## ルール
- 個人的な情報（性格、感情、関係性、名前）は絶対に含めない
- 一般的な知識・事実・専門家見解を検索できるクエリにする
- 日本語で検索クエリを生成する
- 各クエリは簡潔に（10語以内）
- 「調べて」「検索して」「WEBで」等の検索指示語自体はクエリに含めない
- ユーザーが「WEBから見つけてきて」のような短い指示の場合、直前の会話の話題を元にクエリを生成すること
- 「WEB検索」「ネット検索」「情報検索」のようなメタクエリは絶対に生成しない

## ユーザーの質問
${message}
${contextSection}
## 検出されたドメイン
${queryContext.domain}

## 出力形式（JSON）
{"queries": ["検索クエリ1", "検索クエリ2"]}`,
    systemPrompt: "あなたはWeb検索クエリを生成する専門家です。個人情報を一切含まない、ユーザーが実際に知りたい内容に即した検索クエリを生成してください。「検索」「WEB」等のメタワードは絶対に含めないこと。",
    requireJson: true,
    temperature: 0.3,
    maxOutputTokens: 200,
    userId,
    metadata: { feature: "perspective_engine", step: "privacy_gate" },
  });

  const structured = result.structured as Record<string, unknown> | null;
  if (structured && Array.isArray(structured.queries)) {
    const queries = (structured.queries as string[]).slice(0, 2);
    // メタクエリフィルタ: 「WEB検索」「ネット検索」等のゴミクエリを排除
    const filtered = queries.filter(q =>
      !/^(WEB|ウェブ|ネット|インターネット|情報)(検索|サーチ)$/i.test(q.trim())
    );
    if (filtered.length > 0) return filtered;
    // フィルタで全部消えた場合、ドメインベースのフォールバック
    if (queryContext.domain && queryContext.domain !== "self" && queryContext.domain !== "general") {
      return [queryContext.domain.replace(/_/g, " ") + " 最新情報"];
    }
  }

  // Fallback: 質問からキーワードを抽出（検索指示語を除外）
  const keywords = message
    .replace(/[？?！!。、]/g, " ")
    .replace(/(調べ|検索|WEB|ウェブ|ネット|探し|見つけ|持って|引っ張)[てたるるよい来き]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 3);
  return keywords.length > 0 ? [keywords.join(" ")] : [];
}

// ─── Search Execution ─────────────────────────────────────────────────────

const EXA_API_URL = "https://api.exa.ai/search";

/**
 * Exa.ai でセマンティック検索を実行する。
 * fail-open: タイムアウトや失敗時は空配列を返す。
 */
export async function executeSearch(
  queries: string[],
  timeoutMs: number = 3000,
): Promise<SearchResult[]> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    console.warn("[PerspectiveEngine] EXA_API_KEY not set, skipping search");
    return [];
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // 並列化: 全クエリを同時に実行（従来はシリアルで2倍の時間がかかっていた）
    const fetchPromises = queries.slice(0, 2).map(async (query): Promise<SearchResult[]> => {
      try {
        const response = await fetch(EXA_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            query,
            type: "auto",
            numResults: 3,
            contents: {
              text: { maxCharacters: 300 },    // 500→300: token 節約
              highlights: { numSentences: 1 },  // 2→1: 重要な1文のみ
            },
          }),
          signal: controller.signal,
        });

        if (response.ok) {
          const data = await response.json();
          if (data.results && Array.isArray(data.results)) {
            return data.results.map((r: Record<string, unknown>) => ({
              title: (r.title as string) || "",
              url: (r.url as string) || "",
              text: (r.text as string) || "",
              highlights: (r.highlights as string[]) || [],
              score: r.score as number | undefined,
            }));
          }
        }
        return [];
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          console.warn(`[PerspectiveEngine] Search query failed: ${query}`, e);
        }
        return [];
      }
    });

    const allResults = await Promise.all(fetchPromises);
    return allResults.flat();
  } finally {
    clearTimeout(timer);
  }
}

// ─── Epistemic Classification ─────────────────────────────────────────────

const CONFIDENCE_THRESHOLDS: Record<EpistemicType, number> = {
  empirical_fact: 0.7,
  statistical_claim: 0.7,
  expert_analysis: 0.6,
  normative_claim: 1.1, // 常に破棄（Alterは「べき」を語らない）
  opinion: 0.5,
  personal_experience: 0.5,
  anecdote: 0.5,
};

/**
 * 検索結果を認識論的に分類し、PerspectiveFragment に変換する。
 * LLM の構造化出力を使用。
 */
export async function classifySearchResults(
  searchResults: SearchResult[],
  queryContext: QueryContext,
  message: string,
  userId?: string,
): Promise<PerspectiveFragment[]> {
  if (searchResults.length === 0) return [];

  // 検索結果をまとめてLLMに分類させる
  const resultsText = searchResults
    .slice(0, 5)
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.text?.slice(0, 300) || r.highlights?.join(" ") || ""}`)
    .join("\n\n");

  const result = await runAI({
    taskType: "perspective_classify",
    prompt: `以下のWeb検索結果を分類してください。

## ユーザーの質問
${message}

## ドメイン
${queryContext.domain}

## 検索結果
${resultsText}

## 分類ルール
各結果について以下を判定:
- relevance_to_question: 0.0-1.0（**最重要**。この結果がユーザーの質問に直接関連するか。質問と全く関係ない情報は 0.0。例: ユーザーが求人を聞いているのに検索エンジンの使い方が返ってきた場合は 0.0）
- epistemic_type: empirical_fact / statistical_claim / expert_analysis / normative_claim / opinion / personal_experience / anecdote
- confidence: 0.0-1.0（情報の信頼性）
- source_authority: academic / government / industry / media / personal
- stance: support / oppose / neutral / nuanced（質問に対する立場）
- force_relevance: 各力への関連度 (0.0-1.0)
  - opportunity: 機会・チャンスを示すか
  - cost: コスト・リスクを示すか
  - relationship: 関係性に関わるか
  - value: 価値観に関わるか
  - fear: 恐れに関わるか
  - growth: 成長に関わるか
- key_insight: この結果から得られる最も重要な洞察（1文）

## ハードネガティブに注意
検索結果が「事実として正確」でも「ユーザーの質問と無関係」なら relevance_to_question を低くすること。
例: 楽天ウェブ検索のポイント情報は事実だが、求人の質問には無関連 → relevance=0.0

## 出力形式（JSON）
{"fragments": [{"index": 1, "relevance_to_question": 0.8, "epistemic_type": "...", "confidence": 0.8, "source_authority": "...", "stance": "...", "force_relevance": {"opportunity": 0.0, "cost": 0.0, "relationship": 0.0, "value": 0.0, "fear": 0.0, "growth": 0.0}, "key_insight": "..."}]}`,
    systemPrompt: "あなたは情報の認識論的分類と関連性判定の専門家です。まず各情報片がユーザーの質問に直接関連するかを判定し（relevance_to_question）、その上で事実か意見か体験談かを分類してください。質問と無関連な情報は relevance_to_question=0.0 としてください。",
    requireJson: true,
    temperature: 0.2,
    maxOutputTokens: 1000,
    userId,
    metadata: { feature: "perspective_engine", step: "classify" },
  });

  const fragments: PerspectiveFragment[] = [];

  const classifyStructured = result.structured as Record<string, unknown> | null;
  if (classifyStructured && Array.isArray(classifyStructured.fragments)) {
    for (const f of classifyStructured.fragments as Array<Record<string, unknown>>) {
      const idx = (f.index as number) - 1;
      const source = searchResults[idx];
      if (!source) continue;

      // v3: ハードネガティブ除去（Cuconasu, SIGIR 2024）
      // 質問との関連性が低い結果は、confidence が高くても除外
      const relevance = (f.relevance_to_question as number) ?? 1.0; // 未指定時は互換のため 1.0
      if (relevance < 0.3) {
        console.info(`[perspective-engine] 🗑️ Hard negative filtered: [${(f.index as number)}] relevance=${relevance.toFixed(2)}`);
        continue;
      }

      const epistemicType = f.epistemic_type as EpistemicType;
      const confidence = f.confidence as number;

      // タイプ別 confidence 閾値でフィルタ
      const threshold = CONFIDENCE_THRESHOLDS[epistemicType] ?? 0.7;
      if (confidence < threshold) continue;

      const forceRel = f.force_relevance as Record<string, number> | undefined;

      fragments.push({
        text: (f.key_insight as string) || source.text?.slice(0, 200) || "",
        sourceUrl: source.url,
        sourceTitle: source.title,
        epistemicType,
        confidence,
        sourceAuthority: (f.source_authority as SourceAuthority) || "media",
        stanceTowardQuery: (f.stance as StanceDirection) || "neutral",
        forceRelevance: {
          opportunity: forceRel?.opportunity ?? 0,
          cost: forceRel?.cost ?? 0,
          relationship: forceRel?.relationship ?? 0,
          value: forceRel?.value ?? 0,
          fear: forceRel?.fear ?? 0,
          growth: forceRel?.growth ?? 0,
        },
      });
    }
  }

  // Diversity floor: 対立視点が含まれているか確認
  const hasOppose = fragments.some((f) => f.stanceTowardQuery === "oppose");
  const hasSupport = fragments.some((f) => f.stanceTowardQuery === "support");
  // 片方しかない場合は neutral/nuanced を補完役として残す（削除しない）

  // トークン予算制: 圧縮後 300 tokens 上限（≈ 日本語150文字 × fragments数）
  // 最大 3 fragments（多すぎると Alter の声が薄まる）
  const TOKEN_BUDGET = 300;
  const MAX_FRAGMENTS = 3;
  const estimateTokens = (text: string) => Math.ceil(text.length / 1.5); // 日本語近似
  let totalTokens = 0;
  const budgetedFragments: PerspectiveFragment[] = [];

  // Diversity floor: support と oppose を優先して含める
  const sorted = [...fragments].sort((a, b) => {
    // oppose > support > その他 の順で優先
    const priority = (f: PerspectiveFragment) =>
      f.stanceTowardQuery === "oppose" ? 2
      : f.stanceTowardQuery === "support" ? 1
      : 0;
    return priority(b) - priority(a);
  });

  for (const f of sorted) {
    if (budgetedFragments.length >= MAX_FRAGMENTS) break;
    const tokens = estimateTokens(f.text);
    if (totalTokens + tokens > TOKEN_BUDGET && budgetedFragments.length >= 2) break;
    budgetedFragments.push(f);
    totalTokens += tokens;
  }

  console.info(
    `[perspective-engine] 📊 Fragments: ${fragments.length} classified → ${budgetedFragments.length} budgeted (${totalTokens} tokens est.)`
  );

  return budgetedFragments;
}

// ─── ForceBalance Delta Calculation ───────────────────────────────────────

/**
 * 分類された視点フラグメントから ForceBalance の調整量を算出する。
 * 外部情報は重みを「更新」するが、「上書き」しない。
 */
export function calculateForceBalanceDelta(
  fragments: PerspectiveFragment[],
): Partial<ForceBalance> {
  if (fragments.length === 0) return {};

  let oppDelta = 0;
  let costDelta = 0;
  let regretSkipDelta = 0;
  let regretDoDelta = 0;

  for (const f of fragments) {
    const weight = f.confidence * 0.15; // 最大 15% の影響力（控えめ）

    // opportunity / cost に直接マッピング
    oppDelta += f.forceRelevance.opportunity * weight;
    costDelta += f.forceRelevance.cost * weight;

    // fear → regret_if_do, growth → regret_if_skip
    regretDoDelta += f.forceRelevance.fear * weight;
    regretSkipDelta += f.forceRelevance.growth * weight;
  }

  // 正規化（fragments 数で割って1件あたりの影響を一定に保つ）
  const n = fragments.length;
  const delta: Partial<ForceBalance> = {};

  if (oppDelta > 0) delta.opportunity_value = Math.min(oppDelta / n, 0.15);
  if (costDelta > 0) delta.cost_load = Math.min(costDelta / n, 0.15);
  if (regretSkipDelta > 0) delta.regret_if_skip = Math.min(regretSkipDelta / n, 0.1);
  if (regretDoDelta > 0) delta.regret_if_do = Math.min(regretDoDelta / n, 0.1);

  return delta;
}

// ─── Retrieval Quality Gate ──────────────────────────────────────────────

/**
 * 検索後の品質ゲート。CRAG 3段階判定 + Sufficient Context 判定。
 *
 * 検索結果を受け取り、4つのアクションのいずれかを返す:
 *   use       — 十分な品質。そのまま Alter のプロンプトに注入
 *   supplement — 不十分だが使える。hedge 修飾付きで注入
 *   discard   — 品質が低い。破棄して内部知識で回答
 *   abstain   — 結果なし。棄権（clarify で1問聞く余地あり）
 *
 * 文献基盤:
 *   - CRAG (Yan, 2024): 3段階（Correct/Ambiguous/Incorrect）
 *   - Sufficient Context (Google, ICLR 2025): 十分性判定
 *   - Yoran (ICLR 2024): NLI フィルタ
 *   - Du & Tian (EMNLP Findings 2025): 注入量の最小化
 */
export function retrievalQualityGate(
  fragments: PerspectiveFragment[],
  message: string,
): QualityGateResult {
  // 結果なし → abstain
  if (fragments.length === 0) {
    return {
      action: "abstain",
      filteredFragments: [],
      reason: "no_fragments",
      needsHedge: false,
      canClarify: true,
    };
  }

  // Step 1: Confidence-based relevance filter
  // 各 fragment のタイプ別 confidence 閾値は classifySearchResults() で既に適用済み。
  // ここでは追加の品質チェックを行う。

  // Step 2: ハードネガティブ検出（Cuconasu, SIGIR 2024）
  // 信頼度が中途半端（0.5-0.6）で stance が neutral ばかりのフラグメントは
  // 「似ているが実は関連が薄い」可能性が高い
  const highQuality = fragments.filter(
    (f) => f.confidence >= 0.7 || f.stanceTowardQuery !== "neutral",
  );
  const mediumQuality = fragments.filter(
    (f) => f.confidence >= 0.5 && f.confidence < 0.7 && f.stanceTowardQuery === "neutral",
  );

  // 高品質 fragment がゼロ → discard
  if (highQuality.length === 0 && mediumQuality.length > 0) {
    return {
      action: "discard",
      filteredFragments: [],
      reason: "only_medium_quality_neutral",
      needsHedge: false,
      canClarify: true,
    };
  }

  // Step 3: Sufficient Context 判定（Google, ICLR 2025）
  // 高品質 fragment が1件以上 or 合計2件以上 → sufficient
  const filteredFragments = highQuality.length > 0 ? highQuality : fragments;
  const isSufficient =
    highQuality.length >= 2 ||
    (highQuality.length >= 1 && filteredFragments.some((f) => f.confidence >= 0.8));

  if (!isSufficient) {
    // 使えるが不十分 → supplement（hedge 修飾付き）
    // CEO方針: 検索後に不十分だったら1問だけ確認する余地を残す
    return {
      action: "supplement",
      filteredFragments,
      reason: "insufficient_context",
      needsHedge: true,
      canClarify: true,
    };
  }

  // Step 4: Correct（十分な品質）
  return {
    action: "use",
    filteredFragments,
    reason: "sufficient_quality",
    needsHedge: false,
    canClarify: false,
  };
}

// ─── Prompt Block Generation ──────────────────────────────────────────────

/**
 * 分類済みフラグメントから、Alter のシステムプロンプトに注入するブロックを生成する。
 *
 * @param needsHedge - Quality Gate が supplement と判定した場合 true。
 *                     Alter に「確信は持てないけど」修飾を指示する。
 */
export function buildPerspectivePromptBlock(
  fragments: PerspectiveFragment[],
  forceBalanceDelta: Partial<ForceBalance>,
  needsHedge: boolean = false,
): string {
  if (fragments.length === 0) return "";

  const lines: string[] = [];
  lines.push("## 外界の視点（参考材料）");
  lines.push("以下の視点を自分のレンズで消化して語ってよい。ただし:");
  lines.push("- 「調べた」「記事によると」「研究では」とは言わない");
  lines.push("- 自分の言葉で語る：「こういう見方もあるんだけど」「実はね」「面白いのが」");
  lines.push("- 必ず結論を出す。「いろんな意見があるね」で終わることは禁止");
  lines.push("- 外部視点を入れても、あなたの結論はパーソナルモデルから導出すること");
  if (needsHedge) {
    lines.push("- ※ 以下の情報は確定的ではない。「確実ではないけど」「俺の知る限りだと」等の修飾を付けて語ること");
    lines.push("- 情報量が多い場合は「一番面白いのは…」で1点に絞って語ってよい");
  }
  lines.push("");

  for (const f of fragments) {
    const stanceLabel =
      f.stanceTowardQuery === "support" ? "肯定的"
      : f.stanceTowardQuery === "oppose" ? "否定的"
      : f.stanceTowardQuery === "nuanced" ? "条件付き"
      : "中立";
    const typeLabel =
      f.epistemicType === "empirical_fact" ? "事実"
      : f.epistemicType === "statistical_claim" ? "統計"
      : f.epistemicType === "expert_analysis" ? "専門家見解"
      : f.epistemicType === "personal_experience" ? "体験談"
      : f.epistemicType === "anecdote" ? "事例"
      : "意見";

    lines.push(`- [${typeLabel}/${stanceLabel}] ${f.text}`);
  }

  // ForceBalance delta hint
  const deltaHints: string[] = [];
  if (forceBalanceDelta.opportunity_value) {
    deltaHints.push(`機会の具体性が増した(+${(forceBalanceDelta.opportunity_value * 100).toFixed(0)}%)`);
  }
  if (forceBalanceDelta.cost_load) {
    deltaHints.push(`リスクの具体性も増した(+${(forceBalanceDelta.cost_load * 100).toFixed(0)}%)`);
  }
  if (deltaHints.length > 0) {
    lines.push("");
    lines.push(`※ 外部情報により: ${deltaHints.join("、")}`);
  }

  return lines.join("\n");
}

// ─── Main Orchestrator ────────────────────────────────────────────────────

/**
 * Perspective Engine のメインエントリポイント（再設計版）。
 *
 * パイプライン:
 *   L0-L6 Gate → Privacy Gate → Search → Classify → Quality Gate → Personalize → Prompt Block
 *
 * 変更点（v2 → v3）:
 *   - L0 explicit ask を Phase/Trust の外に分離
 *   - Quality Gate（CRAG 3段階 + Sufficient Context）を追加
 *   - hedge 修飾（不十分な検索結果の場合）
 *   - explicit_search_live / implicit_search_live フラグ分離
 *
 * fail-open: どこで失敗しても null を返し、従来パスにフォールバックする。
 */

/** 各ステップのレイテンシ分解 */
export interface PerspectiveLatencyBreakdown {
  queryGenerationMs: number;
  searchMs: number;
  classificationMs: number;
  qualityGateMs: number;
  promptBuildMs: number;
  totalMs: number;
}

export interface PerspectiveEngineResult {
  block: PerspectiveBlock;
  audit: PerspectiveAudit;
  qualityGate?: QualityGateResult;
  latencyBreakdown?: PerspectiveLatencyBreakdown;
}

export async function runPerspectiveEngine(params: {
  message: string;
  queryContext: QueryContext;
  questionCategory: QuestionCategory;
  hdmPhase: number;
  trustLevel: number;
  responseMode: string;
  userId?: string;
  /** 直前の会話の話題要約（短い explicit ask 時に Privacy Gate がクエリ生成に使う） */
  conversationSummary?: string;
}): Promise<PerspectiveEngineResult | null> {
  const startTime = Date.now();

  // 1. Gate（L0-L6）
  const gate = evaluateSearchGate(
    params.message,
    params.queryContext,
    params.questionCategory,
    params.hdmPhase,
    params.trustLevel,
    params.responseMode,
  );

  const baseAudit: PerspectiveAudit = {
    sourceType: "internal",
    fragmentsUsed: [],
    forceBalanceDelta: {},
    searchQueriesSent: [],
    searchLatencyMs: 0,
    gateDecision: "skipped",
    gateReason: gate.reason,
    isExplicitAsk: gate.isExplicitAsk,
    explicitAskBlocked: gate.explicitAskBlocked,
  };

  if (!gate.shouldSearch) {
    return {
      block: {
        fragments: [],
        promptBlock: "",
        forceBalanceDelta: {},
        searchQueriesSent: [],
        searchLatencyMs: 0,
      },
      audit: baseAudit,
    };
  }

  try {
    // 2. Privacy Gate + Query Generation
    const queryGenStart = Date.now();
    const queries = await generateSafeSearchQueries(
      params.message,
      params.queryContext,
      params.userId,
      params.conversationSummary,
    );
    const queryGenerationMs = Date.now() - queryGenStart;

    if (queries.length === 0) {
      return null; // fail-open
    }

    // 3. Search Execution (並列化: 全クエリを同時実行)
    const searchStart = Date.now();
    const searchResults = await executeSearch(queries);
    const searchMs = Date.now() - searchStart;

    if (searchResults.length === 0) {
      console.info("[perspective-engine] Search returned 0 results, fail-open");
      return null; // fail-open
    }

    // 4. Epistemic Classification
    const classifyStart = Date.now();
    const classifiedFragments = await classifySearchResults(
      searchResults,
      params.queryContext,
      params.message,
      params.userId,
    );
    const classificationMs = Date.now() - classifyStart;

    // 5. Quality Gate（CRAG 3段階 + Sufficient Context）
    const qualityGateStart = Date.now();
    const qualityResult = retrievalQualityGate(
      classifiedFragments,
      params.message,
    );
    const qualityGateMs = Date.now() - qualityGateStart;

    console.info(
      `[perspective-engine] 🔍 Quality gate: action=${qualityResult.action}, reason=${qualityResult.reason}, ` +
      `fragments=${classifiedFragments.length}→${qualityResult.filteredFragments.length}, hedge=${qualityResult.needsHedge}`
    );

    // Quality Gate が discard/abstain → 検索結果を使わない
    if (qualityResult.action === "discard" || qualityResult.action === "abstain") {
      const totalMs = Date.now() - startTime;
      return {
        block: {
          fragments: [],
          promptBlock: "",
          forceBalanceDelta: {},
          searchQueriesSent: queries,
          searchLatencyMs: totalMs,
        },
        audit: {
          sourceType: "internal",
          fragmentsUsed: [],
          forceBalanceDelta: {},
          searchQueriesSent: queries,
          searchLatencyMs: totalMs,
          gateDecision: "fired",
          gateReason: `${gate.reason}_quality_${qualityResult.action}`,
          isExplicitAsk: gate.isExplicitAsk,
          explicitAskBlocked: false,
        },
        qualityGate: qualityResult,
      };
    }

    // 6. ForceBalance Delta（品質ゲート通過後の fragment のみ使用）
    const promptBuildStart = Date.now();
    const fragments = qualityResult.filteredFragments;
    const forceBalanceDelta = calculateForceBalanceDelta(fragments);

    // 7. Prompt Block（hedge 対応）
    const promptBlock = buildPerspectivePromptBlock(
      fragments,
      forceBalanceDelta,
      qualityResult.needsHedge,
    );
    const promptBuildMs = Date.now() - promptBuildStart;

    const totalMs = Date.now() - startTime;

    const latencyBreakdown: PerspectiveLatencyBreakdown = {
      queryGenerationMs,
      searchMs,
      classificationMs,
      qualityGateMs,
      promptBuildMs,
      totalMs,
    };

    console.info(
      `[perspective-engine] ⏱️  Latency breakdown: ` +
      `queryGen=${queryGenerationMs}ms, search=${searchMs}ms, classify=${classificationMs}ms, ` +
      `qualityGate=${qualityGateMs}ms, promptBuild=${promptBuildMs}ms, total=${totalMs}ms`
    );

    const block: PerspectiveBlock = {
      fragments,
      promptBlock,
      forceBalanceDelta,
      searchQueriesSent: queries,
      searchLatencyMs: totalMs,
    };

    const audit: PerspectiveAudit = {
      sourceType: fragments.length > 0 ? "external_augmented" : "internal",
      fragmentsUsed: fragments,
      forceBalanceDelta,
      searchQueriesSent: queries,
      searchLatencyMs: totalMs,
      gateDecision: "fired",
      gateReason: gate.reason,
      isExplicitAsk: gate.isExplicitAsk,
      explicitAskBlocked: false,
    };

    return { block, audit, qualityGate: qualityResult, latencyBreakdown };
  } catch (error) {
    console.warn("[PerspectiveEngine] Error in pipeline, falling back:", error);
    return null; // fail-open: 全てのエラーでフォールバック
  }
}
