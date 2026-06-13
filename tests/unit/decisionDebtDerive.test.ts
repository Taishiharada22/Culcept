/**
 * deriveDecisionDebt + buildMomentDecisionContext（RC2a-4）— GPT 必須 12 項
 * 正本: RG0.6 §5 / addendum §4 / CEO RC2a-4 GO
 */
import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { compileEventRealityNodes } from "@/lib/plan/realityCore/compileEventRealityNodes";
import { compileMovementReality } from "@/lib/plan/realityCore/movementReality";
import { compileCommitmentSignals } from "@/lib/plan/realityCore/commitmentSignal";
import {
  deriveDecisionDebt,
  buildMomentDecisionContext,
  decisionDebtViolations,
  DECISION_DEBT_DERIVE_VERSION,
  DECISION_DEBT_COMPONENT_KEYS,
} from "@/lib/plan/realityCore/decisionDebt";
import { REALITY_DERIVATION_VERSIONS } from "@/lib/plan/realityCore/graphIdentity";
import { makeRealityInstantJst } from "@/lib/plan/realityCore/realityInstant";
import { deriveMomentState } from "@/lib/plan/dayState/deriveMomentState";

const DATE = "2026-06-12";

function anchor(over: Partial<ExternalAnchor> & { id: string; startTime: string }): ExternalAnchor {
  return {
    anchorKind: "one_off",
    sourceId: "src-manual",
    title: "予定",
    date: DATE,
    rigidity: "soft",
    confirmedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  } as unknown as ExternalAnchor;
}

function debtFor(anchors: ExternalAnchor[]) {
  const { graph } = buildDayGraph({ anchors, date: DATE });
  const ern = compileEventRealityNodes({ date: DATE, graph, anchors });
  const mv = compileMovementReality({ date: DATE, graph });
  const cs = compileCommitmentSignals({ date: DATE, graph, anchors });
  return deriveDecisionDebt({ subjectiveDate: DATE, graph, ern, mv, cs });
}

describe("derive version 一致（RC2a-1b §4）", () => {
  it("DECISION_DEBT_DERIVE_VERSION === manifest", () => {
    expect(DECISION_DEBT_DERIVE_VERSION).toBe(REALITY_DERIVATION_VERSIONS.decisionDebt);
  });
});

describe("#1 place missing → placeDebt は 0 にならない", () => {
  it("場所欠落予定あり → placeDebt count > 0", () => {
    const dd = debtFor([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00" }), // locationText なし
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "渋谷" }),
    ]);
    expect(dd.components.placeDebt.value).toBeGreaterThan(0);
    expect(dd.components.placeDebt.status).not.toBe("unknown");
  });
  it("全予定に場所あり → placeDebt 0（データありの confirmed 0）", () => {
    const dd = debtFor([anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" })]);
    expect(dd.components.placeDebt.value).toBe(0);
  });
});

describe("#2/#3 mobilityDebt（route/ETA missing → 0 にしない・mv 不在を 0 と読まない）", () => {
  it("別場所間の mv あり → mobilityDebt > 0（v0 は ETA 未供給で全未解決）", () => {
    const dd = debtFor([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "新宿" }),
    ]);
    expect(dd.components.mobilityDebt.value).toBeGreaterThan(0);
    expect(dd.components.mobilityDebt.missingInputs).toContain("eta_source_missing");
  });
  it("#3 mv ノード不在 ∧ 場所欠落あり → mobilityDebt unknown（0 にしない）", () => {
    const dd = debtFor([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00" }), // 場所なし
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00" }), // 場所なし → mv 立たず
    ]);
    expect(dd.components.mobilityDebt.status).toBe("unknown");
    expect(dd.components.mobilityDebt.value).toBeNull(); // 0 ではない
    expect(dd.components.mobilityDebt.missingInputs).toContain("place_missing");
  });
});

describe("#4/#5 commitment と debt/permission の分離", () => {
  it("#4 decisionDebt は permission を持たない（緩めようがない）", () => {
    const dd = debtFor([anchor({ id: "a1", startTime: "10:00", endTime: "11:00", companions: ["X"] } as Partial<ExternalAnchor> & { id: string; startTime: string })]);
    expect("permissionLevel" in dd).toBe(false);
    expect("actionBoundary" in dd).toBe(false);
    expect("permissionLevel" in dd.components).toBe(false);
  });
  it("#5 commitment 高でも decisionDebt 合計に潰されない（commitment は debt 成分でない）", () => {
    const dd = debtFor([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", rigidity: "hard", companions: ["A", "B"] } as Partial<ExternalAnchor> & { id: string; startTime: string }),
    ]);
    // commitment は decisionDebt の成分キーに存在しない
    expect(DECISION_DEBT_COMPONENT_KEYS).not.toContain("commitmentDebt" as never);
    // knownComponentSummary は正本でなく debugOnly 派生
    expect(dd.knownComponentSummary.displayPolicy).toBe("debugOnly");
  });

  it("RC2a-4A #1: 高 changeCost(高 commitment)予定でも changeDebt は unknown（commitment を debt 値にしない）", () => {
    const dd = debtFor([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", rigidity: "hard", companions: ["A", "B"], sensitiveCategory: "medical" } as Partial<ExternalAnchor> & { id: string; startTime: string }),
    ]);
    expect(dd.components.changeDebt.status).toBe("unknown"); // 変更候補/drift source 未実装
    expect(dd.components.changeDebt.value).toBeNull(); // commitment 高でも debt 値にしない
    expect(dd.components.changeDebt.missingInputs).toContain("change_candidate_pending");
  });
});

describe("#6/#7/#8 未供給 source の成分は unknown（0/false でない）", () => {
  it("candidate/followup/snooze/confirmation/change は unknown・value null（source 未実装）", () => {
    const dd = debtFor([anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" })]);
    for (const key of ["candidateDebt", "followupDebt", "snoozeDebt", "confirmationDebt", "changeDebt"] as const) {
      expect(dd.components[key].status).toBe("unknown");
      expect(dd.components[key].value).toBeNull();
    }
    expect(dd.unknownComponents).toEqual(
      expect.arrayContaining(["candidateDebt", "followupDebt", "snoozeDebt", "confirmationDebt", "changeDebt"]),
    );
  });
});

describe("#11 field-level provenance（裸 number に差し替えると FAIL）", () => {
  it("全成分が RealityAttribute・違反 0 / 壊すと違反検出", () => {
    const dd = debtFor([anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" })]);
    expect(decisionDebtViolations(dd)).toEqual([]);
    const broken = { ...dd, components: { ...dd.components, placeDebt: { ...dd.components.placeDebt, value: 1, status: "unknown" as const } } };
    expect(decisionDebtViolations(broken).length).toBeGreaterThan(0);
  });
});

describe("#9/#10 Moment integration（Asia/Tokyo・subjectiveDate・minuteOfSubjectiveDay・browser local 非依存）", () => {
  it("RealityInstant を carry（再計算しない）・JST 固定", () => {
    // UTC 14:17 = JST 23:17（browser TZ に依存しない値）
    const instant = makeRealityInstantJst(new Date(Date.UTC(2026, 5, 12, 14, 17)));
    const { graph } = buildDayGraph({ anchors: [anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" })], date: DATE });
    const ern = compileEventRealityNodes({ date: DATE, graph, anchors: [anchor({ id: "a1", startTime: "10:00", locationText: "渋谷" })] });
    const dd = deriveDecisionDebt({ subjectiveDate: DATE, graph, ern, mv: [], cs: [] });
    const moment = deriveMomentState({ nowHHMM: instant.wallClockHHMM, segments: [] });
    const ctx = buildMomentDecisionContext({ instant, moment, ern, decisionDebt: dd });
    expect(ctx.instant.timezone).toBe("Asia/Tokyo");
    expect(ctx.instant.wallClockHHMM).toBe("23:17");
    expect(ctx.instant.subjectiveDate).toBe("2026-06-12");
    expect(ctx.instant.minuteOfSubjectiveDay).toBe((23 - 5) * 60 + 17);
    expect(ctx.decisionDebt).toBe(dd); // carry（同一参照）
  });
});

describe("single score に潰さない / knownComponentSummary 使用境界（RC2a-4A §5）", () => {
  it("components が正本・knownComponentSummary は debugOnly・unknownComponents を明示", () => {
    const dd = debtFor([anchor({ id: "a1", startTime: "10:00", endTime: "11:00" })]);
    expect(Object.keys(dd.components).sort()).toEqual([...DECISION_DEBT_COMPONENT_KEYS].sort());
    expect(dd.knownComponentSummary.displayPolicy).toBe("debugOnly");
    expect(dd.unknownComponents.length).toBeGreaterThan(0);
  });
  it("knownComponentSummary は unknown 成分を 0 として混ぜない（known 件数のみの合計）", () => {
    // place あり(0) + time explicit(0) + mobility 0 = 0。unknown 5 成分は加算されない
    const dd = debtFor([anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷", endTimeExplicit: true } as Partial<ExternalAnchor> & { id: string; startTime: string })]);
    const knownSum = (["placeDebt", "timeDebt", "mobilityDebt"] as const).reduce((a, k) => a + (dd.components[k].value ?? 0), 0);
    expect(dd.knownComponentSummary.value).toBe(knownSum); // unknown を 0 として足していない
  });
});
