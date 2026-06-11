/**
 * Life Ops Habit Engine（成長/学習・pure）。CEO 指定 10 項目を固定。
 *   週目標ペース・低圧文言(責めない)・cadence と非混同・met/on_track は出さない・collector/presenter 接続。
 */
import { describe, it, expect } from "vitest";
import {
  assessHabit,
  generateHabitCandidates,
  type HabitObservation,
} from "@/lib/lifeops/habit-model";
import { collectLifeOpsCandidates } from "@/lib/lifeops/candidate-collector";
import { toLifeOpsCardViewModel } from "@/lib/lifeops/card-presenter";
import { assessLifeOpsPermission } from "@/lib/lifeops/permission";
import { getCategorySpec, type LifeOpsCategoryId } from "@/lib/lifeops/category-model";
import type { LifeOpsCandidate } from "@/lib/lifeops/candidate-types";

function ob(over: Partial<HabitObservation> = {}): HabitObservation {
  return { categoryId: "workout", weeklyTarget: 3, doneThisWeek: 1, daysSinceLast: 2, weekElapsedRatio: 0.6, ...over };
}
// 責める語（絶対に出さない）
const BLAME = /やるべき|遅れ|未達|サボ|必ず|べき/;
const GROWTH = ["workout", "study", "reading", "weekly_review", "skill_practice"];

describe("Habit assessHabit — phase 判定", () => {
  it("週後半でペース遅れ → ease_in（候補）", () => {
    expect(assessHabit(ob({ weeklyTarget: 3, doneThisWeek: 1, weekElapsedRatio: 0.6, daysSinceLast: 2 })).phase).toBe("ease_in");
  });
  it("達成 → met（出さない）", () => {
    expect(assessHabit(ob({ weeklyTarget: 3, doneThisWeek: 3 })).phase).toBe("met");
    expect(assessHabit(ob({ weeklyTarget: 3, doneThisWeek: 4 })).phase).toBe("met");
  });
  it("ペース内 → on_track（出さない）", () => {
    expect(assessHabit(ob({ weeklyTarget: 3, doneThisWeek: 2, weekElapsedRatio: 0.5, daysSinceLast: 1 })).phase).toBe("on_track");
  });
  it("1週空いた → restart / 大きく空いた → gentle_restart", () => {
    expect(assessHabit(ob({ doneThisWeek: 0, daysSinceLast: 8 })).phase).toBe("restart");
    expect(assessHabit(ob({ doneThisWeek: 0, daysSinceLast: 20 })).phase).toBe("gentle_restart");
  });
  it("達成は gap より優先（達成済なら空いても出さない）", () => {
    expect(assessHabit(ob({ weeklyTarget: 3, doneThisWeek: 3, daysSinceLast: 20 })).phase).toBe("met");
  });
  it("weeklyTarget≤0 は met（無効・出さない）", () => {
    expect(assessHabit(ob({ weeklyTarget: 0 })).phase).toBe("met");
  });
});

describe("Habit generateHabitCandidates", () => {
  it("(1) habit target から候補が出る", () => {
    const out = generateHabitCandidates([ob({ weeklyTarget: 3, doneThisWeek: 1, weekElapsedRatio: 0.6 })]);
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("workout");
    expect(out[0].dueReason.kind).toBe("habit"); // (4) cadence と非混同
  });
  it("(2) weekly progress 十分なら候補が出ない", () => {
    expect(generateHabitCandidates([ob({ doneThisWeek: 3 })])).toEqual([]); // met
    expect(generateHabitCandidates([ob({ doneThisWeek: 2, weekElapsedRatio: 0.5, daysSinceLast: 1 })])).toEqual([]); // on_track
  });
  it("MVP 外 category は skip", () => {
    expect(generateHabitCandidates([ob({ categoryId: "not_growth" })])).toEqual([]);
  });
});

describe("Habit (3)(6) 低圧文言（責めない）", () => {
  function reason(phaseObs: HabitObservation): string {
    const [c] = generateHabitCandidates([phaseObs]);
    return toLifeOpsCardViewModel(c, assessLifeOpsPermission(c)).reasonText;
  }
  it("ease_in/restart/gentle_restart いずれも責める語を含まない", () => {
    const ease = reason(ob({ weeklyTarget: 3, doneThisWeek: 1, weekElapsedRatio: 0.6, daysSinceLast: 2 }));
    const restart = reason(ob({ doneThisWeek: 0, daysSinceLast: 8 }));
    const gentle = reason(ob({ doneThisWeek: 0, daysSinceLast: 20 }));
    for (const r of [ease, restart, gentle]) {
      expect(r.length).toBeGreaterThan(0); // (8) presenter 自然文
      expect(BLAME.test(r)).toBe(false); // (6) low-pressure
    }
    expect(ease).toContain("流れを戻しやすい");
    expect(restart).toContain("再開");
    expect(gentle).toContain("5分");
  });
  it("habit candidate の urgency は normal（低圧）", () => {
    const [c] = generateHabitCandidates([ob({ weeklyTarget: 3, doneThisWeek: 1, weekElapsedRatio: 0.6 })]);
    expect(toLifeOpsCardViewModel(c, assessLifeOpsPermission(c)).urgency).toBe("normal");
  });
});

describe("Habit (5) カテゴリ辞書 / (7) collector / (4) 非混同", () => {
  it("(5) 5 カテゴリが growth 群で valid", () => {
    for (const id of GROWTH as LifeOpsCategoryId[]) {
      const spec = getCategorySpec(id)!;
      expect(spec.group).toBe("growth");
      expect(spec.cyclic).toBe(false); // cadence でない
    }
  });
  it("(7) collector に habitObservations が合流（末尾・低圧）", () => {
    const out = collectLifeOpsCandidates(
      {
        habitObservations: [ob({ categoryId: "study", weeklyTarget: 3, doneThisWeek: 1, weekElapsedRatio: 0.6 })],
        deadlineObservations: [{ categoryId: "tax_filing", deadlineISO: "2026-06-05" }],
      },
      "2026-06-12T00:00:00Z",
    );
    const cats = out.map((c) => c.category);
    expect(cats).toContain("study");
    expect(cats.indexOf("tax_filing")).toBeLessThan(cats.indexOf("study")); // habit は deadline より後（低圧末尾）
  });
  it("(4) habit と cadence は dueReason.kind で区別（混同しない）", () => {
    const habit = generateHabitCandidates([ob()])[0];
    expect(habit.dueReason.kind).toBe("habit");
  });
});

describe("Habit pure", () => {
  it("同入力同出力", () => {
    const o = [ob()];
    expect(generateHabitCandidates(o)).toEqual(generateHabitCandidates(o));
  });
  it("候補は副作用フィールドを持たない（suggestedWindow null・menu null）", () => {
    const c: LifeOpsCandidate = generateHabitCandidates([ob()])[0];
    expect(c.suggestedWindow).toBeNull();
    expect(c.menu).toBeNull();
  });
});
