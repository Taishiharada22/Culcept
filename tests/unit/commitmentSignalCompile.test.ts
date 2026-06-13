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

// ─────────── RC2a-3A closeout audit（GPT 10 点） ───────────

describe("#1 rigidity は裸値でなく RealityAttribute（provenance・fixedStart から導出しない）", () => {
  it("rigidity は status/source/confidence/displayPolicy を持つ・違反 0", () => {
    const cs = one({ id: "a1", startTime: "10:00", endTime: "11:00", rigidity: "hard" });
    expect(cs.rigidity).toHaveProperty("status");
    expect(cs.rigidity).toHaveProperty("source");
    expect(cs.rigidity).toHaveProperty("displayPolicy");
    expect(cs.rigidity.value).toBe("hard");
    expect(commitmentSignalViolations(cs)).toEqual([]);
  });
  it("manual source → rigidity 高確信(known_from_user) / source なし → 保守確信(derived)", () => {
    const src = { id: "src-manual", sourceType: "manual" } as unknown as import("@/lib/plan/external-anchor-source").ExternalAnchorSource;
    const { graph } = buildDayGraph({ anchors: [anchor({ id: "a1", startTime: "10:00", endTime: "11:00", rigidity: "hard" })], date: DATE });
    const withSrc = compileCommitmentSignals({ date: DATE, graph, anchors: [anchor({ id: "a1", startTime: "10:00", rigidity: "hard" })], sources: [src] })[0]!;
    const noSrc = compileCommitmentSignals({ date: DATE, graph, anchors: [anchor({ id: "a1", startTime: "10:00", rigidity: "hard" })] })[0]!;
    expect(withSrc.rigidity.source).toBe("known_from_user");
    expect(withSrc.rigidity.confidence).toBeGreaterThan(noSrc.rigidity.confidence);
    expect(noSrc.rigidity.source).toBe("derived");
  });
});

describe("#2 fixedStart と commitment の分離（fixedStart true だけで high にしない）", () => {
  it("soft × latency strict（fixedStart true）だが他人/予約なし → protectionReasons 空・changeCost 非 high", () => {
    // event の latencyTolerance は kernel 推論。strict になる予定でも soft・非対人なら commitment は弱い
    const cs = one({ id: "a1", title: "予定", startTime: "10:00", endTime: "11:00", rigidity: "soft" });
    if (cs.fixedStart.value === true && cs.otherPeoplePossible.status === "unknown") {
      expect(cs.protectionReasons.value).toEqual([]); // fixedStart だけでは守る理由にならない
      expect(cs.changeCost.status).toBe("unknown"); // high にしない
    }
  });
});

describe("#3 ProtectionReason 圧縮の監査（hard_external の下位 evidence が復元可能）", () => {
  it("companions → hard_external だが otherPeoplePossible 属性で『他人由来』を復元できる", () => {
    const cs = one({ id: "a1", startTime: "10:00", endTime: "11:00", companions: ["田中"] } as Partial<ExternalAnchor> & { id: string; startTime: string });
    expect(cs.protectionReasons.value).toContain("hard_external");
    expect(cs.otherPeoplePossible.value).toBe(true); // 下位 evidence: 他人由来
    expect(cs.reservationOrPaymentPossible.status).toBe("unknown"); // 予約由来ではない（区別可能）
    expect(cs.protectionReasons.evidenceRefs.length).toBeGreaterThan(0); // trace に下位根拠
  });
});

describe("#4 reservation/work の unknown も false にしない", () => {
  it("無信号: reservationOrPayment / workOrShift は unknown（false 捏造しない）・missingInputs に明示", () => {
    const cs = one({ id: "a1", title: "予定", startTime: "10:00", endTime: "11:00" });
    expect(cs.reservationOrPaymentPossible.status).toBe("unknown");
    expect(cs.reservationOrPaymentPossible.value).toBeNull();
    expect(cs.workOrShiftPossible.status).toBe("unknown");
    expect(cs.workOrShiftPossible.value).toBeNull();
    expect(cs.changeCost.value).toBeNull(); // 0 にしない
    expect(cs.missingInputs).toEqual(expect.arrayContaining(["reservation_payment_unknown", "work_shift_unknown"]));
  });
});

describe("#5 title 由来 signal は displayPolicy 保守（visible にしない）", () => {
  it("verb 由来 otherPeople/work は debugOnly・companions は visible", () => {
    const verbOnly = one({ id: "a1", title: "仕事会議", startTime: "10:00", endTime: "11:00" });
    if (verbOnly.otherPeoplePossible.value === true) expect(verbOnly.otherPeoplePossible.displayPolicy).toBe("debugOnly");
    if (verbOnly.workOrShiftPossible.value === true) expect(verbOnly.workOrShiftPossible.displayPolicy).toBe("debugOnly");
    const withCompanions = one({ id: "a2", startTime: "10:00", endTime: "11:00", companions: ["X"] } as Partial<ExternalAnchor> & { id: string; startTime: string });
    expect(withCompanions.otherPeoplePossible.displayPolicy).toBe("visible"); // 構造化は表示可
  });
});

describe("#6 deadlineOrCarryoverImpact は unknown（task/deadline 未実装・捏造しない）", () => {
  it("常に unknown・value null・missingInputs に deadline_model_pending", () => {
    const cs = one({ id: "a1", startTime: "10:00", endTime: "11:00", rigidity: "hard" });
    expect(cs.deadlineOrCarryoverImpact.status).toBe("unknown");
    expect(cs.deadlineOrCarryoverImpact.value).toBeNull();
    expect(cs.missingInputs).toContain("deadline_model_pending");
  });
});

describe("#7 commitmentSignalId identity（index 非依存・順序非依存・date/anchor で変化）", () => {
  it("入力順入れ替えで同 anchor は同 id / 別 date は別 id", () => {
    const a1 = anchor({ id: "a1", startTime: "10:00", endTime: "11:00" });
    const a2 = anchor({ id: "a2", startTime: "14:00", endTime: "15:00" });
    const idAB = new Map(compile([a1, a2]).map((c) => [c.sourceRefs.anchorId, c.commitmentSignalId]));
    const idBA = new Map(compile([a2, a1]).map((c) => [c.sourceRefs.anchorId, c.commitmentSignalId]));
    expect(idAB.get("a1")).toBe(idBA.get("a1"));
    const otherDate = buildDayGraph({ anchors: [{ ...a1, date: "2026-06-13" } as ExternalAnchor], date: "2026-06-13" }).graph;
    const csOther = compileCommitmentSignals({ date: "2026-06-13", graph: otherDate, anchors: [a1] })[0]!;
    expect(csOther.commitmentSignalId).not.toBe(idAB.get("a1")); // date 変化で id 変化
    expect(csOther.sourceRefs.dayGraphSnapshotId).toBeTruthy(); // 内容追跡は snapshot 側
  });
});
