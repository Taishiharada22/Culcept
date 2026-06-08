/**
 * lib/plan/mobility/dogfoodSafetyJournal.ts — A1-13: dogfood shadow の複数日観測ログ（safety journal・local-only）
 *
 * ★目的: dogfood shadow / readiness / report の結果を **日次の derived summary** として local 記録し、
 *   複数日で「安全に ON できそうか（懸念が出ていないか）」を見るための観測基盤。
 *
 * ★安全境界（CEO 方針・最重要）:
 *   - ★**raw GPS / raw pace ratio / friction 数値を保存しない**。保存は derived summary のみ
 *     （date / readiness status / dogfood status / blockers / 4 concern booleans / verdict / activation候補有無）。
 *   - ★**calibration 値を出さない・提案しない**。
 *   - 記録は shadow report が在るとき（= dev/flag ON）だけ呼ばれる前提＝flag OFF では journal は増えない（完全不変）。
 *   - client-only / SSR・破損は fail-open / DB・network 不使用 / versioned key + 日数上限。
 */
import type { OverallReadiness } from "@/lib/plan/mobility/paceActivationReadiness";
import type { PaceShadowActivationReport, PaceShadowConcerns } from "@/lib/plan/mobility/paceShadowActivation";
import type { DogfoodOverall, PersonalPaceDogfoodReadiness } from "@/lib/plan/mobility/personalPaceDogfoodReadiness";

export const DOGFOOD_JOURNAL_KEY = "aneurasync.plan.dogfood-safety-journal.v1";
export const DOGFOOD_JOURNAL_SCHEMA_VERSION = 1 as const;
export const MAX_JOURNAL_DAYS = 60;

/** ★1 日の観測 derived summary（raw GPS/ratio/friction を持たない）。 */
export interface DogfoodObservationEntry {
  readonly date: string; // YYYY-MM-DD
  readonly readinessOverall: OverallReadiness;
  readonly dogfoodOverall: DogfoodOverall;
  readonly blockers: readonly string[];
  readonly concerns: PaceShadowConcerns;
  /** verdict（いずれかの懸念あり）。 */
  readonly anyConcern: boolean;
  /** activation 候補（ready_for_activation 区間）が在ったか。 */
  readonly activationCandidatePresent: boolean;
}

export interface DogfoodSafetyJournal {
  readonly version: typeof DOGFOOD_JOURNAL_SCHEMA_VERSION;
  readonly byDate: Readonly<Record<string, DogfoodObservationEntry>>;
}

export const EMPTY_DOGFOOD_JOURNAL: DogfoodSafetyJournal = {
  version: DOGFOOD_JOURNAL_SCHEMA_VERSION,
  byDate: {},
};

/**
 * shadow report + dogfood readiness を **derived summary** に変換（pure・raw を一切含めない）。
 */
export function summarizeShadowToObservation(input: {
  readonly date: string;
  readonly shadowReport: PaceShadowActivationReport;
  readonly dogfoodReadiness: PersonalPaceDogfoodReadiness;
  readonly activationCandidatePresent: boolean;
}): DogfoodObservationEntry {
  return {
    date: input.date,
    readinessOverall: input.shadowReport.readinessOverall,
    dogfoodOverall: input.dogfoodReadiness.overall,
    blockers: [...input.dogfoodReadiness.blockers],
    concerns: { ...input.shadowReport.concerns },
    anyConcern: input.shadowReport.anyConcern,
    activationCandidatePresent: input.activationCandidatePresent,
  };
}

function isDayISO(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
function isOverallReadiness(v: unknown): v is OverallReadiness {
  return v === "not_enough" || v === "ready_for_shadow" || v === "ready_for_activation";
}
function isDogfoodOverall(v: unknown): v is DogfoodOverall {
  return v === "not_ready" || v === "ready_for_dogfood";
}
function isConcerns(v: unknown): v is PaceShadowConcerns {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.overPessimism === "boolean" &&
    typeof c.markerExplosion === "boolean" &&
    typeof c.diagnosticWorsening === "boolean" &&
    typeof c.overChange === "boolean"
  );
}
function isEntry(v: unknown): v is DogfoodObservationEntry {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    isDayISO(e.date) &&
    isOverallReadiness(e.readinessOverall) &&
    isDogfoodOverall(e.dogfoodOverall) &&
    Array.isArray(e.blockers) &&
    isConcerns(e.concerns) &&
    typeof e.anyConcern === "boolean" &&
    typeof e.activationCandidatePresent === "boolean"
  );
}

/** ★既知 field だけを採用＝raw 値混入を構造的に排除。 */
function pickEntry(e: DogfoodObservationEntry): DogfoodObservationEntry {
  return {
    date: e.date,
    readinessOverall: e.readinessOverall,
    dogfoodOverall: e.dogfoodOverall,
    blockers: e.blockers.filter((b): b is string => typeof b === "string"),
    concerns: {
      overPessimism: e.concerns.overPessimism,
      markerExplosion: e.concerns.markerExplosion,
      diagnosticWorsening: e.concerns.diagnosticWorsening,
      overChange: e.concerns.overChange,
    },
    anyConcern: e.anyConcern,
    activationCandidatePresent: e.activationCandidatePresent,
  };
}

export function parseDogfoodJournal(raw: string | null): DogfoodSafetyJournal {
  if (!raw) return EMPTY_DOGFOOD_JOURNAL;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_DOGFOOD_JOURNAL;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { version?: unknown }).version !== DOGFOOD_JOURNAL_SCHEMA_VERSION
  ) {
    return EMPTY_DOGFOOD_JOURNAL;
  }
  const rawByDate = (parsed as { byDate?: unknown }).byDate;
  if (typeof rawByDate !== "object" || rawByDate === null) return EMPTY_DOGFOOD_JOURNAL;
  const byDate: Record<string, DogfoodObservationEntry> = {};
  for (const [date, entry] of Object.entries(rawByDate as Record<string, unknown>)) {
    if (!isDayISO(date)) continue;
    if (!isEntry(entry)) continue;
    byDate[date] = pickEntry(entry);
  }
  return { version: DOGFOOD_JOURNAL_SCHEMA_VERSION, byDate };
}

export function applyJournalCaps(journal: DogfoodSafetyJournal): DogfoodSafetyJournal {
  const keptDates = Object.keys(journal.byDate).sort().slice(-MAX_JOURNAL_DAYS);
  const byDate: Record<string, DogfoodObservationEntry> = {};
  for (const d of keptDates) byDate[d] = journal.byDate[d];
  return { version: DOGFOOD_JOURNAL_SCHEMA_VERSION, byDate };
}

/** 同 date は最新で上書き（純粋・1 日 1 entry・冪等）。 */
export function setObservation(journal: DogfoodSafetyJournal, entry: DogfoodObservationEntry): DogfoodSafetyJournal {
  if (!isEntry(entry)) return journal;
  return applyJournalCaps({
    version: DOGFOOD_JOURNAL_SCHEMA_VERSION,
    byDate: { ...journal.byDate, [entry.date]: pickEntry(entry) },
  });
}

// ───────────────────────── 複数日 stability 判定 ─────────────────────────

export type DogfoodStability = "insufficient" | "unstable" | "stable_safe";

export interface DogfoodStabilityAssessment {
  readonly daysObserved: number;
  readonly daysWithConcern: number;
  readonly daysReadyForDogfood: number;
  readonly stability: DogfoodStability;
}

export interface DogfoodStabilityConfig {
  /** stable 判定に必要な観測日数。 */
  readonly minDays: number;
}

export const DEFAULT_DOGFOOD_STABILITY_CONFIG: DogfoodStabilityConfig = { minDays: 3 };

/**
 * journal から「安全に ON できそうか」を判定（pure）。
 * - insufficient: 観測日 < minDays。
 * - unstable: 観測日 ≥ minDays だが懸念のある日が 1 日でもある。
 * - stable_safe: 観測日 ≥ minDays かつ懸念ゼロ。
 */
export function assessDogfoodStability(
  journal: DogfoodSafetyJournal,
  config: DogfoodStabilityConfig = DEFAULT_DOGFOOD_STABILITY_CONFIG,
): DogfoodStabilityAssessment {
  const entries = Object.values(journal.byDate);
  const daysObserved = entries.length;
  const daysWithConcern = entries.filter((e) => e.anyConcern).length;
  const daysReadyForDogfood = entries.filter((e) => e.dogfoodOverall === "ready_for_dogfood").length;

  let stability: DogfoodStability;
  if (daysObserved < config.minDays) stability = "insufficient";
  else if (daysWithConcern > 0) stability = "unstable"; // ★1 日でも懸念があれば ON しない
  else stability = "stable_safe";

  return { daysObserved, daysWithConcern, daysReadyForDogfood, stability };
}

function getStorage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

function readJournal(): DogfoodSafetyJournal {
  const ls = getStorage();
  if (!ls) return EMPTY_DOGFOOD_JOURNAL;
  try {
    return parseDogfoodJournal(ls.getItem(DOGFOOD_JOURNAL_KEY));
  } catch {
    return EMPTY_DOGFOOD_JOURNAL;
  }
}

/** 1 日の観測を記録（client・fail-open・冪等＝同 date 上書き）。 */
export function recordDogfoodObservation(entry: DogfoodObservationEntry): void {
  const ls = getStorage();
  if (!ls) return;
  try {
    ls.setItem(DOGFOOD_JOURNAL_KEY, JSON.stringify(setObservation(readJournal(), entry)));
  } catch {
    /* quota 等は fail-open */
  }
}

/** journal を読む（client・fail-open）。 */
export function loadDogfoodJournal(): DogfoodSafetyJournal {
  return readJournal();
}
