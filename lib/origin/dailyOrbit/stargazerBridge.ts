// lib/origin/dailyOrbit/stargazerBridge.ts
// Origin 法則 × Stargazer 軸 の接続インサイト生成
// CEO ガード: 断定しない。柔らかい文体。「矛盾」→「差」「二面性」「状況差」

import type { OrbitLaw } from "./types";
import type { LawType } from "./behavioralLawEngine";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import { AXIS_LABELS } from "@/lib/stargazer/axisLabels";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BridgeDirection = "confirms" | "nuances" | "diverges";

export type BridgeInsight = {
  id: string;
  direction: BridgeDirection;
  text: string; // 日本語、柔らかい文体
  lawId: string;
  axisKey: TraitAxisKey;
  confidence: number; // 0-1
};

// ---------------------------------------------------------------------------
// Axis mapping: Origin法則カテゴリ → 関連 Stargazer軸
// ---------------------------------------------------------------------------

type AxisMapping = {
  axes: TraitAxisKey[];
  // score direction that "aligns" with positive Origin observation
  // e.g. high completion on low-energy days aligns with high locus_of_control
  alignDirection: number; // +1 or -1 per axis
};

const LAW_AXIS_MAP: Record<string, AxisMapping[]> = {
  // Energy × completion
  energy_behavior: [
    { axes: ["stress_isolation_vs_social"], alignDirection: 1 },
    { axes: ["emotional_regulation"], alignDirection: 1 },
    { axes: ["locus_of_control"], alignDirection: -1 },
  ],
  // Task nature patterns
  nature_pattern: [
    { axes: ["function_vs_expression"], alignDirection: 1 },
    { axes: ["quality_vs_quantity"], alignDirection: -1 },
    { axes: ["plan_vs_spontaneous"], alignDirection: -1 },
  ],
  // Texture patterns
  texture_pattern: [
    { axes: ["perfectionist_vs_pragmatic"], alignDirection: 1 },
    { axes: ["growth_mindset"], alignDirection: -1 },
  ],
  // Body correlation
  body_correlation: [
    { axes: ["emotional_variability"], alignDirection: 1 },
    { axes: ["emotional_regulation"], alignDirection: 1 },
  ],
  // Time patterns
  time_pattern: [
    { axes: ["plan_vs_spontaneous"], alignDirection: -1 },
    { axes: ["decision_tempo"], alignDirection: 1 },
  ],
  // Shadow theme
  shadow_theme: [
    { axes: ["rumination_tendency"], alignDirection: 1 },
    { axes: ["shame_vs_guilt"], alignDirection: 1 },
    { axes: ["public_private_gap"], alignDirection: 1 },
  ],
  // Temporal self
  temporal_self: [
    { axes: ["change_embrace_vs_resist"], alignDirection: -1 },
    { axes: ["growth_mindset"], alignDirection: -1 },
  ],
  // Not-doing value
  not_doing_value: [
    { axes: ["cautious_vs_bold"], alignDirection: -1 },
    { axes: ["independence_vs_harmony"], alignDirection: -1 },
  ],
  // Contradiction (explicit cross-system)
  contradiction: [
    { axes: ["public_private_gap"], alignDirection: 1 },
    { axes: ["emotional_variability"], alignDirection: 1 },
  ],
};

// LawType → OrbitLaw.category bridge
const LAW_TYPE_TO_CATEGORY: Record<LawType, string> = {
  weather_completion: "energy_behavior",
  texture_next_day: "texture_pattern",
  emotion_next_day: "texture_pattern",
  carry_outcome: "nature_pattern",
  weekday_completion: "time_pattern",
  weekday_texture: "texture_pattern",
  weekly_rhythm: "time_pattern",
};

// ---------------------------------------------------------------------------
// Narrative templates — 柔らかい文体
// ---------------------------------------------------------------------------

function narrativeConfirms(lawText: string, axisLabel: string): string {
  const templates = [
    `${axisLabel}の傾向と重なるところがあるようです`,
    `Stargazerの観測とも近い方向を示しているかもしれません`,
    `${axisLabel}の特徴が、日々の行動にも現れている可能性があります`,
  ];
  return templates[hashStr(lawText) % templates.length];
}

function narrativeDiverges(lawText: string, axisLabel: string): string {
  const templates = [
    `${axisLabel}の自己申告と、実際の行動に差があるかもしれません。状況による切り替えの可能性もあります`,
    `Stargazerでは異なる傾向が見えています。二面性として現れているのかもしれません`,
    `自覚と行動のあいだに、状況差がある可能性があります`,
  ];
  return templates[hashStr(lawText) % templates.length];
}

function narrativeNuances(lawText: string, axisLabel: string): string {
  const templates = [
    `${axisLabel}が状況によって異なる形で現れているようです`,
    `一見シンプルな傾向の裏に、${axisLabel}の文脈依存性が見えるかもしれません`,
    `この行動パターンは、${axisLabel}の別の側面を映しているのかもしれません`,
  ];
  return templates[hashStr(lawText) % templates.length];
}

// Simple string hash for deterministic template selection
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

const MIN_CONFIDENCE = 0.7;
const MAX_INSIGHTS = 3;

export function generateStargazerBridgeInsights(
  laws: OrbitLaw[],
  axisScores: Partial<Record<TraitAxisKey, number>>,
): BridgeInsight[] {
  if (laws.length === 0 || Object.keys(axisScores).length === 0) return [];

  const candidates: BridgeInsight[] = [];

  for (const law of laws) {
    if (law.confidence < MIN_CONFIDENCE) continue;

    // Find mapping from law category
    const mappings = LAW_AXIS_MAP[law.category];
    if (!mappings) continue;

    for (const mapping of mappings) {
      for (const axisKey of mapping.axes) {
        const score = axisScores[axisKey];
        if (score == null) continue;

        const axisLabel = AXIS_LABELS[axisKey] ?? axisKey;
        const absScore = Math.abs(score);

        // Only generate insights for non-trivial axis scores
        if (absScore < 0.2) continue;

        // Determine direction
        const scoreAligned = Math.sign(score) === Math.sign(mapping.alignDirection);
        let direction: BridgeDirection;
        let text: string;

        if (scoreAligned && absScore > 0.4) {
          direction = "confirms";
          text = narrativeConfirms(law.text, axisLabel);
        } else if (!scoreAligned && absScore > 0.4) {
          direction = "diverges";
          text = narrativeDiverges(law.text, axisLabel);
        } else {
          direction = "nuances";
          text = narrativeNuances(law.text, axisLabel);
        }

        const confidence = Math.min(law.confidence, 0.5 + absScore * 0.5);

        candidates.push({
          id: `bridge_${law.id}_${axisKey}`,
          direction,
          text,
          lawId: law.id,
          axisKey,
          confidence,
        });
      }
    }
  }

  // Sort by confidence, take top N
  candidates.sort((a, b) => b.confidence - a.confidence);

  // Deduplicate by axisKey (show at most 1 per axis)
  const seen = new Set<string>();
  const results: BridgeInsight[] = [];
  for (const c of candidates) {
    if (seen.has(c.axisKey)) continue;
    seen.add(c.axisKey);
    results.push(c);
    if (results.length >= MAX_INSIGHTS) break;
  }

  return results;
}

/** LawType → category 変換ヘルパー (LawLibrary等で利用) */
export function lawTypeToCategory(type: LawType): string {
  return LAW_TYPE_TO_CATEGORY[type] ?? "nature_pattern";
}
