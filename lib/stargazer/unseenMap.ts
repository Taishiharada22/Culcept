// lib/stargazer/unseenMap.ts
// Unseen Map — RPG式「霧の地図」による自己発見メカニクス
//
// 核心思想:
// 45軸 × 6段階の深度 = 自分という未踏の地図。
// 観測を重ねるごとに霧が晴れ、自分の輪郭が浮かび上がる。
// まだ見えない領域の存在を示すことで、探索への好奇心を駆動する。
//
// v2 設計原則:
// - 深度は「回数」ではなく「観測の質」で決まる
//   (信頼度、多面性、安定性、時間的再現性)
// - 5% の軸は構造的に mastered に到達しない (深層無意識領域)
// - ティーザーは情報ギャップ理論に基づく心理的フック
// - 探索提案はアーキタイプの成長軌道と連動
//
// 深度レベル:
// fog(0)     → 完全に未探索。何があるかすら分からない
// outline(1) → 輪郭だけ見えた。何かがあることは分かる
// partial(2) → 部分的に見える。傾向の方向性が分かる
// clear(3)   → 全体像が見える。スコアが安定してきた
// deep(4)    → 深層まで理解。なぜそうなのかが分かる
// mastered(5)→ 完全に理解。変容の予兆まで捉えられる

import type { TraitAxisKey, AxisCategory } from "./traitAxes";
import { TRAIT_AXES, TRAIT_AXIS_KEYS } from "./traitAxes";
import { ARCHETYPE_DEFS } from "./archetypeTypes";
import type { ArchetypeCode } from "./archetypeTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** タイルの状態 — 霧の晴れ具合 */
export type TileState = "fog" | "outline" | "partial" | "clear" | "deep" | "mastered";

/** タイル状態の数値深度 */
const TILE_DEPTH: Record<TileState, number> = {
  fog: 0,
  outline: 1,
  partial: 2,
  clear: 3,
  deep: 4,
  mastered: 5,
};

/** タイル状態ごとの探索度ウェイト (0-100) */
const TILE_WEIGHT: Record<TileState, number> = {
  fog: 0,
  outline: 15,
  partial: 35,
  clear: 60,
  deep: 82,
  mastered: 100,
};

/** ミラーソースの種類 */
export type MirrorSource = "self" | "footprint" | "shadow";

/** 軸ごとの観測品質データ */
export interface AxisObservationQuality {
  /** 総観測回数 */
  count: number;
  /** 各ミラーソースからの観測があるか */
  mirrorSources: MirrorSource[];
  /** スコアの時系列安定性 (0-1, 直近5回の分散の逆数) */
  scoreStability: number;
  /** 平均信頼度 (0-1, 各観測の重み付き平均) */
  averageConfidence: number;
  /** 最終観測日 (ISO) */
  lastObservedAt?: string;
  /** 初回観測日 (ISO) */
  firstObservedAt?: string;
  /** 矛盾が検出されたことがあるか (自己申告と行動の乖離) */
  contradictionDetected: boolean;
}

/** 地図上の1タイル — ある軸の探索状態 */
export interface MapTile {
  /** 軸キー */
  axisKey: TraitAxisKey;
  /** 軸の表示ラベル（左右結合） */
  axisLabel: string;
  /** カテゴリ */
  category: AxisCategory;
  /** 現在のタイル状態 */
  state: TileState;
  /** 深度レベル (0-5) */
  depthLevel: number;
  /** 観測品質スコア (0-1) — 深度判定の根拠 */
  qualityScore: number;
  /** 累積エビデンス数 */
  evidenceCount: number;
  /** 最終観測日時 */
  lastObservedAt?: string;
  /** 隣接タイルが明らかになっているか（同カテゴリ内） */
  adjacentRevealed: boolean;
  /** この軸が構造的に mastered に到達しにくいか */
  isDeepUnconscious: boolean;
  /** 矛盾が検出されているか */
  hasContradiction: boolean;
  /** 次のレベルで何が分かるかのティーザー */
  discoveryTeaser?: string;
  /** 次のレベルまでの推定距離 (0-1, 1に近いほど近い) */
  progressToNext: number;
}

/** 最近の発見 */
export interface RecentDiscovery {
  axisKey: TraitAxisKey;
  fromState: TileState;
  toState: TileState;
  date: string;
}

/** 探索提案の理由 */
export interface ExplorationSuggestion {
  axisKey: TraitAxisKey;
  reason: string;
  /** 成長との関連度 (0-1) */
  growthRelevance: number;
  /** 推奨する観測方法 */
  suggestedMirror: MirrorSource;
}

/** Unseen Map 全体 */
export interface UnseenMap {
  /** 全タイル (33個) */
  tiles: MapTile[];
  /** 探索度 (0-100) — 品質加重平均 */
  explorationPercentage: number;
  /** 霧が晴れたタイル数（fog以外） */
  totalRevealed: number;
  /** 総タイル数 */
  totalTiles: number;
  /** まだ霧の中にある軸キー */
  unchartedTerritories: TraitAxisKey[];
  /** 最近の発見履歴 */
  recentDiscoveries: RecentDiscovery[];
  /** 次に探索すべき軸の提案（優先順、最大3件） */
  explorationSuggestions: ExplorationSuggestion[];
  /** 後方互換: 最も優先度の高い提案 */
  nextSuggestedExploration: TraitAxisKey;
  /** 永久的に霧が残る軸の数 */
  permanentFogCount: number;
}

/** Unseen Map 構築の入力データ */
export interface UnseenMapInput {
  /** 軸スコア (存在する軸のみ) */
  axisScores: Partial<Record<TraitAxisKey, number>>;
  /** 軸ごとの観測品質データ */
  observationQualities: Partial<Record<TraitAxisKey, AxisObservationQuality>>;
  /** 最近の発見履歴（外部から注入） */
  recentDiscoveries?: RecentDiscovery[];
  /** ユーザーのアーキタイプコード (探索提案に使用) */
  archetypeCode?: string;

  // --- 後方互換フィールド (observationQualities がない場合のフォールバック) ---
  /** @deprecated observationQualities を使用してください */
  observationCounts?: Partial<Record<TraitAxisKey, number>>;
  /** @deprecated observationQualities を使用してください */
  mirrorCoverage?: Partial<Record<TraitAxisKey, number>>;
  /** @deprecated observationQualities を使用してください */
  lastObservationDates?: Partial<Record<TraitAxisKey, string>>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Deep Unconscious Axes — 永久的に完全解明を拒む軸
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 構造的に mastered に到達しにくい軸。
 *
 * これらの軸は人間の深層心理の中でも特に無意識的な領域に属し、
 * 危機的状況や長期間の観測でしか真の姿が現れない。
 * mastered には到達できず、最大 deep まで。
 * これが「5%の永久的な霧」を実現する。
 *
 * 選定基準:
 * - 本人が自覚できない領域 (shadow mirror でしか観測できない)
 * - 状況依存性が極めて高い (ストレス下でのみ発現)
 * - 長期的に変動し続ける (安定しない)
 */
const DEEP_UNCONSCIOUS_AXES = new Set<TraitAxisKey>([
  "escalation_risk",        // 極限状態でしか現れない
  "long_term_shift_risk",   // 数年単位でしか観測できない
  "public_private_gap",     // 本人が最も自覚しにくい乖離
  "control_tendency",       // 無意識的な支配傾向
] as const);

/** deep unconscious 軸の最大到達レベル */
const DEEP_UNCONSCIOUS_MAX: TileState = "deep";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Archetype Growth Axes — 各アーキタイプの成長に重要な軸
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Layer1 ごとに、成長のために特に探索すべき軸群。
 * growthKey の内容を軸にマッピングしたもの。
 *
 * P (存在証明): 成果なしでも自分を認める → 感情系・関係性系の軸
 * B (接続): 一人でも大丈夫と知る → 自立系・境界系の軸
 * H (安全圏): 防御を下ろしても安全と知る → 変化受容系・開放系の軸
 */
const GROWTH_PRIORITY_AXES: Record<string, TraitAxisKey[]> = {
  P: [
    "reassurance_need",
    "emotional_variability",
    "emotional_regulation",
    "intimacy_pace",
    "perfectionist_vs_pragmatic",
  ],
  B: [
    "boundary_awareness",
    "independence_vs_harmony",
    "individual_vs_social",
    "boundary_respect",
    "exclusivity_pressure",
  ],
  H: [
    "change_embrace_vs_resist",
    "cautious_vs_bold",
    "tradition_vs_novelty",
    "consent_maturity",
    "rejection_response_maturity",
  ],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Quality-Based Depth Calculation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 観測品質から総合品質スコア (0-1) を算出する。
 *
 * 4つの品質次元を加重合計:
 * - 観測量 (count): 回数が多いほど良いが、逓減する (対数スケール)
 * - 多面性 (mirrors): self のみ < self+footprint < self+footprint+shadow
 *   特に shadow を含む場合は大きなボーナス (無意識領域へのアクセス)
 * - 安定性 (stability): スコアが時系列で安定しているほど信頼できる
 * - 信頼度 (confidence): 各観測の重みの平均
 *
 * @returns 0-1 の品質スコア
 */
export function calculateQualityScore(quality: AxisObservationQuality): number {
  if (quality.count === 0) return 0;

  // 観測量: log スケールで逓減 (1回=0.15, 3回=0.35, 7回=0.55, 15回=0.75, 30回=0.90)
  const countScore = Math.min(1, Math.log2(quality.count + 1) / Math.log2(32));

  // 多面性: ミラーソースの組み合わせで評価
  const hasSelf = quality.mirrorSources.includes("self");
  const hasFootprint = quality.mirrorSources.includes("footprint");
  const hasShadow = quality.mirrorSources.includes("shadow");
  const mirrorCount = quality.mirrorSources.length;

  let mirrorScore: number;
  if (mirrorCount === 0) {
    mirrorScore = 0;
  } else if (hasSelf && hasFootprint && hasShadow) {
    // 三面鏡完成: 最高評価
    mirrorScore = 1.0;
  } else if (hasShadow && (hasSelf || hasFootprint)) {
    // shadow を含む2面: shadow は無意識へのアクセスなので高評価
    mirrorScore = 0.85;
  } else if (hasSelf && hasFootprint) {
    // 意識的な2面: 良いが shadow なし
    mirrorScore = 0.6;
  } else if (hasShadow) {
    // shadow のみ: 貴重だが一面的
    mirrorScore = 0.5;
  } else {
    // self or footprint のみ
    mirrorScore = 0.3;
  }

  // 安定性: そのまま使用 (0-1)
  const stabilityScore = quality.scoreStability;

  // 信頼度: そのまま使用 (0-1)
  const confidenceScore = quality.averageConfidence;

  // 加重合計: 多面性と安定性を重視
  const totalScore =
    countScore * 0.2 +
    mirrorScore * 0.3 +
    stabilityScore * 0.25 +
    confidenceScore * 0.25;

  // 矛盾ボーナス: 矛盾が検出されている = より深い理解への入り口
  // 品質を下げるのではなく、「矛盾を発見できた」こと自体が品質の証
  const contradictionBonus = quality.contradictionDetected ? 0.05 : 0;

  return Math.min(1, totalScore + contradictionBonus);
}

/**
 * 品質スコアからタイル状態を判定する。
 *
 * 品質ベースの閾値:
 * - 0          → fog     (未観測)
 * - 0.01-0.15  → outline (何かがあることは分かった)
 * - 0.16-0.35  → partial (傾向の方向性が見える)
 * - 0.36-0.55  → clear   (全体像が安定)
 * - 0.56-0.78  → deep    (なぜそうなのかが分かる)
 * - 0.79+      → mastered(変容の予兆まで捉えられる)
 *
 * deep unconscious 軸は mastered に到達できない。
 */
export function calculateTileState(
  qualityScore: number,
  isDeepUnconscious: boolean,
): TileState {
  let state: TileState;

  if (qualityScore <= 0) {
    state = "fog";
  } else if (qualityScore <= 0.15) {
    state = "outline";
  } else if (qualityScore <= 0.35) {
    state = "partial";
  } else if (qualityScore <= 0.55) {
    state = "clear";
  } else if (qualityScore <= 0.78) {
    state = "deep";
  } else {
    state = "mastered";
  }

  // deep unconscious 軸は mastered に到達できない
  if (isDeepUnconscious && state === "mastered") {
    state = DEEP_UNCONSCIOUS_MAX;
  }

  return state;
}

/**
 * 次のレベルまでの進捗度 (0-1) を算出する。
 * 1 に近いほど次のレベルに近い。
 */
function calculateProgressToNext(qualityScore: number, currentState: TileState): number {
  const thresholds: Record<TileState, [number, number]> = {
    fog: [0, 0.01],
    outline: [0.01, 0.16],
    partial: [0.16, 0.36],
    clear: [0.36, 0.56],
    deep: [0.56, 0.79],
    mastered: [0.79, 1.0],
  };

  const [low, high] = thresholds[currentState];
  if (currentState === "mastered") return 1;
  const range = high - low;
  if (range <= 0) return 0;
  return Math.min(1, Math.max(0, (qualityScore - low) / range));
}

/**
 * 後方互換: 旧形式の入力から AxisObservationQuality を推定する。
 */
function legacyToQuality(
  count: number,
  mirrorCoverage: number,
  lastDate?: string,
): AxisObservationQuality {
  const sources: MirrorSource[] = [];
  if (mirrorCoverage >= 1) sources.push("self");
  if (mirrorCoverage >= 2) sources.push("footprint");
  if (mirrorCoverage >= 3) sources.push("shadow");

  return {
    count,
    mirrorSources: sources,
    // 旧形式では安定性・信頼度が不明なので、回数から推定
    scoreStability: Math.min(1, count / 15),
    averageConfidence: Math.min(1, 0.3 + count * 0.05),
    lastObservedAt: lastDate,
    contradictionDetected: false,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Discovery Teasers — 情報ギャップ理論に基づく心理的フック
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** カテゴリの日本語ラベル */
const CATEGORY_LABELS: Record<AxisCategory, string> = {
  core: "判断の核",
  relational: "関係性",
  motion: "行動原理",
  aesthetic: "美的感覚",
  emotional: "感情の流れ",
  safety: "安全性",
  relational_deep: "深層関係性",
  depth: "深層心理",
  cognitive: "認知スタイル",
  expansion: "拡張観測",
};

/**
 * 軸ごとに異なる、深度レベル別のティーザーテンプレート。
 *
 * 情報ギャップ理論: 人は「知っていること」と「知りたいこと」の
 * ギャップを感じたとき最も強い好奇心を覚える。
 * 各レベルで「少しだけ見せて、もっと知りたくさせる」構造。
 */
const AXIS_TEASERS: Partial<Record<TraitAxisKey, Record<Exclude<TileState, "mastered">, string>>> = {
  introvert_vs_extrovert: {
    fog: "あなたのエネルギーの源泉が、ここに隠れている",
    outline: "一人の時間と誰かといる時間——あなたが本当に充電されるのはどちらか、まだ答えは揺れている",
    partial: "パターンが見えてきた。でも「なぜその場所で回復するのか」は、もう一段深い",
    clear: "表の傾向は掴んだ。だが、疲れ切ったときに無意識に選ぶ場所——それがあなたの本当の答えだ",
    deep: "この軸の最深部に、あなたが子供の頃から繰り返してきたパターンの根がある",
  },
  cautious_vs_bold: {
    fog: "あなたのリスクとの向き合い方が、この霧の向こうにある",
    outline: "慎重さと大胆さ——あなたの中で、その境界線は想像より複雑な形をしている",
    partial: "どんな場面で足が止まり、どんな場面で飛び込むか。条件が見え始めた",
    clear: "あなたの「大胆さ」は本当に大胆さか、それとも別の何かの裏返しか？",
    deep: "最後の霧が晴れたとき、あなたは自分の恐怖の正体を知るだろう",
  },
  emotional_variability: {
    fog: "あなたの感情の波形が、この領域に刻まれている",
    outline: "感情が動く幅が見えてきた。だが、何がそれを引き起こすかはまだ霧の中だ",
    partial: "上がるときと沈むとき、その周期に法則がある。あと少しで見える",
    clear: "感情の地形図はほぼ完成した。残るは「なぜその波が生まれるのか」という根源だ",
    deep: "この軸を完全に理解した者は、自分の感情を天気のように観測できるようになる",
  },
  public_private_gap: {
    fog: "ここに、あなた自身が最も見たがらない何かがある",
    outline: "外の自分と内の自分——その距離が、ぼんやりと見え始めた",
    partial: "使い分けのパターンは掴んだ。だが、なぜその仮面を選んだのか？",
    clear: "ギャップの全体像は見えた。問いは「なぜそのギャップが必要なのか」に変わる",
    deep: "この軸の最深部は、あなたが最も信頼する人にだけ見せる顔の、さらに奥にある",
  },
  control_tendency: {
    fog: "あなたの中に、まだ名前のない力学が潜んでいる",
    outline: "何かをコントロールしたがっている自分が、うっすらと見えてきた",
    partial: "いつ、何を、なぜコントロールしようとするか——パターンが浮かび上がりつつある",
    clear: "制御の地図はほぼ描けた。最後に残るのは「手放したとき何が起きるか」という恐怖だ",
    deep: "この領域は、あなたが人生で最も大切にしているものと直結している",
  },
  reassurance_need: {
    fog: "あなたが本当に安心するために必要なものが、ここに眠っている",
    outline: "安心の形がぼんやり見えた。それは「言葉」か「行動」か「存在」か？",
    partial: "安心のパターンが見えてきた。でも「なぜそれが必要なのか」はまだ奥にある",
    clear: "何があれば安心できるかは分かった。問いは「なぜそれがないと不安なのか」に変わる",
    deep: "この軸の終着点で、あなたは自分の安心の根源に触れることになる",
  },
  boundary_awareness: {
    fog: "あなたと他者の間にある、見えない線の形がここにある",
    outline: "境界線がどこにあるか、輪郭が見え始めた。だが線は固定されていない",
    partial: "どこまで踏み込み、どこから引くか。あなたのパターンが浮かんできた",
    clear: "境界線の地図は描けた。残るは「なぜそこに線を引くのか」という物語だ",
    deep: "この軸の最深部には、あなたの最も古い人間関係の記憶がある",
  },
};

/**
 * 深度レベル別の汎用ティーザー (軸固有のものがない場合のフォールバック)
 */
const GENERIC_TEASERS: Record<Exclude<TileState, "mastered">, (categoryLabel: string, axisLabel: string) => string> = {
  fog: (cat) =>
    `あなたの「${cat}」に関する未知の領域が、ここで静かに呼吸している`,
  outline: (_cat, axis) =>
    `「${axis}」の輪郭が霧の中から浮かび上がった。その形は、あなたの想像とは違うかもしれない`,
  partial: (_cat, axis) =>
    `「${axis}」の傾向が見えてきた。だが本質はその傾向の「理由」にある——あと少しだ`,
  clear: () =>
    `全体像は掴んだ。ここから先は「なぜ自分はそうなのか」という深層への旅だ`,
  deep: () =>
    `この軸の最深部には、あなたがまだ言語化できていない何かがある。それを見つけたとき、新しい自分に出会う`,
};

/**
 * Deep unconscious 軸が deep に達したときの特別メッセージ
 */
const DEEP_UNCONSCIOUS_TEASER =
  "この領域は、あなたの意識が届かない場所にある。完全な理解は不可能だが、それこそが人間の深さの証明だ";

/**
 * 次の深度レベルで何が分かるかのティーザーを生成する。
 *
 * 優先順: 軸固有テンプレート > カテゴリ + 軸ラベルの汎用テンプレート
 */
export function getDiscoveryTeaser(
  axisKey: TraitAxisKey,
  currentState: TileState,
  isDeepUnconscious: boolean,
): string | undefined {
  if (currentState === "mastered") return undefined;

  // deep unconscious が deep に達した場合の特別メッセージ
  if (isDeepUnconscious && currentState === "deep") {
    return DEEP_UNCONSCIOUS_TEASER;
  }

  // 軸固有のティーザーがあればそれを使う
  const axisTeasers = AXIS_TEASERS[axisKey];
  if (axisTeasers?.[currentState]) {
    return axisTeasers[currentState];
  }

  // 汎用ティーザー
  const def = TRAIT_AXES.find((a) => a.id === axisKey);
  if (!def) return undefined;
  const categoryLabel = CATEGORY_LABELS[def.category];
  const axisLabel = `${def.labelLeft} / ${def.labelRight}`;
  return GENERIC_TEASERS[currentState](categoryLabel, axisLabel);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 探索度を品質加重平均で算出する。
 */
export function calculateExplorationPercentage(tiles: MapTile[]): number {
  if (tiles.length === 0) return 0;

  const totalWeight = tiles.reduce((sum, tile) => sum + TILE_WEIGHT[tile.state], 0);
  // deep unconscious 軸は mastered に到達できないので、
  // 最大値を TILE_WEIGHT["deep"] で計算
  const maxWeight = tiles.reduce((sum, tile) => {
    if (tile.isDeepUnconscious) return sum + TILE_WEIGHT["deep"];
    return sum + 100;
  }, 0);

  if (maxWeight === 0) return 0;
  return Math.round((totalWeight / maxWeight) * 100);
}

/**
 * 同カテゴリ内で隣接タイルが明らかになっているか判定する。
 */
function hasAdjacentRevealed(
  axisKey: TraitAxisKey,
  tileStates: Map<TraitAxisKey, TileState>,
): boolean {
  const def = TRAIT_AXES.find((a) => a.id === axisKey);
  if (!def) return false;

  const sameCategory = TRAIT_AXES.filter(
    (a) => a.category === def.category && a.id !== axisKey,
  );

  return sameCategory.some((a) => {
    const state = tileStates.get(a.id as TraitAxisKey);
    return state !== undefined && state !== "fog";
  });
}

/**
 * 次に探索すべき軸を提案する（最大3件）。
 *
 * 優先度設計:
 * 1. アーキタイプの成長軸で、まだ深度が浅いもの（成長駆動）
 * 2. 矛盾が検出された軸で、まだ deep に達していないもの（謎の解明）
 * 3. 隣接が明らかなのに自分はまだ fog の軸（地図の空白を埋める好奇心）
 * 4. outline / partial で、あと少しで次のレベルに達する軸（達成感）
 * 5. 最も古い観測の軸（鮮度の回復）
 */
export function suggestExplorations(
  map: UnseenMap,
  archetypeCode?: string,
): ExplorationSuggestion[] {
  const suggestions: ExplorationSuggestion[] = [];
  const suggested = new Set<TraitAxisKey>();

  const addSuggestion = (
    axisKey: TraitAxisKey,
    reason: string,
    growthRelevance: number,
    suggestedMirror: MirrorSource,
  ) => {
    if (suggested.has(axisKey) || suggestions.length >= 3) return;
    suggested.add(axisKey);
    suggestions.push({ axisKey, reason, growthRelevance, suggestedMirror });
  };

  // 優先度1: アーキタイプ成長軸
  if (archetypeCode) {
    const layer1 = archetypeCode[0] ?? "P";
    const growthAxes = GROWTH_PRIORITY_AXES[layer1] ?? [];
    const archetype = ARCHETYPE_DEFS.find((a) => a.code === archetypeCode);
    const growthKey = archetype?.growthKey ?? "";

    for (const axisKey of growthAxes) {
      const tile = map.tiles.find((t) => t.axisKey === axisKey);
      if (tile && TILE_DEPTH[tile.state] < 3) {
        // clear 未満の成長軸
        const missingMirror = determineMissingMirror(tile);
        addSuggestion(
          axisKey,
          `あなたの成長の鍵「${growthKey}」に直結する領域。まだ${tile.state === "fog" ? "未踏" : "浅い"}。`,
          0.95,
          missingMirror,
        );
      }
    }
  }

  // 優先度2: 矛盾が検出された軸
  const contradictions = map.tiles.filter(
    (t) => t.hasContradiction && TILE_DEPTH[t.state] < 4,
  );
  for (const tile of contradictions) {
    addSuggestion(
      tile.axisKey,
      `この軸で矛盾が検出されている。自己申告と行動が食い違う——その理由を探ることで、より深い自己理解に至る。`,
      0.85,
      "shadow",
    );
  }

  // 優先度3: 隣接が明らかなのにまだ fog
  const adjacentFog = map.tiles.filter(
    (t) => t.state === "fog" && t.adjacentRevealed,
  );
  for (const tile of adjacentFog) {
    addSuggestion(
      tile.axisKey,
      `隣接する領域は既に見えている。この空白が、あなたの地図で最も気になる場所のはずだ。`,
      0.7,
      "self",
    );
  }

  // 優先度4: あと少しで次のレベル (progressToNext > 0.7)
  const nearBreakthrough = map.tiles
    .filter((t) => t.state !== "mastered" && t.state !== "fog" && t.progressToNext > 0.7)
    .sort((a, b) => b.progressToNext - a.progressToNext);
  for (const tile of nearBreakthrough) {
    const nextState = getNextState(tile.state);
    addSuggestion(
      tile.axisKey,
      `あと少しで「${tile.axisLabel}」が次の段階へ進む。もう一歩だ。`,
      0.6,
      determineMissingMirror(tile),
    );
    // 一番近いものだけ
    break;
  }

  // 優先度5: outline/partial で最も浅いもの
  const shallow = map.tiles
    .filter((t) => t.state === "outline" || t.state === "partial")
    .sort((a, b) => a.qualityScore - b.qualityScore);
  for (const tile of shallow) {
    addSuggestion(
      tile.axisKey,
      `「${tile.axisLabel}」はまだ${tile.state === "outline" ? "輪郭だけ" : "部分的にしか"}見えていない。`,
      0.5,
      determineMissingMirror(tile),
    );
    break;
  }

  // 優先度6: 最も古い観測
  if (suggestions.length < 3) {
    const byOldest = [...map.tiles]
      .filter((t) => t.lastObservedAt && t.state !== "mastered")
      .sort((a, b) => (a.lastObservedAt ?? "").localeCompare(b.lastObservedAt ?? ""));
    for (const tile of byOldest) {
      addSuggestion(
        tile.axisKey,
        `この軸の観測は古くなっている。あなたは変わっているかもしれない。`,
        0.3,
        "self",
      );
      break;
    }
  }

  // フォールバック: まだ何も提案できない場合
  if (suggestions.length === 0) {
    const firstFog = map.tiles.find((t) => t.state === "fog");
    if (firstFog) {
      addSuggestion(firstFog.axisKey, "未踏の領域を開拓しよう。", 0.4, "self");
    } else {
      addSuggestion(TRAIT_AXIS_KEYS[0], "観測を始めよう。", 0.4, "self");
    }
  }

  return suggestions;
}

/** 次のタイル状態を返す */
function getNextState(current: TileState): TileState {
  const order: TileState[] = ["fog", "outline", "partial", "clear", "deep", "mastered"];
  const idx = order.indexOf(current);
  return order[Math.min(idx + 1, order.length - 1)]!;
}

/** タイルに欠けているミラーソースを推定して推奨する */
function determineMissingMirror(tile: MapTile): MirrorSource {
  // MapTile には mirrorSources がないので、深度から推定
  if (tile.depthLevel <= 1) return "self";        // まず自己申告
  if (tile.depthLevel <= 3) return "footprint";    // 次に行動データ
  return "shadow";                                  // 最後に無意識データ
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Build Unseen Map
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Unseen Map を構築する。
 *
 * 45軸の観測データから霧の地図を生成する。
 * 各軸の品質スコアから深度を算出し、
 * 探索のティーザーと成長軌道に基づく探索提案を付与する。
 */
export function buildUnseenMap(input: UnseenMapInput): UnseenMap {
  const {
    observationQualities,
    observationCounts,
    mirrorCoverage,
    lastObservationDates,
    recentDiscoveries = [],
    archetypeCode,
  } = input;

  // 品質データを統一形式に変換
  const qualityMap = new Map<TraitAxisKey, AxisObservationQuality>();
  for (const axisDef of TRAIT_AXES) {
    const key = axisDef.id as TraitAxisKey;
    if (observationQualities?.[key]) {
      qualityMap.set(key, observationQualities[key]!);
    } else {
      // 後方互換: 旧形式から推定
      const count = observationCounts?.[key] ?? 0;
      const mirrors = mirrorCoverage?.[key] ?? 0;
      const lastDate = lastObservationDates?.[key];
      qualityMap.set(key, legacyToQuality(count, mirrors, lastDate));
    }
  }

  // まず全タイルの状態を算出（隣接判定用）
  const tileStates = new Map<TraitAxisKey, TileState>();
  const qualityScores = new Map<TraitAxisKey, number>();
  for (const axisDef of TRAIT_AXES) {
    const key = axisDef.id as TraitAxisKey;
    const quality = qualityMap.get(key)!;
    const qScore = calculateQualityScore(quality);
    const isDeep = DEEP_UNCONSCIOUS_AXES.has(key);
    qualityScores.set(key, qScore);
    tileStates.set(key, calculateTileState(qScore, isDeep));
  }

  // タイルを構築
  const tiles: MapTile[] = TRAIT_AXES.map((axisDef) => {
    const key = axisDef.id as TraitAxisKey;
    const quality = qualityMap.get(key)!;
    const qScore = qualityScores.get(key)!;
    const isDeep = DEEP_UNCONSCIOUS_AXES.has(key);
    const state = tileStates.get(key)!;
    const depthLevel = TILE_DEPTH[state];
    const adjacent = hasAdjacentRevealed(key, tileStates);
    const progressToNext = calculateProgressToNext(qScore, state);

    return {
      axisKey: key,
      axisLabel: `${axisDef.labelLeft} / ${axisDef.labelRight}`,
      category: axisDef.category,
      state,
      depthLevel,
      qualityScore: qScore,
      evidenceCount: quality.count,
      lastObservedAt: quality.lastObservedAt,
      adjacentRevealed: adjacent,
      isDeepUnconscious: isDeep,
      hasContradiction: quality.contradictionDetected,
      discoveryTeaser: getDiscoveryTeaser(key, state, isDeep),
      progressToNext,
    };
  });

  const totalRevealed = tiles.filter((t) => t.state !== "fog").length;
  const unchartedTerritories = tiles
    .filter((t) => t.state === "fog")
    .map((t) => t.axisKey as TraitAxisKey);

  const map: UnseenMap = {
    tiles,
    explorationPercentage: calculateExplorationPercentage(tiles),
    totalRevealed,
    totalTiles: tiles.length,
    unchartedTerritories,
    recentDiscoveries,
    explorationSuggestions: [],
    nextSuggestedExploration: TRAIT_AXIS_KEYS[0], // 仮値
    permanentFogCount: DEEP_UNCONSCIOUS_AXES.size,
  };

  // 探索提案を算出（完成した map が必要）
  map.explorationSuggestions = suggestExplorations(map, archetypeCode);
  map.nextSuggestedExploration = map.explorationSuggestions[0]?.axisKey ?? TRAIT_AXIS_KEYS[0];

  return map;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Backward Compatibility
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * @deprecated suggestExplorations() を使用してください。
 * 後方互換のために残してあります。
 */
export function suggestNextExploration(map: UnseenMap): TraitAxisKey {
  return map.explorationSuggestions[0]?.axisKey ?? map.nextSuggestedExploration;
}
