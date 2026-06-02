import { describe, it, expect } from "vitest";
import {
  flexibilityRank,
  isTentative,
  isProtected,
  isImmovable,
  isRepairTouchable,
  repairTouchOrder,
  promoteOnUserAdoption,
  type PlanItemGovernance,
} from "@/lib/plan/reality/authority";

function gov(p: Partial<PlanItemGovernance>): PlanItemGovernance {
  return {
    origin: "user",
    authority: "user_owned",
    flexibility: "movable",
    protectionReason: "user_declared",
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
  it("proposed OR tentative protectionReason ⇒ tentative", () => {
    expect(isTentative(gov({ authority: "proposed" }))).toBe(true);
    expect(isTentative(gov({ protectionReason: "tentative" }))).toBe(true);
    expect(isTentative(gov({ authority: "user_owned", protectionReason: "user_declared" }))).toBe(false);
  });

  it("isProtected true unless tentative", () => {
    expect(isProtected(gov({ protectionReason: "recovery_core" }))).toBe(true);
    expect(isProtected(gov({ protectionReason: "hard_external" }))).toBe(true);
    expect(isProtected(gov({ protectionReason: "tentative" }))).toBe(false);
  });
});

describe("reality/authority — immovability (INV-5 / INV-7)", () => {
  it("import_locked is immovable", () => {
    expect(isImmovable(gov({ authority: "import_locked", flexibility: "movable" }))).toBe(true);
  });

  it("hard_external (others/reservation/payment) is immovable", () => {
    expect(isImmovable(gov({ protectionReason: "hard_external", flexibility: "movable" }))).toBe(true);
  });

  it("user_owned ∧ locked is immovable", () => {
    expect(isImmovable(gov({ authority: "user_owned", flexibility: "locked" }))).toBe(true);
  });

  it("AI proposal (proposed) is NOT immovable even if locked (it is only a proposal)", () => {
    expect(
      isImmovable(gov({ origin: "alter_generated", authority: "proposed", flexibility: "locked", protectionReason: "tentative" }))
    ).toBe(false);
  });

  it("a plain movable user item is touchable", () => {
    const g = gov({ flexibility: "movable", protectionReason: "user_declared" });
    expect(isImmovable(g)).toBe(false);
    expect(isRepairTouchable(g)).toBe(true);
  });
});

describe("reality/authority — promoteOnUserAdoption (Part A-3)", () => {
  it("adopting an AI tentative proposal promotes authority and protectionReason, keeps origin", () => {
    const proposal = gov({ origin: "alter_generated", authority: "proposed", flexibility: "shortenable", protectionReason: "tentative" });
    const adopted = promoteOnUserAdoption(proposal);
    expect(adopted.origin).toBe("alter_generated"); // history preserved
    expect(adopted.authority).toBe("user_owned");
    expect(adopted.protectionReason).toBe("user_declared");
    expect(isTentative(adopted)).toBe(false);
  });

  it("adopting as recovery core marks recovery_core (AI-generated recovery becomes protected)", () => {
    const proposal = gov({ origin: "alter_generated", authority: "proposed", protectionReason: "tentative" });
    const adopted = promoteOnUserAdoption(proposal, { asRecoveryCore: true });
    expect(adopted.protectionReason).toBe("recovery_core");
    expect(isProtected(adopted)).toBe(true);
  });

  it("does not downgrade an already-strong protectionReason", () => {
    const g = gov({ authority: "proposed", protectionReason: "hard_external" });
    expect(promoteOnUserAdoption(g).protectionReason).toBe("hard_external");
  });
});
