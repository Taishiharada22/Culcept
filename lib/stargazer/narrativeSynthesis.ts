/**
 * narrativeSynthesis.ts
 *
 * Synthesizes scattered observation data (contradiction, temporal shift, blind spot,
 * prophecy accuracy, convergent insight) into a single readable narrative —
 * the "aha moment" card displayed on the home screen.
 */

/* ── Types ── */

export interface NarrativeSynthesisInput {
  convergentInsight: { todayInsight?: { unifiedInsight?: string } } | null;
  temporalMirror: {
    delta?: {
      deltaNarrative?: string;
      biggestMove?: { axisName?: string; delta?: number };
    };
  } | null;
  blindSpot: { message?: string; isNew?: boolean } | null;
  prophecyAccuracy: number;
  prophecyAccuracyPrevWeek: number | null;
  coreValue: string | null;
  dilemma: string | null;
  observationCount: number;
  streakDays: number;
}

export interface NarrativeSynthesisResult {
  /** Main narrative text (2-4 lines, Japanese) */
  narrative: string;
  /** Whether this is a "new" insight not shown today */
  isNew: boolean;
  /** Source signals that contributed */
  sources: (
    | "contradiction"
    | "temporal"
    | "blindspot"
    | "prophecy"
    | "pattern"
  )[];
  /** Emotional weight (affects animation intensity) */
  weight: "light" | "medium" | "heavy";
}

/* ── Constants ── */

const STORAGE_KEY = "aneurasync_narrative_synthesis_v1";

/** Threshold: prophecy accuracy must drop by at least this much to trigger */
const PROPHECY_DROP_THRESHOLD = 0.08;

/* ── Helpers ── */

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function wasShownToday(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return false;
    const parsed = JSON.parse(stored);
    return parsed.date === todayDateStr();
  } catch {
    return false;
  }
}

export function markShownToday(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ date: todayDateStr() }),
    );
  } catch {
    // localStorage unavailable — silently ignore
  }
}

/* ── Core synthesis ── */

export function synthesizeNarrative(
  input: NarrativeSynthesisInput,
): NarrativeSynthesisResult {
  const {
    convergentInsight,
    temporalMirror,
    blindSpot,
    prophecyAccuracy,
    prophecyAccuracyPrevWeek,
    coreValue,
    dilemma,
  } = input;

  const isNew = !wasShownToday();

  // Priority 1: Contradiction + core value mismatch
  if (dilemma && coreValue) {
    return {
      narrative:
        `「${coreValue}」を大事にしているのに、${dilemma}を選ぶ傾向がある。\n` +
        "この矛盾は弱さではなく、あなたの中の複数の声が同時に語っている証拠かもしれない。",
      isNew,
      sources: ["contradiction", "pattern"],
      weight: "heavy",
    };
  }

  // Priority 2: Prediction accuracy drop
  if (
    prophecyAccuracyPrevWeek !== null &&
    prophecyAccuracyPrevWeek - prophecyAccuracy >= PROPHECY_DROP_THRESHOLD
  ) {
    const dropPct = Math.round(
      (prophecyAccuracyPrevWeek - prophecyAccuracy) * 100,
    );
    return {
      narrative:
        `予言の的中率が ${dropPct}% 下がった。\n` +
        "予測できない変化があなたの中で起きている。\n" +
        "それは成長の兆しかもしれない。",
      isNew,
      sources: ["prophecy"],
      weight: "heavy",
    };
  }

  // Priority 3: Temporal shift (biggest axis move)
  const biggestMove = temporalMirror?.delta?.biggestMove;
  if (biggestMove?.axisName && biggestMove.delta != null && Math.abs(biggestMove.delta) >= 5) {
    const direction = biggestMove.delta > 0 ? "上昇" : "低下";
    const deltaNarrative = temporalMirror?.delta?.deltaNarrative;
    return {
      narrative:
        `先週と比べて「${biggestMove.axisName}」軸が大きく${direction}した。\n` +
        (deltaNarrative ?? "あなたの内面の地形が動いている。"),
      isNew,
      sources: ["temporal"],
      weight: "medium",
    };
  }

  // Priority 4: Blind spot (new)
  if (blindSpot?.message && blindSpot.isNew) {
    return {
      narrative: blindSpot.message,
      isNew,
      sources: ["blindspot"],
      weight: "medium",
    };
  }

  // Priority 5: Convergent insight
  const unified = convergentInsight?.todayInsight?.unifiedInsight;
  if (unified) {
    return {
      narrative: unified,
      isNew,
      sources: ["pattern"],
      weight: "medium",
    };
  }

  // Priority 6: Default calm mirror
  return {
    narrative:
      "今のあなたは穏やかな状態にある。\n" +
      "急いで答えを出す必要はない。静かに観ていこう。",
    isNew,
    sources: [],
    weight: "light",
  };
}
