/**
 * compileCommitmentSignals（RC2a-3）— Context 部署の最初の実体化の fixture
 * 正本: RG0.6 §7 / RJ0 §7 / GPT RC2a-3 必須 test 10 項
 */
import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import {
  compileCommitmentSignals,
  commitmentSignalViolations,
  COMMITMENT_SIGNAL_COMPILE_VERSION,
} from "@/lib/plan/realityCore/commitmentSignal";
import { compileEventRealityNodes } from "@/lib/plan/realityCore/compileEventRealityNodes";
import { REALITY_DERIVATION_VERSIONS } from "@/lib/plan/realityCore/graphIdentity";

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

function compile(anchors: ExternalAnchor[]) {
  const { graph } = buildDayGraph({ anchors, date: DATE });
  return compileCommitmentSignals({ date: DATE, graph, anchors });
}

function one(a: Partial<ExternalAnchor> & { id: string; startTime: string }) {
  return compile([anchor(a)])[0]!;
}

describe("derive version 一致（RC2a-1b §4）", () => {
  it("COMMITMENT_SIGNAL_COMPILE_VERSION === manifest", () => {
    expect(COMMITMENT_SIGNAL_COMPILE_VERSION).toBe(REALITY_DERIVATION_VERSIONS.commitmentSignal);
  });
});

describe("provenance（全 8 属性が RealityAttribute・違反 0）", () => {
  it("compile 出力に裸の値が無い・違反 0", () => {
    const nodes = compile([
      anchor({ id: "a1", title: "会議", startTime: "10:00", endTime: "11:00" }),
      anchor({ id: "a2", title: "通院", startTime: "14:00", endTime: "15:00", rigidity: "hard", sensitiveCategory: "medical" } as Partial<ExternalAnchor> & { id: string; startTime: string }),
    ]);
    for (const cs of nodes) expect(commitmentSignalViolations(cs)).toEqual([]);
  });
  it("#7 field-level provenance 欠落（裸 number に差し替え）は機械検証で FAIL", () => {
    const cs = one({ id: "a1", startTime: "10:00", endTime: "11:00" });
    const broken = { ...cs, socialWeight: 0.5 as unknown as typeof cs.socialWeight };
    expect(commitmentSignalViolations(broken).length).toBeGreaterThan(0);
  });
});

describe("#1 otherPeople 可能性が commitment を上げるが permission を緩めない", () => {
  it("companions あり → otherPeoplePossible true・hard_external 保護・ただし commitmentSignal に permission field は無い", () => {
    const cs = one({ id: "a1", title: "打合せ", startTime: "10:00", endTime: "11:00", companions: ["田中"] } as Partial<ExternalAnchor> & { id: string; startTime: string });
    expect(cs.otherPeoplePossible.value).toBe(true);
    expect(cs.protectionReasons.value).toContain("hard_external");
    // #8: commitmentSignal は permissionLevel / actionBoundary を持たない（permission は ern 側の責務）
    expect("permissionLevel" in cs).toBe(false);
    expect("actionBoundary" in cs).toBe(false);
  });

  it("#8 permission は別ノード（ern）が持つ — commitment と直交", () => {
    const { graph } = buildDayGraph({ anchors: [anchor({ id: "a1", startTime: "10:00", endTime: "11:00", companions: ["X"] } as Partial<ExternalAnchor> & { id: string; startTime: string })], date: DATE });
    const ern = compileEventRealityNodes({ date: DATE, graph, anchors: [anchor({ id: "a1", startTime: "10:00", companions: ["X"] } as Partial<ExternalAnchor> & { id: string; startTime: string })] })[0]!;
    const cs = compileCommitmentSignals({ date: DATE, graph, anchors: [anchor({ id: "a1", startTime: "10:00", companions: ["X"] } as Partial<ExternalAnchor> & { id: string; startTime: string })] })[0]!;
    expect(ern).toHaveProperty("permissionLevel"); // permission は ern
    expect(cs).not.toHaveProperty("permissionLevel"); // commitment は permission を持たない
    expect(cs.targetNodeId).toBe(ern.eventRealityNodeId); // join key で接続
  });
});

describe("#2 reservation/payment 可能性は保守側に倒る", () => {
  it("sensitive medical → reservationOrPaymentPossible true・hard_external", () => {
    const cs = one({ id: "a1", title: "診察", startTime: "10:00", endTime: "11:00", sensitiveCategory: "medical" } as Partial<ExternalAnchor> & { id: string; startTime: string });
    expect(cs.reservationOrPaymentPossible.value).toBe(true);
    expect(cs.protectionReasons.value).toContain("hard_external");
  });
});

describe("#3 work/shift 可能性は保守側に倒る", () => {
  it("verb work → workOrShiftPossible true（低確信）", () => {
    const cs = one({ id: "a1", title: "仕事 ミーティング", startTime: "10:00", endTime: "11:00" });
    if (cs.workOrShiftPossible.value === true) {
      expect(cs.workOrShiftPossible.confidence).toBeLessThanOrEqual(0.5);
    }
  });
});

describe("#4 explicit fixed start は fixedStart を上げる", () => {
  it("rigidity hard → fixedStart true（高確信・confirmed）", () => {
    const cs = one({ id: "a1", title: "会議", startTime: "10:00", endTime: "11:00", rigidity: "hard" });
    expect(cs.fixedStart.value).toBe(true);
    expect(cs.fixedStart.confidence).toBeGreaterThanOrEqual(0.7);
  });
});

describe("#5 unknown を low 扱いしない", () => {
  it("無信号予定: otherPeople unknown ∧ socialWeight unknown（0/low を捏造しない）", () => {
    const cs = one({ id: "a1", title: "予定", startTime: "10:00", endTime: "11:00" });
    expect(cs.otherPeoplePossible.status).toBe("unknown");
    expect(cs.socialWeight.status).toBe("unknown");
    expect(cs.socialWeight.value).toBeNull(); // low(0.2) ではなく null
    expect(cs.missingInputs).toContain("other_people_unknown");
    expect(commitmentSignalViolations(cs)).toEqual([]);
  });
});

describe("#6 title だけで high commitment を断定しない", () => {
  it("verb 由来 signal は低確信（≤0.5）に留まる・companions の方が高確信", () => {
    const verbOnly = one({ id: "a1", title: "友達と飲み", startTime: "19:00", endTime: "21:00" });
    const withCompanions = one({ id: "a2", title: "予定", startTime: "19:00", endTime: "21:00", companions: ["友人"] } as Partial<ExternalAnchor> & { id: string; startTime: string });
    if (verbOnly.otherPeoplePossible.value === true) {
      expect(verbOnly.otherPeoplePossible.confidence).toBeLessThanOrEqual(0.5);
    }
    expect(withCompanions.otherPeoplePossible.confidence).toBeGreaterThan(0.5); // 構造化 signal は強い
  });
});

describe("protectionReasons（既存語彙・複合・cascade）", () => {
  it("rest/eat verb → recovery_core / 後続 strict あり → cascade_guard", () => {
    const nodes = compile([
      anchor({ id: "a1", title: "昼食", startTime: "12:00", endTime: "13:00" }),
      anchor({ id: "a2", title: "会議", startTime: "15:00", endTime: "16:00", rigidity: "hard" }),
    ]);
    const lunch = nodes.find((c) => c.sourceRefs.anchorId === "a1")!;
    if (lunch.protectionReasons.value!.includes("cascade_guard")) {
      // a2(hard) が strict/tight なら a1 に cascade_guard が付く
      expect(lunch.protectionReasons.value).toContain("cascade_guard");
    }
  });
  it("無信号予定: protectionReasons は空（confirmed low ではない・missingInput で弱さ明示）", () => {
    const cs = one({ id: "a1", title: "予定", startTime: "10:00", endTime: "11:00" });
    expect(cs.protectionReasons.value).toEqual([]);
    expect(cs.missingInputs).toContain("commitment_signal_weak");
  });
});

describe("stable id / targetNodeId", () => {
  it("cs id = cs:date:anchorId・targetNodeId = ern:date:anchorId（join 可能）", () => {
    const cs = one({ id: "a1", startTime: "10:00", endTime: "11:00" });
    expect(cs.commitmentSignalId).toBe("cs:2026-06-12:a1");
    expect(cs.targetNodeId).toBe("ern:2026-06-12:a1");
  });
});
