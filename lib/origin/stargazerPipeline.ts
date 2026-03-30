// lib/origin/stargazerPipeline.ts
// Stargazer → Origin 最小データパイプライン
// Stargazer の上位軸スコア + 矛盾スコアを Origin で消費可能な形に変換

import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { StargazerDensityInput } from "./observationDensity";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Origin が消費する Stargazer サマリ */
export type StargazerOriginContext = {
  /** 観測密度計算用の最小入力 */
  density: StargazerDensityInput;
  /** スコア上位5軸（絶対値順） */
  topAxes: StargazerAxisSummary[];
  /** 矛盾が検出された軸 */
  contradictions: StargazerContradiction[];
  /** 全軸スコア（Bridge insight 生成用） */
  axisScores: Partial<Record<TraitAxisKey, number>>;
  /** データ取得時刻 */
  fetchedAt: string;
};

export type StargazerAxisSummary = {
  key: TraitAxisKey;
  label: string;
  score: number;       // -1 to +1
  confidence: number;  // 0 to 0.65
};

export type StargazerContradiction = {
  key: TraitAxisKey;
  label: string;
  poles: [number, number];
  strength: number;    // 0-1
};

// ---------------------------------------------------------------------------
// Client-side fetch
// ---------------------------------------------------------------------------

const CACHE_KEY = "origin_stargazer_ctx";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30分キャッシュ

/**
 * Stargazer Profile API からデータを取得し、Origin 用に整形する。
 * - 30分キャッシュ（localStorage）
 * - 失敗時は null を返す（Origin は Stargazer なしでも動く）
 */
export async function fetchStargazerContext(): Promise<StargazerOriginContext | null> {
  // キャッシュチェック
  if (typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as StargazerOriginContext;
        const age = Date.now() - new Date(parsed.fetchedAt).getTime();
        if (age < CACHE_TTL_MS) return parsed;
      }
    } catch { /* ignore */ }
  }

  try {
    const res = await fetch("/api/stargazer/profile", {
      credentials: "include",
    });
    if (!res.ok) return null;

    const data = await res.json();
    const ctx = transformProfileToContext(data);

    // キャッシュ保存
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(ctx));
      } catch { /* quota exceeded etc */ }
    }

    return ctx;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

function transformProfileToContext(profileData: Record<string, unknown>): StargazerOriginContext {
  const liveAxisScores = (profileData.liveAxisScores ?? {}) as Record<string, number>;
  const dimensionDetails = (profileData.dimensionDetails ?? []) as Array<{
    id: string;
    score: number;
    confidence: number;
    evidenceCount: number;
    labelLeft?: string;
    labelRight?: string;
  }>;
  const fluctuation = profileData.fluctuation as {
    distributions?: Array<{
      axisId: string;
      bimodalityCoeff?: number;
      isDual?: boolean;
      poles?: [number, number];
      contradictionStrength?: number;
    }>;
  } | undefined;

  // --- 上位5軸を抽出（絶対値順） ---
  const sortedAxes = dimensionDetails
    .filter((d) => d.evidenceCount > 0)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 5);

  const topAxes: StargazerAxisSummary[] = sortedAxes.map((d) => ({
    key: d.id as TraitAxisKey,
    label: formatAxisLabel(d),
    score: d.score,
    confidence: d.confidence,
  }));

  // --- 矛盾軸を抽出 ---
  const contradictions: StargazerContradiction[] = [];
  if (fluctuation?.distributions) {
    for (const dist of fluctuation.distributions) {
      if (dist.isDual && dist.poles && (dist.contradictionStrength ?? 0) > 0.3) {
        const detail = dimensionDetails.find((d) => d.id === dist.axisId);
        contradictions.push({
          key: dist.axisId as TraitAxisKey,
          label: detail ? formatAxisLabel(detail) : dist.axisId,
          poles: dist.poles,
          strength: dist.contradictionStrength ?? 0,
        });
      }
    }
  }

  // --- 全軸スコア ---
  const axisScores: Partial<Record<TraitAxisKey, number>> = {};
  for (const [key, val] of Object.entries(liveAxisScores)) {
    axisScores[key as TraitAxisKey] = val;
  }

  // --- 観測密度入力 ---
  const observedAxisCount = dimensionDetails.filter((d) => d.evidenceCount > 0).length;
  const contradictionAxisCount = contradictions.length;
  const totalObservationCount = (profileData.actualObservationCount as number) ?? 0;

  return {
    density: {
      observedAxisCount,
      contradictionAxisCount,
      totalObservationCount,
    },
    topAxes,
    contradictions,
    axisScores,
    fetchedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAxisLabel(detail: {
  id: string;
  score: number;
  labelLeft?: string;
  labelRight?: string;
}): string {
  if (detail.labelLeft && detail.labelRight) {
    // スコアの方向に応じてラベルを選択
    return detail.score >= 0 ? detail.labelRight : detail.labelLeft;
  }
  return detail.id;
}
