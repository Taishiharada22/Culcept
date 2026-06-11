/**
 * Life Ops Recurrence Engine（毎月/毎年・pure）。
 *   次発生算出(当月/翌月・当年/翌年・月末クランプ)・within_lead/upcoming/unknown・候補化・collector 合流。
 */
import { describe, it, expect } from "vitest";
import {
  nextOccurrenceISO,
  computeRecurringStatus,
  generateRecurringCandidates,
  getRecurringLeadDays,
  type Recurrence,
  type RecurringObservation,
} from "@/lib/lifeops/recurrence-model";
import { collectLifeOpsCandidates } from "@/lib/lifeops/candidate-collector";

const NOW = "2026-06-12T00:00:00Z"; // 6/12
const monthly = (dayOfMonth: number): Recurrence => ({ kind: "monthly", dayOfMonth });
const annual = (month: number, day: number): Recurrence => ({ kind: "annual", month, day });

describe("Recurrence nextOccurrenceISO — 次発生", () => {
  it("monthly: 当月(未来)/当日/翌月(過去)", () => {
    expect(nextOccurrenceISO(monthly(15), NOW)).toBe("2026-06-15T00:00:00.000Z"); // 当月
    expect(nextOccurrenceISO(monthly(12), NOW)).toBe("2026-06-12T00:00:00.000Z"); // 当日
    expect(nextOccurrenceISO(monthly(10), NOW)).toBe("2026-07-10T00:00:00.000Z"); // 過去→翌月
  });
  it("monthly: 月末クランプ（31指定・2月→28）", () => {
    expect(nextOccurrenceISO(monthly(31), "2026-02-10T00:00:00Z")).toBe("2026-02-28T00:00:00.000Z");
  });
  it("annual: 当年(未来)/翌年(過去)", () => {
    expect(nextOccurrenceISO(annual(12, 25), NOW)).toBe("2026-12-25T00:00:00.000Z"); // 当年
    expect(nextOccurrenceISO(annual(1, 1), NOW)).toBe("2027-01-01T00:00:00.000Z"); // 過去→翌年
  });
  it("不正→null", () => {
    expect(nextOccurrenceISO(monthly(0), NOW)).toBeNull();
    expect(nextOccurrenceISO(monthly(32), NOW)).toBeNull();
    expect(nextOccurrenceISO(annual(13, 1), NOW)).toBeNull();
    expect(nextOccurrenceISO(monthly(15), "broken")).toBeNull();
  });
});

describe("Recurrence computeRecurringStatus — 段階(overdue なし)", () => {
  it("leadDays 以内→within_lead / 先→upcoming", () => {
    expect(computeRecurringStatus(3, monthly(15), NOW).phase).toBe("within_lead"); // 3日 ≤3
    expect(computeRecurringStatus(3, monthly(15), NOW).daysUntilNext).toBe(3);
    expect(computeRecurringStatus(3, monthly(20), NOW).phase).toBe("upcoming"); // 8日 >3
    expect(computeRecurringStatus(3, monthly(12), NOW).daysUntilNext).toBe(0); // 当日
  });
  it("不正→unknown", () => {
    expect(computeRecurringStatus(3, monthly(0), NOW).phase).toBe("unknown");
    expect(computeRecurringStatus(3, monthly(15), "broken").phase).toBe("unknown");
  });
  it("leadDays は MVP 事務（rent3/card3/sub7）", () => {
    expect(getRecurringLeadDays("rent")).toBe(3);
    expect(getRecurringLeadDays("subscription_review")).toBe(7);
    expect(getRecurringLeadDays("unknown")).toBeUndefined();
  });
});

describe("generateRecurringCandidates", () => {
  it("within_lead のみ候補化・recurring dueReason・昇順", () => {
    const obs: RecurringObservation[] = [
      { categoryId: "rent", recurrence: monthly(14) }, // 2日 within(≤3)
      { categoryId: "subscription_review", recurrence: monthly(18) }, // 6日 within(≤7)
      { categoryId: "card_payment", recurrence: monthly(25) }, // 13日 upcoming(>3) → skip
      { categoryId: "not_recurring", recurrence: monthly(14) }, // MVP外 → skip
    ];
    const out = generateRecurringCandidates(obs, NOW);
    expect(out.map((c) => c.category)).toEqual(["rent", "subscription_review"]); // daysUntil 2,6 昇順
    expect(out[0].dueReason.kind).toBe("recurring");
    if (out[0].dueReason.kind === "recurring") {
      expect(out[0].dueReason.daysUntilNext).toBe(2);
      expect(out[0].dueReason.recurrenceLabel).toBe("毎月");
    }
    expect(out[0].permissionLevelHint).toBe("L1");
  });
  it("空→空", () => expect(generateRecurringCandidates([], NOW)).toEqual([]));
});

describe("collector に recurring 合流", () => {
  it("recurringObservations が候補に出る（deadline の後・event/cycle と共存）", () => {
    const out = collectLifeOpsCandidates(
      {
        recurringObservations: [{ categoryId: "rent", recurrence: monthly(14) }], // within
        cadenceObservations: [{ categoryId: "groceries", lastCompletedAtISO: "2026-06-01" }], // beyond
      },
      NOW,
    );
    const cats = out.map((c) => c.category);
    expect(cats).toContain("rent");
    expect(cats).toContain("groceries");
    expect(cats.indexOf("rent")).toBeLessThan(cats.indexOf("groceries")); // recurring が cycle より前
  });
});
