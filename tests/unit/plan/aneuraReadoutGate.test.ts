import { describe, it, expect, vi, afterEach } from "vitest";

import {
  isAneuraReadoutProdEnabled,
  isAneuraObserveProdEnabled,
} from "@/lib/plan/aneuraReadoutGate";
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

afterEach(() => vi.unstubAllEnvs());

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

// B: localStorage 観測（OBSERVE master）
const B_GATES: ReadonlyArray<readonly [string, () => boolean]> = [
  ["postVisitCheck", isPostVisitCheckEnabled],
  ["candidateLensPrefObs", isCandidateLensPrefObsEnabled],
  ["candidateLensPrefApply", isCandidateLensPrefApplyEnabled],
];

describe("aneuraReadoutGate helpers", () => {
  it("READOUTS master: env true → true / 未設定 → false", () => {
    vi.stubEnv("NEXT_PUBLIC_ANEURASYNC_READOUTS_PROD", "true");
    expect(isAneuraReadoutProdEnabled()).toBe(true);
    vi.unstubAllEnvs();
    expect(isAneuraReadoutProdEnabled()).toBe(false);
  });
  it("OBSERVE master: env true → true / 未設定 → false", () => {
    vi.stubEnv("NEXT_PUBLIC_ANEURASYNC_OBSERVE_PROD", "true");
    expect(isAneuraObserveProdEnabled()).toBe(true);
    vi.unstubAllEnvs();
    expect(isAneuraObserveProdEnabled()).toBe(false);
  });
});

describe("A 一族（READOUTS master）— production default false / master true で true", () => {
  for (const [name, gate] of A_GATES) {
    it(`${name}: production + master 未設定 → false（退化なし）`, () => {
      vi.stubEnv("NODE_ENV", "production");
      expect(gate()).toBe(false);
    });
    it(`${name}: production + READOUTS master=true → true（本番解放）`, () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_ANEURASYNC_READOUTS_PROD", "true");
      expect(gate()).toBe(true);
    });
    it(`${name}: A は OBSERVE master では点火しない（分離）`, () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_ANEURASYNC_OBSERVE_PROD", "true");
      expect(gate()).toBe(false);
    });
  }
});

describe("B 一族（OBSERVE master）— production default false / observe true で true", () => {
  for (const [name, gate] of B_GATES) {
    it(`${name}: production + observe 未設定 → false（退化なし・write/observe なし）`, () => {
      vi.stubEnv("NODE_ENV", "production");
      expect(gate()).toBe(false);
    });
    it(`${name}: production + OBSERVE master=true → true`, () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_ANEURASYNC_OBSERVE_PROD", "true");
      expect(gate()).toBe(true);
    });
    it(`${name}: B は READOUTS master では点火しない（分離）`, () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_ANEURASYNC_READOUTS_PROD", "true");
      expect(gate()).toBe(false);
    });
  }
});

describe("既存個別 flag 互換（壊さない）", () => {
  it("candidateLensUi: 既存 NEXT_PUBLIC_PLACE_CANDIDATE_LENS_UI=true は引き続き本番点火", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_PLACE_CANDIDATE_LENS_UI", "true");
    expect(isCandidateLensUiEnabled()).toBe(true);
  });
  it("各 A 一族: dev では従来どおり（master 不要で評価される）", () => {
    vi.stubEnv("NODE_ENV", "development");
    // const true の代表（inverseWhatIf/scenarioComparison）は dev ON
    expect(isInverseWhatIfEnabled()).toBe(true);
    expect(isScenarioComparisonEnabled()).toBe(true);
  });
});
