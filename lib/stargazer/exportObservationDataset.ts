import "server-only";

import { createHash } from "crypto";
import { getAIServiceClient } from "@/lib/ai/db";
import { TRAIT_AXIS_KEYS, type TraitAxisKey } from "./traitAxes";

// ============================================================
// Stargazer Observation Dataset Exporter
//
// stargazer_axis_snapshots をセッション単位で集約し、
// 学習パイプライン用の JSONL データセットとしてエクスポートする。
//
// セッション = 同一 user_id × session_date × context の snapshot群
// ============================================================

export interface ObservationSessionRow {
  /** 匿名化ユーザーID (SHA-256ハッシュ) */
  userHash: string;
  /** DB context値 (friends, romantic_partner, spouse, family, coworkers) */
  context: string;
  /** セッション日 */
  sessionDate: string;
  /** セッション内の全スナップショット */
  snapshots: {
    axisId: string;
    score: number;
    observationLayer: string | null;
  }[];
  /** セッション前のプロファイル (同一contextの過去データから計算) */
  preProfile: Record<string, number>;
  /** セッション後のプロファイル (このセッション含む) */
  postProfile: Record<string, number>;
  /** プロファイル差分 (変化した軸のみ) */
  profileDelta: { axis: string; before: number; after: number; delta: number }[];
  /** このcontext の累計スナップショット数 */
  cumulativeSnapshotCount: number;
  /** プロファイル収束スコア (0-1, 高いほど安定) */
  convergenceScore: number;
}

export interface ObservationDatasetResult {
  ok: boolean;
  rows: ObservationSessionRow[];
  totalSessionsScanned: number;
  error?: string;
}

type RawSnapshot = {
  user_id: string;
  axis_id: string;
  score: number;
  context: string | null;
  observation_layer: string | null;
  session_date: string;
};

function hashUserId(userId: string): string {
  return createHash("sha256").update(`stargazer:obs:${userId}`).digest("hex").slice(0, 16);
}

/**
 * 加重平均でプロファイルを計算 (contextProfileAggregator と同じロジック)
 */
function computeProfile(
  snapshots: RawSnapshot[],
): Record<string, number> {
  const DECAY_RATE = 0.95;
  const now = Date.now();
  const byAxis = new Map<string, { score: number; weight: number }[]>();

  for (const snap of snapshots) {
    if (!TRAIT_AXIS_KEYS.includes(snap.axis_id as TraitAxisKey)) continue;
    const daysSince = Math.max(0, (now - new Date(snap.session_date).getTime()) / 86_400_000);
    const weight = Math.pow(DECAY_RATE, daysSince);
    if (!byAxis.has(snap.axis_id)) byAxis.set(snap.axis_id, []);
    byAxis.get(snap.axis_id)!.push({ score: Number(snap.score), weight });
  }

  const result: Record<string, number> = {};
  for (const [axisId, entries] of byAxis) {
    const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
    if (totalWeight === 0) continue;
    const weightedSum = entries.reduce((sum, e) => sum + e.score * e.weight, 0);
    result[axisId] = Math.round((weightedSum / totalWeight) * 1000) / 1000;
  }
  return result;
}

/**
 * 収束スコアを計算: プロファイル差分が小さいほど高い (0-1)
 */
function computeConvergence(
  delta: { delta: number }[],
): number {
  if (delta.length === 0) return 0.5; // データ不足
  const avgAbsDelta = delta.reduce((sum, d) => sum + Math.abs(d.delta), 0) / delta.length;
  // delta 0 → convergence 1.0, delta 0.5+ → convergence ~0.3
  return Math.max(0, Math.min(1, 1 - avgAbsDelta * 1.5));
}

/**
 * セッション単位の観測データセットをエクスポート
 */
export async function exportObservationDataset(filters?: {
  lookbackDays?: number;
  limit?: number;
  contextFilter?: string;
}): Promise<ObservationDatasetResult> {
  const client = getAIServiceClient();
  if (!client) {
    return { ok: false, rows: [], totalSessionsScanned: 0, error: "no_client" };
  }

  const lookbackDays = filters?.lookbackDays ?? 30;
  const limit = filters?.limit ?? 500;
  const cutoff = new Date(Date.now() - lookbackDays * 86_400_000).toISOString().slice(0, 10);

  // 全スナップショットを取得 (context_bound のみ = 相手別観測)
  let query = client
    .from("stargazer_axis_snapshots")
    .select("user_id, axis_id, score, context, observation_layer, session_date")
    .eq("observation_layer", "context_bound")
    .gte("session_date", cutoff)
    .order("session_date", { ascending: false })
    .limit(5000); // 十分な量を取得

  if (filters?.contextFilter) {
    query = query.eq("context", filters.contextFilter);
  }

  const { data: rawSnapshots, error } = await query;
  if (error || !rawSnapshots || rawSnapshots.length === 0) {
    return { ok: !error, rows: [], totalSessionsScanned: 0, error: error?.message };
  }

  // セッション単位にグルーピング: user_id × session_date × context
  const sessionMap = new Map<string, RawSnapshot[]>();
  for (const snap of rawSnapshots as RawSnapshot[]) {
    if (!snap.context || !snap.session_date) continue;
    const key = `${snap.user_id}|${snap.session_date}|${snap.context}`;
    if (!sessionMap.has(key)) sessionMap.set(key, []);
    sessionMap.get(key)!.push(snap);
  }

  // 全ユーザーの全スナップショットを user_id × context でも集約 (プロファイル計算用)
  const userContextSnapshots = new Map<string, RawSnapshot[]>();
  for (const snap of rawSnapshots as RawSnapshot[]) {
    if (!snap.context) continue;
    const key = `${snap.user_id}|${snap.context}`;
    if (!userContextSnapshots.has(key)) userContextSnapshots.set(key, []);
    userContextSnapshots.get(key)!.push(snap);
  }

  const rows: ObservationSessionRow[] = [];
  let totalSessionsScanned = 0;

  for (const [sessionKey, sessionSnaps] of sessionMap) {
    totalSessionsScanned++;
    if (rows.length >= limit) break;

    const [userId, sessionDate, context] = sessionKey.split("|");

    // このユーザー×contextの全スナップショット
    const allSnapsForContext = userContextSnapshots.get(`${userId}|${context}`) ?? [];

    // pre: このセッション日より前のスナップショットのみ
    const preSessions = allSnapsForContext.filter((s) => s.session_date < sessionDate);
    const preProfile = computeProfile(preSessions);

    // post: このセッション日以前（含む）の全スナップショット
    const postSessions = allSnapsForContext.filter((s) => s.session_date <= sessionDate);
    const postProfile = computeProfile(postSessions);

    // 差分計算
    const allAxes = new Set([...Object.keys(preProfile), ...Object.keys(postProfile)]);
    const profileDelta: ObservationSessionRow["profileDelta"] = [];
    for (const axis of allAxes) {
      const before = preProfile[axis] ?? 0;
      const after = postProfile[axis] ?? 0;
      const delta = after - before;
      if (Math.abs(delta) > 0.001) {
        profileDelta.push({ axis, before, after, delta });
      }
    }

    rows.push({
      userHash: hashUserId(userId),
      context,
      sessionDate,
      snapshots: sessionSnaps.map((s) => ({
        axisId: s.axis_id,
        score: Number(s.score),
        observationLayer: s.observation_layer,
      })),
      preProfile,
      postProfile,
      profileDelta: profileDelta.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
      cumulativeSnapshotCount: postSessions.length,
      convergenceScore: computeConvergence(profileDelta),
    });
  }

  return { ok: true, rows, totalSessionsScanned };
}
