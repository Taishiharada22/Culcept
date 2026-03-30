// lib/rendezvous/narrativePhaseMatching.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Narrative Phase Matching（物語フェーズマッチング）
//
// 脳科学的根拠:
// McAdamsの物語的アイデンティティ理論: 人間は自分の人生を
// 「物語の章」として理解する。同じ「章」にいる人同士は
// 経験のフレームを共有しているため、深い共鳴が起きやすい。
//
// 設計思想:
// 軸スコアだけでなく、「人生のどの段階にいるか」で
// マッチングを調整する。
//
// 例:
// User A: 転職直後（探索フェーズ）× User B: ルーティン確立（安定フェーズ）
//   → 相性スコアは高くても、今のタイミングでは合わない
// User A: 転職直後 × User C: 同じく探索フェーズ
//   → 同じ「章」にいるから共鳴する
//
// 統合:
// Origin の LifeBackboneTimeline + TurningPointEditor から
// 人生の転換点データを取得し、マッチングの文脈パラメータに注入
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { RendezvousCategory } from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 人生のナラティブフェーズ
 *
 * Erik Eriksonの心理社会的発達段階 + 現代的拡張:
 * - 実際の年齢ではなく「心理的段階」で分類
 * - 同じ30歳でも「探索中」と「確立済み」は全く異なる
 */
export type NarrativePhase =
  | "exploration"    // 探索期: 新しいことを試している、方向性を模索中
  | "transition"     // 転換期: 大きな変化の真っ最中（転職、引越し、離別等）
  | "building"       // 構築期: 方向性は決まり、積み上げている
  | "deepening"      // 深化期: 安定した基盤の上で、深みを追求
  | "questioning"    // 再問期: 築いたものに疑問を感じ始めた
  | "renewal";       // 刷新期: 古いものを手放し、新しい章を始めた

/**
 * ナラティブフェーズの詳細プロファイル
 */
export interface NarrativePhaseProfile {
  /** 現在のフェーズ */
  currentPhase: NarrativePhase;
  /** フェーズの確信度（0-1） */
  confidence: number;
  /** 直近の転換点からの日数 */
  daysSinceLastTransition: number | null;
  /** 転換点の種類 */
  lastTransitionType: TransitionType | null;
  /** フェーズ内の進行度（0-1、0=始まったばかり、1=次のフェーズに近い） */
  phaseProgress: number;
  /** 人生のテーマ（現在最も重要なこと） */
  currentTheme: string | null;
  /** 変化への準備度（0-1） */
  changeReadiness: number;
}

export type TransitionType =
  | "career_change"     // キャリアの変化
  | "relocation"        // 引越し/移住
  | "relationship"      // 恋愛関係の変化
  | "loss"              // 喪失（別離、死別等）
  | "achievement"       // 大きな達成
  | "health"            // 健康状態の変化
  | "identity"          // アイデンティティの変化
  | "spiritual"         // 精神的な変化
  | "education"         // 学びの変化
  | "other";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Phase Compatibility Matrix
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * フェーズ間の基本的な共鳴度（0-1）
 *
 * 同じフェーズ → 高い共鳴（経験のフレームを共有）
 * 隣接フェーズ → 中程度の共鳴（少し先/後の視点を提供）
 * 遠いフェーズ → 低い共鳴（世界が違いすぎて理解しづらい）
 */
const PHASE_RESONANCE: Record<NarrativePhase, Record<NarrativePhase, number>> = {
  exploration: {
    exploration: 0.95,  // 同じ探索中 → 最高の共鳴
    transition: 0.75,   // 変化中 → 近い経験
    building: 0.40,     // 構築中 → フェーズが遠い
    deepening: 0.25,    // 深化中 → 世界が違う
    questioning: 0.65,  // 再問中 → 探索に近い
    renewal: 0.80,      // 刷新中 → 新しい探索として共鳴
  },
  transition: {
    exploration: 0.75,
    transition: 0.90,   // 同じ転換期 → 不安定さの共有
    building: 0.55,
    deepening: 0.30,
    questioning: 0.70,
    renewal: 0.85,
  },
  building: {
    exploration: 0.40,
    transition: 0.55,
    building: 0.90,     // 同じ構築中 → 互いの成長を見守れる
    deepening: 0.80,    // 深化中 → 自然な延長
    questioning: 0.45,
    renewal: 0.50,
  },
  deepening: {
    exploration: 0.25,
    transition: 0.30,
    building: 0.80,
    deepening: 0.95,    // 同じ深化中 → 最も安定した共鳴
    questioning: 0.55,
    renewal: 0.35,
  },
  questioning: {
    exploration: 0.65,
    transition: 0.70,
    building: 0.45,
    deepening: 0.55,
    questioning: 0.85,  // 同じ再問中 → 疑問を共有できる
    renewal: 0.75,
  },
  renewal: {
    exploration: 0.80,
    transition: 0.85,
    building: 0.50,
    deepening: 0.35,
    questioning: 0.75,
    renewal: 0.90,      // 同じ刷新中 → 新しい始まりの共有
  },
};

/**
 * カテゴリごとのフェーズ重要度（0-1）
 * 高いほどフェーズの一致がマッチングに影響する
 */
const PHASE_IMPORTANCE_BY_CATEGORY: Record<RendezvousCategory, number> = {
  romantic: 0.20,     // ロマンティック: フェーズの影響大（タイミングが重要）
  partner: 0.25,      // パートナー: 最もフェーズが重要（人生の同期が必要）
  friendship: 0.12,   // 友情: フェーズはやや重要（共通の経験基盤）
  cocreation: 0.08,   // 共創: フェーズは重要度低（スキルと相性が優先）
  community: 0.05,    // コミュニティ: フェーズはほぼ無関係
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Phase Detection from Origin Data
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Originから取得できるデータ */
export interface OriginNarrativeInput {
  /** 直近の転換点の日付（ISO） */
  lastTurningPointDate: string | null;
  /** 転換点の種類 */
  lastTurningPointType: TransitionType | null;
  /** 転換点の重大度（0-1） */
  lastTurningPointSeverity: number;
  /** コアバリュー（生活の中心にあるもの） */
  coreValues: string[];
  /** 情熱のシグナル */
  passionSignals: string[];
  /** ユーザーの自己申告ステータス */
  selfReportedPhase?: string;
  /** Stargazerの変容ステージ（Prochaska） */
  changeStage?: "precontemplation" | "contemplation" | "preparation" | "action" | "maintenance";
}

/**
 * Originデータからナラティブフェーズを推定
 */
export function detectNarrativePhase(
  input: OriginNarrativeInput,
  today: string,
): NarrativePhaseProfile {
  const todayMs = new Date(today).getTime();

  // 直近の転換点からの日数
  let daysSinceLastTransition: number | null = null;
  if (input.lastTurningPointDate) {
    daysSinceLastTransition = Math.max(
      0,
      (todayMs - new Date(input.lastTurningPointDate).getTime()) / 86400000,
    );
  }

  // フェーズ推定ロジック
  let currentPhase: NarrativePhase;
  let confidence = 0.5;
  let phaseProgress = 0.5;

  // Prochaskaの変容ステージが利用可能な場合
  if (input.changeStage) {
    switch (input.changeStage) {
      case "precontemplation":
        currentPhase = daysSinceLastTransition && daysSinceLastTransition < 90
          ? "building"
          : "deepening";
        confidence = 0.6;
        break;
      case "contemplation":
        currentPhase = "questioning";
        confidence = 0.7;
        break;
      case "preparation":
        currentPhase = "questioning";
        phaseProgress = 0.8; // 次のフェーズに近い
        confidence = 0.75;
        break;
      case "action":
        currentPhase = daysSinceLastTransition && daysSinceLastTransition < 30
          ? "transition"
          : "renewal";
        confidence = 0.8;
        break;
      case "maintenance":
        currentPhase = daysSinceLastTransition && daysSinceLastTransition < 180
          ? "building"
          : "deepening";
        confidence = 0.7;
        break;
    }
  } else if (daysSinceLastTransition !== null) {
    // 転換点からの時間でフェーズを推定
    if (daysSinceLastTransition < 30) {
      currentPhase = "transition";
      phaseProgress = daysSinceLastTransition / 30;
      confidence = 0.7;
    } else if (daysSinceLastTransition < 90) {
      currentPhase = input.lastTurningPointSeverity >= 0.7
        ? "renewal"
        : "exploration";
      phaseProgress = (daysSinceLastTransition - 30) / 60;
      confidence = 0.6;
    } else if (daysSinceLastTransition < 365) {
      currentPhase = "building";
      phaseProgress = (daysSinceLastTransition - 90) / 275;
      confidence = 0.5;
    } else {
      currentPhase = "deepening";
      phaseProgress = Math.min(1, (daysSinceLastTransition - 365) / 365);
      confidence = 0.4; // 古いデータほど不確実
    }
  } else {
    // データ不足
    currentPhase = "building"; // デフォルト
    confidence = 0.3;
  }

  // 変化への準備度
  const changeReadiness =
    currentPhase === "questioning"
      ? 0.8
      : currentPhase === "exploration" || currentPhase === "renewal"
        ? 0.7
        : currentPhase === "transition"
          ? 0.9
          : currentPhase === "building"
            ? 0.4
            : 0.3;

  return {
    currentPhase,
    confidence,
    daysSinceLastTransition,
    lastTransitionType: input.lastTurningPointType,
    phaseProgress,
    currentTheme: input.coreValues[0] ?? null,
    changeReadiness,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 4. Phase-Based Score Adjustment
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** フェーズマッチングの結果 */
export interface NarrativePhaseMatchResult {
  /** フェーズ間の共鳴度（0-1） */
  resonance: number;
  /** スコア調整量（-0.1〜+0.1） */
  scoreAdjustment: number;
  /** マッチの文脈説明 */
  narrative: string;
  /** このペアのフェーズ関係 */
  relationship: PhaseRelationship;
  /** 共有テーマがあるか */
  sharedTheme: string | null;
  /** Anima向けフェーズコンテキスト */
  animaContext: string;
}

export type PhaseRelationship =
  | "synchronous"    // 同期: 同じフェーズにいる
  | "adjacent"       // 隣接: 近いフェーズにいる
  | "mentor_mentee"  // 師弟: 一方が先行フェーズにいる
  | "contrasting"    // 対照: 遠いフェーズにいる
  | "unknown";       // データ不足

/**
 * 二人のナラティブフェーズの適合度を計算
 */
export function evaluateNarrativePhaseMatch(
  phaseA: NarrativePhaseProfile,
  phaseB: NarrativePhaseProfile,
  category: RendezvousCategory,
): NarrativePhaseMatchResult {
  // 基本共鳴度
  const baseResonance = PHASE_RESONANCE[phaseA.currentPhase][phaseB.currentPhase];

  // 信頼度による減衰
  const confidenceMultiplier = Math.min(phaseA.confidence, phaseB.confidence);
  const resonance = baseResonance * confidenceMultiplier + (1 - confidenceMultiplier) * 0.5;

  // カテゴリごとの重要度に基づくスコア調整
  const importance = PHASE_IMPORTANCE_BY_CATEGORY[category];
  const scoreAdjustment = (resonance - 0.5) * importance * 2; // -importance〜+importance

  // フェーズ関係の判定
  let relationship: PhaseRelationship;
  if (phaseA.currentPhase === phaseB.currentPhase) {
    relationship = "synchronous";
  } else if (baseResonance >= 0.7) {
    relationship = "adjacent";
  } else if (
    (["building", "deepening"].includes(phaseA.currentPhase) &&
      ["exploration", "transition"].includes(phaseB.currentPhase)) ||
    (["building", "deepening"].includes(phaseB.currentPhase) &&
      ["exploration", "transition"].includes(phaseA.currentPhase))
  ) {
    relationship = "mentor_mentee";
  } else if (baseResonance < 0.4) {
    relationship = "contrasting";
  } else {
    relationship = "adjacent";
  }

  // 共有テーマの検出
  const sharedTheme =
    phaseA.currentTheme &&
    phaseB.currentTheme &&
    phaseA.currentTheme === phaseB.currentTheme
      ? phaseA.currentTheme
      : null;

  // 物語の生成
  const narrative = generatePhaseNarrative(
    phaseA,
    phaseB,
    relationship,
    sharedTheme,
  );

  // Animaコンテキスト
  const animaContext = generateAnimaPhaseContext(phaseA, phaseB, relationship);

  return {
    resonance,
    scoreAdjustment,
    narrative,
    relationship,
    sharedTheme,
    animaContext,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 5. Narrative Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PHASE_LABELS: Record<NarrativePhase, string> = {
  exploration: "探索の章",
  transition: "転換の章",
  building: "構築の章",
  deepening: "深化の章",
  questioning: "再問の章",
  renewal: "刷新の章",
};

function generatePhaseNarrative(
  phaseA: NarrativePhaseProfile,
  phaseB: NarrativePhaseProfile,
  relationship: PhaseRelationship,
  sharedTheme: string | null,
): string {
  const labelA = PHASE_LABELS[phaseA.currentPhase];
  const labelB = PHASE_LABELS[phaseB.currentPhase];

  switch (relationship) {
    case "synchronous":
      return sharedTheme
        ? `同じ「${labelA}」にいて、「${sharedTheme}」という共通のテーマを持っている。最も深い共鳴が期待できる`
        : `同じ「${labelA}」にいる。経験のフレームを共有しているため、言葉にしなくても通じるものがある`;

    case "adjacent":
      return `「${labelA}」と「${labelB}」。近い章にいるため、互いの経験が参考になる。少し先の視点を提供し合える関係`;

    case "mentor_mentee": {
      const stablePhase = ["building", "deepening"].includes(phaseA.currentPhase)
        ? phaseA
        : phaseB;
      const exploringPhase = stablePhase === phaseA ? phaseB : phaseA;
      return `「${PHASE_LABELS[stablePhase.currentPhase]}」にいる安定感と「${PHASE_LABELS[exploringPhase.currentPhase]}」にいる新鮮さ。経験の交換が互いを豊かにする`;
    }

    case "contrasting":
      return `「${labelA}」と「${labelB}」。遠いフェーズにいるため、理解に意識的な努力が必要。ただし、全く異なる視点がブレイクスルーを生むこともある`;

    default:
      return "フェーズの情報が限られているため、実際に会ってみることで見えてくるものがある";
  }
}

function generateAnimaPhaseContext(
  phaseA: NarrativePhaseProfile,
  phaseB: NarrativePhaseProfile,
  relationship: PhaseRelationship,
): string {
  switch (relationship) {
    case "synchronous":
      return "同じ季節を歩いている二人。共鳴する経験の中で、自分だけでは気づけない側面を見つけ合える";
    case "adjacent":
      return "少しだけ先を行く人と、少しだけ後ろを歩く人。互いの歩幅が自然に重なる場所がある";
    case "mentor_mentee":
      return "経験の深さが異なる二人。教えることで学び、学ぶことで教える。その往復が両者を変える";
    case "contrasting":
      return "異なる世界に住む二人。交差する瞬間に生まれる違和感の中に、最大の発見が隠れている";
    default:
      return "まだ互いの物語を知らない。最初の一歩が、新しい章の始まりになるかもしれない";
  }
}
