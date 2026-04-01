// lib/stargazer/portraitBuilder.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 5: The Portrait — 6タブのデータダンプを1ページの「肖像画」に変換
//
// 構成:
//   1. アーキタイプ（名前 + emoji + タグライン）
//   2. 3つの深い真実（確信度上位3軸のナラティブ）
//   3. まだ見えていないもの（低precision軸のカテゴリ名）
//   4. 理解度（syncPercentage）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { TRAIT_AXIS_KEYS, TRAIT_AXES, type TraitAxisKey, type AxisCategory } from "./traitAxes";
import type { BeliefSet, AxisBelief } from "./bayesianAxisUpdater";
import { resolveArchetypeWithUncertainty, resolveArchetype, type ArchetypeResult } from "./archetypeResolver";
import { getArchetypeByCode, type ArchetypeDef } from "./archetypeTypes";
import { computeSyncPercentage } from "./informationGain";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. 型定義
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DeepTruth {
  /** 真実のテキスト（日本語、1-2文） */
  text: string;
  /** 対象軸 */
  axisId: TraitAxisKey;
  /** 確信度 0-1（precision ベース） */
  confidence: number;
  /** 方向 */
  direction: "positive" | "negative";
  /** mu 値 */
  score: number;
}

export interface UnseenArea {
  /** カテゴリ名（日本語） */
  label: string;
  /** カテゴリID */
  category: AxisCategory;
  /** この領域の平均precision */
  avgPrecision: number;
}

export interface Portrait {
  /** アーキタイプ情報 */
  archetype: {
    code: string;
    name: string;
    emoji: string;
    tagline: string;
  } | null;
  /** 3つの深い真実（確信度順） */
  truths: DeepTruth[];
  /** まだ見えていない領域 */
  unseenAreas: UnseenArea[];
  /** 理解度 (0-1) */
  syncPercentage: number;
  /** アーキタイプの confidence */
  archetypeConfidence: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. 真実テンプレート
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface TruthTemplate {
  axis: TraitAxisKey;
  positive: string;
  negative: string;
}

const TRUTH_TEMPLATES: TruthTemplate[] = [
  { axis: "introvert_vs_extrovert", negative: "一人の時間が充電方法。弱さじゃなく、あなたのエネルギー源。", positive: "人といることでエネルギーが生まれる。孤独は充電切れのサイン。" },
  { axis: "individual_vs_social", negative: "自分の考えを深めることに価値を置く。群れるより、一人で掘る。", positive: "みんなで広げることに価値を置く。一人より、チームの方が遠くへ行ける。" },
  { axis: "cautious_vs_bold", negative: "見えない危険を察知するセンサーが強い。予測の解像度が高い。", positive: "不確実性をエネルギーに変える。やってみないとわからない。" },
  { axis: "analytical_vs_intuitive", negative: "決断する前に退路を確保する。安心して進みたいだけ。", positive: "直感が先に動く。理由は後から見つかる。" },
  { axis: "plan_vs_spontaneous", negative: "未来を先に体験する。計画を立てることで、明日を生きてる。", positive: "今この瞬間に全力。計画は退屈。目の前に没頭するのが自然。" },
  { axis: "emotional_variability", negative: "感情は深い湖のように静か。波は小さいが、下には見えない流れ。", positive: "感情は天気のように移り変わる。感じる力が強い。" },
  { axis: "emotional_regulation", negative: "表に出さない感情の貯水池がある。制御してるように見えて、実は感じないようにしてる時がある。", positive: "感情を隠さない。でも出すことを選んでいる。" },
  { axis: "independence_vs_harmony", negative: "自分の道を歩くことに価値を置く。自分を曲げるのが嫌。", positive: "場の調和を身体で感じる。誰かの不快が自分の不快になる。" },
  { axis: "boundary_awareness", negative: "人との距離を自然に調整できる。でもその壁が冷たさに見えないか気にしてる。", positive: "人の領域に入るのが得意。でも時々入りすぎて驚かせる。" },
  { axis: "stress_isolation_vs_social", negative: "辛い時に一人になりたがる。自分で処理したい。でもそれが孤独を生むことがある。", positive: "辛い時こそ人を求める。話すことで整理される。" },
  { axis: "intimacy_pace", negative: "関係をゆっくり深めたい。急に距離を詰められると息苦しい。信頼を大事にしている。", positive: "出会った瞬間から深く入りたい。表面的な会話より本音が楽。" },
  { axis: "reassurance_need", negative: "自分の中に答えを持っている。他人の承認がなくても確信できる。", positive: "大切な人の「大丈夫だよ」が想像以上に大きい。つながりの形。" },
  { axis: "change_embrace_vs_resist", negative: "変化の前に「本当に必要か」を問う。大切なものを守りたいだけ。", positive: "変化を待てない。今のままでいることの方がリスクに感じる。" },
  { axis: "direct_vs_diplomatic", negative: "思ったことをそのまま言う。遠回しが苦手なんじゃない、嘘が嫌なだけ。", positive: "言葉を選んでから話す。相手の気持ちを先に考える。" },
  { axis: "attachment_style", negative: "距離があっても安心できる。でも本当に大事な人が離れる時だけ、静かに傷つく。", positive: "近くにいることで安心する。離れると不安が静かに育つ。" },
  { axis: "rumination_tendency", negative: "考えすぎることはない。起きたことを受け入れて次に進む。", positive: "過去の出来事を何度も思い返す。あの時こうしていれば、という声が消えない。" },
  { axis: "growth_mindset", negative: "自分の強みを知っていて、それを磨く方が効率的だと考える。", positive: "できないことにこそ可能性を感じる。苦手を克服する過程が成長。" },
  { axis: "locus_of_control", negative: "環境や運の影響を正直に認める。コントロールできないものに抗わない。", positive: "結果は自分の行動次第だと信じている。運のせいにしない。" },
  { axis: "public_private_gap", negative: "表と裏の差が小さい。見せてる自分がほぼ本当の自分。", positive: "外に見せてる自分と、中にいる自分が違う。どちらも本当だけど。" },
  { axis: "fairness_sensitivity", negative: "世の中は完全に公平ではないと受け入れている。過剰に怒らない。", positive: "不公平に敏感。「それはおかしい」と感じたら、黙っていられない。" },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. ポートレート構築
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * beliefs から「3つの深い真実」を抽出
 *
 * 選出基準: |mu| × √precision が最大の軸
 * → 「確信を持って方向が分かる」軸 = 最も語れる真実
 */
function extractDeepTruths(beliefs: BeliefSet, maxCount: number = 3): DeepTruth[] {
  const scored: { key: TraitAxisKey; strength: number; belief: AxisBelief }[] = [];

  for (const key of TRAIT_AXIS_KEYS) {
    const belief = beliefs[key];
    if (!belief || belief.precision <= 0.5) continue; // 初期精度のみ = 観測なし

    const strength = Math.abs(belief.mu) * Math.sqrt(belief.precision);
    scored.push({ key, strength, belief });
  }

  // 強度順にソート
  scored.sort((a, b) => b.strength - a.strength);

  // 同じカテゴリから連続しないようにする
  const selected: DeepTruth[] = [];
  const usedCategories = new Set<string>();

  for (const item of scored) {
    if (selected.length >= maxCount) break;

    const axisDef = TRAIT_AXES.find((a) => a.id === item.key);
    const category = axisDef?.category ?? "core";

    // 最初の2つは同カテゴリ不可。3つ目は緩和
    if (selected.length < 2 && usedCategories.has(category)) continue;

    const direction: "positive" | "negative" = item.belief.mu >= 0 ? "positive" : "negative";
    const template = TRUTH_TEMPLATES.find((t) => t.axis === item.key);

    const text = template
      ? (direction === "positive" ? template.positive : template.negative)
      : `${axisDef?.labelLeft ?? ""}と${axisDef?.labelRight ?? ""}の間で、あなたには明確な傾向がある。`;

    selected.push({
      text,
      axisId: item.key,
      confidence: item.belief.confidence,
      direction,
      score: item.belief.mu,
    });

    usedCategories.add(category);
  }

  return selected;
}

/**
 * まだ見えていない領域を特定
 *
 * カテゴリごとに平均precisionを計算し、
 * 低いカテゴリを「未探索領域」として返す
 */
function findUnseenAreas(beliefs: BeliefSet): UnseenArea[] {
  const CATEGORY_LABELS: Record<AxisCategory, string> = {
    core: "基本傾向",
    relational: "対人パターン",
    motion: "行動特性",
    aesthetic: "美意識",
    emotional: "感情の動き",
    safety: "安全感覚",
    relational_deep: "深い関係性",
    depth: "深層心理",
    cognitive: "認知スタイル",
    expansion: "拡張観測",
  };

  const categoryStats = new Map<AxisCategory, { totalPrec: number; count: number }>();

  for (const key of TRAIT_AXIS_KEYS) {
    const axisDef = TRAIT_AXES.find((a) => a.id === key);
    if (!axisDef) continue;

    const belief = beliefs[key];
    const precision = belief?.precision ?? 0.5;
    const category = axisDef.category;

    const stats = categoryStats.get(category) ?? { totalPrec: 0, count: 0 };
    stats.totalPrec += precision;
    stats.count++;
    categoryStats.set(category, stats);
  }

  const areas: UnseenArea[] = [];
  for (const [category, stats] of categoryStats) {
    const avgPrecision = stats.totalPrec / stats.count;
    // precision < 2.0 = まだほぼ未知（4-5回の観測で2.0程度）
    if (avgPrecision < 2.0) {
      areas.push({
        label: CATEGORY_LABELS[category] ?? category,
        category,
        avgPrecision,
      });
    }
  }

  // 最も未知な領域から順に
  areas.sort((a, b) => a.avgPrecision - b.avgPrecision);

  return areas.slice(0, 3); // 最大3つ
}

/**
 * ポートレート全体を構築
 */
export function buildPortrait(
  axisScores: Partial<Record<TraitAxisKey, number>>,
  beliefs: BeliefSet | null,
): Portrait {
  // アーキタイプ判定
  let archetype: Portrait["archetype"] = null;
  let archetypeConfidence = 0;

  if (Object.keys(axisScores).length >= 5) {
    const result = beliefs
      ? resolveArchetypeWithUncertainty(axisScores, beliefs)
      : resolveArchetype(axisScores);

    const def = getArchetypeByCode(result.code);
    if (def) {
      archetype = {
        code: result.code,
        name: def.name,
        emoji: def.emoji,
        tagline: def.tagline,
      };
    }
    archetypeConfidence = result.confidence;
  }

  // 真実の抽出
  const truths = beliefs ? extractDeepTruths(beliefs) : [];

  // 未探索領域
  const unseenAreas = beliefs ? findUnseenAreas(beliefs) : [];

  // 同期率
  const syncPercentage = beliefs ? computeSyncPercentage(beliefs) : 0;

  return {
    archetype,
    truths,
    unseenAreas,
    syncPercentage,
    archetypeConfidence,
  };
}
