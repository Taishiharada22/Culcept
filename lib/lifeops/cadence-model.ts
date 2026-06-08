/**
 * Life Ops L-2 — 周期（cadence）模型（**pure・no-DB・no-external-API・no-UI**・barrel 非 export）
 *
 * 設計: docs/life-ops-l2-cadence-model-mini-design.md / docs/life-ops-boundary-and-handoff.md §2 L-2・Appendix A.2・A.7 / category-model.ts（L-1）
 *
 * 役割: cyclic カテゴリの **標準周期（default）** と、lastCompletedAt から **経過段階** を計算する pure helper。MVP=美容院(カット/カラー)・眉。
 *   「due（締切）」を断定しない（中立な経過段階）。履歴が無い/異常なら `unknown`（捏造しない）。
 *   個人実績からの間隔学習は L-9（本 spec の default を override する）。候補化「何が due か」は L-3。
 *
 * 厳守:
 *   - pure・deterministic: **Date.now / argless new Date() 不使用**。`now`/`lastCompletedAt` は引数注入。`Date.parse(iso)` のみ。
 *   - **due/「行くべき」を断定しない**: CadenceStatus は事実（phase/elapsed/ratio）のみ・action フィールドを持たない。
 *   - 履歴なし・不正 ISO・未来日 → `unknown`（本流 R1-5「completed=unknown・捏造しない」を継承）。
 *   - 横エンジン（lib/plan/reality/*）非 import・barrel 非 export。
 */

import type { LifeOpsCategoryId } from "./category-model";

/** 美容院の menu 別 sub-cadence（L-1 申し送り）。他カテゴリは menu=null。 */
export type BeautyMenu = "cut" | "color" | "treatment";

/** 経過段階（**中立**・締切でない）。unknown=履歴なし/異常で断定しない。 */
export type CadencePhase = "unknown" | "within_typical" | "nearing" | "beyond_typical" | "well_beyond";

/** カテゴリ(×menu)の標準周期 spec（default・個人学習は L-9 が override）。 */
export interface CadenceSpec {
  readonly categoryId: LifeOpsCategoryId;
  readonly menu: BeautyMenu | null;
  readonly typicalIntervalDays: number;
  readonly nearingRatio: number;
  readonly beyondRatio: number;
}

/** 経過の観測（**事実のみ**・「やるべき」を持たない）。履歴なし→elapsed/ratio は null。 */
export interface CadenceStatus {
  readonly phase: CadencePhase;
  readonly elapsedDays: number | null;
  readonly typicalIntervalDays: number;
  readonly ratio: number | null;
}

/** beyond_typical からさらに超過して well_beyond になる margin（カット 42日: beyond=42日/well_beyond=63日）。 */
const WELL_BEYOND_MARGIN = 0.5;

const MS_PER_DAY = 86_400_000;

/**
 * MVP の標準周期（default・個人学習は L-9 が override）。
 *   美容（A.2: カラー>カット>眉）+ 生活維持の補充系（A.8: 食料品/日用品）。treatment/nail/脱毛・家事等は後続。
 */
const MVP_CADENCES: readonly CadenceSpec[] = [
  { categoryId: "beauty_salon", menu: "cut", typicalIntervalDays: 42, nearingRatio: 0.8, beyondRatio: 1.0 },
  { categoryId: "beauty_salon", menu: "color", typicalIntervalDays: 56, nearingRatio: 0.8, beyondRatio: 1.0 },
  { categoryId: "eyebrow", menu: null, typicalIntervalDays: 28, nearingRatio: 0.8, beyondRatio: 1.0 },
  // 生活維持・補充系（消費ペース＝前回購入からの経過。食料品は数日・日用品は約2週間）
  { categoryId: "groceries", menu: null, typicalIntervalDays: 4, nearingRatio: 0.8, beyondRatio: 1.0 },
  { categoryId: "daily_necessities", menu: null, typicalIntervalDays: 14, nearingRatio: 0.8, beyondRatio: 1.0 },
];

/** cadence key（"beauty_salon:cut" / "eyebrow"）。 */
export function cadenceKey(categoryId: LifeOpsCategoryId, menu: BeautyMenu | null = null): string {
  return menu ? `${categoryId}:${menu}` : categoryId;
}

/** (categoryId, menu) → spec（未知は undefined）。 */
export function getCadenceSpec(categoryId: string, menu: BeautyMenu | null = null): CadenceSpec | undefined {
  return MVP_CADENCES.find((s) => s.categoryId === categoryId && s.menu === menu);
}

/** MVP の cadence 一覧（定義順）。 */
export function listMvpCadences(): readonly CadenceSpec[] {
  return MVP_CADENCES;
}

/** ISO 2 点の経過日数（floor）。不正 ISO は null（捏造しない）。 */
export function daysBetween(fromISO: string, toISO: string): number | null {
  const from = Date.parse(fromISO);
  const to = Date.parse(toISO);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.floor((to - from) / MS_PER_DAY);
}

/** ratio → 経過段階（断定しない・中立）。 */
function phaseFromRatio(ratio: number, spec: CadenceSpec): CadencePhase {
  if (ratio < spec.nearingRatio) return "within_typical";
  if (ratio < spec.beyondRatio) return "nearing";
  if (ratio < spec.beyondRatio + WELL_BEYOND_MARGIN) return "beyond_typical";
  return "well_beyond";
}

/**
 * L-2: lastCompletedAt から経過段階を計算（pure・now 注入）。
 *   履歴なし(null) / 不正 ISO / 未来日(elapsed<0) / 異常 spec(typical≤0) → **unknown**（捏造しない）。
 *   返すのは事実（phase/elapsed/ratio）のみ。「やるべき」判断は L-3（文脈統合）。
 */
export function computeCadenceStatus(
  spec: CadenceSpec,
  lastCompletedAtISO: string | null,
  nowISO: string
): CadenceStatus {
  const typical = spec.typicalIntervalDays;
  const unknown: CadenceStatus = { phase: "unknown", elapsedDays: null, typicalIntervalDays: typical, ratio: null };
  if (lastCompletedAtISO === null || !(typical > 0)) return unknown;
  const elapsed = daysBetween(lastCompletedAtISO, nowISO);
  if (elapsed === null || elapsed < 0) return unknown; // 不正 ISO / 未来日 → 断定しない
  const ratio = elapsed / typical;
  return { phase: phaseFromRatio(ratio, spec), elapsedDays: elapsed, typicalIntervalDays: typical, ratio };
}
