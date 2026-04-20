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
import type { ForceBalance, QueryContext, QuestionCategory, QuestionType } from "./alterHomeAdapter";

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
  /** P1.11: 構造化エビデンス — prompt block 構築に使用 */
  evidence?: {
    entities: string[];   // 企業名・サービス名・固有名詞
    numbers: string[];    // 数値データ（"27.4%", "2970億ドル"等）
    date?: string;        // 年度・時点（"2026年Q1", "2025年版"等）
    sourceName?: string;  // ソース名（"総務省テレワーク人口調査"等）
    claim: string;        // 主張・事実の1文要約（旧 key_insight）
  };
  /** Chained Exploration: この fragment が生成された探索層 */
  sourceLayer?: "L0" | "L1" | "L2";
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

// ─── P1.10 Step 1: 情報密度基準（CEO承認 2026-04-14）──────────────────────
// ChatGPT級の情報密度を担保するための最低基準。
// 出力契約（route.ts）と入力設計（クエリ役割分担）の両方がこの基準を参照する。
export const DENSITY_STANDARDS: Record<SearchTaskType, {
  /** クエリの役割分担テンプレート */
  queryRoles: string[];
  /** 最大クエリ数 */
  maxQueries: number;
  /** fragment 最大数（密度を上げるため listing/market は多め） */
  maxFragments: number;
  /** fragment トークン予算 */
  tokenBudget: number;
}> = {
  listing_search: {
    queryRoles: [
      "候補名・企業名が出やすいクエリ（ランキング、注目企業、おすすめ）",
      "働き方・文化・制度が出やすいクエリ（リモート、福利厚生、社風）",
      "職種・業務内容・スキルが出やすいクエリ（募集職種、技術スタック）",
    ],
    maxQueries: 3,
    maxFragments: 4,
    tokenBudget: 600, // P1.11: evidence構造化分の増枠
  },
  market_intel: {
    queryRoles: [
      "市場規模・投資額・成長率など数値系クエリ",
      "業界トレンド・動向・注目分野系クエリ",
      "採用・職種需要・給与系クエリ",
    ],
    maxQueries: 3,
    maxFragments: 4,
    tokenBudget: 600, // P1.11: evidence構造化分の増枠
  },
  comparison: {
    queryRoles: [
      "比較対象Aの特徴・評判クエリ",
      "比較対象Bの特徴・評判クエリ",
    ],
    maxQueries: 2,
    maxFragments: 4, // P1.11: 多軸比較に必要なfragment数を増加
    tokenBudget: 500, // P1.11: evidence構造化分の増枠
  },
  entity_research: {
    queryRoles: [
      "エンティティの基本情報・評判クエリ",
      "エンティティの特徴・強み・弱みクエリ",
    ],
    maxQueries: 2,
    maxFragments: 3,
    tokenBudget: 350,
  },
  factual_lookup: {
    queryRoles: ["事実確認の直接クエリ"],
    maxQueries: 2,
    maxFragments: 3,
    tokenBudget: 300,
  },
  perspective_seek: {
    queryRoles: ["多視点収集クエリ"],
    maxQueries: 2,
    maxFragments: 3,
    tokenBudget: 300,
  },
  how_to: {
    queryRoles: ["方法・手順クエリ"],
    maxQueries: 2,
    maxFragments: 3,
    tokenBudget: 300,
  },
};

// ─── Search Task Types ───────────────────────────────────────────────────
// GPT feedback (CEO endorsed): 「検索前の思考設計」— 検索エンジンの強さではなく、
// WHAT を検索すべきかの定義が先。会話文脈からタスクを理解し、タスクに適したクエリと
// 品質基準を動的に決定する。

/**
 * 検索タスクの種別。検索「前」に何を探すべきかを定義する。
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
export type SearchTaskType =
  | "factual_lookup"     // 事実確認（「〜って本当？」「〜とは」「定義」「割合」）
  | "market_intel"       // 市場・業界情報（年収、求人動向、業界トレンド、相場）
  | "entity_research"    // 特定エンティティの調査（企業、サービス、制度、人物）
  | "listing_search"     // 一覧・リスト型検索（求人一覧、お店一覧、ランキング）
  | "comparison"         // 比較・選択肢（AとBどっち、おすすめ、違い）
  | "perspective_seek"   // 多視点収集（どう思う、世間では、一般的に、普通は）
  | "how_to";            // 方法・手順（やり方、コツ、始め方、準備）

export interface SearchTask {
  type: SearchTaskType;
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
  taskType: SearchTaskType;
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

export const EXPLORATION_OUTPUT_TEMPLATES: Partial<Record<SearchTaskType, ExplorationOutputTemplate>> = {
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
  taskType: SearchTaskType,
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
  taskType: SearchTaskType,
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
const TASK_SEARCH_FITNESS: Record<SearchTaskType, number> = {
  factual_lookup: 0.9,
  market_intel: 0.85,
  entity_research: 0.85,
  comparison: 0.7,
  perspective_seek: 0.7,
  how_to: 0.7,
  listing_search: 0.2,
};

/** タスク種別ごとの必要情報タイプ */
const TASK_REQUIRED_INFO: Record<SearchTaskType, SearchTask["requiredInfoType"]> = {
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
  /** P1.9: questionType を受け取り、外部知識要求バイパスに使用 */
  questionType?: QuestionType,
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

  // ── L0a: External Knowledge Bypass (案B+案C v2) ──────────────
  // Phase/Trust ゲート・clarify/repair ブロックより前に判定。
  // 外部世界に関する知識要求は、Phase=0 / clarify モードでも PE を許可する。
  // 感情吐露・内面相談は従来通りゲートで守る。
  //
  // CEO承認: 2026-04-16
  // CEO追加指摘: 「特定の言葉がないとWEBリサーチを入れられてない。大きく改善する必要がある」
  //
  // v2 改修点（2026-04-16）:
  //   1. conversation 型を拒否リストから除外 — フォローアップ質問が conversation に
  //      分類されるケースが多く、外部知識が必要な会話フローを全滅させていた
  //   2. 外部知識パターンをカテゴリ別に大幅拡張 — 「どこ」「近場」「ビジネスパートナー」
  //      「交流」「コミュニティ」等、現実世界の情報を求めるシグナルを広範に捕捉
  //
  // 設計原則: emotional / self_understanding は厳格に保護。それ以外は
  // メッセージ内容が外部知識を求めていれば Phase/Trust をバイパスする。
  const externalKnowledgeBypass = (() => {
    // 厳密に内面のみの型 — バイパス不可
    // conversation は除外: フォローアップ質問が頻繁に conversation に分類されるため
    const strictlyInternalTypes: (QuestionType | undefined)[] = [
      "emotional", "self_understanding",
      "greeting", "chat_opening", "meta_question", "ask_me",
      "scope_disclosure", "factual_recall", "delegation_request",
    ];
    if (strictlyInternalTypes.includes(questionType)) return false;

    // ── 広範な外部知識シグナル（カテゴリ別） ──
    // 参照: Li & Roth (2002) Question Taxonomy, TREC QA, Perplexity search triggers
    // 原則: 「外部の事実・サービス・場所・手段に関する情報が必要」な質問を捕捉
    //        感情表現・内面独白はここでは捕捉しない（typeフィルタで守る）
    const externalSignals: RegExp[] = [

      // ── 1. 場所・位置・施設 ──
      /どこ|場所|近く|近場|周辺|エリア|地域|お店|店舗|会場|施設|スポット|行ける場|行きたい|立地|アクセス/,

      // ── 2. 人・コミュニティ・出会い ──
      /交流|コミュニティ|出会[いう]|集まる|集まり|イベント|サークル|グループ|人脈|ネットワーキング|オフ会|勉強会|もくもく会/,

      // ── 3. リスト・候補・推薦 ──
      /おすすめ|候補|選択肢|一覧|リスト|ランキング|人気|定番|どんな.{0,8}(ある|いる)|何が.{0,8}(ある|いる)|どういう.{0,6}(ある|いる)/,

      // ── 4. 方法・手順・ハウツー ──
      /やり方|方法|手順|始め方|探し方|見つけ方|作り方|使い方|申し込み|登録|準備|コツ|ポイント|手続き|流れ|ステップ|入門|基礎|基本/,

      // ── 5. 仕事・ビジネス・キャリア ──
      /会社|企業|仕事|職業|職種|業界|市場|年収|給与|収入|転職|就職|採用|求人|起業|経営|投資|ビジネス|パートナー|案件|副業|フリーランス|稼[ぐげぎ]|独立|開業|事業|営業|マーケティング|スタートアップ/,

      // ── 6. 制度・法律・行政 ──
      /制度|法律|法令|条例|保険|資格|学校|大学|免許|補助金|助成金|税金|確定申告|手当|権利|義務|届出|申請|マイナンバー|住民票|戸籍|パスポート|ビザ|在留|役所|市役所|区役所|年金|社会保障/,

      // ── 7. サービス・製品・ツール ──
      /サービス|アプリ|ツール|ソフト|プラットフォーム|価格|料金|費用|プラン|契約|解約|月額|無料|有料|課金|サブスク|定額/,

      // ── 8. リサーチ・具体性シグナル ──
      /具体的(に|な)|調べ|検索|リサーチ|詳しく|実際(に|の|は)|現実(に|的)|本当(に|の|は)|事実|データ|統計|根拠|エビデンス|ソース|出典/,

      // ── 9. 時制・最新情報・ニュース ──
      /最新|最近の|今年|来年|2025|2026|トレンド|流行|ニュース|動向|話題|速報|現在|いま(の|は)/,

      // ── 10. 比較・評価・レビュー ──
      /違い|比較|メリット|デメリット|評判|レビュー|口コミ|どっちが|どちらが|vs|長所|短所|良い点|悪い点|コスパ/,

      // ── 11. 飲食・グルメ ──
      /レストラン|カフェ|居酒屋|ラーメン|飯屋|食べ(る|たい|られる|に)|グルメ|料理|ランチ|ディナー|予約|テイクアウト|デリバリー|Uber|出前|食事|飲み(屋|に)|バー|寿司|焼肉|イタリアン|フレンチ|中華|和食/,

      // ── 12. 医療・健康 ──
      /病院|クリニック|医者|医師|症状|治療|薬|健康|病気|診断|検査|体調|アレルギー|歯医者|眼科|皮膚科|整形外科|内科|外科|精神科|心療内科|カウンセリング|セラピー|漢方|サプリ|ワクチン|予防接種/,

      // ── 13. 住居・不動産・引っ越し ──
      /引っ越し|引越|物件|賃貸|家賃|マンション|アパート|不動産|住む|住まい|部屋(探し|を)|間取り|敷金|礼金|仲介|住宅|リフォーム|リノベ|ローン|住宅ローン/,

      // ── 14. 旅行・観光・移動 ──
      /旅行|観光|ホテル|宿|旅館|民泊|飛行機|新幹線|チケット|航空券|海外|国内|温泉|リゾート|ツアー|バックパック|パッケージ|レンタカー|空港/,

      // ── 15. 交通・移動手段 ──
      /電車|バス|タクシー|車|駐車場|路線|時刻表|乗り換え|運転|免許(取|を)|定期|交通費|終電|始発|ルート|ナビ|高速道路/,

      // ── 16. 教育・学習・スキル ──
      /勉強|学習|講座|セミナー|スクール|教室|塾|研修|独学|資格(取得|を)|試験|受験|合格|英語|語学|プログラミング|オンライン(学習|講座)|通信(教育|講座)|留学|奨学金/,

      // ── 17. エンタメ・文化・趣味 ──
      /映画|本|書籍|音楽|ゲーム|漫画|アニメ|展示|美術館|博物館|コンサート|ライブ|フェス|チケット(を|が)|配信|ストリーミング|Netflix|YouTube|Spotify|読書|小説|作品|上映/,

      // ── 18. テクノロジー・IT・開発 ──
      /プログラミング|フレームワーク|ライブラリ|API|クラウド|サーバー|コード|開発|エンジニア|デザイナー|GitHub|AWS|Google|Apple|Microsoft|ChatGPT|Claude|GPT|LLM|機械学習|ディープラーニング|ブロックチェーン|Web3/,

      // ── 19. 金融・資産・マネー ──
      /貯金|貯蓄|節約|ローン|借金|クレジット|口座|銀行|株|為替|FX|仮想通貨|暗号資産|NISA|iDeCo|投資信託|保険(料|を)|金利|利率|資産(運用|形成)|家計|ポイント(カード|還元)/,

      // ── 20. 美容・ファッション・外見 ──
      /美容(院|室)|美容師|ヘアサロン|化粧|コスメ|メイク|スキンケア|ネイル|エステ|脱毛|ファッション|ブランド|コーデ|着こなし|サイズ|フィット|ショップ|セレクトショップ|通販|EC/,

      // ── 21. スポーツ・フィットネス・身体 ──
      /ジム|トレーニング|ダイエット|筋トレ|ヨガ|ピラティス|ランニング|マラソン|スポーツ|フィットネス|パーソナル(トレーナー|ジム)|プール|スタジオ|体重|カロリー|栄養/,

      // ── 22. ペット・動物 ──
      /ペット|犬|猫|動物病院|飼[いう]方|ペットショップ|トリミング|ドッグラン|キャットフード|ドッグフード/,

      // ── 23. 自然・天気・災害 ──
      /天気|気温|台風|地震|災害|避難|防災|警報|注意報|花粉|紫外線|気候/,

      // ── 24. 冠婚葬祭・ライフイベント ──
      /結婚(式|相談)|婚活|マッチング(アプリ|サービス)|相談所|披露宴|葬儀|葬式|お墓|墓地|出産|妊娠|産院|保育園|幼稚園|入園|入学|卒業|成人式|七五三/,

      // ── 25. 定義・知識・概念 ──
      /って(何|なに)|とは|意味|定義|仕組み|原理|歴史|由来|語源|概要|概念|理論/,

      // ── 26. 数量・価格・スペック ──
      /いくら|何円|何万|何人|何歳|何年|何時間|何キロ|何(グラム|メートル|リットル)|どのくらい(の|かかる)|相場|平均|目安|スペック|性能/,

      // ── 27. 存在・可用性 ──
      /売って(る|い)|やって(る|い)|開いて(る|い)|空いて(る|い)|あいて(る|い)|営業(中|時間|して)|在庫|入荷|予約(でき|可)|受付/,

      // ── 28. 社会・政治・経済 ──
      /政治|選挙|経済|景気|GDP|失業(率|者)|物価|インフレ|デフレ|円安|円高|政府|自治体|都道府県|国会|法案|規制/,

      // ── 29. 修理・DIY・住環境 ──
      /修理|故障|壊れ|直し(方|て)|リペア|DIY|工事|設備|水漏れ|エアコン|給湯器|換気|害虫|駆除|清掃|クリーニング|ハウス/,

      // ── 30. 資格・検定・証明 ──
      /検定|認定|証明書|免状|合格率|過去問|テキスト|問題集|対策|スコア|TOEIC|TOEFL|簿記|宅建|FP|IT(パスポート|ストラテジスト)|基本情報/,
    ];

    return externalSignals.some(pattern => pattern.test(message));
  })();

  // ── L0b: Response mode / greeting exclusions ──────────────────
  // 案C: clarify/repair でも外部知識バイパスが有効なら PE 実行を許可
  if ((responseMode === "clarify" || responseMode === "repair") && !externalKnowledgeBypass) {
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
  // 案B: 外部知識バイパス発動時は Phase/Trust ゲートをスキップ
  // 通常の暗黙検索は引き続き Phase>=1, Trust>=2 を要求
  if (!externalKnowledgeBypass) {
    if (hdmPhase < 1) {
      return { shouldSearch: false, searchNeed: 0, reason: "phase_too_low", isExplicitAsk: false, explicitAskBlocked: false };
    }
    if (trustLevel < 2) {
      return { shouldSearch: false, searchNeed: 0, reason: "trust_too_low", isExplicitAsk: false, explicitAskBlocked: false };
    }
  }

  // ── L1: External Knowledge Need ─────────────────────────────────
  let searchNeed = 0;

  // 外部知識バイパス発動時: searchNeed フロアを設定
  // バイパスは既に (1) questionType が内面系でない (2) メッセージに外部知識パターンがある
  // を確認済み。Phase/Trust gate をスキップした以上、search をコミットする。
  // フロアなしだと、バイパスが通っても scoring が低くて検索されない問題が発生する。
  // (例: "そんな人どこにいんだよ" → bypass=true, searchNeed=0 → 検索されない)
  if (externalKnowledgeBypass) {
    searchNeed = 0.5;
  }

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
): Promise<SearchTask | null> {
  // 短い explicit ask（「WEBから見つけてきて」「調べて」等）の場合、
  // 直前の会話文脈がないとまともなタスク定義ができない
  const isShortExplicit = message.length < 30 && detectExplicitSearchIntent(message);
  const contextSection = (isShortExplicit && conversationSummary)
    ? `\n## 直前の会話の話題（検索対象の特定に使用。ただしここの情報をそのままクエリに使わないこと）\n${conversationSummary}`
    : (conversationSummary ? `\n## 会話の文脈（意図理解の参考のみ。性格情報等をクエリに含めないこと）\n${conversationSummary}` : "");

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
- **最重要: 性格特性語（「自律重視」「変化歓迎」「個人主義」「大胆」「慎重」等）をクエリに絶対に含めない**。これらはユーザーの背景情報であり検索キーワードではない。検索エンジンは性格用語で有用な結果を返さない
- 個人的な情報（性格、感情、関係性、名前）は絶対に含めない
- 「調べて」「検索して」「WEBで」等の検索指示語はクエリに含めない
- 「WEB検索」「ネット検索」「情報検索」のようなメタクエリは絶対に生成しない
- 日本語で簡潔に（各クエリ10語以内）
- **クエリは「検索エンジンで情報が見つかるキーワード」のみ使用すること**。具体的な業界名・職種名・制度名・トレンド名を使う
- listing_search の場合: 直接のリスト検索ではなく、具体的な企業名・サービス名が記事中に登場しやすいクエリに変換すること。例: 「注目企業 ランキング」「おすすめ企業 特徴」「企業 比較 評判」等。業界レポート・評判記事・ランキング記事を狙う
- 地域名（都道府県）はクエリに含めない — 地域は絞り込みの最後の条件であり、まず職種・スキル・働き方で候補を出すこと
- **クエリ役割分担**: 各クエリは異なる種類の情報を狙うこと（同じ情報源を複数クエリで重複して狙わない）
- listing_search / market_intel は 2〜3個のクエリを生成（情報密度のため多め）。それ以外は 1〜2個。
- listing_search のクエリ役割: ①候補名が出やすいクエリ ②働き方・文化が出やすいクエリ ③職種・スキルが出やすいクエリ
- market_intel のクエリ役割: ①数値・市場規模系 ②トレンド・動向系 ③採用・需要系
- comparison のクエリ役割: ①「A vs B 比較」「A B 違い」等のA対Bの直接比較記事を狙うクエリ ②数値・制度・統計の裏付け（年収差・社会保険・税制・利用率・市場シェア・調査データ等の具体数値が出やすいクエリ。必ず「統計」「年収」「調査」「制度」のいずれかをクエリに含めること）

## 悪い例（絶対に生成しないこと）
- ❌ 「キャリアプラン 自律重視 変化歓迎」← 性格語がクエリに入っている
- ❌ 「個人主義 働き方 企業文化」← 性格語がクエリに入っている
- ❌ 「フリーランス 正社員 メリット デメリット」← 意見記事ばかりヒットし、数値が出ない
- ✅ 「転職 キャリアチェンジ 方向性 2026」← 具体的な情報を狙っている
- ✅ 「成長業界 将来性 職種 トレンド」← 検索エンジンで有用な結果が出るキーワード
- ✅ 「フリーランス 正社員 年収 比較 統計」← 数値データが出やすいキーワード
- ✅ 「フリーランス 社会保険 税金 制度 比較」← 制度差のデータが出やすいキーワード

## ユーザーの質問
${message}
${contextSection}
## 検出されたドメイン
${queryContext.domain}

## 出力形式（JSON）
{"task_type": "market_intel", "task_description": "IT業界の転職市場動向を調査", "queries": ["IT業界 市場規模 成長率 2026", "IT業界 注目トレンド AI", "エンジニア 年収 採用需要"]}`,
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
    const validTypes: SearchTaskType[] = [
      "factual_lookup", "market_intel", "entity_research",
      "listing_search", "comparison", "perspective_seek", "how_to",
    ];
    const resolvedType: SearchTaskType = validTypes.includes(taskType as SearchTaskType)
      ? (taskType as SearchTaskType)
      : "factual_lookup";

    // P1.10: タスクタイプ別の maxQueries でスライス
    const taskTypeForLimit = (structured.task_type as string) ?? "factual_lookup";
    const densityStandard = DENSITY_STANDARDS[taskTypeForLimit as SearchTaskType];
    const maxQ = densityStandard?.maxQueries ?? 2;
    const rawQueries = Array.isArray(structured.queries)
      ? (structured.queries as string[]).slice(0, maxQ)
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
    // P1.10: 全クエリを並列実行（最大3本）
    const fetchPromises = queries.slice(0, 3).map(async (query): Promise<SearchResult[]> => {
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
  taskType?: SearchTaskType,
): Promise<PerspectiveFragment[]> {
  if (searchResults.length === 0) return [];

  const capped = searchResults.slice(0, 5);
  const classifyModelOverride = (process.env.PE_CLASSIFY_MODEL ?? "").trim() || undefined;

  // ── S2b: classify prompt builder（バッチ単位） ──
  const buildClassifyBatchPrompt = (batchResults: SearchResult[]): string => {
    const resultsText = batchResults
      .map((r, i) => `[${i + 1}] ${r.title}\n${r.text?.slice(0, 300) || r.highlights?.join(" ") || ""}`)
      .join("\n\n");

    return `以下のWeb検索結果を分類し、エビデンスを構造化抽出してください。

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

## エビデンス抽出ルール（**最重要 — 情報を落とさないこと**）
各結果から以下を**元テキストに忠実に**抽出:
- entities: 企業名・サービス名・組織名・固有名詞の配列（例: ["株式会社SmartHR", "ブレインパッド", "OpenAI"]）。一般用語（IT, AI, DX等）は含めない
- numbers: 具体的な数値データの配列（例: ["27.4%", "2970億ドル", "年収650万円"]）。元テキストにある数値を全て拾うこと
- date: 年度・時点・調査年（例: "2026年Q1", "2025年版調査"）。なければ null
- source_name: 調査名・レポート名・機関名（例: "総務省テレワーク人口実態調査"）。なければ null
- claim: 主張・事実の1文要約

## ハードネガティブに注意
検索結果が「事実として正確」でも「ユーザーの質問と無関係」なら relevance_to_question を低くすること。
例: 楽天ウェブ検索のポイント情報は事実だが、求人の質問には無関連 → relevance=0.0

## 出力形式（JSON）
{"fragments": [{"index": 1, "relevance_to_question": 0.8, "epistemic_type": "...", "confidence": 0.8, "source_authority": "...", "stance": "...", "force_relevance": {"opportunity": 0.0, "cost": 0.0, "relationship": 0.0, "value": 0.0, "fear": 0.0, "growth": 0.0}, "key_insight": "...", "entities": ["企業A", "企業B"], "numbers": ["27.4%", "300億円"], "date": "2026年", "source_name": "○○調査"}]}`;
  };

  const CLASSIFY_SYSTEM_PROMPT =
    "あなたは情報の認識論的分類とエビデンス抽出の専門家です。まず各情報片がユーザーの質問に直接関連するかを判定し（relevance_to_question）、その上で事実か意見か体験談かを分類してください。**特に重要**: 元テキストに含まれる具体的な数値・企業名・年度・調査名を漏れなく entities/numbers/date/source_name に抽出すること。情報を落とさないことが最優先です。";

  const fireClassifyBatch = (batchResults: SearchResult[]) =>
    runAI({
      taskType: "perspective_classify",
      prompt: buildClassifyBatchPrompt(batchResults),
      systemPrompt: CLASSIFY_SYSTEM_PROMPT,
      requireJson: true,
      temperature: 0.2,
      // バッチサイズに応じた出力トークン上限（1結果≈300tok + 余白200tok）
      maxOutputTokens: Math.min(1500, batchResults.length * 350 + 200),
      userId,
      metadata: { feature: "perspective_engine", step: "classify", batchSize: batchResults.length },
      modelOverride: classifyModelOverride,
    });

  type RawFragment = Record<string, unknown>;
  const extractRawFragments = (result: { structured: unknown }): RawFragment[] => {
    const s = result.structured as Record<string, unknown> | null;
    return s && Array.isArray(s.fragments) ? (s.fragments as RawFragment[]) : [];
  };

  // ── S2b: 4件以上 → 2バッチ並列分類（密度保持のまま classify 高速化） ──
  let classifyRawFragments: RawFragment[];

  if (capped.length >= 4) {
    const mid = Math.ceil(capped.length / 2);
    const [r1, r2] = await Promise.all([
      fireClassifyBatch(capped.slice(0, mid)),
      fireClassifyBatch(capped.slice(mid)),
    ]);
    const frags1 = extractRawFragments(r1);
    const frags2 = extractRawFragments(r2);
    // batch2 のインデックスを元の capped 配列位置にオフセット
    classifyRawFragments = [
      ...frags1,
      ...frags2.map(f => ({ ...f, index: ((f.index as number) ?? 0) + mid })),
    ];
  } else {
    classifyRawFragments = extractRawFragments(await fireClassifyBatch(capped));
  }

  const fragments: PerspectiveFragment[] = [];

  for (const f of classifyRawFragments) {
    const idx = (f.index as number) - 1;
    const source = capped[idx];
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

    // P1.11: evidence 構造を抽出
    const rawEntities = Array.isArray(f.entities) ? (f.entities as string[]) : [];
    const rawNumbers = Array.isArray(f.numbers) ? (f.numbers as string[]) : [];
    const rawDate = typeof f.date === "string" ? f.date : undefined;
    const rawSourceName = typeof f.source_name === "string" ? f.source_name : undefined;
    const claim = (f.key_insight as string) || "";

    // P1.11: evidence-rich snippet — claim + 具体データを結合
    // key_insight だけだと数値・企業名が落ちるので、evidence から復元する
    const evidenceParts: string[] = [claim];
    if (rawEntities.length > 0 && !rawEntities.every(e => claim.includes(e))) {
      evidenceParts.push(`（${rawEntities.join("、")}）`);
    }
    if (rawNumbers.length > 0 && !rawNumbers.every(n => claim.includes(n))) {
      evidenceParts.push(`[${rawNumbers.join(", ")}]`);
    }
    const evidenceText = evidenceParts.join(" ");

    fragments.push({
      text: evidenceText || source.text?.slice(0, 200) || "",
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
      evidence: {
        entities: rawEntities,
        numbers: rawNumbers,
        date: rawDate,
        sourceName: rawSourceName,
        claim,
      },
    });
  }

  // Diversity floor: 対立視点が含まれているか確認
  const hasOppose = fragments.some((f) => f.stanceTowardQuery === "oppose");
  const hasSupport = fragments.some((f) => f.stanceTowardQuery === "support");
  // 片方しかない場合は neutral/nuanced を補完役として残す（削除しない）

  // P1.10: タスクタイプ別の fragment 予算（情報密度優先）
  const density = taskType ? DENSITY_STANDARDS[taskType] : null;
  const TOKEN_BUDGET = density?.tokenBudget ?? 300;
  const MAX_FRAGMENTS = density?.maxFragments ?? 3;
  const estimateTokens = (text: string) => Math.ceil(text.length / 1.5); // 日本語近似
  let totalTokens = 0;
  const budgetedFragments: PerspectiveFragment[] = [];

  // P1.10: 情報密度優先ソート — 固有名詞・数値を含む fragment を優先しつつ、diversity を維持
  const infoDensityScore = (text: string): number => {
    let score = 0;
    // 企業名（株式会社〇〇 or 英語固有名詞）
    const corpMatches = text.match(/株式会社[^\s、。,]+|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g) || [];
    score += corpMatches.length * 3;
    // 数値データ（金額・割合・年など）
    const numMatches = text.match(/[0-9]+[%％万億兆ドル円]|[0-9]{4}年/g) || [];
    score += numMatches.length * 2;
    // 具体的名詞（カタカナ語3文字以上）
    const kataMatches = text.match(/[ァ-ヶー]{3,}/g) || [];
    score += kataMatches.length;
    return score;
  };

  const sorted = [...fragments].sort((a, b) => {
    // 一次: 情報密度スコア（固有名詞・数値の含有率）
    const densityDiff = infoDensityScore(b.text) - infoDensityScore(a.text);
    if (densityDiff !== 0) return densityDiff;
    // 二次: stance diversity（oppose > support > other）
    const stancePriority = (f: PerspectiveFragment) =>
      f.stanceTowardQuery === "oppose" ? 2
      : f.stanceTowardQuery === "support" ? 1
      : 0;
    return stancePriority(b) - stancePriority(a);
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

// ─── Chained Exploration: L1 Deep Dive ──────────────────────────────────

/**
 * L0 fragment の情報ギャップをルールベースで分析する。
 * LLM 不使用（0ms）。L1 発火判定の入力。
 */
export interface InformationGapAnalysis {
  /** 具体的数値が含まれるか */
  hasSpecificNumbers: boolean;
  /** stance の多様性 (0-1)。0=全て同じ stance, 1=完全に分散 */
  stanceDiversity: number;
  /** L0 fragment 内で企業名等の詳細情報が取れているか */
  entityResolved: boolean;
  /** 「なぜ」の根拠（因果関係）が含まれるか */
  causalDepth: boolean;
  /** 分析対象のタスクタイプ */
  taskType: SearchTaskType;
  /** 分析の根拠（監査用） */
  gaps: string[];
}

export function analyzeInformationGap(
  fragments: PerspectiveFragment[],
  taskType: SearchTaskType,
): InformationGapAnalysis {
  const gaps: string[] = [];

  // 1. 具体的数値の有無
  const hasSpecificNumbers = fragments.some(f => {
    const nums = f.evidence?.numbers ?? [];
    return nums.length > 0;
  });
  if (!hasSpecificNumbers) gaps.push("no_specific_numbers");

  // 2. stance の多様性
  const stanceCounts = new Map<string, number>();
  for (const f of fragments) {
    stanceCounts.set(f.stanceTowardQuery, (stanceCounts.get(f.stanceTowardQuery) ?? 0) + 1);
  }
  const uniqueStances = stanceCounts.size;
  const stanceDiversity = fragments.length > 0
    ? Math.min(1, (uniqueStances - 1) / 2) // 3+ stances → 1.0
    : 0;
  if (stanceDiversity < 0.4) gaps.push("low_stance_diversity");

  // 3. エンティティ解決
  const totalEntities = fragments.reduce((sum, f) => sum + (f.evidence?.entities?.length ?? 0), 0);
  const entityResolved = totalEntities >= 2;
  if (!entityResolved) gaps.push("entities_unresolved");

  // 4. 因果の深さ（key_insight に「理由」「原因」「なぜ」「メカニズム」等が含まれるか）
  const causalKeywords = /理由|原因|なぜ|メカニズム|要因|背景|because|reason|due to/i;
  const causalDepth = fragments.some(f => causalKeywords.test(f.evidence?.claim ?? "") || causalKeywords.test(f.text));
  if (!causalDepth) gaps.push("no_causal_depth");

  return { hasSpecificNumbers, stanceDiversity, entityResolved, causalDepth, taskType, gaps };
}

/**
 * L1 に進むべきかをルールベースで判定する。
 * 設計書 2.3: タスクタイプ別のOR条件。
 */
export function shouldProceedToL1(
  gap: InformationGapAnalysis,
  qualityAction: QualityAction,
  elapsedMs: number,
  budgetMs: number = 15_000,
): { proceed: boolean; reason: string } {
  // L1 は supplement 時のみ発火（use=十分、discard/abstain=基盤なし）
  if (qualityAction !== "supplement") {
    return { proceed: false, reason: `quality_${qualityAction}_not_supplement` };
  }

  // レイテンシ予算チェック（L1 に最低 4s 必要）
  const L1_MINIMUM_BUDGET_MS = 4_000;
  if (elapsedMs + L1_MINIMUM_BUDGET_MS > budgetMs) {
    return { proceed: false, reason: "latency_budget_exhausted" };
  }

  // タスクタイプ別の発火条件（OR結合）
  const { taskType } = gap;

  if ((taskType === "listing_search" || taskType === "market_intel") && !gap.hasSpecificNumbers) {
    return { proceed: true, reason: "no_numbers_for_data_task" };
  }
  if (taskType === "comparison" && gap.stanceDiversity < 0.4) {
    return { proceed: true, reason: "low_diversity_for_comparison" };
  }
  if (taskType === "entity_research" && !gap.entityResolved) {
    return { proceed: true, reason: "entities_unresolved" };
  }
  if (taskType === "perspective_seek" && !gap.causalDepth) {
    return { proceed: true, reason: "no_causal_for_perspective" };
  }
  // パーソナル関連度が高い＋数値不足
  if (!gap.hasSpecificNumbers && !gap.entityResolved) {
    return { proceed: true, reason: "both_numbers_and_entities_missing" };
  }

  return { proceed: false, reason: "gap_below_threshold" };
}

/**
 * L1 深掘りクエリを生成する。LLM 1回呼び出し。
 * L0 の fragment テキストと情報ギャップから、1-2本の追加クエリを導出する。
 */
export async function generateL1Queries(
  l0Fragments: PerspectiveFragment[],
  gap: InformationGapAnalysis,
  message: string,
  domain: string,
  userId?: string,
): Promise<{ queries: string[]; reason: string }> {
  // L0 fragment のサマリーを構築（LLM 入力用、最大 3 件）
  const fragmentSummary = l0Fragments
    .slice(0, 3)
    .map((f, i) => `[${i + 1}] ${f.evidence?.claim ?? f.text.slice(0, 150)}`)
    .join("\n");

  const gapDescription = gap.gaps.join(", ");

  const result = await runAI({
    taskType: "perspective_l1_query",
    prompt: `以下のWeb検索結果（Layer 0）に不足している情報を補う追加検索クエリを生成してください。

## ユーザーの質問
${message}

## ドメイン
${domain}

## Layer 0 で得られた情報
${fragmentSummary}

## 情報ギャップ
${gapDescription}

## ルール
- Layer 0 で既に得られた情報を**重複して取得しない**クエリを生成すること
- 具体的な数値、企業名、統計データに到達できるクエリにすること
- ユーザーの個人情報（名前、住所、年齢等）を含めないこと（Privacy Gate）
- 1-2本のクエリを生成すること

## 出力形式（JSON）
{"queries": ["追加クエリ1", "追加クエリ2"], "reason": "深掘りの理由（1文）"}`,
    systemPrompt: "あなたはWeb検索クエリの専門家です。既存の検索結果の不足を補う追加クエリを生成してください。具体的なデータに到達するクエリを優先してください。",
    requireJson: true,
    temperature: 0.2,
    maxOutputTokens: 300,
    userId,
    metadata: { feature: "perspective_engine", step: "l1_query_gen" },
  });

  const structured = result.structured as Record<string, unknown> | null;
  if (structured && Array.isArray(structured.queries)) {
    const queries = (structured.queries as string[]).slice(0, 2).filter(q => q.trim().length > 0);
    const reason = (structured.reason as string) ?? "l1_gap_fill";
    if (queries.length > 0) {
      return { queries, reason };
    }
  }

  return { queries: [], reason: "l1_query_gen_failed" };
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
export function retrievalQualityGate(
  fragments: PerspectiveFragment[],
  message: string,
  searchTask?: SearchTask | null,
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
    if (searchTask.type === "listing_search") {
      if (filteredFragments.length > 0) {
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
): string {
  if (fragments.length === 0) return "";

  const lines: string[] = [];
  lines.push("## 外界の視点（参考材料）");
  lines.push("以下の視点を自分のレンズで消化して語ってよい。ただし:");
  lines.push("- 「調べた」「記事によると」「研究では」とは言わない");
  lines.push("- 自分の言葉で語る：「こういう見方もあるんだけど」「実はね」「面白いのが」");
  lines.push("- 必ず結論を出す。「いろんな意見があるね」で終わることは禁止");
  lines.push("- 外部視点を入れても、あなたの結論はパーソナルモデルから導出すること");
  lines.push("- **最重要: 以下の「データ:」行に含まれる数値・企業名・年度を省略せず回答本文に含めること。「数値:」にあるデータを1つも使わないのは契約違反**");
  lines.push("- **以下にない企業名・サービス名・数値を捏造しないこと。プレースホルダー（「○○社」「XYZ」「ABC社」）は絶対禁止**");
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

    // P1.11: 構造化エビデンス付き prompt block
    if (f.evidence && (f.evidence.entities.length > 0 || f.evidence.numbers.length > 0)) {
      lines.push(`- [${typeLabel}/${stanceLabel}] ${f.evidence.claim}`);
      const dataParts: string[] = [];
      if (f.evidence.entities.length > 0) {
        dataParts.push(`企業/名称: ${f.evidence.entities.join("、")}`);
      }
      if (f.evidence.numbers.length > 0) {
        dataParts.push(`数値: ${f.evidence.numbers.join("、")}`);
      }
      if (f.evidence.date) {
        dataParts.push(`時点: ${f.evidence.date}`);
      }
      if (f.evidence.sourceName) {
        dataParts.push(`出典: ${f.evidence.sourceName}`);
      }
      lines.push(`  → データ: ${dataParts.join(" / ")}`);
    } else {
      lines.push(`- [${typeLabel}/${stanceLabel}] ${f.text}`);
    }
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
  /** Chained Exploration L1 — L1 が発火しなかった場合は全て 0 */
  l1?: {
    fired: boolean;
    reason: string;
    queryGenMs: number;
    searchMs: number;
    classifyMs: number;
    totalMs: number;
    queriesSent: string[];
    fragmentsBefore: number;
    fragmentsAfter: number;
  };
}

export interface PerspectiveEngineResult {
  block: PerspectiveBlock;
  audit: PerspectiveAudit;
  qualityGate?: QualityGateResult;
  /** v4: 検索タスク分類結果 */
  searchTask?: SearchTask | null;
  /** v5: マルチターン探索の状態（iterative の場合のみ） */
  explorationState?: ExplorationState | null;
  /** v5: Turn 1 の出力テンプレート（iterative の場合のみ） */
  explorationTemplate?: ExplorationOutputTemplate | null;
  latencyBreakdown?: PerspectiveLatencyBreakdown;
}

/**
 * Perspective Engine のメインエントリポイント（v4: Task-Aware）。
 *
 * パイプライン:
 *   L0-L6 Gate → Task Classification + Query Generation → Search → Classify → Task-Fitness Quality Gate → Personalize → Prompt Block
 *
 * v3 → v4 変更:
 *   - generateSafeSearchQueries → classifyTaskAndGenerateQueries（タスク分類+クエリ生成統合）
 *   - Quality Gate に SearchTask を渡してタスク種別ごとの品質判定
 *   - listing_search の honest limitation パス（結果に searchTask を含めて route.ts で判定）
 *   - searchResults が 0 件でも explicit ask 時は fail-open せず quality gate に通す
 *     （listing_search 等で意味のある fallback を出すため）
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
  /** P1.9: questionType（外部知識バイパス判定用） */
  questionType?: QuestionType;
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
    params.questionType,
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
    // P1.8: Gate skip visibility — skip reason を常にログ出力
    console.info(
      `[perspective-engine] 🚧 Gate SKIP: reason=${gate.reason}, ` +
      `searchNeed=${gate.searchNeed.toFixed(2)}, explicit=${gate.isExplicitAsk}, ` +
      `phase=${params.hdmPhase}, trust=${params.trustLevel}, mode=${params.responseMode}, ` +
      `msg="${params.message.slice(0, 40)}"`,
    );
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

  // P1.8: Gate FIRED visibility
  console.info(
    `[perspective-engine] ✅ Gate FIRED: reason=${gate.reason}, ` +
    `searchNeed=${gate.searchNeed.toFixed(2)}, explicit=${gate.isExplicitAsk}, ` +
    `phase=${params.hdmPhase}, trust=${params.trustLevel}`,
  );

  try {
    // 2. Task Classification + Query Generation（統合 — 単一 LLM 呼び出し）
    const queryGenStart = Date.now();
    const searchTask = await classifyTaskAndGenerateQueries(
      params.message,
      params.queryContext,
      params.userId,
      params.conversationSummary,
    );
    const queryGenerationMs = Date.now() - queryGenStart;

    if (!searchTask || searchTask.queries.length === 0) {
      return null; // fail-open
    }

    const queries = searchTask.queries;

    // v4: listing_search で fitness が極端に低い場合、検索自体をスキップして
    // honest limitation パスに直行する選択肢もある。
    // ただし、周辺情報（業界レポート等）は有用なので、検索は実行する。

    // 3. Search Execution (並列化: 全クエリを同時実行)
    const searchStart = Date.now();
    const searchResults = await executeSearch(queries);
    const searchMs = Date.now() - searchStart;

    // v4: explicit ask 時は検索結果 0 でも quality gate に通す
    // （listing_search 等で honest limitation を返すため）
    if (searchResults.length === 0 && !gate.isExplicitAsk) {
      console.info("[perspective-engine] Search returned 0 results, fail-open");
      return null; // fail-open（暗黙検索で結果ゼロは静かに落とす）
    }

    // 4. Epistemic Classification
    const classifyStart = Date.now();
    const classifiedFragments = searchResults.length > 0
      ? await classifySearchResults(
          searchResults,
          params.queryContext,
          params.message,
          params.userId,
          searchTask.type,
        )
      : [];
    const classificationMs = Date.now() - classifyStart;

    // 5. Quality Gate（CRAG 3段階 + Sufficient Context + Task Fitness）
    const qualityGateStart = Date.now();
    const qualityResult = retrievalQualityGate(
      classifiedFragments,
      params.message,
      searchTask,
    );
    const qualityGateMs = Date.now() - qualityGateStart;

    console.info(
      `[perspective-engine] 🔍 Quality gate: action=${qualityResult.action}, reason=${qualityResult.reason}, ` +
      `task=${searchTask.type}(fitness=${searchTask.searchFitness}), ` +
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
        searchTask,
      };
    }

    // ─── 5.5. Chained Exploration: L1 Deep Dive ──────────────────────────
    // supplement 時に情報ギャップを分析し、不足があれば追加検索を実行。
    // L0 fragment に sourceLayer タグを付与し、L1 fragment とマージする。
    // kill switch: PE_L1_ENABLED=true で有効化（デフォルト false）

    let finalQualityResult = qualityResult;
    let l0Fragments: (PerspectiveFragment & { sourceLayer: "L0" | "L1" | "L2" })[] =
      qualityResult.filteredFragments.map(f => ({
        ...f,
        sourceLayer: "L0" as const,
      }));
    let allQueries = [...queries];
    let l1Breakdown: PerspectiveLatencyBreakdown["l1"] | undefined;

    if (
      STARGAZER_FLAGS.peL1Enabled &&
      qualityResult.action === "supplement" &&
      searchTask
    ) {
      const l1Start = Date.now();
      const elapsedSoFar = l1Start - startTime;

      // 情報ギャップ分析（ルールベース、0ms）
      const gap = analyzeInformationGap(l0Fragments, searchTask.type);
      const l1Decision = shouldProceedToL1(gap, qualityResult.action, elapsedSoFar);

      console.info(
        `[perspective-engine] 🔗 L1 decision: proceed=${l1Decision.proceed}, reason=${l1Decision.reason}, ` +
        `gaps=[${gap.gaps.join(",")}], elapsed=${elapsedSoFar}ms`
      );

      if (l1Decision.proceed) {
        try {
          // L1-1. 追加クエリ生成（LLM 1回）
          const l1QueryStart = Date.now();
          const l1QueryResult = await generateL1Queries(
            l0Fragments,
            gap,
            params.message,
            params.queryContext.domain,
            params.userId,
          );
          const l1QueryGenMs = Date.now() - l1QueryStart;

          if (l1QueryResult.queries.length > 0) {
            // L1-2. 追加検索（L0 と同じ executeSearch）
            const l1SearchStart = Date.now();
            const l1SearchResults = await executeSearch(l1QueryResult.queries);
            const l1SearchMs = Date.now() - l1SearchStart;

            // URL 重複除去: L0 で既出の URL を除外
            const l0Urls = new Set(l0Fragments.map(f => f.sourceUrl));
            const uniqueL1Results = l1SearchResults.filter(r => !l0Urls.has(r.url));

            if (uniqueL1Results.length > 0) {
              // L1-3. 追加分類（classify）
              const l1ClassifyStart = Date.now();
              const l1ClassifiedFragments = await classifySearchResults(
                uniqueL1Results,
                params.queryContext,
                params.message,
                params.userId,
                searchTask.type,
              );
              const l1ClassifyMs = Date.now() - l1ClassifyStart;

              // L1 fragment にレイヤータグ付与
              const l1Tagged = l1ClassifiedFragments.map(f => ({
                ...f,
                sourceLayer: "L1" as const,
              }));

              // マージ: L0 + L1
              const mergedFragments = [...l0Fragments, ...l1Tagged];
              allQueries = [...queries, ...l1QueryResult.queries];

              // マージ後の Quality Gate 再評価
              const mergedQuality = retrievalQualityGate(
                mergedFragments,
                params.message,
                searchTask,
              );

              console.info(
                `[perspective-engine] 🔗 L1 merged: L0=${l0Fragments.length} + L1=${l1Tagged.length} → ` +
                `filtered=${mergedQuality.filteredFragments.length}, action=${mergedQuality.action}, ` +
                `queries=${l1QueryResult.queries.join(" | ")}`
              );

              // マージ後が discard/abstain でなければ結果を更新
              if (mergedQuality.action !== "discard" && mergedQuality.action !== "abstain") {
                finalQualityResult = mergedQuality;
                // sourceLayer を保持したまま filteredFragments を更新
                l0Fragments = mergedQuality.filteredFragments.map(f => ({
                  ...f,
                  sourceLayer: f.sourceLayer ?? "L0",
                }));
              }

              l1Breakdown = {
                fired: true,
                reason: l1Decision.reason,
                queryGenMs: l1QueryGenMs,
                searchMs: l1SearchMs,
                classifyMs: l1ClassifyMs,
                totalMs: Date.now() - l1Start,
                queriesSent: l1QueryResult.queries,
                fragmentsBefore: qualityResult.filteredFragments.length,
                fragmentsAfter: l0Fragments.length,
              };
            } else {
              // L1 検索で新規結果なし（全て重複）
              l1Breakdown = {
                fired: true,
                reason: "l1_all_duplicates",
                queryGenMs: l1QueryGenMs,
                searchMs: l1SearchMs,
                classifyMs: 0,
                totalMs: Date.now() - l1Start,
                queriesSent: l1QueryResult.queries,
                fragmentsBefore: qualityResult.filteredFragments.length,
                fragmentsAfter: l0Fragments.length,
              };
              console.info("[perspective-engine] 🔗 L1 search returned only duplicate URLs, skipping");
            }
          } else {
            // L1 クエリ生成失敗
            l1Breakdown = {
              fired: true,
              reason: "l1_query_gen_empty",
              queryGenMs: l1QueryGenMs,
              searchMs: 0,
              classifyMs: 0,
              totalMs: Date.now() - l1Start,
              queriesSent: [],
              fragmentsBefore: qualityResult.filteredFragments.length,
              fragmentsAfter: l0Fragments.length,
            };
            console.info("[perspective-engine] 🔗 L1 query generation returned empty, skipping");
          }
        } catch (l1Error) {
          // L1 fail-open: L1 失敗は L0 結果をそのまま使う
          console.warn("[perspective-engine] 🔗 L1 failed, falling back to L0:", l1Error);
          l1Breakdown = {
            fired: true,
            reason: "l1_error_fallback",
            queryGenMs: 0,
            searchMs: 0,
            classifyMs: 0,
            totalMs: Date.now() - l1Start,
            queriesSent: [],
            fragmentsBefore: qualityResult.filteredFragments.length,
            fragmentsAfter: l0Fragments.length,
          };
        }
      } else {
        // L1 発火条件を満たさず
        l1Breakdown = {
          fired: false,
          reason: l1Decision.reason,
          queryGenMs: 0,
          searchMs: 0,
          classifyMs: 0,
          totalMs: 0,
          queriesSent: [],
          fragmentsBefore: qualityResult.filteredFragments.length,
          fragmentsAfter: qualityResult.filteredFragments.length,
        };
      }
    }

    // 6. ForceBalance Delta（L1 マージ後の fragment を使用）
    const promptBuildStart = Date.now();
    const fragments = l0Fragments;
    const forceBalanceDelta = calculateForceBalanceDelta(fragments);

    // 7. Prompt Block（hedge 対応 — L1 成功で use に昇格した場合は hedge 解除）
    const promptBlock = buildPerspectivePromptBlock(
      fragments,
      forceBalanceDelta,
      finalQualityResult.needsHedge,
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
      l1: l1Breakdown,
    };

    const l1LogStr = l1Breakdown?.fired
      ? `, L1: queryGen=${l1Breakdown.queryGenMs}ms search=${l1Breakdown.searchMs}ms classify=${l1Breakdown.classifyMs}ms total=${l1Breakdown.totalMs}ms`
      : l1Breakdown ? ", L1: not fired" : "";
    console.info(
      `[perspective-engine] ⏱️  Latency breakdown: ` +
      `queryGen=${queryGenerationMs}ms, search=${searchMs}ms, classify=${classificationMs}ms, ` +
      `qualityGate=${qualityGateMs}ms, promptBuild=${promptBuildMs}ms, total=${totalMs}ms${l1LogStr}`
    );

    const block: PerspectiveBlock = {
      fragments,
      promptBlock,
      forceBalanceDelta,
      searchQueriesSent: allQueries,
      searchLatencyMs: totalMs,
    };

    const audit: PerspectiveAudit = {
      sourceType: fragments.length > 0 ? "external_augmented" : "internal",
      fragmentsUsed: fragments,
      forceBalanceDelta,
      searchQueriesSent: allQueries,
      searchLatencyMs: totalMs,
      gateDecision: "fired",
      gateReason: gate.reason,
      isExplicitAsk: gate.isExplicitAsk,
      explicitAskBlocked: false,
    };

    // v5: iterative タスクの場合、ExplorationState を生成/更新
    let explorationState: ExplorationState | null = null;
    let explorationTemplate: ExplorationOutputTemplate | null = null;

    if (searchTask && searchTask.explorationDepth === "iterative") {
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
          `[perspective-engine] 🔄 Exploration continued: phase=${explorationState.currentPhase}, turn=${explorationState.turnCount}`
        );
      } else {
        // 新規探索を開始（Turn 1: hypothesis フェーズ）
        explorationState = createExplorationState(
          searchTask.type,
          params.queryContext.domain,
          searchTask.description,
          [], // fitHypotheses は route.ts でパーソナルモデルから生成
        );
        explorationState.totalSearchQueries = [...queries];
        explorationState.currentPhase = "user_selection"; // Turn 1 完了後は候補選択待ち

        // タスクタイプ別出力テンプレートを取得
        explorationTemplate = EXPLORATION_OUTPUT_TEMPLATES[searchTask.type] ?? null;

        console.info(
          `[perspective-engine] 🆕 Exploration started: type=${searchTask.type}, ` +
          `template=${explorationTemplate ? "found" : "default"}, id=${explorationState.explorationId}`
        );
      }
    }

    return {
      block, audit, qualityGate: qualityResult, searchTask,
      explorationState, explorationTemplate, latencyBreakdown,
    };
  } catch (error) {
    console.warn("[PerspectiveEngine] Error in pipeline, falling back:", error);
    return null; // fail-open: 全てのエラーでフォールバック
  }
}
