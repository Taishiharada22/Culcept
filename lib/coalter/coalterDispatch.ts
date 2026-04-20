/**
 * CoAlter Phase 2 — Dispatch Layer (2026-04-19 v0.3, Phase 6.C)
 *
 * 位置づけ: Pre-router gate → Mode router → Post-router modifier → Executor の
 *           **オーケストレーション薄層**。純関数的 (副作用 = buildDecisionCard の
 *           callback 経由のみ)。
 *
 * 参照: docs/coalter-phase2-3mode-design.md §1 (Pre/Router/Post 3層), §2 責務境界,
 *       §4 出力契約, §6 着手順
 *
 * CEO 実装固定条件（フェーズ 6.C）:
 *  1. **decision 非破壊** — mode === "decision" の既存挙動は callback をそのまま呼ぶだけ。
 *     negotiate / clarify は「横に足す」形で入れる。
 *  2. **G6 厳守** — theme !== "movie" のとき executor は decision fallback。
 *     router / gate / modifier は theme 非依存で実行。
 *  3. **RouterTrace 永続化** — 結果に trace を含める。永続化は呼び出し側が行う。
 *  4. **card.mode discriminated union を崩さない** — 返り値は必ず CoAlterCard 形。
 *
 * 責務:
 *  - Gate 判定: consent_not_active / emotion_heat_high のとき decision fallback +
 *    theme gate もスキップ（gate が最初に止まる）。
 *  - Router 実行: runModeRouter で trace 生成。
 *  - Modifier 実行: deriveToneModifier で tone 生成。
 *  - Executor 分岐:
 *    - gate 不通過 → decision (callback)
 *    - theme !== "movie" → decision (callback)  ← G6 movie 先行
 *    - trace.selectedMode === "decision" → decision (callback)
 *    - trace.selectedMode === "negotiate" → buildNegotiateCard
 *    - trace.selectedMode === "clarify" → buildClarifyCard
 *
 * 依存禁止:
 *  - DB / LLM / UI / webConnector: 本ファイルから直接呼ばない（callback 経由のみ）
 *  - ranker: 直接 import 禁止（negotiate は rerankedProposals を受け取る、clarify は候補ゼロ）
 */

import type {
  ClarifyCard,
  ConversationTheme,
  CoAlterCard,
  DecisionCard,
  EmotionHeat,
  ModeRouterInput,
  NegotiateCard,
  PreRouterGateInput,
  PreRouterGateResult,
  ProposalCandidate,
  ProposalCard,
  RouterTrace,
  ToneModifier,
  ContradictionSignal,
  ConversationTurn,
  MisreadSignal,
} from "./types";
import { evaluatePreRouterGate } from "./preRouterGate";
import { runModeRouter } from "./modeRouter";
import { deriveToneModifier } from "./postRouterModifier";
import { buildNegotiateCard } from "./negotiateBuilder";
import { buildClarifyCard } from "./clarifyBuilder";

// ─────────────────────────────────────────────
// Input / Output
// ─────────────────────────────────────────────

/**
 * Dispatch で使う「executor が必要とする材料」。
 * negotiate / clarify が参照する情報だけをここに集める（theme=movie のときのみ使う）。
 */
export interface CoAlterDispatchMaterials {
  /** 会話テーマ（G6 で movie かどうか判定、card.theme 伝播にも使う） */
  theme: ConversationTheme;
  /** ペア ID */
  userAId: string;
  userBId: string;
  /** 直近のターン（clarify の paraphrase anchor / pointList 抽出に使う） */
  recentTurns: ConversationTurn[];
  /** negotiate のために呼び出し側が用意した再ランキング済み第三案（0-3 件） */
  rerankedProposals: ProposalCandidate[];
}

/** Dispatch 入力 */
export interface CoAlterDispatchInput {
  /** Gate 入力（consent + emotion_heat） */
  gate: PreRouterGateInput;
  /** Router 入力（misread / contradiction / stall / previousMode 等） */
  router: ModeRouterInput;
  /** Modifier 入力（Post-router で tone を決める） */
  emotionHeat: EmotionHeat;
  /** Executor 用材料（negotiate / clarify builder の input） */
  materials: CoAlterDispatchMaterials;
  /**
   * decision executor の callback。
   * 返り値は既存 ProposalCard。dispatch 側で mode: "decision" を付けて DecisionCard 化する。
   * CEO 条件 #1: この callback は**そのまま呼ぶだけ**。既存挙動を変えない。
   */
  buildDecisionCard: () => Promise<ProposalCard>;
  /** テスト用時刻注入 */
  now?: Date;
}

/** 何によって executor が fallback に落ちたか（観測用） */
export type ExecutorFallbackReason =
  | "gate_blocked"
  | "theme_not_movie_yet"
  | null;

/** Dispatch 結果 */
export interface CoAlterDispatchResult {
  /** 最終カード（discriminated union） */
  card: CoAlterCard;
  /** Gate 結果（fail/pass） */
  gate: PreRouterGateResult;
  /**
   * Router trace（gate 不通過時は null）。
   * CEO 条件 #3: 呼び出し側が metadata.routerTrace に永続化する。
   */
  trace: RouterTrace | null;
  /** Modifier 出力（gate 不通過時は null） */
  tone: ToneModifier | null;
  /**
   * executor が trace.selectedMode と違う decision を出した場合の理由。
   * - gate_blocked: gate で止まった → decision fallback
   * - theme_not_movie_yet: G6（movie 先行）で fallback
   * - null: trace.selectedMode と executor 出力が一致
   */
  executorFallbackReason: ExecutorFallbackReason;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** ProposalCard を DecisionCard 化 */
function toDecisionCard(card: ProposalCard): DecisionCard {
  return { ...card, mode: "decision" };
}

/**
 * G6: executor 本実装は movie 先行。
 * theme !== "movie" のときは negotiate / clarify を出さず decision fallback。
 */
function isExecutorThemeEnabled(theme: ConversationTheme): boolean {
  return theme === "movie";
}

// ─────────────────────────────────────────────
// Dispatch (main)
// ─────────────────────────────────────────────

/**
 * CoAlter Phase 2 dispatch: gate → router → modifier → executor 分岐。
 *
 * 戻り値:
 *  - gate 不通過: decision fallback (既存 buildDecisionCard)、trace=null
 *  - theme !== "movie": decision fallback、trace は記録する（router は走らせる）
 *  - decision: buildDecisionCard の結果をそのまま
 *  - negotiate: buildNegotiateCard（rerankedProposals=0 でも正常）
 *  - clarify: buildClarifyCard
 */
export async function dispatchCoAlter(
  input: CoAlterDispatchInput,
): Promise<CoAlterDispatchResult> {
  const { gate, router, emotionHeat, materials, buildDecisionCard, now } = input;

  // ── 1. Gate ──
  const gateResult = evaluatePreRouterGate(gate);
  if (!gateResult.pass) {
    // CEO 条件 #1: gate 不通過 → 既存 decision path をそのまま呼ぶ
    const proposal = await buildDecisionCard();
    return {
      card: toDecisionCard(proposal),
      gate: gateResult,
      trace: null,
      tone: null,
      executorFallbackReason: "gate_blocked",
    };
  }

  // ── 2. Router ──
  const trace = runModeRouter(router, emotionHeat, now);

  // ── 3. Modifier ──
  const tone = deriveToneModifier(emotionHeat);

  // ── 4. Theme gate (G6) ──
  const themeOk = isExecutorThemeEnabled(materials.theme);
  if (!themeOk) {
    // CEO 条件 #2: movie 以外は executor 本実装が無いので decision fallback
    // router/gate/modifier は走らせた（trace は記録する）
    const proposal = await buildDecisionCard();
    return {
      card: toDecisionCard(proposal),
      gate: gateResult,
      trace,
      tone,
      executorFallbackReason: "theme_not_movie_yet",
    };
  }

  // ── 5. Executor 分岐 ──
  switch (trace.selectedMode) {
    case "decision": {
      const proposal = await buildDecisionCard();
      return {
        card: toDecisionCard(proposal),
        gate: gateResult,
        trace,
        tone,
        executorFallbackReason: null,
      };
    }
    case "negotiate": {
      const negotiateCard: NegotiateCard = buildNegotiateCard({
        contradiction: router.contradiction,
        rerankedProposals: materials.rerankedProposals,
        tone,
      });
      return {
        card: negotiateCard,
        gate: gateResult,
        trace,
        tone,
        executorFallbackReason: null,
      };
    }
    case "clarify": {
      const clarifyCard: ClarifyCard = buildClarifyCard({
        misread: router.misread,
        recentTurns: materials.recentTurns,
        userAId: materials.userAId,
        userBId: materials.userBId,
        tone,
      });
      return {
        card: clarifyCard,
        gate: gateResult,
        trace,
        tone,
        executorFallbackReason: null,
      };
    }
    case "reflect": {
      // Phase 2 では reflect は使用しない (Phase 3 で扱う)。
      // router も reflect を返さない想定だが、型安全のため decision fallback。
      const proposal = await buildDecisionCard();
      return {
        card: toDecisionCard(proposal),
        gate: gateResult,
        trace,
        tone,
        executorFallbackReason: null,
      };
    }
  }
}

// ─────────────────────────────────────────────
// 簡易コンストラクタ（テスト / engine wiring 用）
// ─────────────────────────────────────────────

/**
 * low severity / no reason の EmotionHeat。
 * 検出器が未実装の箇所でも dispatch を回せるようにする default。
 */
export const EMOTION_HEAT_LOW: EmotionHeat = { severity: "low", reason: null };

/**
 * detected=false の ContradictionSignal。
 */
export const CONTRADICTION_EMPTY: ContradictionSignal = {
  detected: false,
  axes: [],
  stanceA: null,
  stanceB: null,
};

/**
 * confidence=0 / direction=null / anchor=null の MisreadSignal。
 * 検出器未実装の箇所で「誤読なし」扱いの default として使う。
 */
export const MISREAD_NONE: MisreadSignal = {
  confidence: 0,
  direction: null,
  anchorMessageId: null,
};
