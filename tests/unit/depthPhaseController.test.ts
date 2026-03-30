import { describe, it, expect } from "vitest";
import {
  resolvePhaseState,
  isFeatureAvailable,
  getFeatureAccess,
  type PhaseInput,
} from "@/lib/stargazer/depthPhaseController";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function makeInput(overrides: Partial<PhaseInput> = {}): PhaseInput {
  return {
    firstObservationDate: new Date().toISOString(),
    totalObservations: 0,
    ...overrides,
  };
}

describe("depthPhaseController", () => {
  // ── Phase Transitions ──

  describe("フェーズ判定", () => {
    it("Day 0, 0 obs → surface", () => {
      const state = resolvePhaseState(makeInput());
      expect(state.phase).toBe("surface");
    });

    it("Day 7, 4 obs → surface (observationsが不足)", () => {
      const state = resolvePhaseState(
        makeInput({
          firstObservationDate: daysAgo(7),
          totalObservations: 4,
        })
      );
      expect(state.phase).toBe("surface");
    });

    it("Day 8, 5 obs → awakening", () => {
      const state = resolvePhaseState(
        makeInput({
          firstObservationDate: daysAgo(8),
          totalObservations: 5,
        })
      );
      expect(state.phase).toBe("awakening");
    });

    it("Day 31, 20 obs → maturity", () => {
      const state = resolvePhaseState(
        makeInput({
          firstObservationDate: daysAgo(31),
          totalObservations: 20,
        })
      );
      expect(state.phase).toBe("maturity");
    });

    it("Day 91, 60 obs → deep", () => {
      const state = resolvePhaseState(
        makeInput({
          firstObservationDate: daysAgo(91),
          totalObservations: 60,
        })
      );
      expect(state.phase).toBe("deep");
    });

    it("Day 91, 50 obs → maturity (observationsが不足)", () => {
      const state = resolvePhaseState(
        makeInput({
          firstObservationDate: daysAgo(91),
          totalObservations: 50,
        })
      );
      expect(state.phase).toBe("maturity");
    });

    it("Day 30, 60 obs → awakening (日数が不足)", () => {
      const state = resolvePhaseState(
        makeInput({
          firstObservationDate: daysAgo(30),
          totalObservations: 60,
        })
      );
      expect(state.phase).toBe("awakening");
    });
  });

  // ── Phase Progress ──

  describe("フェーズ内進行度", () => {
    it("surface フェーズの進行度は 0-1", () => {
      const state = resolvePhaseState(
        makeInput({
          firstObservationDate: daysAgo(3),
          totalObservations: 2,
        })
      );
      expect(state.phaseProgress).toBeGreaterThanOrEqual(0);
      expect(state.phaseProgress).toBeLessThanOrEqual(1);
    });

    it("deep フェーズの進行度も 0-1", () => {
      const state = resolvePhaseState(
        makeInput({
          firstObservationDate: daysAgo(200),
          totalObservations: 150,
        })
      );
      expect(state.phaseProgress).toBeGreaterThanOrEqual(0);
      expect(state.phaseProgress).toBeLessThanOrEqual(1);
    });
  });

  // ── Next Phase ──

  describe("次のフェーズ", () => {
    it("surface の次は awakening", () => {
      const state = resolvePhaseState(makeInput());
      expect(state.nextPhase).toBe("awakening");
    });

    it("deep には次のフェーズがない", () => {
      const state = resolvePhaseState(
        makeInput({
          firstObservationDate: daysAgo(91),
          totalObservations: 60,
        })
      );
      expect(state.nextPhase).toBeUndefined();
    });
  });

  // ── Feature Gating ──

  describe("機能ゲーティング", () => {
    it("inner_weather は surface でも full", () => {
      const state = resolvePhaseState(makeInput());
      const iw = state.features.find((f) => f.feature === "inner_weather");
      expect(iw?.access).toBe("full");
    });

    it("blind_spot は 3 obs 未満で locked", () => {
      const state = resolvePhaseState(
        makeInput({ totalObservations: 2 })
      );
      const bs = state.features.find((f) => f.feature === "blind_spot");
      expect(bs?.access).toBe("locked");
    });

    it("blind_spot は surface + 3 obs で limited", () => {
      const state = resolvePhaseState(
        makeInput({
          firstObservationDate: daysAgo(3),
          totalObservations: 3,
        })
      );
      const bs = state.features.find((f) => f.feature === "blind_spot");
      expect(bs?.access).toBe("limited");
    });

    it("prophecy は awakening で limited", () => {
      const state = resolvePhaseState(
        makeInput({
          firstObservationDate: daysAgo(10),
          totalObservations: 8,
        })
      );
      const pr = state.features.find((f) => f.feature === "prophecy");
      expect(pr?.access).toBe("limited");
    });

    it("decision_oracle は maturity で limited、deep で full", () => {
      const maturityState = resolvePhaseState(
        makeInput({
          firstObservationDate: daysAgo(50),
          totalObservations: 30,
        })
      );
      const doMaturity = maturityState.features.find(
        (f) => f.feature === "decision_oracle"
      );
      expect(doMaturity?.access).toBe("limited");

      const deepState = resolvePhaseState(
        makeInput({
          firstObservationDate: daysAgo(100),
          totalObservations: 70,
        })
      );
      const doDeep = deepState.features.find(
        (f) => f.feature === "decision_oracle"
      );
      expect(doDeep?.access).toBe("full");
    });

    it("transformation は deep でのみ full", () => {
      const maturityState = resolvePhaseState(
        makeInput({
          firstObservationDate: daysAgo(50),
          totalObservations: 30,
        })
      );
      const tfMaturity = maturityState.features.find(
        (f) => f.feature === "transformation"
      );
      expect(tfMaturity?.access).toBe("locked");
    });
  });

  // ── forceFullAccess (beta tester) ──

  describe("forceFullAccess", () => {
    it("全機能が deep + full になる", () => {
      const state = resolvePhaseState(
        makeInput({ forceFullAccess: true })
      );
      expect(state.phase).toBe("deep");
      for (const f of state.features) {
        expect(f.access).toBe("full");
      }
    });
  });

  // ── isFeatureAvailable / getFeatureAccess ──

  describe("isFeatureAvailable", () => {
    it("locked な機能は false", () => {
      expect(
        isFeatureAvailable("transformation", makeInput())
      ).toBe(false);
    });

    it("利用可能な機能は true", () => {
      expect(
        isFeatureAvailable("inner_weather", makeInput())
      ).toBe(true);
    });
  });

  describe("getFeatureAccess", () => {
    it("存在しない機能は locked を返す", () => {
      const access = getFeatureAccess(
        "nonexistent" as never,
        makeInput()
      );
      expect(access.access).toBe("locked");
    });
  });

  // ── Phase Messages ──

  describe("phaseMessage", () => {
    it("各フェーズで日本語メッセージが返る", () => {
      const phases = [
        makeInput(),
        makeInput({ firstObservationDate: daysAgo(10), totalObservations: 8 }),
        makeInput({ firstObservationDate: daysAgo(50), totalObservations: 30 }),
        makeInput({ firstObservationDate: daysAgo(100), totalObservations: 70 }),
      ];
      for (const input of phases) {
        const state = resolvePhaseState(input);
        expect(state.phaseMessage.length).toBeGreaterThan(0);
      }
    });
  });
});
