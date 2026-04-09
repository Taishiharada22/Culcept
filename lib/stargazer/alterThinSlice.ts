/**
 * P1.5 Thin-Slice: Alter 知能の核心4機能
 *
 * v4.2 設計から「刺さる確率を変える」ための核だけを抜き出し、
 * 高価値ターン限定で既存パイプラインに差し込む。
 *
 * 4機能:
 *   1. High-Value Turn Detector — どのターンに追加知能を使うか
 *   2. Insight Generator — 「この人が言えていない核心」を1文生成
 *   3. Sharp Bet + Falsifier — 仮説を賭ける + 外れたら撤回
 *   4. Claim Strength Controller — assert / lean_in / probe / hold
 *
 * 設計原則:
 *   - 既存フローに一切の破壊的変更なし
 *   - Feature Flag で即時 ON/OFF
 *   - fail-open: 全ての失敗は既存フローへのフォールバック
 *   - standard ターン（70-80%）は影響ゼロ
 */

import { runAI } from "@/lib/ai";
import { makeStargazerRunMetadata } from "./studentTrack";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlterGrowthState } from "./alterGrowth";
import type { AlterLongTermMemory, RecurringTheme } from "./alterMemory";
import type { QuestionType, ResponseMode, Reaction, HypothesisFactEntry } from "./alterHomeAdapter";
import type { AlterPersonality } from "./alter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type TurnBudget = "standard" | "elevated" | "critical";

export interface TurnValueAssessment {
  budget: TurnBudget;
  reason: string;
  invoke_insight: boolean;
}

export type InsightType =
  | "unspoken_core"         // この人が言えていない核心
  | "hidden_connection"     // 本人が気づいていない繋がり
  | "reframe"               // 問題の枠組みの読み替え
  | "pattern_name";         // 反復パターンへの名前付け

export interface GeneratedInsight {
  insight: string;
  type: InsightType;
  confidence: number;
  grounding: string[];
  raw_output: string;
}

export type BetType =
  | "surface_to_depth"
  | "pattern_call"
  | "unspoken_need"
  | "reframe";

export interface SharpBet {
  bet: string;
  bet_type: BetType;
  confidence: number;
  falsification_criteria: string;
  retraction_phrase: string;
}

export type BetOutcome = "hit" | "miss" | "pending";

export type ClaimStrength = "assert" | "lean_in" | "probe" | "hold";

export interface ClaimDecision {
  strength: ClaimStrength;
  reason: string;
  phrase_guide: string;
}

/** セッション内 bet 履歴の最小エントリ */
interface BetHistoryEntry {
  bet: string;
  outcome: BetOutcome;
}

/** リクエスト間で再構成されるセッション状態 */
export interface ThinSliceSessionState {
  last_bet: Pick<SharpBet, "bet" | "bet_type" | "confidence"> | null;
  last_bet_outcome: BetOutcome | null;
  rejected_bets: string[];
  accepted_bets: string[];
  bet_history: BetHistoryEntry[];
  consecutive_misses: number;
  /** 同一テキストの bet が連続で注入された回数（反復防止用） */
  consecutive_same_bet_count: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature Flag
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * thin-slice を発火させるかどうかを判定。
 * userId ベースの deterministic hash で A/B 分割。
 */
export function isThinSliceEnabled(userId: string): boolean {
  const enabled = process.env.ALTER_THIN_SLICE_ENABLED !== "false";
  if (!enabled) return false;

  const rolloutPct = parseInt(process.env.ALTER_THIN_SLICE_ROLLOUT_PCT ?? "0", 10);
  if (rolloutPct >= 100) return true;
  if (rolloutPct <= 0) return false;

  const hash = simpleHash(userId) % 100;
  return hash < rolloutPct;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// State Reconstruction (fail-open)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EMPTY_STATE: ThinSliceSessionState = {
  last_bet: null,
  last_bet_outcome: null,
  rejected_bets: [],
  accepted_bets: [],
  bet_history: [],
  consecutive_misses: 0,
  consecutive_same_bet_count: 0,
};

/**
 * セッション内の thin-slice 状態を analytics から再構成。
 * **fail-open**: 失敗時は空の state を返し、既存フローへフォールバック。
 */
export async function reconstructThinSliceState(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<ThinSliceSessionState> {
  try {
    if (!sessionId) return { ...EMPTY_STATE };

    const { data: recentEvents, error } = await supabase
      .from("stargazer_analytics")
      .select("metadata")
      .eq("user_id", userId)
      .eq("event", "home_alter_judgment")
      .filter("metadata->>session_id", "eq", sessionId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error || !recentEvents || recentEvents.length === 0) {
      return { ...EMPTY_STATE };
    }

    const state: ThinSliceSessionState = { ...EMPTY_STATE, rejected_bets: [], accepted_bets: [], bet_history: [] };

    for (const event of recentEvents) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ts = (event.metadata as any)?.thin_slice;
      if (!ts) continue;

      // 直近の bet を取得（最新のイベントから最初に見つかったもの）
      if (!state.last_bet && ts.bet) {
        state.last_bet = {
          bet: ts.bet,
          bet_type: ts.bet_type ?? "unspoken_need",
          confidence: ts.bet_confidence ?? 0.5,
        };
      }

      // bet outcome 履歴を蓄積
      if (ts.bet && ts.previous_bet_outcome) {
        state.bet_history.push({ bet: ts.bet, outcome: ts.previous_bet_outcome });
        if (ts.previous_bet_outcome === "miss") {
          state.rejected_bets.push(ts.bet);
        } else if (ts.previous_bet_outcome === "hit") {
          state.accepted_bets.push(ts.bet);
        }
      }
    }

    // 連続 miss 数
    for (const h of state.bet_history) {
      if (h.outcome === "miss") state.consecutive_misses++;
      else break;
    }

    // 同一 bet 連続注入回数の再構成
    // recentEvents は新しい順に並んでいるので、先頭から同じ bet テキストが続く回数を数える
    let sameBetCount = 0;
    let firstBetText: string | null = null;
    for (const event of recentEvents) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ts = (event.metadata as any)?.thin_slice;
      if (!ts?.bet) continue;
      if (firstBetText === null) {
        firstBetText = ts.bet;
        sameBetCount = 1;
      } else if (ts.bet.slice(0, 30) === firstBetText.slice(0, 30)) {
        sameBetCount++;
      } else {
        break;
      }
    }
    state.consecutive_same_bet_count = sameBetCount;

    return state;
  } catch (e) {
    // fail-open: 再構成失敗は空 state で通常フロー続行
    console.warn("[thin-slice] State reconstruction failed (fail-open):", e);
    return { ...EMPTY_STATE };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. High-Value Turn Detector
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── requestIntent / protest / direct-demand パターン ──
// 実ラリーの痛点を直接拾う。questionType だけでは検出できないもの。

/** co-think insistence: 「一緒に考えてほしい」系 → elevated */
const CO_THINK_INSISTENCE = /一緒に考え|一緒に悩|一緒に探[しす]|二人で|僕[はも].*わから|俺[はも].*わから|わからないから聞[いき]て/;

/** protest: 「押し付けるな」系 → critical（repair でなくても抗議） */
const PROTEST_PATTERNS = /押し付け|決めつけ|上から|偉そう|わかったふう|わかった風|知ったかぶり|勝手に決め|的外れ|ずれてる|ズレてる|見当違い|論点.*ずれ|聞いてない/;

/** direct-answer demand: 「具体的に聞いてる」系 → elevated */
const DIRECT_DEMAND_PATTERNS = /具体的に聞いて|抽象的すぎ|ふわっと|曖昧すぎ|はっきり[言い]って|結局どう|で、どうすれば|答えて[。！!？?]|答えになってない|答えが.*ない|回答になってない/;

/** delegation rejection: 「君がやって」系 → critical */
const DELEGATION_REJECTION = /[君あなたお前]が[やしせ考]|[君あなたお前]の意見|調べるんじゃなく|考えるんじゃなく|[君あなた]に聞[いき]て|投げ返[さす]ないで|丸投げ/;

/** 存在的問い → critical */
const EXISTENTIAL_PATTERNS = /本質|根本|結局|本当[のにはが].*(?:したい|欲しい|大事|大切|求め)|人生|生き方|自分.*(?:何者|意味)/;

/** core-drive 系 → elevated */
const CORE_DRIVE_PATTERNS = /大事[なに]|価値観|譲れない|こだわり|原点|根っこ|核|本当[のにはが]自分/;

/**
 * High-Value Turn Detector: このターンに追加知能を使うか判定。
 * ルールベース。LLM 呼び出しなし。O(1)。
 */
export function assessTurnValue(
  responseMode: ResponseMode,
  questionType: QuestionType,
  detectedReaction: Reaction | null,
  message: string,
  conversationLength: number,
  _lastAlterContent: string | null,
): TurnValueAssessment {
  const trimmed = message.trim();

  // ── critical: 最高知能予算 ──

  // repair mode（信頼回復の一打が最重要）
  if (responseMode === "repair") {
    return { budget: "critical", reason: "repair_mode", invoke_insight: true };
  }
  // protest（repair mode でなくても明確な抗議は critical）
  if (PROTEST_PATTERNS.test(trimmed)) {
    return { budget: "critical", reason: "protest_detected", invoke_insight: true };
  }
  // delegation rejection（Alter への直接的な行動要求 = 最優先対応）
  if (DELEGATION_REJECTION.test(trimmed)) {
    return { budget: "critical", reason: "delegation_rejection", invoke_insight: true };
  }
  // 深い co-think（4ターン以上 + self_understanding）
  if (questionType === "self_understanding" && conversationLength >= 4) {
    return { budget: "critical", reason: "deep_co_think", invoke_insight: true };
  }
  // 存在的問い
  if (EXISTENTIAL_PATTERNS.test(trimmed)) {
    return { budget: "critical", reason: "existential_question", invoke_insight: true };
  }

  // ── elevated: 追加知能あり ──

  // co-think insistence
  if (CO_THINK_INSISTENCE.test(trimmed)) {
    return { budget: "elevated", reason: "co_think_insistence", invoke_insight: true };
  }
  // direct-answer demand
  if (DIRECT_DEMAND_PATTERNS.test(trimmed)) {
    return { budget: "elevated", reason: "direct_demand", invoke_insight: true };
  }
  // self_understanding（初回〜浅いターン）
  if (questionType === "self_understanding") {
    return { budget: "elevated", reason: "self_understanding", invoke_insight: true };
  }
  // disagree からの回復チャンス
  if (detectedReaction?.type === "disagree") {
    return { budget: "elevated", reason: "disagree_recovery", invoke_insight: true };
  }
  // deep judgment consultation（3ターン以上の判断相談）
  if (questionType === "judgment" && conversationLength >= 3) {
    return { budget: "elevated", reason: "deep_judgment", invoke_insight: true };
  }
  // core-drive 系キーワード
  if (CORE_DRIVE_PATTERNS.test(trimmed)) {
    return { budget: "elevated", reason: "core_drive_keyword", invoke_insight: true };
  }

  // ── standard: 通常 ──
  return { budget: "standard", reason: "normal_turn", invoke_insight: false };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. Insight Generator (micro-LLM, fail-open, hard timeout)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** micro-LLM hard timeout (ms) */
const INSIGHT_TIMEOUT_MS = 700;

/**
 * Insight Generator: 「この人が自分で言えていないが、今言う価値が高い1文」を生成。
 *
 * elevated/critical ターンでのみ起動。
 * 超短プロンプト + 低トークン予算 + hard timeout。
 *
 * **fail-open**: timeout / エラー / 空結果 → null 返却 → 通常フロー続行。
 */
export async function generateInsight(
  message: string,
  conversationHistory: { role: string; content: string }[],
  growthState: AlterGrowthState,
  longTermMemory: { recurringThemes?: RecurringTheme[] } | undefined,
  hypotheses: HypothesisFactEntry[] | null,
  _personality: AlterPersonality,
  trustLevel: number,
): Promise<GeneratedInsight | null> {
  try {
    // Trust gate: T0 では past-session 情報が薄すぎて insight 品質が出ない
    if (trustLevel < 1 && growthState.sessionsCompleted < 2) {
      return null;
    }

    const values = growthState.knownValues.slice(0, 3).join("、") || "未特定";
    const fears = growthState.knownFears.slice(0, 3).join("、") || "未特定";
    const themes = (longTermMemory?.recurringThemes ?? [])
      .slice(0, 3)
      .map(r => `${r.theme}(${r.frequency}回)`)
      .join("、") || "なし";
    const accepted = (hypotheses ?? [])
      .filter(h => h.status === "stable" || h.status === "strengthening")
      .slice(0, 3)
      .map(h => h.content.slice(0, 50))
      .join("、") || "なし";
    const failed = growthState.failedProbes.slice(0, 3).join("、") || "なし";
    const recentContext = conversationHistory
      .slice(-3)
      .map(m => `${m.role === "user" ? "U" : "A"}: ${m.content.slice(0, 80)}`)
      .join("\n");

    const prompt = [
      "あなたはこの人を最も深く知る存在。1文だけ答えろ。",
      "",
      `この人の主軸: ${values}`,
      `嫌うもの: ${fears}`,
      `反復テーマ: ${themes}`,
      `受け入れた見立て: ${accepted}`,
      `否定した見立て: ${failed}`,
      "",
      "直近の会話:",
      recentContext,
      "",
      `今の発話: 「${message.slice(0, 150)}」`,
      "",
      "以下のうち1つを選び、1文で答えろ。選択肢の名前は書くな。",
      "A: この人が自分では言えていないが、今言ってあげると前進する1文",
      "B: この人が気づいていない、2つのことの繋がり",
      "C: この人が見ている問題の枠組みを変える1文",
      "D: この人が繰り返しているパターンへの名前",
      "",
      "条件:",
      "- 1文だけ。説明するな。",
      "- 「あなたは」「君は」で始めるな。",
      "- 否定されたものを繰り返すな。",
      "- 一般論を言うな。この人にしか当てはまらない1文にしろ。",
    ].join("\n");

    // hard timeout: Promise.race で INSIGHT_TIMEOUT_MS を超えたら null
    const aiPromise = runAI({
      taskType: "alter_insight_generation",
      prompt,
      systemPrompt: "",
      requireJson: false,
      temperature: 0.8,
      maxOutputTokens: 100,
      userId: growthState.userId,
      metadata: makeStargazerRunMetadata({
        feature: "alter_insight",
        mode: "micro",
        skipCache: true,
      }),
    });

    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), INSIGHT_TIMEOUT_MS);
    });

    const result = await Promise.race([aiPromise, timeoutPromise]);
    if (!result || typeof result === "object" && "success" in result && !result.success) return null;
    if (!result || !("text" in result) || !result.text?.trim()) return null;

    const raw = result.text.trim();
    // 1文だけ抽出（複数文返ってきた場合は最初の1文）
    const firstSentence = raw.split(/[。！？\n]/)[0]?.trim();
    if (!firstSentence || firstSentence.length < 5) return null;

    const insightText = firstSentence + (firstSentence.endsWith("。") ? "" : "。");
    const type = inferInsightType(insightText);
    const grounding = buildInsightGrounding(insightText, growthState, longTermMemory);
    const confidence = Math.min(0.3 + grounding.length * 0.1, 0.8);

    return {
      insight: insightText,
      type,
      confidence,
      grounding,
      raw_output: raw,
    };
  } catch (e) {
    // fail-open: 失敗時は null で通常フロー続行
    console.warn("[thin-slice] Insight generation failed (fail-open):", e);
    return null;
  }
}

function inferInsightType(insight: string): InsightType {
  if (/繋が|つなが|同じ|共通|どちらも/.test(insight)) return "hidden_connection";
  if (/ではなく|じゃなくて|問題は.*ではない|本題は/.test(insight)) return "reframe";
  if (/パターン|繰り返|毎回|いつも/.test(insight)) return "pattern_name";
  return "unspoken_core";
}

function buildInsightGrounding(
  insight: string,
  growthState: AlterGrowthState,
  longTermMemory: { recurringThemes?: RecurringTheme[] } | undefined,
): string[] {
  const grounding: string[] = [];
  for (const v of growthState.knownValues) {
    if (v.length >= 3 && insight.includes(v.slice(0, 5))) {
      grounding.push(`Core Value: ${v}`);
    }
  }
  for (const r of longTermMemory?.recurringThemes ?? []) {
    if (r.theme.length >= 3 && insight.includes(r.theme.slice(0, 5))) {
      grounding.push(`Recurring Theme: ${r.theme} (${r.frequency}回)`);
    }
  }
  for (const f of growthState.knownFears) {
    if (f.length >= 3 && insight.includes(f.slice(0, 5))) {
      grounding.push(`Known Fear: ${f}`);
    }
  }
  return grounding;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. Sharp Bet + Falsifier + Retraction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const RETRACTION_PHRASES = [
  "ごめん、そこは読み違えた。",
  "ちょっとズレてたかもしれない。",
  "そこは僕の見立て違いだった。",
];

/**
 * Sharp Bet 選定: 最も「刺さる」可能性が高い1つの仮説を選ぶ。
 * ルールベース。LLM呼び出しなし。
 *
 * 候補の優先順:
 * 1. Insight Generator の出力（あれば最高優先）
 * 2. stable/strengthening 仮説
 * 3. unfinishedThreads
 * 4. recurringThemes
 */
export function selectSharpBet(
  insight: GeneratedInsight | null,
  hypotheses: HypothesisFactEntry[] | null,
  growthState: AlterGrowthState | undefined,
  longTermMemory: { recurringThemes?: RecurringTheme[] } | undefined,
  sessionState: ThinSliceSessionState,
): SharpBet | null {
  // rejected_bets にある仮説は再利用しない
  const isRejected = (text: string): boolean =>
    sessionState.rejected_bets.some(r =>
      r.length >= 5 && text.includes(r.slice(0, Math.min(r.length, 20)))
    );

  // 候補リスト
  interface BetCandidate {
    bet: string;
    bet_type: BetType;
    confidence: number;
    source: string;
  }
  const candidates: BetCandidate[] = [];

  // 1. Insight Generator の出力
  if (insight && insight.confidence >= 0.3 && !isRejected(insight.insight)) {
    candidates.push({
      bet: insight.insight,
      bet_type: insight.type === "reframe" ? "reframe"
        : insight.type === "pattern_name" ? "pattern_call"
        : insight.type === "hidden_connection" ? "surface_to_depth"
        : "unspoken_need",
      confidence: insight.confidence,
      source: "insight_generator",
    });
  }

  // 2. stable/strengthening 仮説
  if (hypotheses) {
    for (const h of hypotheses.slice(0, 3)) {
      if (!isRejected(h.content)) {
        candidates.push({
          bet: h.content,
          bet_type: h.hypothesis_type === "recurring_pattern" ? "pattern_call"
            : h.hypothesis_type === "contradiction_pattern" ? "reframe"
            : "surface_to_depth",
          confidence: h.confidence,
          source: "hypothesis",
        });
      }
    }
  }

  // 3. unfinishedThreads
  if (growthState?.unfinishedThreads) {
    for (const t of growthState.unfinishedThreads.slice(0, 2)) {
      if (!isRejected(t.topic)) {
        candidates.push({
          bet: t.topic,
          bet_type: "unspoken_need",
          confidence: 0.4,
          source: "unfinished_thread",
        });
      }
    }
  }

  // 4. recurringThemes
  if (longTermMemory?.recurringThemes) {
    for (const r of longTermMemory.recurringThemes.slice(0, 2)) {
      if (r.frequency >= 2 && !isRejected(r.theme)) {
        candidates.push({
          bet: r.theme,
          bet_type: "pattern_call",
          confidence: Math.min(0.3 + r.frequency * 0.1, 0.7),
          source: "recurring_theme",
        });
      }
    }
  }

  if (candidates.length === 0) return null;

  // ── 同一 bet 連続注入ガード ──
  // 同じ bet テキストが MAX_CONSECUTIVE_SAME_BET ターン連続で注入された場合、
  // その bet を候補から除外する。「慎重傾向が強い」が毎ターン出るのを防ぐ。
  const MAX_CONSECUTIVE_SAME_BET = 2; // 2回目まで許容、3回目以降は別 bet に切り替え
  if (sessionState.last_bet && sessionState.consecutive_same_bet_count >= MAX_CONSECUTIVE_SAME_BET) {
    const lastBetPrefix = sessionState.last_bet.bet.slice(0, 30);
    const filteredCandidates = candidates.filter(c => !c.bet.startsWith(lastBetPrefix));
    if (filteredCandidates.length > 0) {
      // 別の bet があるならそちらを使う
      candidates.length = 0;
      candidates.push(...filteredCandidates);
    }
    // 別の bet がない場合は hold（null を返す）
    else {
      return null;
    }
  }

  // Insight Generator の出力がある場合は最優先（value_if_right = transformative）
  // それ以外は confidence × source_weight でスコアリング
  const sourceWeight: Record<string, number> = {
    insight_generator: 1.5, // LLM生成 insight は当たれば最高価値
    hypothesis: 1.0,
    unfinished_thread: 0.8,
    recurring_theme: 0.7,
  };

  candidates.sort((a, b) => {
    const scoreA = a.confidence * (sourceWeight[a.source] ?? 1.0);
    const scoreB = b.confidence * (sourceWeight[b.source] ?? 1.0);
    return scoreB - scoreA;
  });

  const winner = candidates[0]!;

  // Falsifier: 外れ判定条件 + 撤回フレーズ
  const retraction = RETRACTION_PHRASES[Math.floor(Math.random() * RETRACTION_PHRASES.length)]!;

  return {
    bet: winner.bet,
    bet_type: winner.bet_type,
    confidence: winner.confidence,
    falsification_criteria: "ユーザーが否定・違和感・方向修正を示した場合",
    retraction_phrase: retraction,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. Claim Strength Controller
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PHRASE_GUIDES: Record<ClaimStrength, string> = {
  assert: "「これは〜だと思う」「はっきり言うと」— 確信を持って言い切る",
  lean_in: "「僕の読みだと〜」「たぶん〜」— 少し踏み込むが断定はしない",
  probe: "「もしかして〜？」「〜じゃない？」— 問いかけとして出す",
  hold: "この仮説は今は出さない",
};

/**
 * Claim Strength Controller: 仮説をどれだけ強く出すかを制御。
 */
export function determineClaimStrength(
  bet: SharpBet | null,
  trustLevel: number,
  detectedReaction: Reaction | null,
  sessionState: ThinSliceSessionState,
): ClaimDecision {
  if (!bet) {
    return { strength: "hold", reason: "no_bet", phrase_guide: PHRASE_GUIDES.hold };
  }

  let strength: ClaimStrength = "probe"; // デフォルトは問いかけ

  // ── assert に昇格する条件 ──

  // 条件1: confidence > 0.6 + trust >= 2
  if (bet.confidence > 0.6 && trustLevel >= 2) {
    strength = "assert";
  }

  // 条件2: 前ターンが agree（ユーザーが乗ってきている）
  if (detectedReaction?.type === "agree") {
    if (strength === "probe") strength = "lean_in";
    if (strength === "lean_in") strength = "assert";
  }

  // 条件3: 前ターンが deepen（もっと聞きたい）
  if (detectedReaction?.type === "deepen") {
    if (strength === "probe") strength = "lean_in";
  }

  // 条件4: confidence > 0.4 + trust >= 1 → lean_in
  if (bet.confidence > 0.4 && trustLevel >= 1 && strength === "probe") {
    strength = "lean_in";
  }

  // ── probe に降格する条件 ──

  // 条件A: trust < 2 で assert から降格
  if (trustLevel < 2 && strength === "assert") {
    strength = "lean_in";
  }
  if (trustLevel < 1 && strength === "lean_in") {
    strength = "probe";
  }

  // 条件B: 前ターンが miss（外した直後は弱める）
  if (sessionState.last_bet_outcome === "miss") {
    if (strength === "assert") strength = "lean_in";
    if (strength === "lean_in") strength = "probe";
  }

  // 条件C: 前ターンが disagree（否定された = 慎重に）
  if (detectedReaction?.type === "disagree") {
    if (strength === "assert") strength = "lean_in";
    if (detectedReaction.disagree_strength === "strong") {
      strength = "probe";
    }
  }

  // ── hold: 今は言わない ──

  // 連続 miss が 2回以上（賭け続けても外れる）
  if (sessionState.consecutive_misses >= 2) {
    strength = "hold";
  }
  // confidence が低すぎ + trust が低い
  if (bet.confidence < 0.3 && trustLevel < 1) {
    strength = "hold";
  }

  const reason = buildClaimReason(strength, bet, trustLevel, sessionState);
  return { strength, reason, phrase_guide: PHRASE_GUIDES[strength] };
}

function buildClaimReason(
  strength: ClaimStrength,
  bet: SharpBet,
  trustLevel: number,
  sessionState: ThinSliceSessionState,
): string {
  switch (strength) {
    case "assert":
      return `conf=${bet.confidence.toFixed(2)}, trust=${trustLevel}, user_positive`;
    case "lean_in":
      return `conf=${bet.confidence.toFixed(2)}, trust=${trustLevel}, moderate_confidence`;
    case "probe":
      return `conf=${bet.confidence.toFixed(2)}, trust=${trustLevel}, cautious`;
    case "hold":
      return `consecutive_misses=${sessionState.consecutive_misses}, conf=${bet.confidence.toFixed(2)}, trust=${trustLevel}`;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Bet Outcome Evaluation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 前ターンの bet の outcome を、今ターンの reaction から判定。
 */
export function evaluateBetOutcome(reaction: Reaction | null): BetOutcome {
  if (!reaction) return "pending";
  if (reaction.type === "agree") return "hit";
  if (reaction.type === "deepen") return "hit"; // もっと聞きたい = 刺さった
  if (reaction.type === "disagree") return "miss";
  if (reaction.type === "redirect" && reaction.redirect_subtype === "correction") return "miss";
  return "pending";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prompt Block Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * bet + claim をプロンプトに注入するブロックを生成。
 * homeSystemPrompt += buildBetPromptBlock(bet, claim) で使う。
 */
export function buildBetPromptBlock(bet: SharpBet, claim: ClaimDecision): string {
  if (claim.strength === "hold") return "";

  const retractionLine = `外れた場合: ${bet.retraction_phrase}`;

  const strengthInstruction =
    claim.strength === "assert"
      ? "この仮説を核に据え、確信を持って言い切れ。「はっきり言うと」「これは間違いなく」で始めてよい。バランスを取るな。"
      : claim.strength === "lean_in"
        ? "この仮説を核に据え、少し踏み込め。「僕の読みだと」「たぶん」で始めてよい。"
        : "この仮説を問いかけとして出せ。「もしかして〜？」「〜じゃない？」の形で。押し付けない。";

  return [
    "",
    "# 今ターンの一点突破（P1.5 Thin-Slice）",
    `**仮説**: ${bet.bet}`,
    `**出し方**: ${claim.strength.toUpperCase()} — ${claim.phrase_guide}`,
    "",
    strengthInstruction,
    "",
    retractionLine,
    "ユーザーが否定したら、この仮説に固執せず即座に手放すこと。",
    "「ごめん、そこは違ったかも」から別角度に入り直す。",
    "",
    "# 禁止（一点突破ルール）",
    "- 仮説を「書き出して」「整理して」「考えてみて」に変換するな。Alterが言い切れ。",
    "- 仮説を出さずに安全な要約だけで返すな。",
    "- 一般論にすり替えるな。この人にしか当てはまらない1文にしろ。",
  ].join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Bet Retraction Prompt (miss 後の次ターン用)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 前 bet が miss だった場合に、次ターンのプロンプトに撤回指示を注入する。
 */
export function buildRetractionPromptBlock(
  missedBet: string,
  retractionPhrase: string,
): string {
  return [
    "",
    "# 前回の仮説撤回（P1.5）",
    `前回出した仮説「${missedBet.slice(0, 80)}」はユーザーに否定された。`,
    `まず「${retractionPhrase}」のトーンでズレを認め、別の角度から入り直すこと。`,
    "同じ仮説を繰り返すな。",
  ].join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Analytics Metadata Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * analytics metadata に追加する thin_slice フィールドを構築。
 */
export function buildThinSliceAnalytics(
  enabled: boolean,
  turnValue: TurnValueAssessment,
  insight: GeneratedInsight | null,
  bet: SharpBet | null,
  claim: ClaimDecision | null,
  previousBetOutcome: BetOutcome | null,
): Record<string, unknown> {
  return {
    enabled,
    turn_budget: turnValue.budget,
    turn_budget_reason: turnValue.reason,
    insight_generated: !!insight,
    insight_type: insight?.type ?? null,
    insight_confidence: insight?.confidence ?? null,
    bet: bet?.bet?.slice(0, 100) ?? null,
    bet_type: bet?.bet_type ?? null,
    bet_confidence: bet?.confidence ?? null,
    claim_strength: claim?.strength ?? null,
    claim_reason: claim?.reason ?? null,
    previous_bet_outcome: previousBetOutcome,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Exports for testing
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** @internal テスト用: パターン定数を export */
export const _testPatterns = {
  CO_THINK_INSISTENCE,
  PROTEST_PATTERNS,
  DIRECT_DEMAND_PATTERNS,
  DELEGATION_REJECTION,
  EXISTENTIAL_PATTERNS,
  CORE_DRIVE_PATTERNS,
};
