/**
 * genomeExpression.ts — 遺伝子発現エンジン
 *
 * 状況（気分/季節/時間帯/疲労度）によって各塩基対の活性/休眠状態を計算。
 * 純関数 — 副作用なし、クライアントサイドで完結。
 */

/* ─── Types ─── */

export interface GeneExpressionContext {
  mood: number;           // 1-5 (daily observation)
  selfMatch: number;      // 1-5 (daily observation)
  season: "spring" | "summer" | "autumn" | "winter";
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
  fatigueTrend: number;   // 0-1 (derived from recent mood average)
  socialFatigue: number;  // 0-1 (derived from interpersonal scores)
}

export interface GeneActivation {
  basePairId: string;
  activationLevel: number; // 0.0 (dormant) to 1.0 (fully expressed)
  reason: string;
}

/* ─── Context Derivation ─── */

/** Derive current season from Date */
export function deriveSeason(date: Date = new Date()): GeneExpressionContext["season"] {
  const month = date.getMonth(); // 0-indexed
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "winter";
}

/** Derive time of day from Date */
export function deriveTimeOfDay(date: Date = new Date()): GeneExpressionContext["timeOfDay"] {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

/** Build default context from Date + optional observation scores */
export function buildExpressionContext(
  opts?: Partial<GeneExpressionContext>,
): GeneExpressionContext {
  const now = new Date();
  return {
    mood: opts?.mood ?? 3,
    selfMatch: opts?.selfMatch ?? 3,
    season: opts?.season ?? deriveSeason(now),
    timeOfDay: opts?.timeOfDay ?? deriveTimeOfDay(now),
    fatigueTrend: opts?.fatigueTrend ?? 0.3,
    socialFatigue: opts?.socialFatigue ?? 0.3,
  };
}

/* ─── Activation Rules ─── */

/**
 * Strand-level activation multiplier.
 * Each strand responds differently to context signals.
 */
function strandActivation(strandId: string, ctx: GeneExpressionContext): number {
  switch (strandId) {
    case "physical": {
      // Physical genes are most expressed when mood is good + season aligns
      const moodFactor = Math.min(1, (ctx.mood - 1) / 4); // 0-1
      const seasonBoost =
        ctx.season === "spring" || ctx.season === "autumn" ? 0.15 : 0;
      const timeFactor = ctx.timeOfDay === "morning" ? 0.1 : 0;
      return clamp(0.3 + moodFactor * 0.5 + seasonBoost + timeFactor);
    }

    case "personality": {
      // Personality genes are strongest when selfMatch is high
      const selfFactor = Math.min(1, (ctx.selfMatch - 1) / 4);
      const fatigueDown = ctx.fatigueTrend * 0.2;
      return clamp(0.35 + selfFactor * 0.5 - fatigueDown);
    }

    case "behavioral": {
      // Behavioral genes are always partially active (recent actions)
      const baseLine = 0.5;
      const moodMod = ((ctx.mood - 3) / 4) * 0.2;
      const timeMod = ctx.timeOfDay === "evening" ? 0.1 : ctx.timeOfDay === "night" ? -0.1 : 0;
      return clamp(baseLine + moodMod + timeMod);
    }

    case "social": {
      // Social genes are suppressed by social fatigue
      const baseLine = 0.55;
      const fatigueDown = ctx.socialFatigue * 0.4;
      const peopleMod = ctx.timeOfDay === "afternoon" || ctx.timeOfDay === "evening" ? 0.1 : 0;
      return clamp(baseLine - fatigueDown + peopleMod);
    }

    default:
      return 0.5;
  }
}

/**
 * Compute activation levels for all base pairs in a genome visualization.
 */
export function computeActivations(
  strands: Array<{ id: string; basePairs: Array<{ id: string; confidence: number; value: number }> }>,
  ctx: GeneExpressionContext,
): GeneActivation[] {
  const activations: GeneActivation[] = [];

  for (const strand of strands) {
    const strandLevel = strandActivation(strand.id, ctx);

    for (const bp of strand.basePairs) {
      // High confidence base pairs are more readily expressed
      const confidenceBoost = bp.confidence * 0.2;
      // Value extremes (far from 0.5) are more expressible
      const valueExtremeBoost = Math.abs(bp.value - 0.5) * 0.15;
      // Dark genes (low confidence) are naturally dormant
      const darkPenalty = bp.confidence < 0.3 ? -0.3 : 0;

      const level = clamp(strandLevel + confidenceBoost + valueExtremeBoost + darkPenalty);

      const reasons: string[] = [];
      if (level > 0.7) reasons.push("高発現");
      else if (level > 0.4) reasons.push("部分発現");
      else reasons.push("休眠中");

      if (ctx.mood >= 4) reasons.push("好調");
      if (ctx.socialFatigue > 0.6 && strand.id === "social") reasons.push("社交疲労");
      if (bp.confidence < 0.3) reasons.push("暗黒遺伝子");

      activations.push({
        basePairId: bp.id,
        activationLevel: level,
        reason: reasons.join(" / "),
      });
    }
  }

  return activations;
}

/* ─── Utils ─── */

function clamp(n: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, n));
}
