/**
 * Life Ops Growth Neuron Taxonomy（pure 契約）。CEO 指定 12 項目を固定。
 *   5 カテゴリ branch valid・unknown invalid・free text/PII 流入不可・habit と非混同・evidence→根拠文・低圧維持。
 */
import { describe, it, expect } from "vitest";
import {
  GROWTH_NEURON_TAXONOMY,
  getNeuronBranch,
  isValidNeuronSelection,
  sanitizeNeuronSelections,
  neuronValueLabel,
  buildHabitNeuronContext,
  type NeuronSelection,
} from "@/lib/lifeops/growth-neuron";
import { generateHabitCandidates, type HabitObservation } from "@/lib/lifeops/habit-model";
import { generateLifeOpsCandidates } from "@/lib/lifeops/candidate-engine";
import { toLifeOpsCardViewModel } from "@/lib/lifeops/card-presenter";
import { assessLifeOpsPermission } from "@/lib/lifeops/permission";

const BLAME = /やるべき|遅れ|未達|サボ|必ず|べき/;
const sel = (dimension: string, valueId: string): NeuronSelection => ({ dimension, valueId });

function dims(categoryId: string): string[] {
  return getNeuronBranch(categoryId)!.dimensions.map((d) => d.id);
}
function habitObs(over: Partial<HabitObservation> = {}): HabitObservation {
  // ease_in（週後半・ペース遅れ）で候補化される基準形
  return { categoryId: "study", weeklyTarget: 3, doneThisWeek: 1, daysSinceLast: 2, weekElapsedRatio: 0.6, ...over };
}

describe("Neuron (1)-(5) 各カテゴリの branch dimension が valid", () => {
  it("(1) study: domain/purpose/target/current_level/goal_level/method/unit/friction/evidence", () => {
    expect(dims("study")).toEqual(["domain", "purpose", "target", "current_level", "goal_level", "method", "unit", "friction", "evidence"]);
    expect(isValidNeuronSelection("study", sel("domain", "english"))).toBe(true);
    expect(isValidNeuronSelection("study", sel("method", "review"))).toBe(true);
    expect(isValidNeuronSelection("study", sel("current_level", "beginner"))).toBe(true);
  });
  it("(2) workout: goal/mode/intensity/body_state/unit/evidence", () => {
    expect(dims("workout")).toEqual(["goal", "mode", "intensity", "body_state", "unit", "evidence"]);
    expect(isValidNeuronSelection("workout", sel("mode", "stretch"))).toBe(true);
    expect(isValidNeuronSelection("workout", sel("intensity", "very_light"))).toBe(true);
  });
  it("(3) reading: purpose/material_type/mode/unit/evidence", () => {
    expect(dims("reading")).toEqual(["purpose", "material_type", "mode", "unit", "evidence"]);
    expect(isValidNeuronSelection("reading", sel("mode", "deep_read"))).toBe(true);
  });
  it("(4) weekly_review: scope/output/depth/evidence", () => {
    expect(dims("weekly_review")).toEqual(["scope", "output", "depth", "evidence"]);
    expect(isValidNeuronSelection("weekly_review", sel("output", "reflection"))).toBe(true);
  });
  it("(5) skill_practice: skill/practice_type/level/unit/evidence", () => {
    expect(dims("skill_practice")).toEqual(["skill", "practice_type", "level", "unit", "evidence"]);
    expect(isValidNeuronSelection("skill_practice", sel("skill", "aviation"))).toBe(true);
  });
});

describe("Neuron (6) unknown は invalid", () => {
  it("未知 dimension / 未知 value / 他カテゴリの dimension / 非 growth カテゴリ → false", () => {
    expect(isValidNeuronSelection("study", sel("bogus_dim", "english"))).toBe(false);
    expect(isValidNeuronSelection("study", sel("domain", "bogus_value"))).toBe(false);
    expect(isValidNeuronSelection("study", sel("goal", "strength"))).toBe(false); // workout の dimension
    expect(isValidNeuronSelection("beauty_salon", sel("domain", "english"))).toBe(false); // growth 外
    expect(isValidNeuronSelection("unknown_cat", sel("domain", "english"))).toBe(false);
  });
});

describe("Neuron (7) free text / raw note / user_id / DB id を持たない", () => {
  it("自由記述・PII 風の selection は sanitize で drop（流入遮断）", () => {
    const dirty: NeuronSelection[] = [
      sel("domain", "english"), // valid
      sel("note", "今日は疲れたのでやる気が出ない…"), // 自由記述 → drop
      sel("user_id", "uuid-1234-abcd"), // PII 風 → drop
      sel("domain", "山田さんに勝ちたい"), // free text value → drop
    ];
    const clean = sanitizeNeuronSelections("study", dirty);
    expect(clean).toEqual([sel("domain", "english")]);
  });
  it("taxonomy の値は {id,label} の 2 key のみ（raw/メモ slot が存在しない）", () => {
    for (const branch of Object.values(GROWTH_NEURON_TAXONOMY)) {
      for (const dim of branch.dimensions) {
        for (const value of dim.values) {
          expect(Object.keys(value).sort()).toEqual(["id", "label"]);
        }
      }
    }
  });
  it("label は定数からのみ（未知 id は null・入力文字列が表示に乗らない）", () => {
    expect(neuronValueLabel("study", "method", "review")).toBe("復習");
    expect(neuronValueLabel("study", "method", "<script>alert(1)</script>")).toBeNull();
  });
});

describe("Neuron (8) habit candidate と neuron metadata の非混同", () => {
  it("neuron は habit dueReason の optional metadata（判定は不変・cycle 候補には存在しない）", () => {
    const withNeuron = generateHabitCandidates([habitObs({ neuronSelections: [sel("method", "review"), sel("unit", "min5")] })])[0];
    const without = generateHabitCandidates([habitObs()])[0];
    expect(withNeuron.dueReason.kind).toBe("habit");
    expect(without.dueReason.kind).toBe("habit");
    if (withNeuron.dueReason.kind === "habit" && without.dueReason.kind === "habit") {
      expect(withNeuron.dueReason.phase).toBe(without.dueReason.phase); // 判定に影響しない
      expect(withNeuron.dueReason.neuron).toBeDefined();
      expect(without.dueReason.neuron).toBeUndefined(); // 無ければ省略
    }
    // cycle（cadence）候補に neuron は構造的に存在しない
    const cycle = generateLifeOpsCandidates([{ categoryId: "groceries", lastCompletedAtISO: "2026-06-01" }], "2026-06-12T00:00:00Z")[0];
    expect(cycle.dueReason.kind).toBe("cycle");
    expect("neuron" in cycle.dueReason).toBe(false);
  });
  it("buildHabitNeuronContext: 3 slot のみ・全部 invalid なら undefined", () => {
    const ctx = buildHabitNeuronContext("study", [sel("method", "review"), sel("unit", "min5"), sel("evidence", "long_pause"), sel("domain", "english")]);
    expect(ctx).toEqual({ approachLabel: "復習", unitLabel: "5分", evidenceKind: "long_pause" }); // domain は候補に載せない
    expect(buildHabitNeuronContext("study", [sel("bogus", "x")])).toBeUndefined();
    expect(buildHabitNeuronContext("study", [])).toBeUndefined();
  });
});

describe("Neuron (9) evidence slot が根拠文言に使える / (10) 低圧維持", () => {
  function vmFor(selections: NeuronSelection[], categoryId = "study") {
    const [c] = generateHabitCandidates([habitObs({ categoryId, neuronSelections: selections })]);
    return toLifeOpsCardViewModel(c, assessLifeOpsPermission(c));
  }
  it("(9) evidence → 補足行の根拠文（4 種とも低圧）", () => {
    expect(vmFor([sel("evidence", "recent_struggle")]).timingHint).toBe("最近は詰まりやすかったので、軽くで十分です");
    expect(vmFor([sel("evidence", "long_pause")]).timingHint).toBe("間が空くのは自然なことです");
    expect(vmFor([sel("evidence", "sustained_streak")]).timingHint).toBe("これまでの積み重ねがあります");
    expect(vmFor([sel("evidence", "recent_success")]).timingHint).toBe("最近うまくいった流れがあります");
  });
  it("(10) approach/unit 精緻化しても「やるべき」系にならない", () => {
    const ease = vmFor([sel("method", "review")]); // ease_in × 復習
    expect(ease.reasonText).toBe("復習を軽めに1回入れると、今週の流れを戻しやすいです");
    const gentle = generateHabitCandidates([habitObs({ categoryId: "workout", doneThisWeek: 0, daysSinceLast: 20, neuronSelections: [sel("unit", "one_set")] })])[0];
    const gentleVm = toLifeOpsCardViewModel(gentle, assessLifeOpsPermission(gentle));
    expect(gentleVm.reasonText).toBe("今日は1セットだけでも、戻るきっかけになります");
    for (const v of [ease, gentleVm]) {
      expect(BLAME.test(v.reasonText)).toBe(false);
      if (v.timingHint) expect(BLAME.test(v.timingHint)).toBe(false);
    }
  });
  it("neuron なしは従来文言のまま（後方互換）", () => {
    const v = vmFor([]);
    expect(v.reasonText).toBe("軽めに1回入れると、今週の流れを戻しやすいです");
    expect(v.timingHint).toBeNull();
  });
});

describe("Neuron pure", () => {
  it("同入力同出力", () => {
    const sels = [sel("method", "review"), sel("evidence", "long_pause")];
    expect(buildHabitNeuronContext("study", sels)).toEqual(buildHabitNeuronContext("study", sels));
  });
});
