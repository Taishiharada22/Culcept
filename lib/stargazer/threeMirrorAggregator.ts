// lib/stargazer/threeMirrorAggregator.ts
// 三面鏡プロファイル集約 — 3つのミラーからの実データを統合
//
// 各ミラーのデータソース:
// 🪞 Self-Portrait: stargazer_axis_snapshots (observation_layer = 'state' | 'context_bound' | 'reobservation')
// 👣 Footprint: localStorage行動信号 → footprintCollector → 軸スコア変換
// 🎭 Shadow Play: stargazer_axis_snapshots (observation_layer = 'shadow_play')

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";
import type { ThreeMirrorProfile, MirrorAxisScore } from "./threeMirrors";
import {
  getStoredFootprints,
  aggregateFootprints,
  footprintPatternsToAxisScores,
} from "./footprintCollector";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** DB から取得する軸スナップショットの最小型 */
export interface AxisSnapshotRow {
  axis_id: string;
  score: number;
  observation_layer: string;
  variant_id?: string | null;
  session_date: string;
  created_at: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Server-side: DB + Footprint統合
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * DBスナップショットからThreeMirrorProfileを構築
 * Server Components / API Routes から呼ぶ
 */
export function buildThreeMirrorProfileFromSnapshots(
  snapshots: AxisSnapshotRow[],
  footprintAxisScores?: { axisId: TraitAxisKey; score: number; weight: number }[],
): Partial<ThreeMirrorProfile> {
  const profile: Partial<ThreeMirrorProfile> = {};

  // 全軸の空テンプレートを用意
  for (const axis of TRAIT_AXES) {
    profile[axis.id] = {
      axisId: axis.id,
      selfPortrait: undefined,
      footprint: undefined,
      shadowPlay: undefined,
      counts: { selfPortrait: 0, footprint: 0, shadowPlay: 0 },
    };
  }

  // ── Self-Portrait & Shadow Play をDBスナップショットから集計 ──
  const selfScores: Record<string, { sum: number; count: number }> = {};
  const shadowScores: Record<string, { sum: number; count: number }> = {};

  for (const snap of snapshots) {
    const axisId = snap.axis_id as TraitAxisKey;
    if (!profile[axisId]) continue;

    if (snap.observation_layer === "shadow_play") {
      // Shadow Play スコア
      if (!shadowScores[axisId]) shadowScores[axisId] = { sum: 0, count: 0 };
      shadowScores[axisId].sum += Number(snap.score);
      shadowScores[axisId].count += 1;
    } else {
      // Self-Portrait スコア (state, context_bound, reobservation, delta)
      if (!selfScores[axisId]) selfScores[axisId] = { sum: 0, count: 0 };
      selfScores[axisId].sum += Number(snap.score);
      selfScores[axisId].count += 1;
    }
  }

  // Self-Portrait の平均スコアを設定
  for (const [axisId, data] of Object.entries(selfScores)) {
    const key = axisId as TraitAxisKey;
    if (profile[key] && data.count > 0) {
      profile[key]!.selfPortrait = data.sum / data.count;
      profile[key]!.counts.selfPortrait = data.count;
    }
  }

  // Shadow Play の平均スコアを設定
  for (const [axisId, data] of Object.entries(shadowScores)) {
    const key = axisId as TraitAxisKey;
    if (profile[key] && data.count > 0) {
      profile[key]!.shadowPlay = data.sum / data.count;
      profile[key]!.counts.shadowPlay = data.count;
    }
  }

  // ── Footprint: 行動データからの軸スコアを設定 ──
  if (footprintAxisScores) {
    // 同一軸の複数信号を加重平均
    const fpAgg: Record<string, { weightedSum: number; totalWeight: number; count: number }> = {};
    for (const fp of footprintAxisScores) {
      if (!fpAgg[fp.axisId]) fpAgg[fp.axisId] = { weightedSum: 0, totalWeight: 0, count: 0 };
      fpAgg[fp.axisId].weightedSum += fp.score * fp.weight;
      fpAgg[fp.axisId].totalWeight += fp.weight;
      fpAgg[fp.axisId].count += 1;
    }

    for (const [axisId, data] of Object.entries(fpAgg)) {
      const key = axisId as TraitAxisKey;
      if (profile[key] && data.totalWeight > 0) {
        profile[key]!.footprint = data.weightedSum / data.totalWeight;
        profile[key]!.counts.footprint = data.count;
      }
    }
  }

  // 空の軸（全ミラー未観測）を除去
  const cleaned: Partial<ThreeMirrorProfile> = {};
  for (const [axisId, mirror] of Object.entries(profile)) {
    if (
      mirror &&
      (mirror.selfPortrait !== undefined ||
       mirror.footprint !== undefined ||
       mirror.shadowPlay !== undefined)
    ) {
      cleaned[axisId as TraitAxisKey] = mirror;
    }
  }

  return cleaned;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Client-side: localStorage Footprint + 既存axisScoresから構築
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * クライアントサイドでThreeMirrorProfileを構築
 * StargazerHome.tsx から呼ぶ（プレビューモード or ログイン済み）
 *
 * @param selfPortraitScores 既存の自画像スコア（従来の軸スコア）
 * @param shadowPlaySnapshots Shadow Play のDB保存済みスナップショット
 */
export function buildClientThreeMirrorProfile(
  selfPortraitScores: Partial<Record<TraitAxisKey, number>>,
  shadowPlaySnapshots?: AxisSnapshotRow[],
): Partial<ThreeMirrorProfile> {
  // Footprint: localStorageから行動信号を集計
  const footprints = getStoredFootprints();
  const patterns = aggregateFootprints(footprints, 30);
  const footprintAxisScores = footprintPatternsToAxisScores(patterns);

  // Self-Portrait → snapshot形式に変換
  const selfSnapshots: AxisSnapshotRow[] = Object.entries(selfPortraitScores).map(
    ([axisId, score]) => ({
      axis_id: axisId,
      score: score ?? 0,
      observation_layer: "state",
      session_date: new Date().toISOString().split("T")[0],
      created_at: new Date().toISOString(),
    }),
  );

  // Shadow Play スナップショットも合算
  const allSnapshots = [...selfSnapshots, ...(shadowPlaySnapshots ?? [])];

  return buildThreeMirrorProfileFromSnapshots(allSnapshots, footprintAxisScores);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Utility: ミラーカバレッジ統計
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface MirrorCoverageStats {
  totalAxes: number;
  selfPortraitAxes: number;
  footprintAxes: number;
  shadowPlayAxes: number;
  /** 2つ以上のミラーで観測されている軸の数 */
  multiMirrorAxes: number;
  /** 3つ全てのミラーで観測されている軸の数 */
  fullCoverageAxes: number;
}

export function getMirrorCoverageStats(
  profile: Partial<ThreeMirrorProfile>,
): MirrorCoverageStats {
  let selfPortraitAxes = 0;
  let footprintAxes = 0;
  let shadowPlayAxes = 0;
  let multiMirrorAxes = 0;
  let fullCoverageAxes = 0;

  for (const mirror of Object.values(profile) as MirrorAxisScore[]) {
    const hasS = mirror.selfPortrait !== undefined;
    const hasF = mirror.footprint !== undefined;
    const hasSh = mirror.shadowPlay !== undefined;
    if (hasS) selfPortraitAxes++;
    if (hasF) footprintAxes++;
    if (hasSh) shadowPlayAxes++;
    const count = [hasS, hasF, hasSh].filter(Boolean).length;
    if (count >= 2) multiMirrorAxes++;
    if (count === 3) fullCoverageAxes++;
  }

  return {
    totalAxes: Object.keys(profile).length,
    selfPortraitAxes,
    footprintAxes,
    shadowPlayAxes,
    multiMirrorAxes,
    fullCoverageAxes,
  };
}
