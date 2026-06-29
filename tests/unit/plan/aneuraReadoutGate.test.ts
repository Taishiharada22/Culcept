import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  isAneuraReadoutProdEnabled,
  isAneuraObserveProdEnabled,
} from "@/lib/plan/aneuraReadoutGate";
import { EVAL_OS_CANARY_OPTIN_KEY } from "@/lib/plan/aneuraCanaryOptIn";
import { isInverseWhatIfEnabled } from "@/lib/plan/dayRehearsal/inverseWhatIf";
import { isScenarioComparisonEnabled } from "@/lib/plan/dayRehearsal/scenarioComparison";
import { isMovementToleranceReasonUiEnabled } from "@/lib/plan/mobility/movementToleranceReasonUi";
import { isEnergyRhythmReasonUiEnabled } from "@/lib/plan/mobility/energyRhythmReasonUi";
import { isPlaceAffinityReasonEnabled } from "@/lib/plan/compose/placeAffinityReasonUi";
import { isFitArcReadoutEnabled } from "@/lib/plan/postVisit/fitArcReadout";
import {
  isCandidateLensUiEnabled,
  isCandidateLensExplanationEnabled,
} from "@/lib/plan/candidateLens/candidateLensUi";
import { isPostVisitCheckEnabled } from "@/lib/plan/postVisit/postVisitObservation";
import {
  isCandidateLensPrefObsEnabled,
  isCandidateLensPrefApplyEnabled,
} from "@/lib/plan/candidateLens/candidateLensPreferenceStore";

// ★canary scope guard: env true でも opt-in した browser だけ点火（localStorage opt-in）。
//   jsdom 不使用ゆえ globalThis に Map-backed localStorage を注入（既存 store test と同流儀）。
class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
}
const optIn = () => globalThis.localStorage.setItem(EVAL_OS_CANARY_OPTIN_KEY, "1");
const optOut = () => globalThis.localStorage.removeItem(EVAL_OS_CANARY_OPTIN_KEY);

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = new MemStorage() as unknown as Storage;
});
afterEach(() => {
  vi.unstubAllEnvs();
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

// A: 純表示 readout 一族（READOUTS master）
const A_GATES: ReadonlyArray<readonly [string, () => boolean]> = [
  ["inverseWhatIf", isInverseWhatIfEnabled],
  ["scenarioComparison", isScenarioComparisonEnabled],
  ["movementToleranceReason", isMovementToleranceReasonUiEnabled],
  ["energyRhythmReason", isEnergyRhythmReasonUiEnabled],
  ["placeAffinityReason", isPlaceAffinityReasonEnabled],
  ["fitArcReadout", isFitArcReadoutEnabled],
  ["candidateLensUi", isCandidateLensUiEnabled],
  ["candidateLensExplanation", isCandidateLensExplanationEnabled],
];

// B: localStorage 観測の **記録**（OBSERVE master）。※ P3-c apply は B から decouple 済（下記 C 参照）。
const B_GATES: ReadonlyArray<readonly [string, () => boolean]> = [
  ["postVisitCheck", isPostVisitCheckEnabled],
  ["candidateLensPrefObs", isCandidateLensPrefObsEnabled],
];

describe("aneuraReadoutGate helpers（master ∧ canary opt-in）", () => {
  it("READOUTS master: env true ∧ opt-in → true / env true ∧ opt-in なし → false / env 未設定 → false", () => {
    vi.stubEnv("NEXT_PUBLIC_ANEURASYNC_READOUTS_PROD", "true");
    optIn();
    expect(isAneuraReadoutProdEnabled()).toBe(true);
    optOut();
    expect(isAneuraReadoutProdEnabled()).toBe(false); // ★scope guard: opt-in なしは false
    vi.unstubAllEnvs();
    optIn();
    expect(isAneuraReadoutProdEnabled()).toBe(false); // env 未設定は opt-in でも false
  });
  it("OBSERVE master: env true ∧ opt-in → true / env true ∧ opt-in なし → false / env 未設定 → false", () => {
    vi.stubEnv("NEXT_PUBLIC_ANEURASYNC_OBSERVE_PROD", "true");
    optIn();
    expect(isAneuraObserveProdEnabled()).toBe(true);
    optOut();
    expect(isAneuraObserveProdEnabled()).toBe(false); // ★scope guard
    vi.unstubAllEnvs();
    optIn();
    expect(isAneuraObserveProdEnabled()).toBe(false);
  });
});

describe("A 一族（READOUTS master ∧ opt-in）", () => {
  for (const [name, gate] of A_GATES) {
    it(`${name}: production + master 未設定 → false（退化なし）`, () => {
      vi.stubEnv("NODE_ENV", "production");
      optIn();
      expect(gate()).toBe(false);
    });
    it(`${name}: production + READOUTS master=true + opt-in → true（本番解放）`, () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_ANEURASYNC_READOUTS_PROD", "true");
      optIn();
      expect(gate()).toBe(true);
    });
    it(`${name}: ★scope guard: production + master=true + opt-in なし → false`, () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_ANEURASYNC_READOUTS_PROD", "true");
      // opt-in なし
      expect(gate()).toBe(false);
    });
    it(`${name}: A は OBSERVE master では点火しない（分離・opt-in 済でも）`, () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_ANEURASYNC_OBSERVE_PROD", "true");
      optIn();
      expect(gate()).toBe(false);
    });
  }
});

describe("B 一族（OBSERVE master ∧ opt-in）", () => {
  for (const [name, gate] of B_GATES) {
    it(`${name}: production + observe 未設定 → false（退化なし）`, () => {
      vi.stubEnv("NODE_ENV", "production");
      optIn();
      expect(gate()).toBe(false);
    });
    it(`${name}: production + OBSERVE master=true + opt-in → true`, () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_ANEURASYNC_OBSERVE_PROD", "true");
      optIn();
      expect(gate()).toBe(true);
    });
    it(`${name}: ★scope guard: production + OBSERVE master=true + opt-in なし → false`, () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_ANEURASYNC_OBSERVE_PROD", "true");
      expect(gate()).toBe(false);
    });
    it(`${name}: B は READOUTS master では点火しない（分離・opt-in 済でも）`, () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_ANEURASYNC_READOUTS_PROD", "true");
      optIn();
      expect(gate()).toBe(false);
    });
  }
});

// C: P3-c apply（OBSERVE から decouple・2026-06-28）— どちらの master でも本番点火しない・独自 P3-c GO を要する
describe("C: candidateLensPrefApply は OBSERVE/READOUTS どちらの master でも本番点火しない（decouple）", () => {
  it("production + OBSERVE master=true + opt-in でも apply は false（記録だけ開く）", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ANEURASYNC_OBSERVE_PROD", "true");
    optIn();
    expect(isCandidateLensPrefObsEnabled()).toBe(true); // 記録(P3-b)は OBSERVE+opt-in で開く
    expect(isCandidateLensPrefApplyEnabled()).toBe(false); // 供給(P3-c apply)は開かない
  });
  it("production + READOUTS master=true + opt-in でも false", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ANEURASYNC_READOUTS_PROD", "true");
    optIn();
    expect(isCandidateLensPrefApplyEnabled()).toBe(false);
  });
  it("production + 両 master 未設定 → false（退化なし）", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isCandidateLensPrefApplyEnabled()).toBe(false);
  });
});

describe("既存個別 flag 互換（壊さない）", () => {
  it("candidateLensUi: 既存 NEXT_PUBLIC_PLACE_CANDIDATE_LENS_UI=true は引き続き本番点火（opt-in 不要の独立 flag）", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_PLACE_CANDIDATE_LENS_UI", "true");
    expect(isCandidateLensUiEnabled()).toBe(true);
  });
  it("各 A 一族: dev では従来どおり（master/opt-in 不要で評価される）", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isInverseWhatIfEnabled()).toBe(true);
    expect(isScenarioComparisonEnabled()).toBe(true);
  });
});
