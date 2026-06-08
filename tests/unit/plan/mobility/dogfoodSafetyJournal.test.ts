import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  summarizeShadowToObservation,
  setObservation,
  assessDogfoodStability,
  parseDogfoodJournal,
  recordDogfoodObservation,
  loadDogfoodJournal,
  EMPTY_DOGFOOD_JOURNAL,
  DOGFOOD_JOURNAL_KEY,
  DOGFOOD_JOURNAL_SCHEMA_VERSION,
  type DogfoodObservationEntry,
  type DogfoodSafetyJournal,
} from "@/lib/plan/mobility/dogfoodSafetyJournal";
import type { PaceShadowActivationReport } from "@/lib/plan/mobility/paceShadowActivation";
import type { PersonalPaceDogfoodReadiness } from "@/lib/plan/mobility/personalPaceDogfoodReadiness";

const shadow = (over: Partial<PaceShadowActivationReport> = {}): PaceShadowActivationReport => ({
  ran: true, readinessOverall: "ready_for_activation", shadow: null,
  concerns: { overPessimism: false, markerExplosion: false, diagnosticWorsening: false, overChange: false }, anyConcern: false, ...over,
});
const dogfood: PersonalPaceDogfoodReadiness = { checks: [], overall: "ready_for_dogfood", blockers: [], watchItems: [], rollbackConditions: [] };
const entry = (date: string, over: Partial<DogfoodObservationEntry> = {}): DogfoodObservationEntry => ({
  date, readinessOverall: "ready_for_activation", dogfoodOverall: "ready_for_dogfood", blockers: [],
  concerns: { overPessimism: false, markerExplosion: false, diagnosticWorsening: false, overChange: false }, anyConcern: false, activationCandidatePresent: true, ...over,
});

describe("summarizeShadowToObservation — derived only", () => {
  it("date/readiness/dogfood/concerns/verdict/activation候補 を derived で記録（raw なし）", () => {
    const e = summarizeShadowToObservation({ date: "2026-06-08", shadowReport: shadow(), dogfoodReadiness: dogfood, activationCandidatePresent: true });
    expect(e.date).toBe("2026-06-08");
    expect(e.readinessOverall).toBe("ready_for_activation");
    expect(e.anyConcern).toBe(false);
    expect(e.activationCandidatePresent).toBe(true);
  });
  it("★raw GPS / pace ratio / friction field を持たない", () => {
    const e = summarizeShadowToObservation({ date: "2026-06-08", shadowReport: shadow(), dogfoodReadiness: dogfood, activationCandidatePresent: false });
    const keys = Object.keys(e);
    expect(keys).not.toContain("medianRatio");
    expect(keys).not.toContain("lat");
    expect(keys).not.toContain("lng");
    expect(keys).not.toContain("friction");
    expect(keys.sort()).toEqual(["activationCandidatePresent", "anyConcern", "blockers", "concerns", "date", "dogfoodOverall", "readinessOverall"].sort());
  });
});

describe("assessDogfoodStability — 複数日判定", () => {
  function journal(entries: DogfoodObservationEntry[]): DogfoodSafetyJournal {
    return entries.reduce((j, e) => setObservation(j, e), EMPTY_DOGFOOD_JOURNAL);
  }
  it("観測 < 3日 → insufficient", () => {
    expect(assessDogfoodStability(journal([entry("2026-06-06"), entry("2026-06-07")])).stability).toBe("insufficient");
  });
  it("★3日以上・懸念ゼロ → stable_safe", () => {
    const r = assessDogfoodStability(journal([entry("2026-06-06"), entry("2026-06-07"), entry("2026-06-08")]));
    expect(r.stability).toBe("stable_safe");
    expect(r.daysObserved).toBe(3);
    expect(r.daysWithConcern).toBe(0);
  });
  it("★3日以上だが1日でも懸念あり → unstable", () => {
    const r = assessDogfoodStability(journal([
      entry("2026-06-06"),
      entry("2026-06-07", { anyConcern: true, concerns: { overPessimism: true, markerExplosion: false, diagnosticWorsening: false, overChange: false } }),
      entry("2026-06-08"),
    ]));
    expect(r.stability).toBe("unstable");
    expect(r.daysWithConcern).toBe(1);
  });
  it("空 → insufficient", () => {
    expect(assessDogfoodStability(EMPTY_DOGFOOD_JOURNAL).stability).toBe("insufficient");
  });
});

describe("setObservation / parse — 冪等・fail-open・raw 排除", () => {
  it("同 date は上書き（1日1entry）", () => {
    let j = setObservation(EMPTY_DOGFOOD_JOURNAL, entry("2026-06-08", { anyConcern: false }));
    j = setObservation(j, entry("2026-06-08", { anyConcern: true }));
    expect(Object.keys(j.byDate)).toHaveLength(1);
    expect(j.byDate["2026-06-08"].anyConcern).toBe(true);
  });
  it("壊れた JSON / version 不一致 → empty", () => {
    expect(parseDogfoodJournal("{broken")).toEqual(EMPTY_DOGFOOD_JOURNAL);
    expect(parseDogfoodJournal(JSON.stringify({ version: 999, byDate: {} }))).toEqual(EMPTY_DOGFOOD_JOURNAL);
  });
  it("★raw 値混入 entry は drop（既知 field のみ採用）", () => {
    const dirty = { version: DOGFOOD_JOURNAL_SCHEMA_VERSION, byDate: { "2026-06-08": { ...entry("2026-06-08"), lat: 35.6, medianRatio: 1.5 } } };
    const parsed = parseDogfoodJournal(JSON.stringify(dirty));
    const e = parsed.byDate["2026-06-08"] as unknown as Record<string, unknown>;
    expect(e.lat).toBeUndefined();
    expect(e.medianRatio).toBeUndefined();
  });
});

describe("record→load round-trip（localStorage mock）", () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(),
      key: (i: number) => Array.from(m.keys())[i] ?? null,
      get length() { return m.size; },
    } as Storage;
  });
  afterEach(() => { delete (globalThis as { localStorage?: Storage }).localStorage; });

  it("record → load で再現・key 確認", () => {
    recordDogfoodObservation(entry("2026-06-08"));
    expect(loadDogfoodJournal().byDate["2026-06-08"]?.date).toBe("2026-06-08");
    expect(localStorage.getItem(DOGFOOD_JOURNAL_KEY)).not.toBeNull();
  });
});
