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
  gateDecision: "fired" | "skipped" | "blocked" | "abstain" | "error";
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

// ─── Search Task Types ───────────────────────────────────────────────────
// GPT feedback (CEO endorsed): 「検索前の思考設計」— 検索エンジンの強さではなく、
// WHAT を検索すべきかの定義が先。会話文脈からタスクを理解し、タスクに適したクエリと
// 品質基準を動的に決定する。

/**
 * 内部パイプライン用タスク種別。classifyTaskAndGenerateQueries が返す。
 *
 * 各タイプは Exa.ai での検索適性（searchFitness）が異なる:
 * - factual_lookup: 高 (0.9) — 事実確認は Web 検索の得意領域
 * - market_intel: 高 (0.85) — 業界レポート、統計記事は豊富
 * - entity_research: 高 (0.85) — 企業・サービス情報は充実
 * - comparison: 中 (0.7) — 比較記事はあるが質にばらつき
 * - perspective_seek: 中 (0.7) — 意見・視点は見つかるが多様性に限界
 * - how_to: 中 (0.7) — 手順記事は見つかるが個別事情に弱い
 * - listing_search: 低 (0.2) — 求人一覧、店舗一覧は Exa.ai の弱点
 */
export type SearchTaskClassificationType =
  | "factual_lookup"     // 事実確認（「〜って本当？」「〜とは」「定義」「割合」）
  | "market_intel"       // 市場・業界情報（年収、求人動向、業界トレンド、相場）
  | "entity_research"    // 特定エンティティの調査（企業、サービス、制度、人物）
  | "listing_search"     // 一覧・リスト型検索（求人一覧、お店一覧、ランキング）
  | "comparison"         // 比較・選択肢（AとBどっち、おすすめ、違い）
  | "perspective_seek"   // 多視点収集（どう思う、世間では、一般的に、普通は）
  | "how_to";            // 方法・手順（やり方、コツ、始め方、準備）

export interface SearchTaskClassification {
  type: SearchTaskClassificationType;
  /** タスクの簡潔な記述（LLM 生成） */
  description: string;
  /** Exa.ai での検索適性（0.0-1.0）。listing_search は 0.2 */
  searchFitness: number;
  /** タスク遂行に必要な情報の種類 */
  requiredInfoType: "factual" | "statistical" | "experiential" | "listings" | "mixed";
  /** 生成されたクエリ（タスクに最適化済み） */
  queries: string[];
  /**
   * 探索深度: single（1回検索で完結）/ iterative（マルチターン探索）。
   *
   * iterative になるのは以下のパターンのみ:
   *   - company_fit: 適性仮説 → 候補探索 → ユーザー選択 → 深掘り
   *   - listing_search + 適性依存度 high: 場所探索、候補絞り込み
   *   - comparison + 適性依存度 high: サービス選定、選択肢評価
   *
   * iterative の場合、ExplorationState が生成され、ターンをまたいで保持される。
   */
  explorationDepth: "single" | "iterative";
}

// ─── Downstream-Facing Search Task (CEO spec) ──────────────────────────
// route.ts が参照する source of truth。内部 SearchTaskClassification を
// 下流向けに正規化したもの。

/** Downstream-facing search task type (CEO spec) */
export type SearchTaskType =
  | "market_intel"
  | "listing_search"
  | "company_research"  // was entity_research
  | "comparison"
  | "factual_lookup"
  | "none";

/** Downstream-facing SearchTask — route.ts の source of truth */
export interface SearchTask {
  type: SearchTaskType;
  explicit: boolean;
  confidence: number;
  rationale?: string;
  queryIntent?: string;
  candidateEntities?: string[];
  userNeed?: string;
}

export interface PerspectiveRetrievalResult {
  rawResults: SearchResult[];
  classifiedFragments: PerspectiveFragment[];
  queriesSent: string[];
  searchLatencyMs: number;
}

export interface PerspectiveQualityGateResult {
  action: QualityAction;
  reason: string;
  needsHedge: boolean;
  canClarify: boolean;
  filteredFragments: PerspectiveFragment[];
}

// ─── Exploration State（マルチターン探索） ──────────────────────────────
// 「探索」の進行状態のみを管理する。感情・広い会話文脈は既存システム
// （HdmPhaseState, AlterUnderstanding, sessionContext）の責務。
//
// 設計原則:
//   - ExplorationState は「検索探索の状態」であって「会話のすべて」ではない
//   - 検索が Alter の通常会話を飲み込まないようにする
//   - 迷ったら通常会話優先。探索は明示的再開 or 候補名一致のみで復帰
//   - Alter は汎用 AI チャットではない。ネットから常に検索をかける必要はない

export type ExplorationPhase =
  | "hypothesis"        // Turn 1: 適性仮説の提示 + 広い候補探索
  | "user_selection"    // Turn 2 待ち: ユーザーの候補選択
  | "deep_research"     // Turn 3: 選択された候補の深掘りリサーチ
  | "synthesis"         // Turn 4+: 統合・結論・次のアクション提案
  | "complete";         // 探索完了

export interface CandidateEntity {
  name: string;           // 「株式会社〇〇」「A社」等
  category: string;       // 業界・カテゴリ
  fitReason: string;      // なぜこの候補がユーザーに合うか（パーソナルモデル由来）
  source: string;         // どこで見つけたか
  userSelected: boolean;  // ユーザーが選択したか
}

export interface EntityResearch {
  name: string;
  overview: string;        // 企業概要、サービス概要
  fitAnalysis: string;     // パーソナルモデル視点での適合分析
  concerns: string[];      // 引っかかりそうな点
  actionableInfo: string;  // 採用ページURL、応募方法等
  searchQueries: string[]; // このリサーチで使った検索クエリ
}

export interface ExplorationState {
  // 探索の定義
  explorationId: string;
  taskType: SearchTaskClassificationType;
  domain: string;
  userIntent: string;         // 「転職先を探したい」等

  // フェーズ管理
  currentPhase: ExplorationPhase;
  turnCount: number;

  // アクティブ / 休眠管理
  // isActive: 今まさに探索中（直前ターンが探索に関連した）
  // isDormant: ユーザーが別の話題に移った。候補名一致 or 明示的再開で復帰
  isActive: boolean;
  isDormant: boolean;

  // 探索復帰アンカー: candidatesProposed から自動生成される候補名リスト。
  // ユーザーの発話にこれらの文字列が含まれていれば、dormant → active に復帰。
  // LLMによる「意味連続性判定」はやらない。文字列マッチのみ。
  resumeAnchors: string[];

  // 蓄積されたコンテキスト
  fitHypotheses: string[];           // 適性仮説（パーソナルモデルから）
  candidatesProposed: CandidateEntity[]; // Alter が提案した候補
  candidatesSelected: string[];       // ユーザーが選んだ候補名
  researchCompleted: EntityResearch[];// リサーチ完了済み

  // 品質追跡
  totalSearchQueries: string[];
  limitations: string[];     // 「求人一覧の直接取得はできない」等

  // 有効期限
  createdAt: string;
  lastUpdatedAt: string;
  expiresAt: string;          // 7日で自動破棄
}

// ─── Exploration Output Templates ────────────────────────────────────────
// Turn 1 の出力契約をタスクタイプ別に定義。共通骨格:
//   1. 方向性の一言（パーソナルモデルから導出）
//   2. 具体的な候補（3-5件、多すぎない）
//   3. 各候補に「なぜこの人に合うか」の理由（1行）
//   4. honest limitation（「公開Webから調べた範囲」等）
//   5. 選択促し（「気になるところがあれば教えて」）

export interface ExplorationOutputTemplate {
  directionFormat: string;
  candidateCount: { min: number; max: number };
  candidateFormat: string;
  limitation: string;
  selectionPrompt: string;
}

export const EXPLORATION_OUTPUT_TEMPLATES: Partial<Record<SearchTaskClassificationType, ExplorationOutputTemplate>> = {
  listing_search: {
    directionFormat: "パーソナルモデルから導いた適性仮説を1文で提示",
    candidateCount: { min: 3, max: 5 },
    candidateFormat: "候補名 + 合う理由1行 + 注意点がある場合は1行",
    limitation: "公開Webから調べた範囲の候補です。一覧サイトの完全取得はできないので、見つかった中からの提案です",
    selectionPrompt: "この中で気になるところ、もう少し見てみたいところがあれば教えて",
  },
  comparison: {
    directionFormat: "比較の軸を先に提示（何を基準に比べるか）",
    candidateCount: { min: 2, max: 4 },
    candidateFormat: "選択肢名 + 軸ごとの評価 + この人にとっての意味",
    limitation: "公開情報ベースの比較です",
    selectionPrompt: "どっちが気になる？もう少し掘ってみようか",
  },
};

// company_fit は listing_search + entity_research の複合。
// listing_search テンプレートをベースにしつつ、entity_research の深掘り要素を含む。
// ※ company_fit は SearchTaskType には含めない（listing_search + entity_research の組み合わせで表現）

// ─── Exploration Depth Classification ────────────────────────────────────

/**
 * SearchTask の探索深度を判定する。
 *
 * iterative になる条件:
 *   1. listing_search — 候補群からの絞り込みが必要
 *   2. comparison + 適性依存度が高い — サービス選定等
 *   3. entity_research + 適性文脈あり — 会社探し（company_fit パターン）
 *
 * 判定にはメッセージとドメインを使用。LLM は使わない（高速判定のため）。
 */
export function classifyExplorationDepth(
  taskType: SearchTaskClassificationType,
  message: string,
  domain: string,
): "single" | "iterative" {
  // listing_search は原則 iterative（候補群 → 選択 → 深掘り）
  if (taskType === "listing_search") {
    return "iterative";
  }

  // comparison + 適性が主役のドメイン → iterative
  if (taskType === "comparison") {
    const fitDomains = ["career_fit", "industry_fit", "lifestyle", "work"];
    if (fitDomains.includes(domain)) return "iterative";
    // 「自分に合うのは」「向いてるのは」等の適性ワード
    if (/自分に(合|向|適)|私に(合|向|適)|俺に(合|向)/.test(message)) return "iterative";
  }

  // entity_research + 適性文脈（company_fit パターン）
  // 「自分に合う会社」「向いてる職場」等
  if (taskType === "entity_research") {
    if (/自分に(合|向)|私に(合|向)|俺に(合|向)|(転職|就職|仕事)(先|探|見つけ)/.test(message)) {
      return "iterative";
    }
  }

  return "single";
}

/**
 * 探索復帰を判定する。
 *
 * ExplorationState が isDormant の場合、ユーザーの発話に以下が含まれていれば復帰:
 *   1. 明示的再開（「さっきの続き」「もう少し調べて」「候補の件」等）
 *   2. resumeAnchors への文字列マッチ（候補名への直接参照）
 *
 * 迷ったら通常会話優先。この原則は絶対。
 */
export function shouldResumeExploration(
  message: string,
  state: ExplorationState,
): boolean {
  if (!state.isDormant) return false;
  if (state.currentPhase === "complete") return false;

  // 有効期限チェック
  if (new Date(state.expiresAt) < new Date()) return false;

  // 1. 明示的再開パターン
  const resumePatterns = /さっき(の|調べ|の続き|の候補)|もう少し(調べ|探し|見|教え)|候補(の|について|は？|は$)|続き(を|は|から)|あの(会社|候補|店|サービス)/;
  if (resumePatterns.test(message)) return true;

  // 2. 候補名アンカー一致（文字列マッチのみ、LLM不使用）
  for (const anchor of state.resumeAnchors) {
    if (anchor.length >= 2 && message.includes(anchor)) return true;
  }

  return false;
}

/**
 * ExplorationState から resumeAnchors を自動生成する。
 * candidatesProposed の名前から抽出。
 */
export function buildResumeAnchors(candidates: CandidateEntity[]): string[] {
  const anchors: string[] = [];
  for (const c of candidates) {
    anchors.push(c.name);
    // 「株式会社〇〇」→「〇〇」も追加
    const shortName = c.name.replace(/^(株式会社|合同会社|有限会社)\s*/, "");
    if (shortName !== c.name && shortName.length >= 2) anchors.push(shortName);
  }
  return [...new Set(anchors)]; // 重複除去
}

/**
 * 新しい ExplorationState を生成する。
 */
export function createExplorationState(
  taskType: SearchTaskClassificationType,
  domain: string,
  userIntent: string,
  fitHypotheses: string[],
): ExplorationState {
  const now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7日
  return {
    explorationId: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    taskType,
    domain,
    userIntent,
    currentPhase: "hypothesis",
    turnCount: 0,
    isActive: true,
    isDormant: false,
    resumeAnchors: [],
    fitHypotheses,
    candidatesProposed: [],
    candidatesSelected: [],
    researchCompleted: [],
    totalSearchQueries: [],
    limitations: [],
    createdAt: now.toISOString(),
    lastUpdatedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };
}

/** タスク種別ごとのデフォルト検索適性 */
const TASK_SEARCH_FITNESS: Record<SearchTaskClassificationType, number> = {
  factual_lookup: 0.9,
  market_intel: 0.85,
  entity_research: 0.85,
  comparison: 0.7,
  perspective_seek: 0.7,
  how_to: 0.7,
  listing_search: 0.2,
};

/** タスク種別ごとの必要情報タイプ */
const TASK_REQUIRED_INFO: Record<SearchTaskClassificationType, SearchTaskClassification["requiredInfoType"]> = {
  factual_lookup: "factual",
  market_intel: "statistical",
  entity_research: "factual",
  comparison: "mixed",
  perspective_seek: "experiential",
  how_to: "mixed",
  listing_search: "listings",
};

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

// ─── Task-Aware Query Builder ────────────────────────────────────────────

/**
 * タスク分類 + クエリ生成の統合関数（v4）。
 *
 * v3 の generateSafeSearchQueries を置き換え。
 * **単一 LLM 呼び出し**でタスク種別の判定とクエリ生成を同時に行う。
 *
 * 設計思想（GPT feedback, CEO endorsed）:
 *   「検索エンジンの強さではなく、検索前の思考設計が足りない」
 *   → 会話文脈からユーザーが本当に必要としている情報タスクを理解し、
 *     そのタスクに適したクエリを生成する。
 *
 * Privacy Gate を兼ねる:
 *   - 性格タイプ、感情状態、関係性情報は検索エンジンに送信しない
 *   - パーソナルモデル情報を除去したクエリのみを生成
 *
 * @returns SearchTask（タスク種別 + 適性 + クエリ）。失敗時は null。
 */
export async function classifyTaskAndGenerateQueries(
  message: string,
  queryContext: QueryContext,
  userId?: string,
  conversationSummary?: string,
): Promise<SearchTaskClassification | null> {
  // 短い explicit ask（「WEBから見つけてきて」「調べて」等）の場合、
  // 直前の会話文脈がないとまともなタスク定義ができない
  const isShortExplicit = message.length < 30 && detectExplicitSearchIntent(message);

  // P1.5: conversationSummary にパーソナリティ/ライフコンテキストが含まれる場合、
  // 「会話の文脈」と「ユーザーの特性」を分離して提示する
  const hasPersonaContext = conversationSummary && /この人の傾向:|職種:|価値観:|関心:|ライフステージ:/.test(conversationSummary);
  const contextSection = (() => {
    if (!conversationSummary) return "";
    if (isShortExplicit) {
      return `\n## 直前の会話の話題 + ユーザー特性（検索対象の特定に使用）\n${conversationSummary}\n※ ユーザー特性はクエリの「方向付け」に使え。クエリ文字列に個人情報を含めるな。`;
    }
    if (hasPersonaContext) {
      return `\n## 会話の文脈 + ユーザー特性（参考）\n${conversationSummary}\n※ listing_search / entity_research の場合: ユーザー特性から「この人に合いそうな候補」を特定するクエリを生成せよ。ただしクエリ文字列に性格・価値観の語を直接入れるな。特性から推測される具体的な属性（例:「自律重視」→「リモートワーク」「少人数」）に変換してクエリに含めよ。`;
    }
    return `\n## 会話の文脈（参考）\n${conversationSummary}`;
  })();

  const result = await runAI({
    taskType: "perspective_task_query",
    prompt: `ユーザーの質問を分析し、(1) 検索タスクの種別を判定し、(2) そのタスクに最適な検索クエリを生成してください。

## タスク種別の定義
- factual_lookup: 事実確認（「〜って本当？」「〜とは」「割合は？」「統計」）
- market_intel: 市場・業界情報（年収、転職市場、業界トレンド、相場、動向）
- entity_research: 特定エンティティの調査（「〇〇社ってどう？」「△△サービスの評判」「制度の詳細」）
- listing_search: 一覧・リスト型（「求人を探して」「おすすめのお店」「ランキング」— ※実際のリスト検索は苦手）
- comparison: 比較・選択肢（「AとBどっち」「違いは？」「おすすめ」）
- perspective_seek: 多視点収集（「世間ではどう思われてる？」「一般的に」「普通は」）
- how_to: 方法・手順（「やり方」「コツ」「始め方」「何を準備」）

## 判定のポイント
- ユーザーの質問だけでなく、会話の文脈全体からタスクを判定すること
- 「WEBから見つけてきて」のような短い指示の場合、直前の会話の話題がタスクの本質
- 「転職先を探して」→ listing_search（求人一覧が欲しい）
- 「転職市場ってどうなの？」→ market_intel（市場動向が欲しい）
- 「〇〇社の評判は？」→ entity_research（特定企業の情報）
- 迷ったら、ユーザーが最終的に欲しい成果物で判断する

## クエリ生成ルール
- 個人的な情報（性格、感情、関係性、名前）は絶対に含めない
- 「調べて」「検索して」「WEBで」等の検索指示語はクエリに含めない
- 「WEB検索」「ネット検索」「情報検索」のようなメタクエリは絶対に生成しない
- 日本語で簡潔に（各クエリ10語以内）
- listing_search の場合（最重要 — 厳守）:
  - 目的: 具体的な候補名・エンティティ名が検索結果に含まれるクエリを生成すること
  - 求人系の良い例: 「データ分析 企業 採用 2026」「リモートワーク推進 IT企業」「少人数 技術会社 エンジニア」
  - サービス系の良い例: 「転職エージェント 比較 エンジニア向け」「プログラミングスクール 評判」
  - 場所系の良い例: 「渋谷 カフェ 静か 作業」「京都 町家 宿泊」
  - ❌ 絶対禁止: how-to/アドバイス系（「選び方」「コツ」「方法」「ポイント」「特徴」「見つけ方」「見極め方」）
  - ❌ 絶対禁止: 抽象クエリ（「自分に合う〇〇」「〇〇 おすすめ」だけの漠然とした形）
  - ❌ 絶対禁止: ランキング記事だけを狙うクエリ（「年収ランキング」「ホワイト企業ランキング」→周辺情報にしかならない）
  - ✅ 必須: 業界 + 規模/特性 + 具体ワード の組み合わせにすること
- 1〜2個のクエリを生成

## ユーザーの質問
${message}
${contextSection}
## 検出されたドメイン
${queryContext.domain}

## 出力形式（JSON）
{"task_type": "market_intel", "task_description": "IT業界の転職市場動向を調査", "queries": ["IT業界 転職市場 2026", "エンジニア 年収 トレンド"]}`,
    systemPrompt: "あなたは検索タスク設計の専門家です。ユーザーの本当の情報ニーズを会話文脈から理解し、(1) 最適なタスク種別を判定し、(2) そのタスクに合ったクエリを生成します。個人情報を一切含まないこと。メタワード（「検索」「WEB」等）を含めないこと。",
    requireJson: true,
    temperature: 0.3,
    maxOutputTokens: 300,
    userId,
    metadata: { feature: "perspective_engine", step: "task_query_builder" },
  });

  const structured = result.structured as Record<string, unknown> | null;
  if (structured) {
    const taskType = (structured.task_type as string) ?? "factual_lookup";
    const validTypes: SearchTaskClassificationType[] = [
      "factual_lookup", "market_intel", "entity_research",
      "listing_search", "comparison", "perspective_seek", "how_to",
    ];
    const resolvedType: SearchTaskClassificationType = validTypes.includes(taskType as SearchTaskClassificationType)
      ? (taskType as SearchTaskClassificationType)
      : "factual_lookup";

    const rawQueries = Array.isArray(structured.queries)
      ? (structured.queries as string[]).slice(0, 2)
      : [];

    // メタクエリフィルタ: 「WEB検索」「ネット検索」等のゴミクエリを排除
    const filtered = rawQueries.filter(q =>
      !/^(WEB|ウェブ|ネット|インターネット|情報)(検索|サーチ)$/i.test(q.trim())
    );

    const queries = filtered.length > 0
      ? filtered
      : fallbackQueryExtraction(message, queryContext);

    if (queries.length === 0) return null;

    const description = (structured.task_description as string) ?? `${resolvedType} search`;

    const depth = classifyExplorationDepth(resolvedType, message, queryContext.domain);

    console.info(
      `[perspective-engine] 🎯 Task classified: type=${resolvedType}, ` +
      `fitness=${TASK_SEARCH_FITNESS[resolvedType]}, depth=${depth}, ` +
      `queries=${JSON.stringify(queries)}, desc="${description}"`
    );

    return {
      type: resolvedType,
      description,
      searchFitness: TASK_SEARCH_FITNESS[resolvedType],
      requiredInfoType: TASK_REQUIRED_INFO[resolvedType],
      queries,
      explorationDepth: depth,
    };
  }

  // LLM fallback: 構造化出力失敗
  const queries = fallbackQueryExtraction(message, queryContext);
  if (queries.length === 0) return null;

  return {
    type: "factual_lookup",
    description: "fallback query extraction",
    searchFitness: 0.5,
    requiredInfoType: "mixed",
    queries,
    explorationDepth: "single",
  };
}

/**
 * LLM 失敗時のフォールバック: メッセージからキーワードを抽出してクエリを生成。
 * @internal
 */
function fallbackQueryExtraction(
  message: string,
  queryContext: QueryContext,
): string[] {
  // ドメインベースフォールバック
  if (queryContext.domain && queryContext.domain !== "self" && queryContext.domain !== "general") {
    return [queryContext.domain.replace(/_/g, " ") + " 最新情報"];
  }
  // キーワード抽出（検索指示語を除外）
  const keywords = message
    .replace(/[？?！!。、]/g, " ")
    .replace(/(調べ|検索|WEB|ウェブ|ネット|探し|見つけ|持って|引っ張)[てたるるよい来き]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 3);
  return keywords.length > 0 ? [keywords.join(" ")] : [];
}

/**
 * @deprecated v4 で classifyTaskAndGenerateQueries に統合。後方互換のためエイリアスを残す。
 */
export async function generateSafeSearchQueries(
  message: string,
  queryContext: QueryContext,
  userId?: string,
  conversationSummary?: string,
): Promise<string[]> {
  const task = await classifyTaskAndGenerateQueries(message, queryContext, userId, conversationSummary);
  return task?.queries ?? [];
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
 * P1.6: Rule-based ノイズ除去。LLM 前に明らかなゴミ結果を落とす。
 *
 * 除去基準:
 *   1. テキスト長が極端に短い（<30文字 → タイトルのみ/空結果）
 *   2. URL がノイズドメイン（ポイントサイト、広告集約等）
 *   3. テキストに検索エンジンUIの断片が含まれる
 *
 * @internal
 */
const NOISE_URL_PATTERNS = [
  /point\.rakuten/i,       // 楽天ポイント
  /ad\.(google|yahoo)/i,   // 広告
  /search\.(yahoo|google)/i, // 検索結果ページ自体
  /\.pdf$/i,               // PDF（テキスト取得が不完全）
];

const NOISE_TEXT_PATTERNS = [
  /^(ログイン|会員登録|お気に入り|ブックマーク|シェア)/,
  /検索結果.*件/,
  /cookie.*同意/i,
];

export function preFilterSearchResults(results: SearchResult[]): { kept: SearchResult[]; droppedCount: number } {
  const kept: SearchResult[] = [];
  let droppedCount = 0;

  for (const r of results) {
    const text = r.text || r.highlights?.join(" ") || "";
    // Drop 1: テキスト極短
    if (text.length < 30) {
      droppedCount++;
      continue;
    }
    // Drop 2: ノイズURL
    if (NOISE_URL_PATTERNS.some(p => p.test(r.url))) {
      droppedCount++;
      continue;
    }
    // Drop 3: 検索UI断片
    if (NOISE_TEXT_PATTERNS.some(p => p.test(text))) {
      droppedCount++;
      continue;
    }
    kept.push(r);
  }

  return { kept, droppedCount };
}

/**
 * 検索結果を認識論的に分類し、PerspectiveFragment に変換する。
 * LLM の構造化出力を使用。
 *
 * P1.6 最適化:
 *   - Rule-based ノイズ除去（LLM呼び出し前に明らかなゴミを落とす）
 *   - 入力を最大3件に制限（MAX_FRAGMENTS=3 と一致。5→3で入力トークン40%減）
 *   - テキストを200文字に制限（300→200。LLM入力トークン33%減）
 *   - 出力JSONを簡素化:
 *     - source_authority を削除（downstream で "media" デフォルト、分類精度にほぼ寄与しない）
 *     - force_relevance を3軸に集約（opp/cost/growth のみ。relationship/value/fear は
 *       downstream の rankFragmentsByFit で使うが、opp/cost/growth からの推定で代替可能）
 *     - key_insight を「1文15字以内」に制限（fragment text の長さを制御）
 *   - maxOutputTokens: 800→400（出力簡素化に合わせて削減）
 */
export async function classifySearchResults(
  searchResults: SearchResult[],
  queryContext: QueryContext,
  message: string,
  userId?: string,
): Promise<PerspectiveFragment[]> {
  if (searchResults.length === 0) return [];

  // P1.6-1: Rule-based ノイズ除去
  const { kept: cleanResults, droppedCount } = preFilterSearchResults(searchResults);
  if (droppedCount > 0) {
    console.info(`[perspective-engine] 🧹 Pre-filter: ${droppedCount} noise results dropped, ${cleanResults.length} kept`);
  }
  if (cleanResults.length === 0) return [];

  // P1.6-2: 入力を最大3件に制限（MAX_FRAGMENTS と一致）
  const MAX_CLASSIFY_INPUT = 3;
  const resultsText = cleanResults
    .slice(0, MAX_CLASSIFY_INPUT)
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.text?.slice(0, 200) || r.highlights?.join(" ") || ""}`)
    .join("\n\n");

  // P1.6-3: 簡素化プロンプト
  const result = await runAI({
    taskType: "perspective_classify",
    prompt: `検索結果を分類。

質問: ${message}
ドメイン: ${queryContext.domain}

${resultsText}

各結果を判定:
- rel: 0.0-1.0（質問との関連度。無関係なら0）
- type: fact/stat/expert/opinion/experience
- conf: 0.0-1.0（信頼性）
- stance: support/oppose/neutral
- opp: 0-1（機会）, cost: 0-1（リスク）, grow: 0-1（成長）
- insight: 要点1文（15字以内）

出力: {"f":[{"i":1,"rel":0.8,"type":"stat","conf":0.8,"stance":"support","opp":0.5,"cost":0.1,"grow":0.7,"insight":"要点"}]}`,
    systemPrompt: "検索結果の関連性と信頼性を判定するJSON分類器。無関連はrel=0。簡潔に。",
    requireJson: true,
    temperature: 0.2,
    maxOutputTokens: 400, // P1.6: 800→400（出力簡素化）
    userId,
    metadata: { feature: "perspective_engine", step: "classify" },
  });

  const fragments: PerspectiveFragment[] = [];

  const classifyStructured = result.structured as Record<string, unknown> | null;
  // P1.6: 新旧2形式に対応（"f" 配列 or "fragments" 配列）
  const rawFragments = classifyStructured
    ? (Array.isArray(classifyStructured.f)
        ? classifyStructured.f
        : Array.isArray(classifyStructured.fragments)
          ? classifyStructured.fragments
          : null)
    : null;

  if (rawFragments) {
    for (const f of rawFragments as Array<Record<string, unknown>>) {
      // P1.6: "i" or "index" 両対応
      const rawIdx = (f.i as number) ?? (f.index as number);
      const idx = rawIdx - 1;
      const source = cleanResults[idx];
      if (!source) continue;

      // ハードネガティブ除去（Cuconasu, SIGIR 2024）
      const relevance = (f.rel as number) ?? (f.relevance_to_question as number) ?? 1.0;
      if (relevance < 0.3) {
        console.info(`[perspective-engine] 🗑️ Hard negative filtered: [${rawIdx}] relevance=${relevance.toFixed(2)}`);
        continue;
      }

      // P1.6: 短縮型 type → フル型への展開
      const typeMap: Record<string, EpistemicType> = {
        fact: "empirical_fact",
        stat: "statistical_claim",
        expert: "expert_analysis",
        opinion: "opinion",
        experience: "personal_experience",
        // フル型もそのまま通す
        empirical_fact: "empirical_fact",
        statistical_claim: "statistical_claim",
        expert_analysis: "expert_analysis",
        normative_claim: "normative_claim",
        personal_experience: "personal_experience",
        anecdote: "anecdote",
      };
      const rawType = (f.type as string) ?? (f.epistemic_type as string) ?? "opinion";
      const epistemicType = typeMap[rawType] ?? "opinion";
      const confidence = (f.conf as number) ?? (f.confidence as number) ?? 0.7;

      // タイプ別 confidence 閾値でフィルタ
      const threshold = CONFIDENCE_THRESHOLDS[epistemicType] ?? 0.7;
      if (confidence < threshold) continue;

      // P1.6: 3軸 → 6軸への展開（opp/cost/grow から残り3軸を推定）
      const opp = (f.opp as number) ?? 0;
      const cost = (f.cost as number) ?? 0;
      const grow = (f.grow as number) ?? 0;
      // 旧形式のフル force_relevance もフォールバック
      const forceRel = f.force_relevance as Record<string, number> | undefined;

      fragments.push({
        text: (f.insight as string) || (f.key_insight as string) || source.text?.slice(0, 200) || "",
        sourceUrl: source.url,
        sourceTitle: source.title,
        epistemicType,
        confidence,
        sourceAuthority: (f.source_authority as SourceAuthority) || "media",
        stanceTowardQuery: ((f.stance as string) || "neutral") as StanceDirection,
        forceRelevance: forceRel ? {
          opportunity: forceRel.opportunity ?? 0,
          cost: forceRel.cost ?? 0,
          relationship: forceRel.relationship ?? 0,
          value: forceRel.value ?? 0,
          fear: forceRel.fear ?? 0,
          growth: forceRel.growth ?? 0,
        } : {
          // P1.6: 3軸から残り3軸を推定
          // relationship ≈ 1 - (opp + cost)/2（機会/リスクが高いと関係性は低め）
          // value ≈ grow * 0.6（成長関連は価値観にも関連しやすい）
          // fear ≈ cost * 0.7（コスト/リスクは恐れにも関連しやすい）
          opportunity: opp,
          cost: cost,
          relationship: Math.max(0, 1 - (opp + cost) / 2) * 0.3,
          value: grow * 0.6,
          fear: cost * 0.7,
          growth: grow,
        },
      });
    }
  }

  // Diversity floor: 対立視点が含まれているか確認
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
    const priority = (fp: PerspectiveFragment) =>
      fp.stanceTowardQuery === "oppose" ? 2
      : fp.stanceTowardQuery === "support" ? 1
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
    `[perspective-engine] 📊 Fragments: ${searchResults.length} raw → ${cleanResults.length} clean → ${fragments.length} classified → ${budgetedFragments.length} budgeted (${totalTokens} tokens est.)`
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
 * 検索後の品質ゲート。CRAG 3段階判定 + Sufficient Context + Task Fitness。
 *
 * v4: SearchTask の種別に応じて品質基準を動的に調整する。
 *   - listing_search (fitness=0.2): 有用な周辺情報があれば supplement、なければ discard
 *   - factual_lookup (fitness=0.9): 高品質 fragment が必須
 *   - perspective_seek: 多様な stance が揃っているかも評価
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

/**
 * P1-1: listing_search の fragment から候補エンティティ（固有名詞）を検出する。
 *
 * 候補エンティティ = 企業名・サービス名・人名等の固有名詞。
 * 検出ヒューリスティック:
 *   1. カタカナ3文字以上の連続（例: メイプル、シフト）
 *   2. ASCII大文字2文字以上の連続（例: SHIFT, SRI, NTT）
 *   3. アルファベット+カタカナの混合パターン（例: Maple SRI）
 *   4. 「株式会社」「(株)」「Inc.」「Ltd.」等の法人接尾辞
 *
 * 一般名詞を除外するため、よく出る汎用語はブラックリストで弾く。
 */
const ENTITY_BLACKLIST = new Set([
  "データ", "サービス", "システム", "プロジェクト", "エンジニア", "マネージャー",
  "リモート", "フリーランス", "スタートアップ", "ベンチャー", "コンサル",
  "キャリア", "スキル", "マーケット", "テクノロジー", "アプリ", "ツール",
  "ポイント", "レベル", "カテゴリ", "プラン", "モデル", "メソッド",
  "リスト", "ガイド", "チェック", "ステップ", "フロー", "プロセス",
  "テスト", "パフォーマンス", "コスト", "リスク", "メリット", "デメリット",
  "トレンド", "インパクト", "アドバイス", "サポート", "バランス", "パターン",
  "ワーク", "ライフ", "ストレス", "モチベーション", "コミュニケーション",
  "ネットワーク", "プログラミング", "マネジメント", "コーチング",
  "IT", "AI", "DX", "HR", "PM", "UX", "UI",
]);

/**
 * Fragment テキストから候補エンティティ名を抽出する（内部共通ロジック）。
 *
 * 検出ヒューリスティック:
 *   1. 法人名マーカー（株式会社、Inc. 等）
 *   2. ASCII 大文字2文字以上（SHIFT, SRI, NTT 等）
 *   3. カタカナ3文字以上（メイプル、ビズリーチ等）
 *   4. 「〇〇社」「〇〇会社」パターン
 *
 * ブラックリストで一般名詞を除外。
 */
function collectCandidateEntities(fragments: PerspectiveFragment[]): Set<string> {
  const allText = fragments.map(f => f.text).join(" ");
  const entities = new Set<string>();

  // Pattern 1: 法人名マーカー（最も確実）
  const corpPatterns = /(?:株式会社|(?:\(株\))|(?:Inc\.|Ltd\.|Corp\.|LLC|Co\.))\s*[\w\u30A0-\u30FFー]+|[\w\u30A0-\u30FFー]+\s*(?:株式会社|(?:\(株\)))/g;
  for (const m of allText.matchAll(corpPatterns)) {
    entities.add(m[0].trim());
  }

  // Pattern 2: ASCII 大文字2文字以上（SHIFT, SRI, NTT 等）— ブラックリスト除外
  const asciiUpper = /\b[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)*\b/g;
  for (const m of allText.matchAll(asciiUpper)) {
    const word = m[0].trim();
    if (word.length >= 2 && !ENTITY_BLACKLIST.has(word)) {
      entities.add(word);
    }
  }

  // Pattern 3: カタカナ3文字以上（メイプル、ビズリーチ等）— ブラックリスト除外
  const katakana = /[ァ-ヶー]{3,}/g;
  for (const m of allText.matchAll(katakana)) {
    const word = m[0];
    if (!ENTITY_BLACKLIST.has(word)) {
      entities.add(word);
    }
  }

  // Pattern 4: 「〇〇社」「〇〇会社」パターン
  const shaPattern = /[\u4E00-\u9FFF\u30A0-\u30FF]{2,}(?:社|会社)/g;
  for (const m of allText.matchAll(shaPattern)) {
    entities.add(m[0]);
  }

  return entities;
}

function countCandidateEntities(fragments: PerspectiveFragment[]): number {
  return collectCandidateEntities(fragments).size;
}

/**
 * Fragment テキストから候補エンティティ名を抽出して重複除去した配列で返す。
 * countCandidateEntities と同じヒューリスティックを使用。
 */
export function extractCandidateEntityNames(fragments: PerspectiveFragment[]): string[] {
  return [...collectCandidateEntities(fragments)];
}

export function retrievalQualityGate(
  fragments: PerspectiveFragment[],
  message: string,
  searchTask?: SearchTaskClassification | null,
): QualityGateResult {
  // 結果なし → abstain
  if (fragments.length === 0) {
    // listing_search で結果ゼロ: これは想定内。honest limitation パスへ
    if (searchTask?.type === "listing_search") {
      return {
        action: "discard",
        filteredFragments: [],
        reason: "listing_search_no_results",
        needsHedge: false,
        canClarify: false, // clarify ではなく honest limitation を route.ts で出す
      };
    }
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

  const filteredFragments = highQuality.length > 0 ? highQuality : fragments;

  // Step 3: Task Fitness 判定（v4 新設）
  // タスク種別ごとに品質基準を調整する
  if (searchTask) {
    const fitness = searchTask.searchFitness;

    // listing_search (fitness=0.2): 直接のリストは見つからない想定。
    // 周辺情報（業界レポート、給与データ等）が見つかれば supplement として活用。
    // P1-1: ただし fragment に候補エンティティ（固有名詞・企業名等）が含まれる場合、
    //        supplement → use にアップグレードする。Maple SRI / SHIFT 等の具体名が
    //        PE 内部にあるのに supplement 判定で hedge 付きになり、最終応答から消えるのを防ぐ。
    if (searchTask.type === "listing_search") {
      if (filteredFragments.length > 0) {
        const entityCount = countCandidateEntities(filteredFragments);
        if (entityCount >= 1) {
          // 具体的な候補名が見つかった → use にアップグレード
          return {
            action: "use",
            filteredFragments,
            reason: `listing_search_with_entities(${entityCount})`,
            needsHedge: true, // hedge は維持（リスト検索の不完全性は伝える）
            canClarify: false,
          };
        }
        return {
          action: "supplement",
          filteredFragments,
          reason: "listing_search_peripheral_info",
          needsHedge: true,
          canClarify: false, // clarify ではなく honest limitation を route.ts で出す
        };
      }
      return {
        action: "discard",
        filteredFragments: [],
        reason: "listing_search_no_useful_info",
        needsHedge: false,
        canClarify: false,
      };
    }

    // perspective_seek: 多様性も評価する
    if (searchTask.type === "perspective_seek") {
      const stances = new Set(filteredFragments.map(f => f.stanceTowardQuery));
      if (stances.size >= 2 && filteredFragments.length >= 2) {
        return {
          action: "use",
          filteredFragments,
          reason: "perspective_diverse_stances",
          needsHedge: false,
          canClarify: false,
        };
      }
      // 視点が偏っている → hedge 付きで supplement
      if (filteredFragments.length > 0) {
        return {
          action: "supplement",
          filteredFragments,
          reason: "perspective_limited_diversity",
          needsHedge: true,
          canClarify: true,
        };
      }
    }

    // 低 fitness タスクは、一般的な基準を緩和する
    // fitness < 0.5 なら highQuality 1件でも supplement → use に昇格
    if (fitness < 0.5 && highQuality.length >= 1) {
      return {
        action: "supplement",
        filteredFragments,
        reason: `low_fitness_${searchTask.type}_hedged`,
        needsHedge: true,
        canClarify: true,
      };
    }
  }

  // Step 4: Sufficient Context 判定（Google, ICLR 2025）
  // 高品質 fragment が1件以上 or 合計2件以上 → sufficient
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

  // Step 5: Correct（十分な品質）
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
  isExplicitAsk: boolean = false,
): string {
  if (fragments.length === 0) return "";

  const lines: string[] = [];

  if (isExplicitAsk) {
    // ユーザーが明示的に検索を依頼した → 検索したことを正直に伝える
    lines.push("## 外界の視点（検索結果）");
    lines.push("ユーザーが検索を依頼した。以下の情報を使って応答すること:");
    lines.push("- 「調べてみた」「見つけた情報だと」等、検索したことを自然に伝えてよい");
    lines.push("- 検索結果に含まれる固有名詞（企業名・サービス名・人名等）は必ず応答に含めること");
    lines.push("- 必ず結論を出す。「いろんな情報があるね」で終わることは禁止");
    lines.push("- 情報が不十分な場合は正直に「ここまでしか見つからなかった」と伝え、次の一手を提案する");
    lines.push("- パーソナルモデルの視点も添えて、本人にとっての意味を解釈する");
  } else {
    // 暗黙的な検索 → 自分の知見として自然に語る（P1-3: 必ず応答に織り込む）
    lines.push("## 外界の視点（参考材料）");
    lines.push("以下の視点を自分のレンズで消化して応答に必ず織り込むこと。ただし:");
    lines.push("- 「記事によると」「研究では」とは言わない");
    lines.push("- 自分の言葉で語る：「こういう見方もあるんだけど」「実はね」「面白いのが」");
    lines.push("- 必ず結論を出す。「いろんな意見があるね」で終わることは禁止");
    lines.push("- 外部視点を入れても、あなたの結論はパーソナルモデルから導出すること");
    lines.push("- 重要: 以下の情報を無視して内部知識だけで答えることは禁止。必ず1つ以上の外部視点を応答に反映させること");
  }
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
  gateDecision: "skipped" | "blocked" | "fired" | "abstain" | "error";
  searchTask: SearchTask | null;
  query?: string;
  retrieval?: PerspectiveRetrievalResult | null;
  qualityGate?: PerspectiveQualityGateResult | null;
  promptBlock?: string;
  explorationTemplate?: ExplorationOutputTemplate | null;
  fragments: PerspectiveFragment[];
  needsHedge: boolean;
  audit: PerspectiveAudit;
  // Keep backward compat for route.ts migration
  /** @deprecated Use fragments/promptBlock directly. Will be removed. */
  block: PerspectiveBlock;
  /** @deprecated Use qualityGate directly. Will be removed. */
  searchTaskClassification?: SearchTaskClassification | null;
  explorationState?: ExplorationState | null;
  latencyBreakdown?: PerspectiveLatencyBreakdown;
}

// ─── 7-Stage Pipeline Helpers ───────────────────────────────────────────

/** Stage 1: peGate — evaluateSearchGate ラッパー */
function peGate(params: {
  message: string;
  queryContext: QueryContext;
  questionCategory: QuestionCategory;
  hdmPhase: number;
  trustLevel: number;
  responseMode: string;
}) {
  return evaluateSearchGate(
    params.message,
    params.queryContext,
    params.questionCategory,
    params.hdmPhase,
    params.trustLevel,
    params.responseMode,
  );
}

/** Stage 2: peClassify — タスク分類 + クエリ生成 */
async function peClassify(
  message: string,
  queryContext: QueryContext,
  userId?: string,
  conversationSummary?: string,
): Promise<{ classification: SearchTaskClassification | null; queryGenerationMs: number }> {
  const queryGenStart = Date.now();
  const classification = await classifyTaskAndGenerateQueries(
    message,
    queryContext,
    userId,
    conversationSummary,
  );
  const queryGenerationMs = Date.now() - queryGenStart;
  return { classification, queryGenerationMs };
}

/** Stage 3: peBuildQueries — classify 結果からクエリを抽出（既に生成済み） */
function peBuildQueries(classification: SearchTaskClassification): string[] {
  return classification.queries;
}

/** Stage 4: peRetrieve — 検索実行 + 認識論的分類 */
async function peRetrieve(
  queries: string[],
  queryContext: QueryContext,
  message: string,
  userId?: string,
): Promise<{ searchResults: SearchResult[]; classifiedFragments: PerspectiveFragment[]; searchMs: number; classificationMs: number }> {
  const searchStart = Date.now();
  const searchResults = await executeSearch(queries);
  const searchMs = Date.now() - searchStart;

  const classifyStart = Date.now();
  const classifiedFragments = searchResults.length > 0
    ? await classifySearchResults(searchResults, queryContext, message, userId)
    : [];
  const classificationMs = Date.now() - classifyStart;

  return { searchResults, classifiedFragments, searchMs, classificationMs };
}

/** Stage 5: peQualityGate — 品質ゲート */
function peQualityGate(
  classifiedFragments: PerspectiveFragment[],
  message: string,
  classification: SearchTaskClassification,
): { qualityResult: QualityGateResult; qualityGateMs: number } {
  const qualityGateStart = Date.now();
  const qualityResult = retrievalQualityGate(classifiedFragments, message, classification);
  const qualityGateMs = Date.now() - qualityGateStart;
  return { qualityResult, qualityGateMs };
}

/**
 * P1.5: パーソナリティ適性でフラグメントをランキングする。
 *
 * 4次元スコア:
 *   1. personalityFit  — ユーザーの性格軸とフラグメントの力学的関連度の一致
 *   2. workStyleFit    — 働き方（自律/協調、計画/柔軟）との合致
 *   3. growthAlignment — 成長志向/安定志向との合致
 *   4. originalRelevance — 元の分類品質（confidence × relevance by position）
 *
 * ランキングはフラグメント順序の並べ替えのみ。フィルタリング（除外）はしない。
 * MAX_FRAGMENTS=3 の制約は classifySearchResults で既に適用済み。
 */
export interface PersonalityContext {
  axisScores?: Partial<Record<string, number>>;
}

export function rankFragmentsByFit(
  fragments: PerspectiveFragment[],
  personalityCtx?: PersonalityContext | null,
): PerspectiveFragment[] {
  if (!personalityCtx?.axisScores || fragments.length <= 1) return fragments;

  const axes = personalityCtx.axisScores;

  // ユーザーの働き方ベクトルを構築（-1〜+1 の軸スコアを 0〜1 に正規化して使用）
  const autonomy = (axes.independence_vs_harmony ?? 0.5); // 高い = 自律重視
  const boldness = (axes.cautious_vs_bold ?? 0.5);        // 高い = 大胆
  const growthOrientation = (axes.growth_mindset ?? 0.5);  // 高い = 成長志向
  const flexibility = (axes.plan_vs_spontaneous ?? 0.5);   // 高い = 柔軟
  const changeEmbracement = (axes.change_embrace_vs_resist ?? 0.5); // 高い = 変化歓迎

  const scored = fragments.map((f, idx) => {
    const fr = f.forceRelevance;

    // 1. personalityFit: opportunity/growth はbold/growth-oriented人に加点、cost/fearはcautious人に加点
    const personalityFit =
      (fr.opportunity * boldness) +
      (fr.growth * growthOrientation) +
      (fr.cost * (1 - boldness) * 0.5) +   // cautious人はリスク情報を重視
      (fr.fear * (1 - changeEmbracement) * 0.3);

    // 2. workStyleFit: relationship は social人に、value は autonomy人に加点
    const workStyleFit =
      (fr.relationship * (1 - autonomy)) +
      (fr.value * autonomy * 0.8);

    // 3. growthAlignment: growthが高いfragmentは成長志向の人に加点
    const growthAlignment = fr.growth * growthOrientation;

    // 4. originalRelevance: confidence + position bonus（元の順序を尊重）
    const positionBonus = Math.max(0, 1 - idx * 0.15);
    const originalRelevance = f.confidence * 0.7 + positionBonus * 0.3;

    // 重み付き合計
    const totalScore =
      personalityFit * 0.35 +
      workStyleFit * 0.20 +
      growthAlignment * 0.15 +
      originalRelevance * 0.30;

    return { fragment: f, score: totalScore };
  });

  // スコア降順でソート
  scored.sort((a, b) => b.score - a.score);

  return scored.map(s => s.fragment);
}

/**
 * Stage 6: peAssembleResponseContract — promptBlock + SearchTask 生成。
 *
 * 内部 SearchTaskClassification を下流向け SearchTask に正規化し、
 * promptBlock を構築する。
 *
 * P1.5: personalityCtx が渡された場合、フラグメントをパーソナリティ適性で
 * ランキングしてから promptBlock を構築する。
 */
export function peAssembleResponseContract(
  classificationResult: SearchTaskClassification,
  qualityResult: QualityGateResult,
  fragments: PerspectiveFragment[],
  forceBalanceDelta: Partial<ForceBalance>,
  isExplicitAsk: boolean,
  personalityCtx?: PersonalityContext | null,
): { promptBlock: string; searchTask: SearchTask; candidateEntities: string[] } {
  // P1.5: パーソナリティ適性でフラグメントをランキング
  const rankedFragments = rankFragmentsByFit(fragments, personalityCtx);

  // Build prompt block (ranked order)
  const promptBlock = buildPerspectivePromptBlock(
    rankedFragments,
    forceBalanceDelta,
    qualityResult.needsHedge,
    isExplicitAsk,
  );

  // Detect candidate entities from ranked fragments
  const candidateEntityNames = extractCandidateEntityNames(rankedFragments);

  // Map internal classification type to downstream type
  const typeMap: Record<SearchTaskClassificationType, SearchTaskType> = {
    factual_lookup: "factual_lookup",
    market_intel: "market_intel",
    entity_research: "company_research",
    listing_search: "listing_search",
    comparison: "comparison",
    perspective_seek: "market_intel",  // perspective seeking maps to market intel
    how_to: "factual_lookup",         // how-to maps to factual lookup
  };

  const searchTask: SearchTask = {
    type: typeMap[classificationResult.type] ?? "none",
    explicit: isExplicitAsk,
    confidence: classificationResult.searchFitness,
    rationale: classificationResult.description,
    queryIntent: classificationResult.queries[0],
    candidateEntities: candidateEntityNames.length > 0 ? candidateEntityNames : undefined,
    userNeed: classificationResult.description,
  };

  return { promptBlock, searchTask, candidateEntities: candidateEntityNames };
}

/** Stage 7: peFinalize — PerspectiveEngineResult を組み立てる */
function peFinalize(opts: {
  gateDecision: PerspectiveEngineResult["gateDecision"];
  searchTask: SearchTask | null;
  searchTaskClassification: SearchTaskClassification | null;
  fragments: PerspectiveFragment[];
  needsHedge: boolean;
  promptBlock: string;
  forceBalanceDelta: Partial<ForceBalance>;
  queries: string[];
  totalMs: number;
  audit: PerspectiveAudit;
  qualityResult?: QualityGateResult;
  retrieval?: PerspectiveRetrievalResult | null;
  qualityGate?: PerspectiveQualityGateResult | null;
  explorationState?: ExplorationState | null;
  explorationTemplate?: ExplorationOutputTemplate | null;
  latencyBreakdown?: PerspectiveLatencyBreakdown;
}): PerspectiveEngineResult {
  const block: PerspectiveBlock = {
    fragments: opts.fragments,
    promptBlock: opts.promptBlock,
    forceBalanceDelta: opts.forceBalanceDelta,
    searchQueriesSent: opts.queries,
    searchLatencyMs: opts.totalMs,
  };

  return {
    gateDecision: opts.gateDecision,
    searchTask: opts.searchTask,
    query: opts.queries[0],
    retrieval: opts.retrieval ?? null,
    qualityGate: opts.qualityGate ?? null,
    promptBlock: opts.promptBlock,
    explorationTemplate: opts.explorationTemplate ?? null,
    fragments: opts.fragments,
    needsHedge: opts.needsHedge,
    audit: opts.audit,
    block,
    searchTaskClassification: opts.searchTaskClassification,
    explorationState: opts.explorationState ?? null,
    latencyBreakdown: opts.latencyBreakdown,
  };
}

// ─── runPerspectiveEngine ───────────────────────────────────────────────

/**
 * Perspective Engine のメインエントリポイント（v6: 7-Stage Pipeline）。
 *
 * パイプライン:
 *   1. peGate        — L0-L6 検索ゲート
 *   2. peClassify    — タスク分類 + クエリ生成（単一 LLM 呼び出し）
 *   3. peBuildQueries — classify 結果からクエリ抽出
 *   4. peRetrieve    — 検索実行 + 認識論的分類
 *   5. peQualityGate — CRAG 3段階 + Sufficient Context + Task Fitness
 *   6. peAssembleResponseContract — promptBlock + SearchTask(downstream) 生成
 *   7. peFinalize    — PerspectiveEngineResult 組み立て
 *
 * fail-open: どこで失敗しても null を返し、従来パスにフォールバックする。
 */
export async function runPerspectiveEngine(params: {
  message: string;
  queryContext: QueryContext;
  questionCategory: QuestionCategory;
  hdmPhase: number;
  trustLevel: number;
  responseMode: string;
  userId?: string;
  /** 直前の会話の話題要約（タスク分類 + クエリ生成に使う） */
  conversationSummary?: string;
  /** v5: 既存の ExplorationState（マルチターン探索の継続時） */
  existingExploration?: ExplorationState | null;
  /** P1.5: パーソナリティコンテキスト（フラグメントランキングに使う） */
  personalityCtx?: PersonalityContext | null;
}): Promise<PerspectiveEngineResult | null> {
  const startTime = Date.now();

  // ── Stage 1: peGate ──────────────────────────────────────────────
  const gate = peGate(params);

  const baseAudit: PerspectiveAudit = {
    sourceType: "internal",
    fragmentsUsed: [],
    forceBalanceDelta: {},
    searchQueriesSent: [],
    searchLatencyMs: 0,
    gateDecision: gate.explicitAskBlocked ? "blocked" : "skipped",
    gateReason: gate.reason,
    isExplicitAsk: gate.isExplicitAsk,
    explicitAskBlocked: gate.explicitAskBlocked,
  };

  if (!gate.shouldSearch) {
    const gateDecision: PerspectiveEngineResult["gateDecision"] =
      gate.explicitAskBlocked ? "blocked" : "skipped";

    return peFinalize({
      gateDecision,
      searchTask: null,
      searchTaskClassification: null,
      fragments: [],
      needsHedge: false,
      promptBlock: "",
      forceBalanceDelta: {},
      queries: [],
      totalMs: 0,
      audit: baseAudit,
    });
  }

  try {
    // ── Stage 2: peClassify ──────────────────────────────────────────
    const { classification, queryGenerationMs } = await peClassify(
      params.message,
      params.queryContext,
      params.userId,
      params.conversationSummary,
    );

    if (!classification || classification.queries.length === 0) {
      return null; // fail-open
    }

    // ── Stage 3: peBuildQueries ──────────────────────────────────────
    const queries = peBuildQueries(classification);

    // ── Stage 4: peRetrieve ──────────────────────────────────────────
    const { searchResults, classifiedFragments, searchMs, classificationMs } =
      await peRetrieve(queries, params.queryContext, params.message, params.userId);

    // v4: explicit ask 時は検索結果 0 でも quality gate に通す
    // （listing_search 等で honest limitation を返すため）
    if (searchResults.length === 0 && !gate.isExplicitAsk) {
      console.info("[perspective-engine] Search returned 0 results, fail-open");
      return null; // fail-open（暗黙検索で結果ゼロは静かに落とす）
    }

    const retrievalResult: PerspectiveRetrievalResult = {
      rawResults: searchResults,
      classifiedFragments,
      queriesSent: queries,
      searchLatencyMs: searchMs,
    };

    // ── Stage 5: peQualityGate ───────────────────────────────────────
    const { qualityResult, qualityGateMs } = peQualityGate(
      classifiedFragments,
      params.message,
      classification,
    );

    console.info(
      `[perspective-engine] Quality gate: action=${qualityResult.action}, reason=${qualityResult.reason}, ` +
      `task=${classification.type}(fitness=${classification.searchFitness}), ` +
      `fragments=${classifiedFragments.length}->${qualityResult.filteredFragments.length}, hedge=${qualityResult.needsHedge}`
    );

    const qualityGateResult: PerspectiveQualityGateResult = {
      action: qualityResult.action,
      reason: qualityResult.reason,
      needsHedge: qualityResult.needsHedge,
      canClarify: qualityResult.canClarify,
      filteredFragments: qualityResult.filteredFragments,
    };

    // Quality Gate が discard/abstain → 検索結果を使わない
    if (qualityResult.action === "discard" || qualityResult.action === "abstain") {
      const totalMs = Date.now() - startTime;
      const gateDecision: PerspectiveEngineResult["gateDecision"] = "abstain";

      // Still build a downstream SearchTask for route.ts context
      const { searchTask: downstreamTask } = peAssembleResponseContract(
        classification, qualityResult, [], {}, gate.isExplicitAsk,
      );

      return peFinalize({
        gateDecision,
        searchTask: downstreamTask,
        searchTaskClassification: classification,
        fragments: [],
        needsHedge: false,
        promptBlock: "",
        forceBalanceDelta: {},
        queries,
        totalMs,
        audit: {
          sourceType: "internal",
          fragmentsUsed: [],
          forceBalanceDelta: {},
          searchQueriesSent: queries,
          searchLatencyMs: totalMs,
          gateDecision: "abstain",
          gateReason: `${gate.reason}_quality_${qualityResult.action}`,
          isExplicitAsk: gate.isExplicitAsk,
          explicitAskBlocked: false,
        },
        qualityResult,
        retrieval: retrievalResult,
        qualityGate: qualityGateResult,
      });
    }

    // ── Stage 6: peAssembleResponseContract ──────────────────────────
    const promptBuildStart = Date.now();
    const fragments = qualityResult.filteredFragments;
    const forceBalanceDelta = calculateForceBalanceDelta(fragments);

    const { promptBlock, searchTask: downstreamSearchTask, candidateEntities } =
      peAssembleResponseContract(
        classification,
        qualityResult,
        fragments,
        forceBalanceDelta,
        gate.isExplicitAsk,
        params.personalityCtx,
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
      `[perspective-engine] Latency breakdown: ` +
      `queryGen=${queryGenerationMs}ms, search=${searchMs}ms, classify=${classificationMs}ms, ` +
      `qualityGate=${qualityGateMs}ms, promptBuild=${promptBuildMs}ms, total=${totalMs}ms`
    );

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

    // v5: iterative タスクの場合、ExplorationState を生成/更新
    let explorationState: ExplorationState | null = null;
    let explorationTemplate: ExplorationOutputTemplate | null = null;

    // v5: iterative タスクの Exploration 開始条件:
    //   - 既存 Exploration の継続: 常に OK
    //   - 新規開始: quality gate が "use" の場合のみ。
    //     "supplement" (peripheral_info のみ) で開始すると、候補エンティティが無い状態を
    //     跨いで持つだけになる。候補が取れて初めて Exploration の価値がある。
    const canStartNewExploration = qualityResult.action === "use";

    if (classification && classification.explorationDepth === "iterative") {
      if (params.existingExploration && !params.existingExploration.isDormant) {
        // 既存の探索を継続（deep_research フェーズへ遷移等）
        explorationState = {
          ...params.existingExploration,
          turnCount: params.existingExploration.turnCount + 1,
          totalSearchQueries: [
            ...params.existingExploration.totalSearchQueries,
            ...queries,
          ],
          lastUpdatedAt: new Date().toISOString(),
          isActive: true,
        };
        console.info(
          `[perspective-engine] Exploration continued: phase=${explorationState.currentPhase}, turn=${explorationState.turnCount}`
        );
      } else if (canStartNewExploration) {
        // 新規探索を開始（Turn 1: hypothesis フェーズ）
        explorationState = createExplorationState(
          classification.type,
          params.queryContext.domain,
          classification.description,
          [], // fitHypotheses は route.ts でパーソナルモデルから生成
        );
        explorationState.totalSearchQueries = [...queries];
        explorationState.currentPhase = "user_selection"; // Turn 1 完了後は候補選択待ち

        // タスクタイプ別出力テンプレートを取得
        explorationTemplate = EXPLORATION_OUTPUT_TEMPLATES[classification.type] ?? null;

        console.info(
          `[perspective-engine] Exploration started: type=${classification.type}, ` +
          `template=${explorationTemplate ? "found" : "default"}, id=${explorationState.explorationId}`
        );
      } else {
        console.info(
          `[perspective-engine] Exploration deferred: quality=${qualityResult.action} ` +
          `(need "use" to start, got "${qualityResult.reason}"). ` +
          `Search results will be delivered as single-turn.`
        );
      }
    }

    // ── Stage 7: peFinalize ──────────────────────────────────────────
    return peFinalize({
      gateDecision: "fired",
      searchTask: downstreamSearchTask,
      searchTaskClassification: classification,
      fragments,
      needsHedge: qualityResult.needsHedge,
      promptBlock,
      forceBalanceDelta,
      queries,
      totalMs,
      audit,
      qualityResult,
      retrieval: retrievalResult,
      qualityGate: qualityGateResult,
      explorationState,
      explorationTemplate,
      latencyBreakdown,
    });
  } catch (error) {
    console.warn("[PerspectiveEngine] Error in pipeline, falling back:", error);
    return null; // fail-open: 全てのエラーでフォールバック
  }
}
