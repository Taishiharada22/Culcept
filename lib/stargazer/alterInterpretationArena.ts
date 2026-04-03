/**
 * v4.2 Phase B: Interpretation Arena
 *
 * 11の競合解釈レンズが同時に発話を読み、
 * 最もスコアの高い解釈が勝利する。
 *
 * - 11 Lenses: それぞれが独立した読みを提供
 * - Dominant Attractor: 直近で支配的なレンズに小バイアス
 * - Anti-Attractor: 同一レンズの連続勝利を抑制（Novelty Gate）
 * - WinningInterpretation: 最終的な解釈結果
 *
 * ルールベース。LLM 呼び出しなし。O(1)。
 */

import type { TurnSignal } from "./alterSignalReader";
import type { LivingSelfModel } from "./alterSelfModel";
import type { ThinSliceSessionState } from "./alterThinSlice";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type InterpretationLensId =
  | "fatigue_support"     // 疲労・バーンアウト支援
  | "co_think"            // 共同思考
  | "repair_demand"       // 修復要求
  | "core_drive_check"    // 核心的価値観の探索
  | "knowledge_ask"       // 情報・知識要求
  | "reality_check"       // 現実確認・グラウンディング
  | "vent"                // 感情の吐露
  | "execution_ask"       // 具体的行動・ステップ要求
  | "relationship_probe"  // 対人関係の探索
  | "identity_quest"      // アイデンティティ探索
  | "open_hypothesis";    // どのレンズにも当てはまらない（オープン仮説）

export interface LensReading {
  lens: InterpretationLensId;
  /** この解釈でユーザーの発話を読んだ1文 */
  reading: string;
  /** このレンズの確信度 0-1 */
  confidence: number;
  /** スコア（confidence + attractor bonus - anti-attractor penalty） */
  score: number;
}

export interface DominantAttractor {
  /** 直近で最も勝利しているレンズ */
  dominant_lens: InterpretationLensId | null;
  /** 連続勝利数 */
  consecutive_wins: number;
  /** 直近5ターンでの各レンズの勝利数 */
  recent_distribution: Partial<Record<InterpretationLensId, number>>;
}

export interface WinningInterpretation {
  /** 勝利した解釈 */
  primary: LensReading;
  /** 2位の解釈（対立仮説） */
  secondary: LensReading | null;
  /** 全レンズの読み */
  all_readings: LensReading[];
  /** Dominant Attractor の状態 */
  attractor: DominantAttractor;
  /** Anti-Attractor が発動したか */
  novelty_gate_triggered: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Lens Definitions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface LensDefinition {
  id: InterpretationLensId;
  /** このレンズが反応するキーワードパターン */
  patterns: RegExp[];
  /** intent でこのレンズが優先される場合 */
  intent_boost: string[];
  /** このレンズの基本 reading テンプレート */
  reading_template: string;
}

const LENS_DEFINITIONS: LensDefinition[] = [
  {
    id: "fatigue_support",
    patterns: [
      /疲れ|しんどい|つらい|限界|もう(?:いや|無理|だめ)|バーンアウト|燃え尽き|休[みむ]たい|元気.*ない/,
    ],
    intent_boost: ["vent"],
    reading_template: "この人は消耗している。回復を支える言葉が必要。",
  },
  {
    id: "co_think",
    patterns: [
      /一緒に考え|一緒に悩|二人で|どう思う|わからない(?:から|んだ)/,
    ],
    intent_boost: ["co_think_request", "seek_understanding"],
    reading_template: "この人は一人で考えきれず、共に思考する相手を求めている。",
  },
  {
    id: "repair_demand",
    patterns: [
      /押し付け|決めつけ|ずれてる|的外れ|聞いてない|違う.*よ|そうじゃない/,
    ],
    intent_boost: ["challenge_alter"],
    reading_template: "この人はAlterの前回の応答に不満を持ち、修正を求めている。",
  },
  {
    id: "core_drive_check",
    patterns: [
      /大事[なに]|価値観|譲れない|こだわり|原点|根っこ|核|本当[のにはが]自分|本質/,
    ],
    intent_boost: ["existential", "seek_understanding"],
    reading_template: "この人は自分の核心的な動因や価値観を探ろうとしている。",
  },
  {
    id: "knowledge_ask",
    patterns: [
      /教えて|(?:何|なに)[？?]|どういう(?:こと|意味)|情報|調べ|データ|統計|事実/,
    ],
    intent_boost: ["request_information"],
    reading_template: "この人は具体的な情報や知識を求めている。",
  },
  {
    id: "reality_check",
    patterns: [
      /現実|実際|本当に(?:できる|可能|大丈夫)|甘[いく]|リスク|危[なない]|無謀/,
    ],
    intent_boost: ["ask_judgment"],
    reading_template: "この人は自分の考えが現実的かどうか確認したがっている。",
  },
  {
    id: "vent",
    patterns: [
      /[！!]{2,}|むかつく|腹立つ|最悪|ふざけ|許せない|嫌[だい]|やめてほしい|聞いてほしい/,
    ],
    intent_boost: ["vent"],
    reading_template: "この人は感情を吐き出す場所を必要としている。判断や提案は求めていない。",
  },
  {
    id: "execution_ask",
    patterns: [
      /どうすれば|何をすれば|やり方|手順|ステップ|具体的に|実際.*どう|アクション/,
    ],
    intent_boost: ["demand_action"],
    reading_template: "この人は考えるフェーズを終え、具体的な行動プランを求めている。",
  },
  {
    id: "relationship_probe",
    patterns: [
      /(?:彼|彼女|上司|部下|先輩|後輩|親|友達|恋人|パートナー|同僚).*(?:と|が|に|から)|人間関係|対人|距離感/,
    ],
    intent_boost: ["ask_judgment"],
    reading_template: "この人の悩みの核には特定の対人関係がある。",
  },
  {
    id: "identity_quest",
    patterns: [
      /自分(?:って|は|が).*(?:何|誰|どんな)|何者|アイデンティティ|自分らしさ|自分探し|生き方|人生/,
    ],
    intent_boost: ["existential", "seek_understanding"],
    reading_template: "この人は「自分とは何者か」という根本的な問いに直面している。",
  },
  {
    id: "open_hypothesis",
    patterns: [], // パターンなし — フォールバック
    intent_boost: ["neutral"],
    reading_template: "明確なカテゴリに入らない。オープンな仮説で探索する。",
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Arena Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Attractor bonus: 直近で勝利しているレンズへの追加スコア */
const ATTRACTOR_BONUS = 0.08;

/** Anti-Attractor penalty: 3回以上連続勝利しているレンズへのペナルティ */
const ANTI_ATTRACTOR_PENALTY = 0.15;

/** Anti-Attractor 発動閾値: 連続勝利がこれを超えると penalty */
const ANTI_ATTRACTOR_THRESHOLD = 3;

/**
 * runInterpretationArena: 11の解釈レンズを競わせ、勝者を決定。
 *
 * ルールベース。LLM 呼び出しなし。
 * 各レンズは keyword match + intent alignment + Self Model context で
 * confidence スコアを算出。
 *
 * Dominant Attractor: 直近の支配的レンズに小バイアスを加える。
 * Anti-Attractor: 同一レンズが3ターン以上連続勝利すると penalty。
 */
export function runInterpretationArena(
  message: string,
  signal: TurnSignal,
  selfModel: LivingSelfModel,
  sessionState: ThinSliceSessionState,
  arenaHistory: InterpretationLensId[],
): WinningInterpretation {
  const trimmed = message.trim();

  // ── Dominant Attractor を計算 ──
  const attractor = computeAttractor(arenaHistory);

  // ── 各レンズのスコアリング ──
  const readings: LensReading[] = LENS_DEFINITIONS.map(def => {
    const confidence = scoreLens(def, trimmed, signal, selfModel);
    let score = confidence;

    // Dominant Attractor bonus
    if (attractor.dominant_lens === def.id && attractor.consecutive_wins >= 1) {
      score += ATTRACTOR_BONUS;
    }

    // Anti-Attractor penalty (Novelty Gate)
    if (attractor.dominant_lens === def.id && attractor.consecutive_wins >= ANTI_ATTRACTOR_THRESHOLD) {
      score -= ANTI_ATTRACTOR_PENALTY;
    }

    return {
      lens: def.id,
      reading: def.reading_template,
      confidence,
      score: Math.max(score, 0),
    };
  });

  // ── スコア順にソート ──
  readings.sort((a, b) => b.score - a.score);

  const primary = readings[0]!;
  const secondary = readings.length > 1 ? readings[1]! : null;

  // ── Novelty Gate 発動判定 ──
  const noveltyGateTriggered =
    attractor.dominant_lens === primary.lens &&
    attractor.consecutive_wins >= ANTI_ATTRACTOR_THRESHOLD;

  // Novelty Gate 発動時: secondary が十分なスコアを持っていれば入れ替え
  if (noveltyGateTriggered && secondary && secondary.confidence >= 0.3) {
    return {
      primary: secondary,
      secondary: primary,
      all_readings: readings,
      attractor,
      novelty_gate_triggered: true,
    };
  }

  return {
    primary,
    secondary,
    all_readings: readings,
    attractor,
    novelty_gate_triggered: noveltyGateTriggered,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scoring Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 個別レンズのスコアリング。
 * 3つのシグナルの加重和:
 *   - keyword match (0-0.4)
 *   - intent alignment (0-0.3)
 *   - self model context (0-0.3)
 */
function scoreLens(
  def: LensDefinition,
  message: string,
  signal: TurnSignal,
  selfModel: LivingSelfModel,
): number {
  let score = 0;

  // ── Keyword match (0-0.4) ──
  if (def.patterns.length > 0) {
    const matchCount = def.patterns.filter(p => p.test(message)).length;
    score += Math.min(matchCount * 0.2, 0.4);
  }

  // ── Intent alignment (0-0.3) ──
  if (def.intent_boost.includes(signal.intent)) {
    score += 0.3;
  }

  // ── Self Model context (0-0.3) ──
  score += selfModelBoost(def.id, selfModel);

  // ── open_hypothesis は常にベースラインスコアを持つ ──
  if (def.id === "open_hypothesis" && score < 0.15) {
    score = 0.15;
  }

  return Math.min(score, 1.0);
}

/**
 * Self Model からレンズへの追加スコア。
 * このユーザーの特性に基づいてレンズの妥当性を加算。
 */
function selfModelBoost(
  lensId: InterpretationLensId,
  model: LivingSelfModel,
): number {
  let boost = 0;

  switch (lensId) {
    case "core_drive_check":
      // core_drives が多いほど、このレンズの価値が高い
      if (model.core_drives.length >= 2) boost += 0.1;
      break;

    case "identity_quest":
      // contradictions が多い人ほど identity quest の可能性
      if (model.dominant_contradictions.length >= 1) boost += 0.1;
      if (model.blind_spots.length >= 1) boost += 0.05;
      break;

    case "relationship_probe":
      // aversion_map に対人関係系がある場合
      if (model.aversion_map.some(a =>
        /人|関係|信頼|裏切|距離/.test(a.trigger)
      )) boost += 0.1;
      break;

    case "vent":
      // emotional_richness が高い人ほど vent の可能性
      if (model.response_style.emotional_richness > 0.6) boost += 0.1;
      break;

    case "co_think":
      // self_referencing_depth が高い人ほど co_think を好む
      if (model.response_style.self_referencing_depth > 0.5) boost += 0.1;
      break;

    case "repair_demand":
      // disagreement_tendency が高い人ほど repair の必要性
      if (model.response_style.disagreement_tendency > 0.4) boost += 0.05;
      break;

    case "fatigue_support":
      // repeated_returns に疲労系テーマがある場合
      if (model.repeated_returns.some(r =>
        /疲|限界|しんどい|休/.test(r.theme)
      )) boost += 0.1;
      break;
  }

  return boost;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Attractor Computation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 直近の Arena 勝利履歴から Dominant Attractor を計算。
 */
function computeAttractor(
  arenaHistory: InterpretationLensId[],
): DominantAttractor {
  if (arenaHistory.length === 0) {
    return { dominant_lens: null, consecutive_wins: 0, recent_distribution: {} };
  }

  // 直近5ターンの分布
  const recent = arenaHistory.slice(-5);
  const distribution: Partial<Record<InterpretationLensId, number>> = {};
  for (const lens of recent) {
    distribution[lens] = (distribution[lens] ?? 0) + 1;
  }

  // 最頻出レンズ
  let dominant: InterpretationLensId | null = null;
  let maxCount = 0;
  for (const [lens, count] of Object.entries(distribution)) {
    if (count > maxCount) {
      dominant = lens as InterpretationLensId;
      maxCount = count;
    }
  }

  // 連続勝利数（末尾から）
  let consecutive = 0;
  for (let i = arenaHistory.length - 1; i >= 0; i--) {
    if (arenaHistory[i] === dominant) consecutive++;
    else break;
  }

  return {
    dominant_lens: dominant,
    consecutive_wins: consecutive,
    recent_distribution: distribution,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prompt Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * buildArenaPromptBlock: Arena の結果をプロンプトに注入。
 */
export function buildArenaPromptBlock(arena: WinningInterpretation): string {
  const sections: string[] = [
    "",
    "# 解釈（Interpretation Arena）",
    `**主要な読み（${arena.primary.lens}）**: ${arena.primary.reading}`,
    `  確信度: ${(arena.primary.confidence * 100).toFixed(0)}%`,
  ];

  if (arena.secondary && arena.secondary.confidence >= 0.2) {
    sections.push(`**対立仮説（${arena.secondary.lens}）**: ${arena.secondary.reading}`);
    sections.push(`  確信度: ${(arena.secondary.confidence * 100).toFixed(0)}%`);
  }

  if (arena.novelty_gate_triggered) {
    sections.push("");
    sections.push("⚠ Novelty Gate 発動: 同じ解釈が続いている。新しい角度を試すこと。");
  }

  sections.push("");
  sections.push("主要な読みに基づいて応答せよ。ただし対立仮説の可能性も頭に入れておくこと。");

  return sections.join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Analytics Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function buildArenaAnalytics(arena: WinningInterpretation): Record<string, unknown> {
  return {
    primary_lens: arena.primary.lens,
    primary_confidence: Math.round(arena.primary.confidence * 100) / 100,
    secondary_lens: arena.secondary?.lens ?? null,
    secondary_confidence: arena.secondary ? Math.round(arena.secondary.confidence * 100) / 100 : null,
    novelty_gate_triggered: arena.novelty_gate_triggered,
    attractor_dominant: arena.attractor.dominant_lens,
    attractor_consecutive: arena.attractor.consecutive_wins,
    top_3_lenses: arena.all_readings
      .slice(0, 3)
      .map(r => ({ lens: r.lens, score: Math.round(r.score * 100) / 100 })),
  };
}
