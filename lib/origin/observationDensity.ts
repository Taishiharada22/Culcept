// lib/origin/observationDensity.ts
// 観測密度スコア — Origin の応答深度を連続的に変化させるコアエンジン
// 段階的アンロックではなく、データ蓄積に応じて連続的に深くなる設計

import type { DailyOrbitStore } from "./dailyOrbit/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ObservationDensity = {
  /** 総合スコア (0-100) — AI応答の深度を決定 */
  score: number;
  /** 応答深度レベル（UIには見せない内部指標） */
  depthLevel: "surface" | "emerging" | "contextual" | "deep";
  /** 各ソースの寄与 */
  breakdown: {
    /** 直近7日のOrigin記録数 (0-7) */
    recentEntries: number;
    /** DailyOrbit で使用された層の種類数 (0-11) */
    layerVariety: number;
    /** Stargazer 完了軸数 (0-39) */
    stargazerAxes: number;
    /** Stargazer 矛盾検出軸数 */
    contradictionAxes: number;
    /** 累計記録日数 */
    totalDays: number;
  };
};

/** Stargazer から受け取る最小データ */
export type StargazerDensityInput = {
  observedAxisCount: number;
  contradictionAxisCount: number;
  totalObservationCount: number;
};

// ---------------------------------------------------------------------------
// Core calculation
// ---------------------------------------------------------------------------

/**
 * 観測密度スコアを算出する。
 * - 段階をユーザーに見せない。内部で応答深度を連続的に制御する
 * - Stargazer データがなくても動作する（スコアが低いだけ）
 */
export function calculateObservationDensity(
  orbitStore: DailyOrbitStore | null,
  stargazerInput: StargazerDensityInput | null,
): ObservationDensity {
  const now = new Date();
  const today = toDateKey(now);

  // --- Origin 側の密度 ---
  let recentEntries = 0;
  let layerVariety = 0;
  let totalDays = 0;

  if (orbitStore) {
    const entries = orbitStore.entries ?? {};
    totalDays = Object.keys(entries).length;

    // 直近7日の記録数
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = toDateKey(d);
      if (entries[key] && entries[key].tasks.length > 0) {
        recentEntries++;
      }
    }

    // 直近7日で使用された層の種類数
    const usedLayers = new Set<string>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = toDateKey(d);
      const entry = entries[key];
      if (!entry) continue;
      if (entry.tasks.length > 0) usedLayers.add("tasks");
      if (entry.bodyEcho) usedLayers.add("bodyEcho");
      if (entry.dayState) usedLayers.add("dayState");
      if (entry.shadowIntention) usedLayers.add("shadowIntention");
      if (entry.temporalDialogue?.response) usedLayers.add("temporalDialogue");
      if (entry.timeTexture != null) usedLayers.add("timeTexture");
      if (entry.reflection) usedLayers.add("reflection");
      if (entry.selfForecast) usedLayers.add("selfForecast");
      if (entry.userPrediction != null) usedLayers.add("userPrediction");
    }
    layerVariety = usedLayers.size;
  }

  // --- Stargazer 側の密度 ---
  const stargazerAxes = stargazerInput?.observedAxisCount ?? 0;
  const contradictionAxes = stargazerInput?.contradictionAxisCount ?? 0;

  // --- 重み付けスコア算出 ---
  // 各要素を 0-1 に正規化して重み付け
  const recentScore = Math.min(recentEntries / 5, 1);        // 5日以上 = 満点
  const layerScore = Math.min(layerVariety / 6, 1);           // 6層以上 = 満点
  const stargazerScore = Math.min(stargazerAxes / 15, 1);     // 15軸以上 = 満点
  const contradictionScore = Math.min(contradictionAxes / 3, 1); // 3軸以上 = 満点
  const totalDaysScore = Math.min(totalDays / 30, 1);         // 30日以上 = 満点

  const score = Math.round(
    (recentScore * 25 +         // 直近の活動頻度
     layerScore * 15 +          // 観測の多様性
     stargazerScore * 30 +      // Stargazer 深度（最重要）
     contradictionScore * 15 +  // 矛盾検出（深い洞察の材料）
     totalDaysScore * 15)       // 長期の蓄積
  );

  // --- 深度レベル判定 ---
  let depthLevel: ObservationDensity["depthLevel"];
  if (score >= 70) depthLevel = "deep";
  else if (score >= 40) depthLevel = "contextual";
  else if (score >= 15) depthLevel = "emerging";
  else depthLevel = "surface";

  return {
    score,
    depthLevel,
    breakdown: {
      recentEntries,
      layerVariety,
      stargazerAxes,
      contradictionAxes,
      totalDays,
    },
  };
}

// ---------------------------------------------------------------------------
// 深度に応じた応答テンプレート選択
// ---------------------------------------------------------------------------

export type DepthResponse = {
  acknowledgment: string;
  insight: string | null;
  nextPrompt: string | null;
};

/**
 * 観測密度に応じて応答の深さを変える。
 * - surface: 記録の確認のみ
 * - emerging: 軽い観察
 * - contextual: Stargazer 連動の文脈付き観察
 * - deep: パターン + 問いかけ
 */
export function selectDepthResponse(
  density: ObservationDensity,
  context: {
    judgmentCategory: string;
    categoryLabel: string;
    stargazerTopAxes?: { key: string; label: string; score: number }[];
    recentPatterns?: { pattern: string; frequency: string }[];
  },
): DepthResponse {
  const { depthLevel } = density;
  const { categoryLabel, stargazerTopAxes, recentPatterns } = context;

  switch (depthLevel) {
    case "surface":
      return {
        acknowledgment: `${categoryLabel}にエネルギーを使った日として記録しました`,
        insight: null,
        nextPrompt: "観測を続けると、あなたのパターンが見え始めます",
      };

    case "emerging":
      return {
        acknowledgment: `${categoryLabel}にエネルギーを使った日ですね`,
        insight: density.breakdown.totalDays >= 3
          ? "まだ観測が浅いですが、記録が増えるほど、あなたの傾向が見え始めます"
          : null,
        nextPrompt: `あと${Math.max(7 - density.breakdown.totalDays, 1)}日ほどで、最初のパターンが現れるかもしれません`,
      };

    case "contextual": {
      const axisHint = stargazerTopAxes?.[0];
      return {
        acknowledgment: `${categoryLabel}にエネルギーが集中した日ですね`,
        insight: axisHint
          ? `Stargazerの観測では、あなたは「${axisHint.label}」の傾向があります。今日の場面とどう関係していたか、気になりませんか？`
          : `${categoryLabel}に関する記録が蓄積され始めています`,
        nextPrompt: null,
      };
    }

    case "deep": {
      const pattern = recentPatterns?.[0];
      const axisHint = stargazerTopAxes?.[0];
      return {
        acknowledgment: `${categoryLabel}の日ですね`,
        insight: pattern
          ? `${pattern.pattern}（${pattern.frequency}）`
          : axisHint
          ? `あなたの「${axisHint.label}」の傾向が、${categoryLabel}の場面でどう現れるか — 興味深い観測ポイントです`
          : `${categoryLabel}に関する蓄積が十分になってきました`,
        nextPrompt: pattern
          ? "この傾向に心当たりはありますか？"
          : null,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
