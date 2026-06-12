import "server-only";
/**
 * M2 PersonalizationPort — Supabase read-only reader（server-only・wiring のみ）
 *
 * 設計: docs/m2-personalization-port-design.md §2 / §4（M2-A）
 *
 * 厳守（worldstate ports 4-D1 の house style 踏襲）:
 *   - createClient しない（**注入**。実 Supabase client が structural に満たす）
 *   - **service_role 禁止**（user-RLS client 前提。自分の行 + pair RLS の範囲のみ読む）
 *   - read-only（INSERT / UPDATE / DELETE / UPSERT 呼び出しなし）
 *   - throw しない: query error / 想定外 shape は **null を返す**（readiness が surface）
 *   - 読めるのは: 自 user の axis snapshots（global context）/ 自 user の growth /
 *     pair の state + fairness ledger。**ペア相手の snapshot は読まない**
 *     （RLS で不可。M2-B owning issue: design doc §1.2 / §4）
 */

import type { TraitAxisKey } from "../../stargazer/traitAxes";
import { TRAIT_AXIS_KEYS } from "../../stargazer/traitAxes";
import type {
  AxisSnapshot,
  FairnessLedgerEntry,
  HdmSummary,
  PairPersonalizationContext,
  PersonalizationSnapshot,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// 注入 client の structural 最小 interface（select チェーンのみ = write は型レベルで不可）
// ─────────────────────────────────────────────────────────────────────────────

type ReadResult = { data: unknown[] | null; error: { message: string } | null };

interface SelectChain extends PromiseLike<ReadResult> {
  eq(column: string, value: string): SelectChain;
  is(column: string, value: null): SelectChain;
  order(column: string, opts: { ascending: boolean }): SelectChain;
}

interface PersonalizationReadClient {
  from(table: string): { select(columns: string): SelectChain };
}

const TABLE_AXES = "stargazer_axis_snapshots";
const TABLE_GROWTH = "stargazer_alter_growth";
const TABLE_PAIR = "coalter_pair_states";
const TABLE_FAIRNESS = "coalter_fairness_ledger";

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const VALID_AXIS_KEYS = new Set<string>(TRAIT_AXIS_KEYS);

function asRecord(row: unknown): Record<string, unknown> | null {
  return typeof row === "object" && row !== null ? (row as Record<string, unknown>) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// getPersonalizationSnapshot（自 user のみ・read-only）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 自 user の PersonalizationSnapshot を読む。
 * @param client 注入 user-RLS client（service_role を渡さないこと）
 * @param asOf snapshot 時刻 ISO（caller 注入。決定論のため内部で現在時刻を取らない）
 * @returns 読めない（query error）場合は null。観測ゼロは axes 空の snapshot（null ではない）。
 */
export async function getPersonalizationSnapshot(
  client: unknown,
  userId: string,
  asOf: string,
): Promise<PersonalizationSnapshot | null> {
  const c = client as PersonalizationReadClient;

  let axesRes: ReadResult;
  let growthRes: ReadResult;
  try {
    // liveCollector 同様 global context（context IS NULL）のみ。昇順で読み、軸ごと最新を採用。
    axesRes = await c
      .from(TABLE_AXES)
      .select("axis_id, score, confidence, created_at")
      .eq("user_id", userId)
      .is("context", null)
      .order("created_at", { ascending: true });
    growthRes = await c
      .from(TABLE_GROWTH)
      .select("hdm_phase_state, trust_level, updated_at")
      .eq("user_id", userId);
  } catch {
    return null;
  }
  if (axesRes.error || growthRes.error) return null;

  // 軸ごと最新 1 件（created_at 昇順で上書き = 最後の行が最新）
  const axes: Partial<Record<TraitAxisKey, AxisSnapshot>> = {};
  for (const raw of axesRes.data ?? []) {
    const row = asRecord(raw);
    if (!row) continue;
    const axisId = row.axis_id;
    if (typeof axisId !== "string" || !VALID_AXIS_KEYS.has(axisId)) continue; // 未知軸は黙って捨てない方針も有り得るが、型正本（traitAxes）外は v1 では除外
    const createdAt = typeof row.created_at === "string" ? row.created_at : null;
    if (!createdAt) continue;
    axes[axisId as TraitAxisKey] = {
      score: clamp(Number(row.score), -1, 1),
      confidence: clamp(Number(row.confidence ?? 0), 0, 1),
      observedAt: createdAt,
    };
  }

  // growth: 行が複数あれば updated_at 最新を採用。無ければ null。
  let hdm: HdmSummary | null = null;
  let latestUpdatedAt = "";
  for (const raw of growthRes.data ?? []) {
    const row = asRecord(raw);
    if (!row) continue;
    const updatedAt = typeof row.updated_at === "string" ? row.updated_at : "";
    if (hdm && updatedAt <= latestUpdatedAt) continue;
    const phaseState = asRecord(row.hdm_phase_state);
    const rawPhase = phaseState ? Number(phaseState.currentPhase) : NaN;
    hdm = {
      currentPhase: Number.isFinite(rawPhase) ? clamp(Math.trunc(rawPhase), 0, 5) : 0,
      trustLevelRaw: typeof row.trust_level === "number" ? row.trust_level : null,
    };
    latestUpdatedAt = updatedAt;
  }

  return {
    userId,
    asOf,
    axes,
    hdm,
    dynamicState: null, // M2-A: innerWeather 未永続化（design doc §1.1）
    decisionMeta: null, // M2-A: ActionShape/ForceBalance 未永続化（design doc §1.1）
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// getPairPersonalizationContext（pair RLS の範囲のみ・read-only）
// ─────────────────────────────────────────────────────────────────────────────

/** currentBias の対象行数（直近 N 行の平均） */
export const FAIRNESS_RECENT_WINDOW = 10;

/**
 * pair の fairness 文脈を読む。partnerSnapshot は M2-A では常に null。
 * @returns pair 行が見えない（非メンバー / 不在 / query error）場合は null。
 */
export async function getPairPersonalizationContext(
  client: unknown,
  pairStateId: string,
): Promise<PairPersonalizationContext | null> {
  const c = client as PersonalizationReadClient;

  let pairRes: ReadResult;
  let ledgerRes: ReadResult;
  try {
    pairRes = await c
      .from(TABLE_PAIR)
      .select("id, state, onboarded_at")
      .eq("id", pairStateId);
    ledgerRes = await c
      .from(TABLE_FAIRNESS)
      .select("bias_score, decided_at")
      .eq("pair_state_id", pairStateId)
      .order("decided_at", { ascending: true });
  } catch {
    return null;
  }
  if (pairRes.error || ledgerRes.error) return null;

  const pairRow = asRecord((pairRes.data ?? [])[0]);
  if (!pairRow) return null; // RLS 非メンバー or pair 不在

  const rows: FairnessLedgerEntry[] = [];
  for (const raw of ledgerRes.data ?? []) {
    const row = asRecord(raw);
    if (!row) continue;
    const decidedAt = typeof row.decided_at === "string" ? row.decided_at : null;
    if (!decidedAt) continue;
    rows.push({ biasScore: clamp(Number(row.bias_score), -1, 1), decidedAt });
  }

  const recent = rows.slice(-FAIRNESS_RECENT_WINDOW);
  const currentBias =
    recent.length === 0
      ? 0
      : clamp(recent.reduce((s, r) => s + r.biasScore, 0) / recent.length, -1, 1);

  return {
    pairStateId,
    enabled: pairRow.state === "enabled" && pairRow.onboarded_at != null,
    fairness: { rows, currentBias },
    partnerSnapshot: null, // M2-A: RLS で読めない（M2-B owning issue）
  };
}
