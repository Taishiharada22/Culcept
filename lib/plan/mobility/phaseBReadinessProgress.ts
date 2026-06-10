/**
 * lib/plan/mobility/phaseBReadinessProgress.ts
 *   — B-0: Phase B readiness の data gate 進捗（pure helper + loader・operator console 用）
 *
 * ★目的（CEO 2026-06-09 承認）: Phase B（cross-day）に入れるだけの dogfood データが溜まっているかを
 *   operator が /ceo で確認できるようにする。★**Phase B 本体の実装ではない**（進捗の集計と gate 判定のみ）。
 *
 * ★gate 定義は `docs/phase-b-readiness-gate.md` の data gate に従う:
 *   観測日数 ≥14 / 連続観測日ペア ≥10 / 1日あたり観測数の中央値 ≥3 / A0 reason ≥10（うち tired ≥3）。
 *   - 4 check 全充足 → `design_review_ready`（Phase B design review 可能）。
 *   - + 観測総数 ≥40 → `v0_candidate`（Phase B v0 実装候補）。
 *   - それ以外 → `accumulating`（まだ蓄積中）。
 *   ★過去日の予定密度履歴（DB read 領域）は **蓄積では満たせない構造的な別 status**（CEO 承認待ち）として
 *     view 側で常設表示する（ここでは判定しない＝DB read しない）。
 *
 * ★安全境界: local store の read のみ・DB/Supabase/network なし・新規データ保存なし・
 *   raw location/GPS/placeId 不扱い（日付 key と件数のみ）・cross-day の中身は判定しない（断定回避・gate 進捗のみ）。
 *   pure 部は Date.now() 不使用（日付 serial は入力文字列からの決定論変換）。
 */
import {
  MOBILITY_OBSERVATION_KEY,
  parseObservationStore,
  type MobilityObservationStore,
} from "@/lib/plan/mobility/mobilityObservationStore";
import {
  loadHypothesisFeedbackStore,
  type HypothesisFeedbackStore,
} from "@/lib/plan/mobility/hypothesisFeedbackStore";

/** ★data gate 閾値（`docs/phase-b-readiness-gate.md` と同値・internal）。 */
export const PHASE_B_DATA_GATE = {
  minObservationDays: 14,
  minConsecutiveDayPairs: 10,
  minMedianPerDay: 3,
  minReasonCount: 10,
  minTiredCount: 3,
  /** v0_candidate の追加条件（条件別スライスの底）。 */
  minTotalObservationsForV0: 40,
} as const;

export type PhaseBCheckKey = "observation_days" | "consecutive_pairs" | "daily_density" | "reason_count";

export interface PhaseBGateCheck {
  readonly key: PhaseBCheckKey;
  readonly met: boolean;
}

export type PhaseBOverall = "accumulating" | "design_review_ready" | "v0_candidate";

export interface PhaseBReadinessProgress {
  readonly checks: readonly PhaseBGateCheck[];
  readonly overall: PhaseBOverall;
  /** internal（実カウント・view では描画しない）。 */
  readonly totals: {
    readonly observationDays: number;
    readonly consecutivePairs: number;
    readonly medianPerDay: number;
    readonly totalObservations: number;
    readonly reasonCount: number;
    readonly tiredCount: number;
  };
}

/** "YYYY-MM-DD" → 決定論の日 serial（隣接判定用・Date.now() 不使用・不正は null）。 */
function dayISOToSerial(dayISO: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayISO);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null;
}

/** 中央値（空は 0）。 */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * ★core: 観測 store + feedback store から data gate 進捗を作る（pure・読むだけ）。
 *   日付 key と件数のみ扱う（leg の中身=場所 key 等は読まない）。
 */
export function buildPhaseBReadinessProgress(
  observationStore: MobilityObservationStore,
  feedbackStore: HypothesisFeedbackStore,
): PhaseBReadinessProgress {
  // per-day 観測数（観測がある日のみ）
  const perDay: number[] = [];
  const serials = new Set<number>();
  let totalObservations = 0;
  for (const [dayISO, legs] of Object.entries(observationStore.byDay)) {
    const count = Object.keys(legs).length;
    if (count <= 0) continue;
    perDay.push(count);
    totalObservations += count;
    const s = dayISOToSerial(dayISO);
    if (s != null) serials.add(s);
  }
  const observationDays = perDay.length;
  let consecutivePairs = 0;
  for (const s of serials) if (serials.has(s + 1)) consecutivePairs += 1;
  const medianPerDay = median(perDay);

  // A0 reason 集計（reason の値のみ・場所 key 不読）
  let reasonCount = 0;
  let tiredCount = 0;
  for (const legs of Object.values(feedbackStore.byDay)) {
    for (const entry of Object.values(legs)) {
      if (entry.reason == null) continue;
      reasonCount += 1;
      if (entry.reason === "tired") tiredCount += 1;
    }
  }

  const g = PHASE_B_DATA_GATE;
  const checks: PhaseBGateCheck[] = [
    { key: "observation_days", met: observationDays >= g.minObservationDays },
    { key: "consecutive_pairs", met: consecutivePairs >= g.minConsecutiveDayPairs },
    { key: "daily_density", met: observationDays > 0 && medianPerDay >= g.minMedianPerDay },
    { key: "reason_count", met: reasonCount >= g.minReasonCount && tiredCount >= g.minTiredCount },
  ];
  const allMet = checks.every((c) => c.met);
  const overall: PhaseBOverall = !allMet
    ? "accumulating"
    : totalObservations >= g.minTotalObservationsForV0
      ? "v0_candidate"
      : "design_review_ready";

  return {
    checks,
    overall,
    totals: { observationDays, consecutivePairs, medianPerDay, totalObservations, reasonCount, tiredCount },
  };
}

// ───────────────────────── 表示ラベル（★数字を含まない・status summary のみ） ─────────────────────────

export const PHASE_B_CHECK_LABEL: Record<PhaseBCheckKey, string> = {
  observation_days: "観測日数",
  consecutive_pairs: "連続観測日ペア",
  daily_density: "一日あたりの観測密度",
  reason_count: "理由の記録（A0）",
};

export const PHASE_B_OVERALL_DISPLAY: Record<PhaseBOverall, { readonly label: string; readonly action: string }> = {
  accumulating: { label: "まだ蓄積中", action: "移動の記録を継続（leg を開いて手段を選ぶ）" },
  design_review_ready: { label: "design review 可能", action: "Phase B design review の開始を判断（CEO）" },
  v0_candidate: { label: "v0 実装候補", action: "Phase B v0 着手を判断（CEO GO 待ち）" },
};

/** ★構造的な別 status（蓄積では満たせない・DB read 承認が必要な領域）。view が常設表示する。 */
export const PHASE_B_DB_READ_NOTE = "過去日の予定密度履歴は DB read 承認が必要（別 gate・CEO 判断）";

/** stores から進捗を作る（client・fail-open）。SSR/不在は空 store 扱い。 */
export function loadPhaseBReadinessProgressFromStores(): PhaseBReadinessProgress {
  let raw: string | null = null;
  try {
    raw = (globalThis as { localStorage?: Storage }).localStorage?.getItem(MOBILITY_OBSERVATION_KEY) ?? null;
  } catch {
    raw = null;
  }
  return buildPhaseBReadinessProgress(parseObservationStore(raw), loadHypothesisFeedbackStore());
}
