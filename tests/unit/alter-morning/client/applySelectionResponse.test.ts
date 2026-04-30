/**
 * applySelectionResponse — client wiring fix verification
 *
 * CEO 2026-04-26 root-cause fix:
 *   selection endpoint は morningSession.pendingClarify={slot:"transport",...} を
 *   返すが、旧 client は dialogState/persistedEvents/phase/plan の 4 fields のみを
 *   propagate し、pendingClarify を捨てていた。本テストはその穴埋めを保証する。
 *
 * 検証観点:
 *   1. pendingClarify = {slot:"transport"} が setMorningPendingClarify に伝わる
 *   2. dialogState/persistedEvents/phase/plan の旧 4 fields も従来通り伝わる
 *   3. rawInputs/parsedIntent/sufficiency/personalizeHints/planStateV2/pipelineVersion
 *      も chat response handler と同等に伝わる
 *   4. field 省略（undefined）時は setter が呼ばれない（state 維持）
 *   5. pendingClarify=null は setter に null で渡される（リセット意図）
 */

import { describe, it, expect, vi } from "vitest";
import { applySelectionMorningSession } from "@/hooks/applySelectionResponse";
import type { SelectionResponseSetters } from "@/hooks/applySelectionResponse";

function mkSetters(): {
  setters: SelectionResponseSetters;
  spies: Record<keyof SelectionResponseSetters, ReturnType<typeof vi.fn>>;
} {
  const spies = {
    setMorningDialogState: vi.fn(),
    setMorningPersistedEvents: vi.fn(),
    setMorningPhase: vi.fn(),
    setMorningPlan: vi.fn(),
    setMorningPendingClarify: vi.fn(),
    setMorningRawInputs: vi.fn(),
    setMorningParsedIntent: vi.fn(),
    setMorningSufficiency: vi.fn(),
    setMorningPersonalizeHints: vi.fn(),
    setMorningPlanStateV2: vi.fn(),
    setMorningPipelineVersion: vi.fn(),
  };
  return { setters: spies as unknown as SelectionResponseSetters, spies };
}

describe("applySelectionMorningSession — CEO 2026-04-26 client wiring fix", () => {
  it("[ROOT CAUSE] propagates pendingClarify={slot:'transport'} to setMorningPendingClarify", () => {
    const { setters, spies } = mkSetters();

    // selection endpoint scope 4-B' + 4-C 後の canonical response 形
    const next = {
      dialogState: { conversationStatus: "stable", focus: null } as unknown,
      persistedEvents: [
        {
          event_id: "event_1",
          where: { place_ref: "TSUTAYA", placeType: "exact_proper_noun" },
          when: { startTime: "09:00" },
          what: { activity: "コーヒー" },
        },
      ],
      phase: "clarifying",
      plan: { date: "2026-04-26", items: [], dayConditions: {} },
      pendingClarify: {
        event_id: "event_1",
        slot: "transport",
        kind: "transport",
        scope: { event_id: "event_1" },
        question: "移動手段は何にする？",
        askedAt: "2026-04-26T05:00:00.000Z",
      },
    };

    applySelectionMorningSession(
      next as unknown as Record<string, unknown>,
      setters,
    );

    expect(spies.setMorningPendingClarify).toHaveBeenCalledTimes(1);
    expect(spies.setMorningPendingClarify).toHaveBeenCalledWith(
      expect.objectContaining({
        slot: "transport",
        kind: "transport",
        question: "移動手段は何にする？",
      }),
    );
  });

  it("propagates the legacy 4 fields (dialogState / persistedEvents / phase / plan)", () => {
    const { setters, spies } = mkSetters();
    const next = {
      dialogState: { conversationStatus: "stable" },
      persistedEvents: [{ event_id: "evt_1" }],
      phase: "clarifying",
      plan: { date: "2026-04-26", items: [] },
    };

    applySelectionMorningSession(
      next as unknown as Record<string, unknown>,
      setters,
    );

    expect(spies.setMorningDialogState).toHaveBeenCalledWith(next.dialogState);
    expect(spies.setMorningPersistedEvents).toHaveBeenCalledWith(
      next.persistedEvents,
    );
    expect(spies.setMorningPhase).toHaveBeenCalledWith("clarifying");
    expect(spies.setMorningPlan).toHaveBeenCalledWith(next.plan);
  });

  it("propagates rawInputs / parsedIntent / sufficiency / personalizeHints / planStateV2 / pipelineVersion (chat-handler parity)", () => {
    const { setters, spies } = mkSetters();
    const next = {
      rawInputs: ["明日9時に渋谷のスタバ"],
      parsedIntent: { topPriorities: [] },
      sufficiency: { complete: false, missing: [] },
      personalizeHints: ["前回は90分で組んでたよ"],
      planStateV2: { items: [], turn: 2 },
      pipelineVersion: "v2" as const,
    };

    applySelectionMorningSession(
      next as unknown as Record<string, unknown>,
      setters,
    );

    expect(spies.setMorningRawInputs).toHaveBeenCalledWith(next.rawInputs);
    expect(spies.setMorningParsedIntent).toHaveBeenCalledWith(next.parsedIntent);
    expect(spies.setMorningSufficiency).toHaveBeenCalledWith(next.sufficiency);
    expect(spies.setMorningPersonalizeHints).toHaveBeenCalledWith(
      next.personalizeHints,
    );
    expect(spies.setMorningPlanStateV2).toHaveBeenCalledWith(next.planStateV2);
    expect(spies.setMorningPipelineVersion).toHaveBeenCalledWith("v2");
  });

  it("does not call setters for fields that are absent (undefined preserves prior state)", () => {
    const { setters, spies } = mkSetters();
    // 最小 response: phase のみ
    applySelectionMorningSession({ phase: "clarifying" }, setters);

    expect(spies.setMorningPhase).toHaveBeenCalledTimes(1);
    expect(spies.setMorningDialogState).not.toHaveBeenCalled();
    expect(spies.setMorningPersistedEvents).not.toHaveBeenCalled();
    expect(spies.setMorningPlan).not.toHaveBeenCalled();
    expect(spies.setMorningPendingClarify).not.toHaveBeenCalled();
    expect(spies.setMorningRawInputs).not.toHaveBeenCalled();
    expect(spies.setMorningParsedIntent).not.toHaveBeenCalled();
    expect(spies.setMorningSufficiency).not.toHaveBeenCalled();
    expect(spies.setMorningPersonalizeHints).not.toHaveBeenCalled();
    expect(spies.setMorningPlanStateV2).not.toHaveBeenCalled();
    expect(spies.setMorningPipelineVersion).not.toHaveBeenCalled();
  });

  it("propagates pendingClarify=null as null (explicit reset)", () => {
    const { setters, spies } = mkSetters();
    applySelectionMorningSession({ pendingClarify: null }, setters);

    expect(spies.setMorningPendingClarify).toHaveBeenCalledTimes(1);
    expect(spies.setMorningPendingClarify).toHaveBeenCalledWith(null);
  });

  it("normalizes pipelineVersion to null when value is not 'v2'", () => {
    const { setters, spies } = mkSetters();
    applySelectionMorningSession({ pipelineVersion: "v1" }, setters);
    expect(spies.setMorningPipelineVersion).toHaveBeenCalledWith(null);
  });

  it("normalizes empty arrays for rawInputs / personalizeHints when null", () => {
    const { setters, spies } = mkSetters();
    applySelectionMorningSession(
      { rawInputs: null, personalizeHints: null },
      setters,
    );
    expect(spies.setMorningRawInputs).toHaveBeenCalledWith([]);
    expect(spies.setMorningPersonalizeHints).toHaveBeenCalledWith([]);
  });
});
