/**
 * genomeTension.ts — ストランド間テンション計算
 *
 * 4本のDNA鎖(physical/personality/behavioral/social)間の
 * 矛盾(テンション)と共鳴(ハーモニー)を検出する純関数。
 */

/* ─── Types ─── */

export interface StrandTension {
  fromStrand: string;
  fromBasePairId: string;
  fromLabel: string;
  toStrand: string;
  toBasePairId: string;
  toLabel: string;
  /** Negative = tension/clash, Positive = harmony/resonance */
  tensionScore: number;
  label: string;
}

export interface TensionMapData {
  tensions: StrandTension[];
  overallHarmony: number; // 0-100
  topClashes: StrandTension[];
  topHarmonies: StrandTension[];
}

/* ─── Tension Rules ─── */

interface TensionRule {
  fromStrand: string;
  fromBpPattern: string;   // substring match on basePair id
  fromCondition: (value: number) => boolean;
  toStrand: string;
  toBpPattern: string;
  toCondition: (value: number) => boolean;
  tensionScore: number;     // negative = clash, positive = harmony
  label: string;
}

const RULES: TensionRule[] = [
  // personality "品質重視" + behavioral "低save_rate" = テンション（言行不一致）
  {
    fromStrand: "personality", fromBpPattern: "quality",
    fromCondition: (v) => v < 0.4, // quality-leaning
    toStrand: "behavioral", toBpPattern: "save_rate",
    toCondition: (v) => v < 0.3,
    tensionScore: -0.7,
    label: "品質を重視するのに保存率が低い — 理想と行動のギャップ",
  },
  // personality "ミニマル" + behavioral "color" high saturation
  {
    fromStrand: "personality", fromBpPattern: "minimal",
    fromCondition: (v) => v < 0.4, // minimal-leaning
    toStrand: "behavioral", toBpPattern: "color",
    toCondition: (v) => v > 0.6,
    tensionScore: -0.5,
    label: "ミニマルな性格だが派手なカラーを好む — 隠れた表現欲",
  },
  // personality "大胆" + behavioral "like_rate低" = テンション
  {
    fromStrand: "personality", fromBpPattern: "bold",
    fromCondition: (v) => v > 0.6,
    toStrand: "behavioral", toBpPattern: "like_rate",
    toCondition: (v) => v < 0.3,
    tensionScore: -0.4,
    label: "大胆な性格だが選択は慎重 — 選り好みの強さ",
  },
  // physical "warm color" + behavioral "dark color" = テンション
  {
    fromStrand: "physical", fromBpPattern: "pc_warm",
    fromCondition: (v) => v > 0.6,
    toStrand: "behavioral", toBpPattern: "color",
    toCondition: (v) => v < 0.35,
    tensionScore: -0.35,
    label: "暖色が似合うのにダーク系を好む — 似合う色と好みの乖離",
  },
  // social "high fit" + personality "introvert" = 興味深いテンション
  {
    fromStrand: "social", fromBpPattern: "fit_score",
    fromCondition: (v) => v > 0.6,
    toStrand: "personality", toBpPattern: "introvert",
    toCondition: (v) => v < 0.4,
    tensionScore: -0.3,
    label: "社会的フィットが高いのに内向的 — 適応力の高い内向型",
  },
  // personality "quality" + behavioral "like_rate high" = 共鳴
  {
    fromStrand: "personality", fromBpPattern: "quality",
    fromCondition: (v) => v < 0.4,
    toStrand: "behavioral", toBpPattern: "like_rate",
    toCondition: (v) => v < 0.5,
    tensionScore: 0.6,
    label: "品質重視と厳選的なライク — 一貫した審美眼",
  },
  // physical "eye" + personality "analytical" = 共鳴
  {
    fromStrand: "physical", fromBpPattern: "eye",
    fromCondition: (v) => v > 0.5,
    toStrand: "personality", toBpPattern: "analytical",
    toCondition: (v) => v > 0.4,
    tensionScore: 0.45,
    label: "鋭い目元と分析的な性格 — 観察者としての一体感",
  },
  // behavioral "silhouette relaxed" + personality "introvert" = 共鳴
  {
    fromStrand: "behavioral", fromBpPattern: "silhouette",
    fromCondition: (v) => v > 0.5,
    toStrand: "personality", toBpPattern: "introvert",
    toCondition: (v) => v < 0.45,
    tensionScore: 0.4,
    label: "リラックスなシルエットと内向的な性格 — 自然体の共鳴",
  },
  // personality "introvert" + social "high match volume" = テンション
  {
    fromStrand: "personality", fromBpPattern: "introvert",
    fromCondition: (v) => v < 0.35, // introvert-leaning
    toStrand: "social", toBpPattern: "match_volume",
    toCondition: (v) => v > 0.6,
    tensionScore: -0.5,
    label: "内向的な性格なのに活発な社会的つながり — 質を重視するタイプかもしれません",
  },
  // behavioral "high like_rate" + personality "minimal" = テンション
  {
    fromStrand: "behavioral", fromBpPattern: "like_rate",
    fromCondition: (v) => v > 0.5,
    toStrand: "personality", toBpPattern: "minimal",
    toCondition: (v) => v < 0.35, // minimal-leaning
    tensionScore: -0.4,
    label: "ミニマル志向なのにいいね率が高い — 選り好みしない寛容さがあります",
  },
  // physical "warm PC" + behavioral "dark color preference" = 共鳴
  {
    fromStrand: "physical", fromBpPattern: "pc_warm",
    fromCondition: (v) => v > 0.6,
    toStrand: "behavioral", toBpPattern: "color",
    toCondition: (v) => v < 0.35,
    tensionScore: 0.35,
    label: "温かみのあるパーソナルカラーとダーク系の嗜好 — 落ち着きと温かさの共存",
  },
  // personality "bold" + behavioral "low purchase intent" = テンション
  {
    fromStrand: "personality", fromBpPattern: "bold",
    fromCondition: (v) => v > 0.65,
    toStrand: "behavioral", toBpPattern: "purchase_intent",
    toCondition: (v) => v < 0.1,
    tensionScore: -0.55,
    label: "大胆な性格なのに購買行動は慎重 — 判断と行動にギャップがあります",
  },
];

/* ─── Computation ─── */

/**
 * Compute tensions/harmonies between strands.
 */
export function computeTensionMap(
  strands: Array<{
    id: string;
    basePairs: Array<{ id: string; label: string; value: number; confidence: number }>;
  }>,
): TensionMapData {
  const strandMap = new Map(strands.map((s) => [s.id, s]));
  const tensions: StrandTension[] = [];

  for (const rule of RULES) {
    const fromStrand = strandMap.get(rule.fromStrand);
    const toStrand = strandMap.get(rule.toStrand);
    if (!fromStrand || !toStrand) continue;

    const fromBp = fromStrand.basePairs.find((bp) =>
      bp.id.includes(rule.fromBpPattern),
    );
    const toBp = toStrand.basePairs.find((bp) =>
      bp.id.includes(rule.toBpPattern),
    );
    if (!fromBp || !toBp) continue;

    // Check conditions
    if (rule.fromCondition(fromBp.value) && rule.toCondition(toBp.value)) {
      // Weight by confidence
      const confWeight =
        Math.min(fromBp.confidence, toBp.confidence);
      if (confWeight < 0.3) continue; // skip low-confidence detections

      tensions.push({
        fromStrand: rule.fromStrand,
        fromBasePairId: fromBp.id,
        fromLabel: fromBp.label,
        toStrand: rule.toStrand,
        toBasePairId: toBp.id,
        toLabel: toBp.label,
        tensionScore: rule.tensionScore * confWeight,
        label: rule.label,
      });
    }
  }

  // Sort: clashes first (most negative), then harmonies (most positive)
  const clashes = tensions
    .filter((t) => t.tensionScore < 0)
    .sort((a, b) => a.tensionScore - b.tensionScore);
  const harmonies = tensions
    .filter((t) => t.tensionScore > 0)
    .sort((a, b) => b.tensionScore - a.tensionScore);

  // Overall harmony: 0 (all clashes) to 100 (all harmonies)
  const totalAbs = tensions.reduce((s, t) => s + Math.abs(t.tensionScore), 0);
  const harmonySum = harmonies.reduce((s, t) => s + t.tensionScore, 0);
  const overallHarmony =
    totalAbs > 0 ? Math.round((harmonySum / totalAbs) * 100) : 50;

  return {
    tensions,
    overallHarmony: Math.max(0, Math.min(100, 50 + overallHarmony)),
    topClashes: clashes.slice(0, 3),
    topHarmonies: harmonies.slice(0, 3),
  };
}
