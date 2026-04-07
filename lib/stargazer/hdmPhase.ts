/**
 * HDM Phase Controller — Heart Dynamics Model v1 のフェーズ制御
 *
 * 6フェーズ (0-5) で Alter の関係深度を管理する。
 * - Phase 0-2: 自動遷移（floor + metric 条件）
 * - Phase 3-5: manual gate（shadow として型定義のみ、自動遷移なし）
 *
 * 既存の Phase (0-3) in proactiveUnderstanding.ts を置換する上位概念。
 * TrustLevel (0-4) は HDM Phase から派生する。
 *
 * 設計原則:
 * - 観測は全レンズ常時実行。Phase が制御するのは「応答深度」のみ
 * - Phase は DB に保存（manual gate + regression 追跡のため）
 * - 純関数＋fail-open パターン
 */

import type { TrustLevel } from "./alterUnderstanding";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 定義
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * HDM Phase (0-5)
 *
 * 0: 接触可能性 — 安全、拒絶のなさ、緊張の低さを作る
 * 1: 友達化 — 表層の防衛と安心条件を取得
 * 2: 心の復元 — 差分から中層・深層の仮説を立てる
 * 3: 本人化 — 予測的中率で心モデルを検証（manual gate）
 * 4: 多視点統合 — 反事実シミュレーション（manual gate）
 * 5: 現実返還 — 状態依存で現実の一手に落とす（manual gate）
 */
export type HdmPhase = 0 | 1 | 2 | 3 | 4 | 5;

/** Phase のラベル（内部用・ログ用） */
export const HDM_PHASE_LABELS: Record<HdmPhase, string> = {
  0: "contact",        // 接触可能性
  1: "befriend",       // 友達化
  2: "restoration",    // 心の復元
  3: "embodiment",     // 本人化
  4: "integration",    // 多視点統合
  5: "realization",    // 現実返還
};

/** Phase の日本語名（analytics / ログ用） */
export const HDM_PHASE_LABELS_JA: Record<HdmPhase, string> = {
  0: "接触可能性",
  1: "友達化",
  2: "心の復元",
  3: "本人化",
  4: "多視点統合",
  5: "現実返還",
};

/** Phase 3-5 は manual gate（自動遷移しない上限） */
export const AUTO_TRANSITION_CEILING: HdmPhase = 2;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 遷移条件の入力
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 遷移判定に使うメトリクス */
export interface HdmPhaseInputs {
  // ── floor 条件（最低ターン / セッション数） ──
  /** 完了セッション数 */
  sessionsCompleted: number;
  /** 現セッションのターン数 */
  currentSessionTurnCount: number;
  /** 累計ターン数（全セッション合算） */
  totalTurnCount: number;

  // ── metric 条件 ──
  /** 連続信頼値 (0-1) */
  continuousTrust: number;
  /** 累計獲得信頼ポイント */
  earnedTrustTotal: number;
  /** 自己開示深度 (0-1) */
  selfDisclosureDepth: number;
  /** 因果マップ信頼度 (0-1) */
  causalMapConfidence: number;
  /** 修復成功率 (0-1)。null = まだ rupture 発生なし */
  repairSuccessRate: number | null;
  /** 理解カバレッジ (0-1) */
  understandingCoverage: number;

  // ── P2 レンズメトリクス（Phase 2 遷移に利用） ──
  /** 防衛パターン予測の連続正解数 */
  defensePredictionStreak: number;
  /** ユーザーが自発的に話題を展開した回数 */
  voluntaryTopicExpansionCount: number;
}

/** DB から取得する現在のフェーズ状態 */
export interface HdmPhaseState {
  /** 現在の Phase */
  currentPhase: HdmPhase;
  /** Phase 遷移が発生した日時 */
  lastTransitionAt: string | null;
  /** manual gate で上書きされた Phase（null = 自動遷移に従う） */
  manualOverride: HdmPhase | null;
  /** hard regression で再昇格条件の再達成が必要か */
  hardRegressionActive: boolean;
  /** hard regression からの復帰に必要な Phase */
  hardRegressionFloor: HdmPhase | null;
  /** 前ターンの soft regression 原因（cooldown + recovery 用） */
  lastSoftRegressionCause: string | null;
  /** soft regression 発生前の Phase（recovery で戻る先） */
  softRegressionPreviousPhase: HdmPhase | null;
  /** 直近ターンの rupture フラグ履歴（cross-turn consecutiveRuptureCount 算出用、最大5件） */
  recentRuptureFlags: boolean[];
  /** 前ターン終了時の信頼レベル（trustDelta 算出用） */
  priorSessionTrust: number | null;
  /** P5-3: 前回の Reality Anchoring 記録（After-Action Loop 用） */
  pendingRealityAnchoring: {
    actionShape: string;
    anchoringSummary: string;
    suggestedAt: string;
    followUpAttempts: number;
  } | null;
}

/** デフォルトの初期状態 */
export const DEFAULT_HDM_PHASE_STATE: HdmPhaseState = {
  currentPhase: 0,
  lastTransitionAt: null,
  manualOverride: null,
  hardRegressionActive: false,
  hardRegressionFloor: null,
  lastSoftRegressionCause: null,
  softRegressionPreviousPhase: null,
  recentRuptureFlags: [],
  priorSessionTrust: null,
  pendingRealityAnchoring: null,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Floor 条件（最低限の量的要件）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Phase 遷移の floor 条件 */
interface FloorCondition {
  minSessions: number;
  minTotalTurns: number;
  /** 初回セッション内の早期遷移を許可するターン数（Phase 0→1 のみ） */
  inSessionFallback?: number;
}

/**
 * Floor 条件テーブル。
 * コールドスタート対策: メトリクスが溜まる前に遷移しないための最低量。
 * Phase 0→1, 1→2 は floor 強め。
 */
const FLOOR_CONDITIONS: Record<1 | 2, FloorCondition> = {
  // 0→1: 3セッション以上 OR 初回セッション6ターン以上
  1: { minSessions: 3, minTotalTurns: 8, inSessionFallback: 6 },
  // 1→2: 6セッション以上, 累計20ターン以上
  2: { minSessions: 6, minTotalTurns: 20 },
};

/** floor 条件を満たすか判定 */
function meetsFloor(targetPhase: 1 | 2, inputs: HdmPhaseInputs): boolean {
  const floor = FLOOR_CONDITIONS[targetPhase];

  // 通常の floor: セッション数 AND ターン数
  if (
    inputs.sessionsCompleted >= floor.minSessions &&
    inputs.totalTurnCount >= floor.minTotalTurns
  ) {
    return true;
  }

  // Phase 0→1 のみ: 初回セッション内 fallback
  if (targetPhase === 1 && floor.inSessionFallback) {
    if (inputs.currentSessionTurnCount >= floor.inSessionFallback) {
      return true;
    }
  }

  return false;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Metric 条件（質的要件）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Phase 0→1 の metric 条件:
 * 「ユーザーが2回以上自発的に話題を展開」（HDM 設計書 5.2）
 * + 信頼ベースの代替パス
 */
function meetsPhase1Metrics(inputs: HdmPhaseInputs): boolean {
  // 主条件: 自発的話題展開 2回以上
  if (inputs.voluntaryTopicExpansionCount >= 2) return true;

  // 代替パス: 信頼蓄積が十分（早期に深い開示をするユーザー向け）
  if (inputs.earnedTrustTotal >= 3.0) return true;
  if (inputs.selfDisclosureDepth >= 0.4) return true;
  if (inputs.continuousTrust >= 0.2 && inputs.sessionsCompleted >= 3) return true;

  return false;
}

/**
 * Phase 1→2 の metric 条件:
 * 「防衛パターンを3回連続で正確に予測」（HDM 設計書 5.2）
 * + 複合条件の代替パス
 */
function meetsPhase2Metrics(inputs: HdmPhaseInputs): boolean {
  // 主条件: 防衛パターン予測 3連続正解
  if (inputs.defensePredictionStreak >= 3) return true;

  // 代替パス: 複合メトリクス（2つ以上満たす）
  let altCount = 0;
  if (inputs.earnedTrustTotal >= 8.0) altCount++;
  if (inputs.selfDisclosureDepth >= 0.6) altCount++;
  if (inputs.causalMapConfidence >= 0.3) altCount++;
  if (inputs.repairSuccessRate !== null && inputs.repairSuccessRate >= 0.7) altCount++;
  if (inputs.continuousTrust >= 0.4) altCount++;
  if (altCount >= 2) return true;

  return false;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 自動遷移判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PhaseTransitionResult {
  /** 遷移後の Phase */
  phase: HdmPhase;
  /** 遷移が発生したか */
  transitioned: boolean;
  /** 遷移理由（null = 遷移なし） */
  transitionReason: string | null;
  /** 遷移がブロックされた理由（null = ブロックなし） */
  blockedReason: string | null;
  /** Phase 1 の metric 達成度 */
  phase1MetricsMet: boolean;
  /** Phase 1 の floor 達成度 */
  phase1FloorMet: boolean;
  /** Phase 2 の metric 達成度 */
  phase2MetricsMet: boolean;
  /** Phase 2 の floor 達成度 */
  phase2FloorMet: boolean;
}

/**
 * 自動遷移を計算する（Phase 0→1→2 のみ）。
 * Phase は単調増加（後退は別関数 `computeRegression` で処理）。
 * manual gate / hard regression がある場合はそちらが優先。
 */
export function computeAutoTransition(
  state: HdmPhaseState,
  inputs: HdmPhaseInputs,
): PhaseTransitionResult {
  const result: PhaseTransitionResult = {
    phase: state.currentPhase,
    transitioned: false,
    transitionReason: null,
    blockedReason: null,
    phase1MetricsMet: meetsPhase1Metrics(inputs),
    phase1FloorMet: state.currentPhase >= 1 || meetsFloor(1, inputs),
    phase2MetricsMet: meetsPhase2Metrics(inputs),
    phase2FloorMet: state.currentPhase >= 2 || meetsFloor(2, inputs),
  };

  // manual gate がある場合はそれを上限にする
  const ceiling = state.manualOverride !== null
    ? Math.min(state.manualOverride, AUTO_TRANSITION_CEILING)
    : AUTO_TRANSITION_CEILING;

  // hard regression 中は floor 以下に留まる
  if (state.hardRegressionActive && state.hardRegressionFloor !== null) {
    if (state.currentPhase <= state.hardRegressionFloor) {
      result.blockedReason = `hard_regression_active: floor=${state.hardRegressionFloor}`;
      return result;
    }
  }

  // 自動遷移の上限チェック
  if (state.currentPhase >= ceiling) {
    if (state.currentPhase >= AUTO_TRANSITION_CEILING) {
      result.blockedReason = "at_auto_ceiling";
    }
    return result;
  }

  // Phase 0 → 1 遷移判定
  if (state.currentPhase === 0) {
    if (result.phase1FloorMet && result.phase1MetricsMet) {
      result.phase = 1;
      result.transitioned = true;
      result.transitionReason = "floor_and_metrics_met_for_phase_1";
      return result;
    }
    // floor は満たしたが metric が足りない、またはその逆
    if (result.phase1FloorMet && !result.phase1MetricsMet) {
      result.blockedReason = "phase_1_metrics_not_met";
    } else if (!result.phase1FloorMet && result.phase1MetricsMet) {
      result.blockedReason = "phase_1_floor_not_met";
    }
    return result;
  }

  // Phase 1 → 2 遷移判定
  if (state.currentPhase === 1) {
    if (result.phase2FloorMet && result.phase2MetricsMet) {
      result.phase = 2;
      result.transitioned = true;
      result.transitionReason = "floor_and_metrics_met_for_phase_2";
      return result;
    }
    if (result.phase2FloorMet && !result.phase2MetricsMet) {
      result.blockedReason = "phase_2_metrics_not_met";
    } else if (!result.phase2FloorMet && result.phase2MetricsMet) {
      result.blockedReason = "phase_2_floor_not_met";
    }
    return result;
  }

  return result;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TrustLevel 派生（後方互換）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * HDM Phase → TrustLevel (0-4) の後方互換マッピング。
 *
 * 既存コードが discreteTrustLevel (0-4) を参照する箇所のために維持。
 * Phase 進行に応じて TrustLevel も上がるが、Phase と TrustLevel は
 * 1:1 対応ではない（Phase は関係深度、TrustLevel は開示スタイル）。
 */
export function hdmPhaseToTrustLevel(phase: HdmPhase): TrustLevel {
  switch (phase) {
    case 0: return 0;  // 反映のみ
    case 1: return 1;  // パターン提示
    case 2: return 2;  // 仮説提示
    case 3: return 3;  // 接続提示
    case 4: return 4;  // 直言
    case 5: return 4;  // 直言（Phase 5 でも TrustLevel は 4 が上限）
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 応答深度マトリクス（P3-3 で拡充予定）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 各 Phase で許可される応答深度 */
export interface PhaseResponseDepth {
  /** Phase 番号 */
  phase: HdmPhase;
  /** P2-1 Narrative Lens: prompt 注入可否 */
  narrativeLens: "off" | "surface" | "full";
  /** P2-2 Body Lens: prompt 注入可否 */
  bodyLens: "off" | "surface" | "full";
  /** P2-3 Parts Lens: prompt 注入可否 */
  partsLens: "off" | "surface" | "full";
  /** P2-4 Memory Policy: 使用モード */
  memoryPolicy: "exclude_all" | "hedged_only" | "full";
  /** 差分（聞いたこと vs 見えたこと の不一致）の利用 */
  differenceAccess: boolean;
  /** 反事実シミュレーションの利用 */
  counterfactualAccess: boolean;
  /** 最大開示レベルの説明（ログ用） */
  description: string;
}

/**
 * Phase → 応答深度マトリクス。
 * P3-3 で詳細化するが、型定義と基本マッピングは P3-1 で確定。
 *
 * 原則:
 * - 観測は常時全レンズ実行（ここでは制御しない）
 * - 制御するのは prompt 注入深度・Alter が言及できる範囲
 * - 本人化前に多視点は解禁しない
 */
export function getPhaseResponseDepth(phase: HdmPhase): PhaseResponseDepth {
  switch (phase) {
    case 0:
      return {
        phase: 0,
        narrativeLens: "off",
        bodyLens: "off",
        partsLens: "off",
        memoryPolicy: "exclude_all",
        differenceAccess: false,
        counterfactualAccess: false,
        description: "表層のみ: 聞く・見る",
      };
    case 1:
      return {
        phase: 1,
        narrativeLens: "surface",
        bodyLens: "off",
        partsLens: "off",
        memoryPolicy: "hedged_only",
        differenceAccess: false,
        counterfactualAccess: false,
        description: "友達化: 表層パターンまで",
      };
    case 2:
      return {
        phase: 2,
        narrativeLens: "full",
        bodyLens: "surface",
        partsLens: "surface",
        memoryPolicy: "full",
        differenceAccess: true,
        counterfactualAccess: false,
        description: "心の復元: 差分・中層まで",
      };
    case 3:
      return {
        phase: 3,
        narrativeLens: "full",
        bodyLens: "full",
        partsLens: "full",
        memoryPolicy: "full",
        differenceAccess: true,
        counterfactualAccess: false,
        description: "本人化: 全層（仮説として）",
      };
    case 4:
      return {
        phase: 4,
        narrativeLens: "full",
        bodyLens: "full",
        partsLens: "full",
        memoryPolicy: "full",
        differenceAccess: true,
        counterfactualAccess: true,
        description: "多視点統合: 全層＋反事実",
      };
    case 5:
      return {
        phase: 5,
        narrativeLens: "full",
        bodyLens: "full",
        partsLens: "full",
        memoryPolicy: "full",
        differenceAccess: true,
        counterfactualAccess: true,
        description: "現実返還: 全層＋反事実＋一手",
      };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P3-3: Lens Depth Gating — prompt 注入の深度制御
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 原則:
// - off = prompt に一切注入しない
// - surface = 一行ヒント（背景認識のみ、直接言及しない）
// - full = レンズの buildXxxPromptBlock() 出力をそのまま注入
//
// 観測は常時全レンズ実行。ここで制御するのは prompt 注入のみ。

export type LensDepth = "off" | "surface" | "full";

/**
 * レンズ出力を depth に応じて gate する。
 * - off → 空文字列（注入なし）
 * - surface → surfaceHint（一行の背景認識ヒント）
 * - full → 元の promptBlock をそのまま返す
 */
export function gateLensPrompt(
  depth: LensDepth,
  fullPromptBlock: string,
  surfaceHint: string,
): string {
  switch (depth) {
    case "off": return "";
    case "surface": return surfaceHint;
    case "full": return fullPromptBlock;
  }
}

/** 各レンズの surface ヒント（Phase が surface の時に注入する最小文脈） */
export const LENS_SURFACE_HINTS = {
  narrative: "\n[内部観測: ユーザーの語りに意味づけの変化の兆候がある。直接言及しない。背景認識として保持。]",
  body: "\n[内部観測: 身体的シグナルが検出された。まだ直接触れない。背景として認識。]",
  parts: "\n[内部観測: 内的な動き（防衛/脆弱/反応）の兆候がある。直接言及しない。応答トーンに反映するのみ。]",
} as const;

/**
 * Memory Policy の深度制御。
 * - exclude_all → 全仮説を除外
 * - hedged_only → tentative/weakening の仮説のみ hedged 言語で通す
 * - full → 全仮説を通常通り使用
 */
export type MemoryDepth = "exclude_all" | "hedged_only" | "full";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Trust × Phase 交差制御（P3-2: CEO条件2）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 原則:
//   Trust = 触れてよいか（AlterAccessGate で制御）
//   Phase = どこまで深く使うか（PhaseResponseDepth で制御）
//   Trust が禁止しているものを Phase が解禁してはいけない
//
// 最終的な応答深度 = min(trustAllowed, phaseAllowed)

/** Trust レベルが許可する応答深度の上限 */
function trustToMaxDepth(trustLevel: TrustLevel): PhaseResponseDepth {
  switch (trustLevel) {
    case 0:
      return {
        phase: 0,
        narrativeLens: "off",
        bodyLens: "off",
        partsLens: "off",
        memoryPolicy: "exclude_all",
        differenceAccess: false,
        counterfactualAccess: false,
        description: "T0: 反映のみ",
      };
    case 1:
      return {
        phase: 1,
        narrativeLens: "surface",
        bodyLens: "off",
        partsLens: "off",
        memoryPolicy: "hedged_only",
        differenceAccess: false,
        counterfactualAccess: false,
        description: "T1: パターン提示まで",
      };
    case 2:
      return {
        phase: 2,
        narrativeLens: "full",
        bodyLens: "surface",
        partsLens: "surface",
        memoryPolicy: "full",
        differenceAccess: true,
        counterfactualAccess: false,
        description: "T2: 仮説提示まで",
      };
    case 3:
      return {
        phase: 3,
        narrativeLens: "full",
        bodyLens: "full",
        partsLens: "full",
        memoryPolicy: "full",
        differenceAccess: true,
        counterfactualAccess: false,
        description: "T3: 接続提示まで",
      };
    case 4:
      return {
        phase: 5,
        narrativeLens: "full",
        bodyLens: "full",
        partsLens: "full",
        memoryPolicy: "full",
        differenceAccess: true,
        counterfactualAccess: true,
        description: "T4: 全解禁",
      };
  }
}

/** 3値の深度レベルの min を取る */
function minLensDepth(
  a: "off" | "surface" | "full",
  b: "off" | "surface" | "full",
): "off" | "surface" | "full" {
  const order = { off: 0, surface: 1, full: 2 };
  const min = Math.min(order[a], order[b]);
  return min === 0 ? "off" : min === 1 ? "surface" : "full";
}

/** 3値の memory policy の min を取る */
function minMemoryPolicy(
  a: "exclude_all" | "hedged_only" | "full",
  b: "exclude_all" | "hedged_only" | "full",
): "exclude_all" | "hedged_only" | "full" {
  const order = { exclude_all: 0, hedged_only: 1, full: 2 };
  const min = Math.min(order[a], order[b]);
  return min === 0 ? "exclude_all" : min === 1 ? "hedged_only" : "full";
}

/**
 * Trust × Phase の交差制御。
 * Phase が許可する深度と Trust が許可する深度の min を取る。
 * Trust が禁止しているものを Phase が解禁することは絶対にない。
 */
export function resolveEffectiveDepth(
  phase: HdmPhase,
  trustLevel: TrustLevel,
): PhaseResponseDepth {
  const phaseDepth = getPhaseResponseDepth(phase);
  const trustDepth = trustToMaxDepth(trustLevel);

  return {
    phase: phaseDepth.phase,
    narrativeLens: minLensDepth(phaseDepth.narrativeLens, trustDepth.narrativeLens),
    bodyLens: minLensDepth(phaseDepth.bodyLens, trustDepth.bodyLens),
    partsLens: minLensDepth(phaseDepth.partsLens, trustDepth.partsLens),
    memoryPolicy: minMemoryPolicy(phaseDepth.memoryPolicy, trustDepth.memoryPolicy),
    differenceAccess: phaseDepth.differenceAccess && trustDepth.differenceAccess,
    counterfactualAccess: phaseDepth.counterfactualAccess && trustDepth.counterfactualAccess,
    description: `${phaseDepth.description} ∩ ${trustDepth.description}`,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Proactive Engine メトリクス接続（P3-2）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** proactive engine の出力から HDM Phase 入力を構築する */
export interface ProactiveMetricsBridge {
  earnedTrustTotal: number;
  selfDisclosureDepth: number;
  repairSuccessRate: number | null;
  understandingCoverage: number;
  causalMapConfidence: number;
}

/**
 * proactive engine が既に計算したメトリクスを HDM Phase 入力に変換する。
 * これにより二重計算を避け、single source of truth を維持する。
 */
export function buildHdmInputsFromProactive(
  sessionsCompleted: number,
  currentSessionTurnCount: number,
  continuousTrust: number,
  proactiveMetrics: ProactiveMetricsBridge,
  defensePredictionStreak: number,
  voluntaryTopicExpansionCount: number,
): HdmPhaseInputs {
  return {
    sessionsCompleted,
    currentSessionTurnCount,
    totalTurnCount: sessionsCompleted * 8 + currentSessionTurnCount, // 概算
    continuousTrust,
    earnedTrustTotal: proactiveMetrics.earnedTrustTotal,
    selfDisclosureDepth: proactiveMetrics.selfDisclosureDepth,
    causalMapConfidence: proactiveMetrics.causalMapConfidence,
    repairSuccessRate: proactiveMetrics.repairSuccessRate,
    understandingCoverage: proactiveMetrics.understandingCoverage,
    defensePredictionStreak,
    voluntaryTopicExpansionCount,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Regression トリガー検出（P3-2）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** regression 検出に必要な P1/P2 シグナル */
export interface RegressionContext {
  // P1: Rupture Assessment
  ruptureDetected: boolean;
  ruptureType: "withdrawal" | "confrontation" | null;
  /** 直近3ターンで連続して rupture が検出されたか */
  consecutiveRuptureCount: number;

  // P1: Dignity Filter
  dignityViolationDetected: boolean;

  // P1: Abstention
  /** ユーザーが明示的に拒絶したか（「もうやめて」「聞きたくない」等） */
  explicitRejection: boolean;

  // P2-3: Parts Lens
  /** reactive パート活性度 (0-1) */
  reactiveActivation: number;
  /** protective パート活性度 (0-1) */
  protectiveActivation: number;

  // Trust
  /** 前ターンからの trust 変化量（負 = 低下） */
  trustDelta: number;
}

/** regression トリガーの閾値 */
const REGRESSION_THRESHOLDS = {
  /** reactive activation がこの値以上で soft regression */
  reactiveSpikeSoft: 0.7,
  /** protective activation がこの値以上で soft regression */
  protectiveSpikeSoft: 0.8,
  /** 連続 rupture 回数がこの値以上で hard regression */
  consecutiveRuptureHard: 3,
  /** trust 低下量がこの値以下で hard regression */
  trustCrashThreshold: -0.3,
};

/**
 * P1/P2 シグナルから regression シグナルを検出する。
 * null = regression なし。
 *
 * 優先順位: hard > soft（hard が検出されたら soft は無視）
 */
export function detectRegressionSignal(
  context: RegressionContext,
): RegressionSignal | null {
  // ── Hard regression（2段以上後退 + 再昇格条件要求） ──

  // 尊厳違反: 最も重い — 2段後退
  if (context.dignityViolationDetected) {
    return {
      type: "hard",
      cause: "dignity_violation",
      stepsBack: 2,
      requireRequalification: true,
    };
  }

  // 明示的拒絶: rupture も同時検出されている場合のみ hard regression
  // 拒絶的な言葉だけでは false positive リスクが高い（冗談・軽い否定・第三者言及）
  if (context.explicitRejection && context.ruptureDetected) {
    return {
      type: "hard",
      cause: "explicit_rejection",
      stepsBack: 2,
      requireRequalification: true,
    };
  }

  // 連続断裂: 3回連続 → 2段後退
  if (context.consecutiveRuptureCount >= REGRESSION_THRESHOLDS.consecutiveRuptureHard) {
    return {
      type: "hard",
      cause: "consecutive_rupture",
      stepsBack: 2,
      requireRequalification: true,
    };
  }

  // 信頼急落: trust が一気に 0.3 以上低下 → 2段後退
  if (context.trustDelta <= REGRESSION_THRESHOLDS.trustCrashThreshold) {
    return {
      type: "hard",
      cause: "trust_crash",
      stepsBack: 2,
      requireRequalification: true,
    };
  }

  // ── Soft regression（1段後退、spike 解消で復帰可能） ──

  // 断裂検出（単発） → withdrawal / confrontation
  if (context.ruptureDetected && context.ruptureType) {
    return {
      type: "soft",
      cause: context.ruptureType,
      stepsBack: 1,
      requireRequalification: false,
    };
  }

  // reactive spike
  if (context.reactiveActivation >= REGRESSION_THRESHOLDS.reactiveSpikeSoft) {
    return {
      type: "soft",
      cause: "reactive_spike",
      stepsBack: 1,
      requireRequalification: false,
    };
  }

  // protective spike
  if (context.protectiveActivation >= REGRESSION_THRESHOLDS.protectiveSpikeSoft) {
    return {
      type: "soft",
      cause: "protective_spike",
      stepsBack: 1,
      requireRequalification: false,
    };
  }

  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 旧 Phase → HDM Phase 移行（P3-2: CEO条件1）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 移行計画:
//
// ┌──────────┬──────────────────────────────────────────────────────┐
// │ Phase    │ 状態                                                │
// ├──────────┼──────────────────────────────────────────────────────┤
// │ P3-1     │ HDM Phase 新設。derivePhase() と並走（analytics のみ）│
// │ P3-2     │ resolveEffectiveDepth() で Trust×Phase 統合完了。     │
// │ (現在)   │ route.ts の HDM Phase ブロックで proactive metrics 接続│
// │          │ derivePhase() はまだ proactive engine 内で呼ばれる    │
// │ P3-3     │ Phase → レンズ深度制御を route.ts に適用。            │
// │          │ proactive engine に hdmPhase を渡し、内部 derivePhase │
// │          │ を hdmPhase 優先に切り替え。derivePhase() @deprecated │
// │ P3-3完了 │ single source of truth = hdm_phase_state in DB       │
// │          │ derivePhase() は後方互換のみ残し、新規コードでは禁止   │
// └──────────┴──────────────────────────────────────────────────────┘
//
// 旧 Phase → HDM Phase のマッピング（既存ユーザーの初回移行用）:

type LegacyPhase = 0 | 1 | 2 | 3;

/**
 * 旧 Phase (0-3) → HDM Phase (0-5) への初回変換。
 * 既存ユーザーが初めて HDM Phase を計算する時に使用。
 * hdm_phase_state が null/default の場合のみ適用。
 */
export function migrateLegacyPhase(legacyPhase: LegacyPhase): HdmPhase {
  switch (legacyPhase) {
    case 0: return 0;  // 接触可能性
    case 1: return 1;  // 友達化
    case 2: return 2;  // 心の復元
    case 3: return 2;  // 旧 Phase 3 (Deep Understanding) → HDM Phase 2
    // 旧 Phase 3 は HDM Phase 3 (本人化) に自動昇格しない。
    // HDM Phase 3 は manual gate であり、旧 Phase 3 の条件では不十分。
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Regression（後退）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 後退の種類 */
export type RegressionType = "soft" | "hard";

/** 後退の入力シグナル */
export interface RegressionSignal {
  /** 後退の種類 */
  type: RegressionType;
  /** 後退の原因 */
  cause:
    | "reactive_spike"         // Parts Lens: reactive 高活性
    | "protective_spike"       // Parts Lens: protective 高活性
    | "withdrawal"             // 引きこもり型断裂
    | "confrontation"          // 対立型断裂
    | "dignity_violation"      // 尊厳フィルタ違反
    | "explicit_rejection"     // 明示的拒絶
    | "consecutive_rupture"    // 連続断裂
    | "trust_crash";           // 信頼の急激な低下
  /** 後退段数（soft=1, hard=2+） */
  stepsBack: number;
  /** hard regression の場合、再昇格に条件の再達成を要求するか */
  requireRequalification: boolean;
}

/**
 * 後退を計算する。
 * soft: 一時的 spike → 1段階低下、次ターンで spike 消失すれば復帰
 * hard: 連続 rupture / dignity violation → 2段以上低下 + 再昇格条件
 */
export function computeRegression(
  state: HdmPhaseState,
  signal: RegressionSignal,
): HdmPhaseState {
  const newPhase = Math.max(0, state.currentPhase - signal.stepsBack) as HdmPhase;

  if (newPhase >= state.currentPhase) {
    // 後退なし（既に最低）
    return state;
  }

  const newState: HdmPhaseState = {
    ...state,
    currentPhase: newPhase,
    lastTransitionAt: new Date().toISOString(),
    hardRegressionActive: signal.type === "hard" ? signal.requireRequalification : state.hardRegressionActive,
    hardRegressionFloor: signal.type === "hard" ? newPhase : state.hardRegressionFloor,
    // soft regression tracking
    lastSoftRegressionCause: signal.type === "soft" ? signal.cause : null,
    softRegressionPreviousPhase: signal.type === "soft" ? state.currentPhase : null,
  };

  return newState;
}

/**
 * Soft regression からの復帰を計算する。
 * spike が消失した場合、元の Phase に戻る。
 */
export function computeSoftRecovery(
  state: HdmPhaseState,
  previousPhase: HdmPhase,
  spikeResolved: boolean,
): HdmPhaseState {
  if (!spikeResolved) return state;
  if (state.hardRegressionActive) return state; // hard regression 中は soft recovery 不可

  return {
    ...state,
    currentPhase: previousPhase,
    lastTransitionAt: new Date().toISOString(),
    lastSoftRegressionCause: null,
    softRegressionPreviousPhase: null,
  };
}

/**
 * P3-4: regression + recovery の統合オーケストレーター。
 * 1ターン分の P1/P2 シグナルを受け取り、Phase の変更を計算する。
 *
 * 処理順:
 * 1. 前ターンの soft regression からの recovery 判定
 * 2. 新しい regression シグナル検出
 * 3. cooldown チェック（同じ cause の soft regression は連続で発生しない）
 * 4. regression 適用
 */
export interface RegressionOrchestratorResult {
  /** 更新後の state */
  newState: HdmPhaseState;
  /** 検出された regression シグナル */
  detectedSignal: RegressionSignal | null;
  /** regression が適用されたか */
  regressionApplied: boolean;
  /** soft recovery が適用されたか */
  recoveryApplied: boolean;
  /** cooldown でスキップされたか */
  cooldownSkipped: boolean;
  /** 前の Phase（変更前） */
  previousPhase: HdmPhase;
}

export function orchestrateRegression(
  state: HdmPhaseState,
  context: RegressionContext,
): RegressionOrchestratorResult {
  const result: RegressionOrchestratorResult = {
    newState: state,
    detectedSignal: null,
    regressionApplied: false,
    recoveryApplied: false,
    cooldownSkipped: false,
    previousPhase: state.currentPhase,
  };

  // ── Step 1: Soft recovery 判定 ──
  // 前ターンで soft regression が発生し、今ターンで同じ cause の spike が解消された場合
  if (state.lastSoftRegressionCause && state.softRegressionPreviousPhase !== null) {
    const prevCause = state.lastSoftRegressionCause;
    // spike が解消されたか: 同じ cause に該当するシグナルが閾値未満
    const spikeResolved = !isCauseStillActive(prevCause, context);

    if (spikeResolved) {
      const recovered = computeSoftRecovery(state, state.softRegressionPreviousPhase, true);
      result.newState = recovered;
      result.recoveryApplied = true;
      // recovery 後も新しい regression をチェック（recovery → 即 regression はありえる）
      // ただし recovered state から再計算
      state = recovered;
    }
  }

  // ── Step 2: 新しい regression シグナル検出 ──
  const signal = detectRegressionSignal(context);
  result.detectedSignal = signal;

  if (!signal) {
    // regression なし — recovery だけで終了
    return result;
  }

  // ── Step 3: Cooldown チェック ──
  // 同じ cause の soft regression が前ターンで発生していたらスキップ
  if (
    signal.type === "soft" &&
    state.lastSoftRegressionCause === signal.cause &&
    !result.recoveryApplied // recovery が行われた場合は cooldown リセット
  ) {
    result.cooldownSkipped = true;
    return result;
  }

  // ── Step 4: Regression 適用 ──
  const regressed = computeRegression(result.newState, signal);
  if (regressed.currentPhase < result.newState.currentPhase) {
    result.newState = regressed;
    result.regressionApplied = true;
  }

  return result;
}

/** 特定の regression cause がまだアクティブか判定 */
function isCauseStillActive(cause: string, context: RegressionContext): boolean {
  switch (cause) {
    case "reactive_spike":
      return context.reactiveActivation >= REGRESSION_THRESHOLDS.reactiveSpikeSoft;
    case "protective_spike":
      return context.protectiveActivation >= REGRESSION_THRESHOLDS.protectiveSpikeSoft;
    case "withdrawal":
    case "confrontation":
      return context.ruptureDetected && context.ruptureType === cause;
    case "dignity_violation":
      return context.dignityViolationDetected;
    case "explicit_rejection":
      return context.explicitRejection && context.ruptureDetected;
    case "consecutive_rupture":
      return context.consecutiveRuptureCount >= REGRESSION_THRESHOLDS.consecutiveRuptureHard;
    case "trust_crash":
      return context.trustDelta <= REGRESSION_THRESHOLDS.trustCrashThreshold;
    default:
      return false;
  }
}

/**
 * Hard regression からの復帰判定。
 * 遷移条件を再達成し、かつ追加の安定条件を満たす必要がある。
 */
export function canRecoverFromHardRegression(
  state: HdmPhaseState,
  inputs: HdmPhaseInputs,
): boolean {
  if (!state.hardRegressionActive || state.hardRegressionFloor === null) return false;

  // 通常の遷移条件を満たしているか
  const targetPhase = (state.hardRegressionFloor + 1) as HdmPhase;
  if (targetPhase > AUTO_TRANSITION_CEILING) return false;

  // Phase 1 への回復
  if (targetPhase === 1) {
    return meetsFloor(1, inputs) && meetsPhase1Metrics(inputs);
  }

  // Phase 2 への回復
  if (targetPhase === 2) {
    return meetsFloor(2, inputs) && meetsPhase2Metrics(inputs);
  }

  return false;
}

/**
 * Hard regression を解除する。
 */
export function resolveHardRegression(state: HdmPhaseState): HdmPhaseState {
  return {
    ...state,
    hardRegressionActive: false,
    hardRegressionFloor: null,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Analytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface HdmPhaseAnalytics {
  currentPhase: HdmPhase;
  phaseLabel: string;
  phaseLabelJa: string;
  transitioned: boolean;
  transitionReason: string | null;
  blockedReason: string | null;
  trustLevelDerived: TrustLevel;
  /** Phase 単体の応答深度 */
  responseDepth: PhaseResponseDepth;
  /** Trust × Phase 交差後の実効深度（null = trustLevel 未提供） */
  effectiveDepth: PhaseResponseDepth | null;
  hardRegressionActive: boolean;
  /** 検出された regression シグナル（null = なし） */
  regressionSignal: RegressionSignal | null;
  phase1MetricsMet: boolean;
  phase1FloorMet: boolean;
  phase2MetricsMet: boolean;
  phase2FloorMet: boolean;
}

export function buildHdmPhaseAnalytics(
  state: HdmPhaseState,
  transitionResult: PhaseTransitionResult,
  trustLevel?: TrustLevel,
  regressionSignal?: RegressionSignal | null,
): HdmPhaseAnalytics {
  const phase = transitionResult.phase;
  return {
    currentPhase: phase,
    phaseLabel: HDM_PHASE_LABELS[phase],
    phaseLabelJa: HDM_PHASE_LABELS_JA[phase],
    transitioned: transitionResult.transitioned,
    transitionReason: transitionResult.transitionReason,
    blockedReason: transitionResult.blockedReason,
    trustLevelDerived: hdmPhaseToTrustLevel(phase),
    responseDepth: getPhaseResponseDepth(phase),
    effectiveDepth: trustLevel !== undefined
      ? resolveEffectiveDepth(phase, trustLevel)
      : null,
    hardRegressionActive: state.hardRegressionActive,
    regressionSignal: regressionSignal ?? null,
    phase1MetricsMet: transitionResult.phase1MetricsMet,
    phase1FloorMet: transitionResult.phase1FloorMet,
    phase2MetricsMet: transitionResult.phase2MetricsMet,
    phase2FloorMet: transitionResult.phase2FloorMet,
  };
}
