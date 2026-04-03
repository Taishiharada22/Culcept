/**
 * 第3層: Genome連携 — データ契約 + 内部スコアリング + 限定発火
 *
 * CEO指示: 全面公開ではなく、条件が揃った日だけ上乗せされる設計
 *
 * 発火条件（全てAND）:
 * 1. イベント型が date / party / friends のいずれか
 * 2. パートナーのGenomeデータが利用可能（completeness >= 40）
 * 3. 自分のGenomeデータも十分（completeness >= 40）
 * 4. スタイル相性スコアの confidence >= 0.6
 * 5. 第1層（practical）を一切邪魔しない
 */

import type { Insight, InsightType, InsightTier } from "./types";

/* ═══════════════════════════════════════════
   データ契約: Calendar が受け取る Genome 関連データ

   PersonaGenome 全体を渡さず、必要なフィールドだけ抽出する。
   assembleForUser → extractRelationshipContext で変換。
   ═══════════════════════════════════════════ */

/** パートナーのスタイル傾向（Calendar に必要な最小データ） */
export interface PartnerStyleContext {
  /** パーソナルカラーシーズン */
  pcSeason4: string | null;
  /** スタイル方向性（4軸） */
  styleAxis: {
    minimal_vs_maximal: number;
    classic_vs_trendy: number;
    cautious_vs_bold: number;
    function_vs_expression: number;
  };
  /** 好みの色温度 (-1: cool, +1: warm) */
  colorWarmth: number;
  /** 好みのシルエット (-1: tight, +1: oversize) */
  silhouetteAxis: number;
  /** Genome completeness (0-100) */
  completeness: number;
}

/** Genome連携コンテキスト（CalendarPageClient → insightEngine に渡す） */
export interface GenomeRelationshipContext {
  /** 自分のスタイル傾向 */
  self: PartnerStyleContext;
  /** パートナーのスタイル傾向（null = パートナー不在） */
  partner: PartnerStyleContext | null;
  /** 関係性タイプ（イベント型から推定） */
  relationshipHint: "romantic" | "social" | null;
}

/* ═══════════════════════════════════════════
   内部スコアリング: スタイル相性の計算
   ═══════════════════════════════════════════ */

/** 相性スコアの内訳 */
interface StyleCompatibility {
  /** PCカラー調和度 (0-1) */
  colorHarmony: number;
  /** スタイル軸の補完度 (0-1): 似すぎず離れすぎないのが良い */
  styleComplementarity: number;
  /** 総合スコア (0-1) */
  overall: number;
  /** 信頼度 (0-1) */
  confidence: number;
  /** テキスト生成用の特徴 */
  trait: StyleTrait;
}

type StyleTrait =
  | "color_harmony"        // PC季節が調和する
  | "style_complement"     // スタイル軸が補完的
  | "similar_taste"        // 似た趣味
  | "interesting_contrast" // 面白い対比
  | null;

/** PCシーズン間の調和マトリクス (0-1) */
const PC_HARMONY: Record<string, Record<string, number>> = {
  spring: { spring: 0.7, summer: 0.5, autumn: 0.9, winter: 0.4 },
  summer: { spring: 0.5, summer: 0.7, autumn: 0.4, winter: 0.8 },
  autumn: { spring: 0.9, summer: 0.4, autumn: 0.7, winter: 0.5 },
  winter: { spring: 0.4, summer: 0.8, autumn: 0.5, winter: 0.7 },
};

/** スタイル軸の距離 → 補完度を計算 */
function computeAxisComplementarity(selfAxis: number, partnerAxis: number): number {
  const diff = Math.abs(selfAxis - partnerAxis);
  // 適度な差（0.3-0.8）が最も補完的、同じすぎ or 真逆すぎは低い
  if (diff <= 0.3) return 0.5 + diff;   // 似ている: 0.5-0.8
  if (diff <= 0.8) return 0.9;           // 適度な差: 0.9（最高）
  return 1.2 - diff;                     // 離れすぎ: 0.4-0.2
}

/** Genome相性スコアを計算 */
function computeStyleCompatibility(
  self: PartnerStyleContext,
  partner: PartnerStyleContext,
): StyleCompatibility {
  // 1. PCカラー調和
  let colorHarmony = 0.5; // デフォルト
  if (self.pcSeason4 && partner.pcSeason4) {
    colorHarmony = PC_HARMONY[self.pcSeason4]?.[partner.pcSeason4] ?? 0.5;
  }

  // 2. スタイル軸補完度（4軸の平均）
  const axes = ["minimal_vs_maximal", "classic_vs_trendy", "cautious_vs_bold", "function_vs_expression"] as const;
  let axisSum = 0;
  for (const axis of axes) {
    axisSum += computeAxisComplementarity(
      self.styleAxis[axis],
      partner.styleAxis[axis],
    );
  }
  const styleComplementarity = axisSum / axes.length;

  // 3. 総合スコア（重み: カラー 40%, スタイル 60%）
  const overall = colorHarmony * 0.4 + styleComplementarity * 0.6;

  // 4. 信頼度（両者のcompletenessの幾何平均を基準）
  const confidence = Math.min(1,
    Math.sqrt((self.completeness / 80) * (partner.completeness / 80))
  );

  // 5. 特徴を判定
  let trait: StyleTrait = null;
  if (colorHarmony >= 0.8) trait = "color_harmony";
  else if (styleComplementarity >= 0.85) trait = "style_complement";
  else if (styleComplementarity <= 0.55) trait = "interesting_contrast";
  else if (overall >= 0.7) trait = "similar_taste";

  return { colorHarmony, styleComplementarity, overall, confidence, trait };
}

/* ═══════════════════════════════════════════
   限定発火: インサイト生成
   ═══════════════════════════════════════════ */

/** 発火対象のイベント型 */
const RELATIONSHIP_EVENT_TYPES = new Set(["date", "party", "friends"]);

/**
 * 特徴に応じたインサイトテキスト
 *
 * CEO指示: 「相手に合わせる」ではなく「相手を踏まえても自分らしさを保つ」表現にする
 * 主語は常に「あなた」。相手はあくまで背景情報。
 */
const TRAIT_TEXT: Record<NonNullable<StyleTrait>, { romantic: string; social: string }> = {
  color_harmony: {
    romantic: "あなたの色がそのまま映える日。自然体でいるだけで、隣の人との配色が調和します",
    social: "あなたらしい色選びが、場の空気ともちょうど調和する日",
  },
  style_complement: {
    romantic: "自分のスタイルを崩さなくても、相手との間にいいバランスが生まれる構成",
    social: "いつも通りのあなたで大丈夫。それが場の中でちょうどいいアクセントになる",
  },
  similar_taste: {
    romantic: "感性が近い相手だから、あなたらしさを出すほど自然とトーンが揃う",
    social: "好みが近い仲間との日。あなたの定番をそのまま出せる安心感",
  },
  interesting_contrast: {
    romantic: "スタイルが違うからこそ、あなたらしさがより際立つ日。いつも通りでいい",
    social: "個性がぶつかる場だからこそ、あなたの軸をそのまま出してみて",
  },
};

/**
 * Genome連携インサイトを生成（条件付き）
 *
 * 全条件を満たした時のみ Insight を返す。
 * 1つでも欠けたら null → 第1層に影響なし。
 */
export function generateGenomeRelationshipInsight(
  events: Array<{ event_type: string }>,
  genomeContext: GenomeRelationshipContext | null,
): Insight | null {
  // 条件1: コンテキスト自体が存在する
  if (!genomeContext) return null;

  // 条件2: パートナーのデータがある
  if (!genomeContext.partner) return null;

  // 条件3: イベント型が対象（date, party, friends）
  const hasRelEvent = events.some(e => RELATIONSHIP_EVENT_TYPES.has(e.event_type));
  if (!hasRelEvent) return null;

  // 条件4: 両者のcompleteness >= 40
  if (genomeContext.self.completeness < 40 || genomeContext.partner.completeness < 40) return null;

  // 条件5: 相性スコアを計算
  const compat = computeStyleCompatibility(genomeContext.self, genomeContext.partner);

  // 条件6: confidence >= 0.6
  if (compat.confidence < 0.6) return null;

  // 条件7: 特徴が判定できない場合は出さない（弱い根拠で出さない原則）
  if (!compat.trait) return null;

  // 関係性ヒントに応じたテキスト選択
  const hint = genomeContext.relationshipHint ?? "social";
  const textSet = TRAIT_TEXT[compat.trait];
  const text = hint === "romantic" ? textSet.romantic : textSet.social;

  // アイコン: romantic vs social
  const icon = hint === "romantic" ? "💫" : "🤝";

  return {
    type: "genome_relationship" as InsightType,
    tier: "impression" as InsightTier,  // impression層に上乗せ
    icon,
    label: hint === "romantic" ? "ふたりの相性" : "場の雰囲気",
    text,
    priority: 40, // impression層の中では控えめ（EVENT_IMPRESSIONのdate:62, friends:45より低い）
    confidence: compat.confidence,
  };
}

/* ═══════════════════════════════════════════
   ユーティリティ: PersonaGenome → PartnerStyleContext 変換

   CalendarPageClient 側で使用。
   PersonaGenome の全体構造に依存しないよう、
   extractCalendarProfile と同じパターンで軽量抽出。
   ═══════════════════════════════════════════ */

/**
 * PersonaGenome から PartnerStyleContext を抽出する
 * import は呼び出し側で行う（Calendar側の依存を最小化）
 */
export function extractPartnerStyleContext(
  genome: {
    physical?: { pcSeason4?: string | null } | null;
    personality?: {
      dimensions?: Array<{
        dimension: string;
        score: number;
        confidence: number;
      }> | null;
    } | null;
    behavioral?: {
      taste30d?: { colorAxis?: string; silhouetteAxis?: string } | null;
    } | null;
  } | null,
  completeness: number,
): PartnerStyleContext | null {
  if (!genome) return null;

  const dims = genome.personality?.dimensions ?? [];
  const dimMap = new Map(dims.map(d => [d.dimension, d.score]));

  const colorAxisMap: Record<string, number> = {
    dark: -0.5, low_sat: -0.2, neutral: 0, light: 0.2, high_sat: 0.5,
  };
  const silhouetteAxisMap: Record<string, number> = {
    tight: -1, neutral: 0, relaxed: 0.5, oversize: 1,
  };

  return {
    pcSeason4: genome.physical?.pcSeason4 ?? null,
    styleAxis: {
      minimal_vs_maximal: dimMap.get("minimal_vs_maximal") ?? 0,
      classic_vs_trendy: dimMap.get("classic_vs_trendy") ?? 0,
      cautious_vs_bold: dimMap.get("cautious_vs_bold") ?? 0,
      function_vs_expression: dimMap.get("function_vs_expression") ?? 0,
    },
    colorWarmth: colorAxisMap[genome.behavioral?.taste30d?.colorAxis ?? "neutral"] ?? 0,
    silhouetteAxis: silhouetteAxisMap[genome.behavioral?.taste30d?.silhouetteAxis ?? "neutral"] ?? 0,
    completeness,
  };
}
