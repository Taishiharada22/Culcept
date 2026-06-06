/**
 * Repair Candidate What-if Preview v0 — pure layer のテスト。
 * 定性 preview / category 3 系統 / confidence level / uncertainty / evidence trace / 禁止語なし / deterministic を検証。
 */
import { describe, it, expect } from "vitest";
import { previewRepairEffect, previewRepairEffects, type RepairEffectPreview } from "@/lib/plan/dayRehearsal/dayRepairPreview";
import type { DayRepairCandidate, DayRepairKind } from "@/lib/plan/dayRehearsal/dayRepairCandidates";
import type { Evidence } from "@/lib/plan/dayRehearsal/dayRehearsalTypes";

const EV: Evidence = { basis: ["b"], known: ["k"], unknown: [], inferred: [] };
const cand = (kind: DayRepairKind, targetStepIndex: number | null = 0): DayRepairCandidate => ({ kind, suggestion: "s", targetStepIndex, evidence: EV });
const ALL_KINDS: readonly DayRepairKind[] = ["leave_earlier", "protect_buffer", "confirm_uncertain", "use_recovery_window", "reduce_density"];

describe("previewRepairEffect", () => {
  it("W1. 全 kind が preview を返す（category/headline/body/confidence/uncertainty/evidence/appliesTo）", () => {
    for (const kind of ALL_KINDS) {
      const p = previewRepairEffect(cand(kind, 2));
      expect(p.kind).toBe(kind);
      expect(["effect", "clarity", "utilization"]).toContain(p.category);
      expect(p.headline.length).toBeGreaterThan(0);
      expect(p.body.length).toBeGreaterThan(0);
      expect(["high", "medium", "low"]).toContain(p.confidence);
      expect(Array.isArray(p.uncertainty)).toBe(true);
      expect(p.evidence).toBe(EV); // candidate evidence を保持
      expect(p.appliesTo).toBe(2); // targetStepIndex を保持
    }
  });

  it("W2. category 分類: effect(leave_earlier/protect_buffer/reduce_density) / clarity(confirm_uncertain) / utilization(use_recovery_window)", () => {
    expect(previewRepairEffect(cand("leave_earlier")).category).toBe("effect");
    expect(previewRepairEffect(cand("protect_buffer")).category).toBe("effect");
    expect(previewRepairEffect(cand("reduce_density")).category).toBe("effect");
    expect(previewRepairEffect(cand("confirm_uncertain")).category).toBe("clarity");
    expect(previewRepairEffect(cand("use_recovery_window")).category).toBe("utilization");
  });

  it("W3. confidence: effect=medium（reduce_density は低=low）/ clarity・utilization=high", () => {
    expect(previewRepairEffect(cand("leave_earlier")).confidence).toBe("medium");
    expect(previewRepairEffect(cand("protect_buffer")).confidence).toBe("medium");
    expect(previewRepairEffect(cand("reduce_density")).confidence).toBe("low"); // v0 弱く扱う
    expect(previewRepairEffect(cand("confirm_uncertain")).confidence).toBe("high");
    expect(previewRepairEffect(cand("use_recovery_window")).confidence).toBe("high");
  });

  it("W4. confirm_uncertain は clarity（改善でなく不確定の解消）・uncertainty に確認前の未確定", () => {
    const p = previewRepairEffect(cand("confirm_uncertain"));
    expect(p.category).toBe("clarity");
    expect(p.uncertainty.join("")).toContain("確認するまで");
  });

  it("W5. use_recovery_window は utilization（行動変更でなく既存余裕の活用）", () => {
    const p = previewRepairEffect(cand("use_recovery_window"));
    expect(p.category).toBe("utilization");
    expect(p.body).toContain("一息");
  });

  it("W6. reduce_density は弱い表現（予定削除/変更を促さない・decemt 決めつけない）", () => {
    const p = previewRepairEffect(cand("reduce_density"));
    expect(p.confidence).toBe("low");
    expect(p.body).not.toMatch(/削除|消す|外す|変更してください|減らしてください/); // 具体的予定変更を促さない
    expect(p.uncertainty.join("")).toContain("決めつけません");
  });

  it("W7. effect 候補は uncertainty に「度合い未確定」を持つ（定量を出さない）", () => {
    expect(previewRepairEffect(cand("leave_earlier")).uncertainty.length).toBeGreaterThan(0);
    expect(previewRepairEffect(cand("protect_buffer")).uncertainty.length).toBeGreaterThan(0);
  });

  it("W8. 禁止語・断定・生数値を含まない（headline+body+uncertainty）", () => {
    for (const kind of ALL_KINDS) {
      const p = previewRepairEffect(cand(kind));
      const all = [p.headline, p.body, ...p.uncertainty].join(" / ");
      expect(all).not.toMatch(/改善します|解決します|危険|警告|失敗|疲れ|壊れ|絶対|すべき|べきです/); // 禁止語・断定
      expect(all).not.toMatch(/\d/); // 生数値なし（定量を出さない）
      expect(all).not.toMatch(/high|medium|low|score|slack|shortfall/i); // confidence level/内部名を copy に出さない
    }
  });

  it("W9. deterministic（同一入力→同一出力）", () => {
    expect(previewRepairEffect(cand("leave_earlier", 3))).toEqual(previewRepairEffect(cand("leave_earlier", 3)));
  });
});

describe("previewRepairEffects", () => {
  it("W10. 候補配列を順序保持で map", () => {
    const out = previewRepairEffects([cand("leave_earlier", 0), cand("use_recovery_window", 1), cand("reduce_density", null)]);
    expect(out.map((x: RepairEffectPreview) => x.kind)).toEqual(["leave_earlier", "use_recovery_window", "reduce_density"]);
    expect(out.map((x) => x.appliesTo)).toEqual([0, 1, null]);
  });

  it("W11. 空配列 → 空配列", () => {
    expect(previewRepairEffects([])).toEqual([]);
  });
});
