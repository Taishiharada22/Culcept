import { describe, it, expect } from "vitest";
import {
  flexibilityRank,
  hasProtection,
  primaryProtectionReason,
  isTentative,
  isProtected,
  isImmovable,
  isRepairTouchable,
  repairTouchOrder,
  promoteOnUserAdoption,
  PROTECTION_PRIORITY,
  type PlanItemGovernance,
  type ProtectionReason,
} from "@/lib/plan/reality/authority";

function gov(p: Partial<PlanItemGovernance>): PlanItemGovernance {
  return {
    origin: "user",
    authority: "user_owned",
    flexibility: "movable",
    protectionReasons: ["user_declared"],
    ...p,
  };
}

describe("reality/authority — flexibility ordering (INV-7)", () => {
  it("rank: droppable < shortenable < movable < locked", () => {
    expect(flexibilityRank("droppable")).toBeLessThan(flexibilityRank("shortenable"));
    expect(flexibilityRank("shortenable")).toBeLessThan(flexibilityRank("movable"));
    expect(flexibilityRank("movable")).toBeLessThan(flexibilityRank("locked"));
  });

  it("repairTouchOrder sorts droppable first, locked last, stable on ties", () => {
    const items = [
      { id: "a", governance: gov({ flexibility: "locked" }) },
      { id: "b", governance: gov({ flexibility: "droppable" }) },
      { id: "c", governance: gov({ flexibility: "movable" }) },
      { id: "d", governance: gov({ flexibility: "shortenable" }) },
      { id: "e", governance: gov({ flexibility: "droppable" }) },
    ];
    expect(repairTouchOrder(items).map((x) => x.id)).toEqual(["b", "e", "d", "c", "a"]);
  });

  it("repairTouchOrder does not mutate input", () => {
    const items = [
      { id: "a", governance: gov({ flexibility: "locked" }) },
      { id: "b", governance: gov({ flexibility: "droppable" }) },
    ];
    const order = items.map((x) => x.id);
    repairTouchOrder(items);
    expect(items.map((x) => x.id)).toEqual(order);
  });
});

describe("reality/authority — tentative & protection (INV-23)", () => {
  it("proposed OR no-non-tentative-reason ⇒ tentative", () => {
    expect(isTentative(gov({ authority: "proposed" }))).toBe(true);
    expect(isTentative(gov({ protectionReasons: ["tentative"] }))).toBe(true);
    expect(isTentative(gov({ protectionReasons: [] }))).toBe(true);
    expect(isTentative(gov({ authority: "user_owned", protectionReasons: ["user_declared"] }))).toBe(false);
  });

  it("isProtected true unless only tentative/empty", () => {
    expect(isProtected(gov({ protectionReasons: ["recovery_core"] }))).toBe(true);
    expect(isProtected(gov({ protectionReasons: ["hard_external"] }))).toBe(true);
    expect(isProtected(gov({ protectionReasons: ["tentative"] }))).toBe(false);
    expect(isProtected(gov({ protectionReasons: [] }))).toBe(false);
  });
});

describe("reality/authority — composite protection reasons (GPT audit)", () => {
  it("a plan item can hold multiple reasons (recovery_core ∧ cascade_guard)", () => {
    const g = gov({ protectionReasons: ["recovery_core", "cascade_guard"] });
    expect(hasProtection(g, "recovery_core")).toBe(true);
    expect(hasProtection(g, "cascade_guard")).toBe(true);
    expect(hasProtection(g, "hard_external")).toBe(false);
  });

  it("primaryProtectionReason returns the strongest by priority", () => {
    expect(primaryProtectionReason(gov({ protectionReasons: ["cascade_guard", "recovery_core"] }))).toBe("recovery_core");
    expect(primaryProtectionReason(gov({ protectionReasons: ["recovery_core", "hard_external"] }))).toBe("hard_external");
    expect(primaryProtectionReason(gov({ protectionReasons: [] }))).toBe("tentative");
  });

  it("priority ordering is total and hard_external strongest, tentative weakest", () => {
    const order: ProtectionReason[] = ["hard_external", "user_declared", "recovery_core", "cascade_guard", "tentative"];
    for (let i = 0; i < order.length - 1; i++) {
      expect(PROTECTION_PRIORITY[order[i]]).toBeGreaterThan(PROTECTION_PRIORITY[order[i + 1]]);
    }
  });
});

describe("reality/authority — immovability (INV-5 / INV-7)", () => {
  it("import_locked is immovable", () => {
    expect(isImmovable(gov({ authority: "import_locked", flexibility: "movable" }))).toBe(true);
  });

  it("hard_external (others/reservation/payment) is immovable even amid composite reasons", () => {
    expect(isImmovable(gov({ protectionReasons: ["recovery_core", "hard_external"], flexibility: "movable" }))).toBe(true);
  });

  it("user_owned ∧ locked is immovable", () => {
    expect(isImmovable(gov({ authority: "user_owned", flexibility: "locked" }))).toBe(true);
  });

  it("AI proposal (proposed) is NOT immovable even if locked (it is only a proposal)", () => {
    expect(
      isImmovable(gov({ origin: "alter_generated", authority: "proposed", flexibility: "locked", protectionReasons: ["tentative"] }))
    ).toBe(false);
  });

  it("a plain movable user item is touchable", () => {
    const g = gov({ flexibility: "movable", protectionReasons: ["user_declared"] });
    expect(isImmovable(g)).toBe(false);
    expect(isRepairTouchable(g)).toBe(true);
  });
});

describe("reality/authority — promoteOnUserAdoption (Part A-3)", () => {
  it("adopting an AI tentative proposal promotes authority and reason, keeps origin", () => {
    const proposal = gov({ origin: "alter_generated", authority: "proposed", flexibility: "shortenable", protectionReasons: ["tentative"] });
    const adopted = promoteOnUserAdoption(proposal);
    expect(adopted.origin).toBe("alter_generated"); // history preserved
    expect(adopted.authority).toBe("user_owned");
    expect(adopted.protectionReasons).toEqual(["user_declared"]);
    expect(isTentative(adopted)).toBe(false);
  });

  it("adopting as recovery core composes recovery_core (AI walk becomes protected)", () => {
    const proposal = gov({ origin: "alter_generated", authority: "proposed", protectionReasons: ["tentative", "cascade_guard"] });
    const adopted = promoteOnUserAdoption(proposal, { asRecoveryCore: true });
    expect(adopted.protectionReasons).toContain("recovery_core");
    expect(adopted.protectionReasons).toContain("cascade_guard"); // kept
    expect(adopted.protectionReasons).not.toContain("tentative"); // dropped
    expect(isProtected(adopted)).toBe(true);
  });

  it("does not drop an already-strong reason and removes tentative", () => {
    const g = gov({ authority: "proposed", protectionReasons: ["hard_external", "tentative"] });
    const adopted = promoteOnUserAdoption(g);
    expect(adopted.protectionReasons).toEqual(["hard_external"]);
  });
});
