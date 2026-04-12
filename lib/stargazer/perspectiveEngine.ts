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
}

// ─── Search Gate ──────────────────────────────────────────────────────────

/**
 * 検索が必要かどうかを判定する。
 * analyzeQueryContext と classifyQuestion の結果を受け取り、searchNeed スコアを算出。
 */
export function evaluateSearchGate(
  message: string,
  queryContext: QueryContext,
  questionCategory: QuestionCategory,
  hdmPhase: number,
  trustLevel: number,
  responseMode: string,
): { shouldSearch: boolean; searchNeed: number; reason: string } {
  // Kill switch
  if (!STARGAZER_FLAGS.perspectiveEngineLive) {
    return { shouldSearch: false, searchNeed: 0, reason: "kill_switch_off" };
  }

  // Phase/Trust gate
  if (hdmPhase < 2) {
    return { shouldSearch: false, searchNeed: 0, reason: "phase_too_low" };
  }
  if (trustLevel < 3) {
    return { shouldSearch: false, searchNeed: 0, reason: "trust_too_low" };
  }

  // Response mode exclusions
  if (responseMode === "clarify" || responseMode === "repair") {
    return { shouldSearch: false, searchNeed: 0, reason: `mode_${responseMode}` };
  }

  // Greeting / ask_me exclusions
  const greetingPatterns = /^(おはよう|こんにちは|こんばんは|ただいま|やあ|よう|ひさしぶり)/;
  const askMePatterns = /(質問して|聞いて|何か聞いて)/;
  if (greetingPatterns.test(message)) {
    return { shouldSearch: false, searchNeed: 0, reason: "greeting" };
  }
  if (askMePatterns.test(message)) {
    return { shouldSearch: false, searchNeed: 0, reason: "ask_me" };
  }

  // Score components
  let searchNeed = 0;

  // 1. Temporal signals (時間的新しさへの言及)
  const temporalPatterns = /今|最近|2026|2025|最新|トレンド|今後|将来|動向/;
  if (temporalPatterns.test(message)) searchNeed += 0.2;

  // 2. Factual density (事実確認の密度)
  const factualPatterns = /って(本当|ほんと)|って(何|なに)|とは|意味|定義|割合|%|パーセント|統計|データ|研究|科学的/;
  if (factualPatterns.test(message)) searchNeed += 0.25;

  // 3. Entity mentions (固有名詞)
  const entityPatterns = /[A-Z][a-z]+|[A-Z]{2,}|HSP|ADHD|MBTI|エニアグラム|ストレングスファインダー/;
  if (entityPatterns.test(message)) searchNeed += 0.15;

  // 4. Domain external relevance
  const highExternalDomains: string[] = [
    "career_fit", "industry_fit", "creation", "lifestyle", "founder_team_fit",
  ];
  const mediumExternalDomains: string[] = ["work", "romance"];
  if (highExternalDomains.includes(queryContext.domain)) {
    searchNeed += 0.25;
  } else if (mediumExternalDomains.includes(queryContext.domain)) {
    searchNeed += 0.15;
  }

  // 5. Self-understanding with external value (内省×外部視点)
  // 「自分の性質」について外部の知見が有効なケース
  const selfExternalPatterns = /って(甘え|普通|おかしい|変|異常)|みんなは|一般的|他の人|タイプの人|こういう(性格|人|タイプ)|な人って|損してる|得してる/;
  if (queryContext.domain === "self" && selfExternalPatterns.test(message)) {
    searchNeed += 0.3;
  }

  // 5b. Decision-seeking questions (判断を求める質問は外部視点が有効)
  const decisionPatterns = /すべき|した(ほう|方)がいい|どうすれば|何から始め|どう(受け止め|対処|対応|向き合)|迷って/;
  if (decisionPatterns.test(message)) {
    searchNeed += 0.15;
  }

  // 5c. How-to / practical questions (実用的な質問)
  const practicalPatterns = /準備|方法|やり方|手順|コツ|ポイント|始め(たい|よう|る)|何を(準備|用意)/;
  if (practicalPatterns.test(message)) {
    searchNeed += 0.15;
  }

  // 6. Pure emotional — suppress search
  const pureEmotionalPatterns = /^(しんどい|つらい|疲れた|泣きたい|もう(無理|だめ|やだ)|きつい|消えたい)/;
  if (pureEmotionalPatterns.test(message)) {
    searchNeed = Math.max(0, searchNeed - 0.4);
  }

  // 7. Personal model coverage (パーソナルモデルで十分な場合)
  const pureInternalPatterns = /^(僕|私|俺|自分)(の|って)(強み|弱み|特徴|性格|いいところ|課題)/;
  if (pureInternalPatterns.test(message) && !selfExternalPatterns.test(message)) {
    searchNeed = Math.max(0, searchNeed - 0.3);
  }

  const shouldSearch = searchNeed >= 0.3;
  const reason = shouldSearch
    ? `searchNeed=${searchNeed.toFixed(2)}_domain=${queryContext.domain}`
    : `searchNeed=${searchNeed.toFixed(2)}_below_threshold`;

  return { shouldSearch, searchNeed, reason };
}

// ─── Privacy Gate ─────────────────────────────────────────────────────────

/**
 * ユーザーの質問から、パーソナルモデル情報を除去した検索クエリを生成する。
 * 性格タイプ、感情状態、関係性情報は検索エンジンに送信しない。
 */
export async function generateSafeSearchQueries(
  message: string,
  queryContext: QueryContext,
  userId?: string,
): Promise<string[]> {
  const result = await runAI({
    taskType: "perspective_privacy_gate",
    prompt: `ユーザーの質問から、Web検索用のクエリを1〜2個生成してください。

## ルール
- 個人的な情報（性格、感情、関係性、名前）は絶対に含めない
- 一般的な知識・事実・専門家見解を検索できるクエリにする
- 日本語で検索クエリを生成する
- 各クエリは簡潔に（10語以内）

## ユーザーの質問
${message}

## 検出されたドメイン
${queryContext.domain}

## 出力形式（JSON）
{"queries": ["検索クエリ1", "検索クエリ2"]}`,
    systemPrompt: "あなたはWeb検索クエリを生成する専門家です。個人情報を一切含まない、一般的な知識検索クエリを生成してください。",
    requireJson: true,
    temperature: 0.3,
    maxOutputTokens: 200,
    userId,
    metadata: { feature: "perspective_engine", step: "privacy_gate" },
  });

  const structured = result.structured as Record<string, unknown> | null;
  if (structured && Array.isArray(structured.queries)) {
    return (structured.queries as string[]).slice(0, 2);
  }

  // Fallback: 質問からキーワードを抽出
  const keywords = message
    .replace(/[？?！!。、]/g, " ")
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

## 出力形式（JSON）
{"fragments": [{"index": 1, "epistemic_type": "...", "confidence": 0.8, "source_authority": "...", "stance": "...", "force_relevance": {"opportunity": 0.0, "cost": 0.0, "relationship": 0.0, "value": 0.0, "fear": 0.0, "growth": 0.0}, "key_insight": "..."}]}`,
    systemPrompt: "あなたは情報の認識論的分類の専門家です。各情報片が事実か意見か体験談かを正確に判定し、判断に関わる力への関連度を評価してください。",
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

// ─── Prompt Block Generation ──────────────────────────────────────────────

/**
 * 分類済みフラグメントから、Alter のシステムプロンプトに注入するブロックを生成する。
 */
export function buildPerspectivePromptBlock(
  fragments: PerspectiveFragment[],
  forceBalanceDelta: Partial<ForceBalance>,
): string {
  if (fragments.length === 0) return "";

  const lines: string[] = [];
  lines.push("## 外界の視点（参考材料）");
  lines.push("以下の視点を自分のレンズで消化して語ってよい。ただし:");
  lines.push("- 「調べた」「記事によると」「研究では」とは言わない");
  lines.push("- 自分の言葉で語る：「こういう見方もあるんだけど」「実はね」「面白いのが」");
  lines.push("- 必ず結論を出す。「いろんな意見があるね」で終わることは禁止");
  lines.push("- 外部視点を入れても、あなたの結論はパーソナルモデルから導出すること");
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
 * Perspective Engine のメインエントリポイント。
 * Gate → Privacy Gate → Search → Classify → Personalize → Prompt Block
 *
 * fail-open: どこで失敗しても null を返し、従来パスにフォールバックする。
 */
/** 各ステップのレイテンシ分解（Phase 0 計測用） */
export interface PerspectiveLatencyBreakdown {
  queryGenerationMs: number;
  searchMs: number;
  classificationMs: number;
  promptBuildMs: number;
  totalMs: number;
}

export async function runPerspectiveEngine(params: {
  message: string;
  queryContext: QueryContext;
  questionCategory: QuestionCategory;
  hdmPhase: number;
  trustLevel: number;
  responseMode: string;
  userId?: string;
}): Promise<{ block: PerspectiveBlock; audit: PerspectiveAudit; latencyBreakdown?: PerspectiveLatencyBreakdown } | null> {
  const startTime = Date.now();

  // 1. Gate
  const gate = evaluateSearchGate(
    params.message,
    params.queryContext,
    params.questionCategory,
    params.hdmPhase,
    params.trustLevel,
    params.responseMode,
  );

  if (!gate.shouldSearch) {
    return {
      block: {
        fragments: [],
        promptBlock: "",
        forceBalanceDelta: {},
        searchQueriesSent: [],
        searchLatencyMs: 0,
      },
      audit: {
        sourceType: "internal",
        fragmentsUsed: [],
        forceBalanceDelta: {},
        searchQueriesSent: [],
        searchLatencyMs: 0,
        gateDecision: "skipped",
        gateReason: gate.reason,
      },
    };
  }

  try {
    // 2. Privacy Gate + Query Generation
    const queryGenStart = Date.now();
    const queries = await generateSafeSearchQueries(
      params.message,
      params.queryContext,
      params.userId,
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
      return null; // fail-open
    }

    // 4. Classification
    const classifyStart = Date.now();
    const fragments = await classifySearchResults(
      searchResults,
      params.queryContext,
      params.message,
      params.userId,
    );
    const classificationMs = Date.now() - classifyStart;

    if (fragments.length === 0) {
      return null; // fail-open
    }

    // 5. ForceBalance Delta
    const promptBuildStart = Date.now();
    const forceBalanceDelta = calculateForceBalanceDelta(fragments);

    // 6. Prompt Block
    const promptBlock = buildPerspectivePromptBlock(fragments, forceBalanceDelta);
    const promptBuildMs = Date.now() - promptBuildStart;

    const totalMs = Date.now() - startTime;

    const latencyBreakdown: PerspectiveLatencyBreakdown = {
      queryGenerationMs,
      searchMs,
      classificationMs,
      promptBuildMs,
      totalMs,
    };

    // Phase 0: レイテンシ分解ログ
    console.info(
      `[perspective-engine] ⏱️  Latency breakdown: ` +
      `queryGen=${queryGenerationMs}ms, search=${searchMs}ms, classify=${classificationMs}ms, ` +
      `promptBuild=${promptBuildMs}ms, total=${totalMs}ms`
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
    };

    return { block, audit, latencyBreakdown };
  } catch (error) {
    console.warn("[PerspectiveEngine] Error in pipeline, falling back:", error);
    return null; // fail-open: 全てのエラーでフォールバック
  }
}
