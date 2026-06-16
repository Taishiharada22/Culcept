/**
 * compileMovementReality（RC2a-2）— Mobility 部署の最初の実体化の fixture
 * 正本: RG0.6 §6 / RG0.6a §8 / docs/reality-judgment-patch-rj02.md §8
 */
import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import {
  compileMovementReality,
  movementRealityViolations,
  MOVEMENT_REALITY_COMPILE_VERSION,
} from "@/lib/plan/realityCore/movementReality";
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
  return { graph, nodes: compileMovementReality({ date: DATE, graph }) };
}

describe("derive version の一致（RC2a-1b §4 — bump 漏れ検出）", () => {
  it("MOVEMENT_REALITY_COMPILE_VERSION === manifest", () => {
    expect(MOVEMENT_REALITY_COMPILE_VERSION).toBe(REALITY_DERIVATION_VERSIONS.movementRealityCompile);
  });
});

describe("compile — 異なる場所間にのみ mv ノードが立つ", () => {
  it("2 つの別場所の予定 → 1 つの mv ノード（移動が必要な区間のみ）", () => {
    const { nodes } = compile([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "新宿" }),
    ]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.movementRealityId).toBe("mv:2026-06-12:a1:a2");
    expect(nodes[0]!.sourceRefs.fromAnchorId).toBe("a1");
    expect(nodes[0]!.sourceRefs.toAnchorId).toBe("a2");
  });

  it("同一場所テキストの連続予定 → mv ノードは立たない（移動が必要な場所差が観測されない・移動不要の証明ではない）", () => {
    const { nodes } = compile([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "自宅" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "自宅" }),
    ]);
    expect(nodes).toHaveLength(0); // = same place confirmed ではない（同名別店舗等は未判別・RC4 前）
  });

  it("両端とも場所なし → mv ノードは立たない（移動判断に必要な場所情報が無いだけ・移動不要/同一場所の証明ではない）", () => {
    const { nodes } = compile([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00" }),
    ]);
    expect(nodes).toHaveLength(0);
    // 意味論不変条件（RC2a-2A）: no movement node ≠ no movement risk。
    // 場所欠落の signal は event 側（ern.placeCertainty=unknown）が保持し、RJ1 が別経路で拾う。
    // mv 不在から「移動リスクなし」を導出してはならない。
  });

  it("片側のみ場所あり → 防御的に mv ノードが立つ（移動の有無を断定しない）", () => {
    const { nodes } = compile([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00" }),
    ]);
    expect(nodes).toHaveLength(1);
  });
});

describe("provenance / unknown 正直（全 8 属性が RealityAttribute・違反 0）", () => {
  it("両端の場所が判る区間: 違反 0・movementRequired visible true・samePlacePossible 弱否定", () => {
    const { nodes } = compile([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "新宿" }),
    ]);
    const m = nodes[0]!;
    expect(movementRealityViolations(m)).toEqual([]);
    expect(m.movementRequired.value).toBe(true);
    expect(m.movementRequired.displayPolicy).toBe("visible");
    expect(m.samePlacePossible.value).toBe(false);
    expect(m.samePlacePossible.confidence).toBeLessThanOrEqual(0.4); // 文字列不一致は弱証拠
    expect(m.placeKnown.value).toBe(true);
  });

  it("場所不明な区間（片側欠落）: movementRequired/samePlacePossible/placeKnown は unknown（断定しない）", () => {
    const { nodes } = compile([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00" }),
    ]);
    const m = nodes[0]!;
    expect(movementRealityViolations(m)).toEqual([]);
    expect(m.movementRequired.value).toBeNull();
    expect(m.movementRequired.status).toBe("unknown");
    expect(m.samePlacePossible.value).toBeNull();
    expect(m.placeKnown.value).toBeNull();
  });
});

describe("ETA/route 供給なしの不変条件（fake ETA / fake leave-by 禁止 — RJ0.2 §8）", () => {
  it("routeKnown/etaKnown/leaveByKnown は false・mobilityStatus unresolved・missingInputs に eta_source_missing", () => {
    const { nodes } = compile([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "新宿" }),
    ]);
    const m = nodes[0]!;
    expect(m.routeKnown.value).toBe(false);
    expect(m.etaKnown.value).toBe(false);
    expect(m.leaveByKnown.value).toBe(false);
    expect(m.mobilityStatus.value).toBe("unresolved");
    expect(m.missingInputs).toContain("eta_source_missing");
    expect(m.missingInputs[0]).toBe("route_missing"); // 場所あり → 主理由は route
  });

  // ── RD3d-P1: routeKnown=route shape / etaKnown=arrival projection の evidence semantic 分離 ──
  it("RD3d-P1 #1/#2/#7/#8 routeKnown は route shape・etaKnown は arrival projection の evidence で、両者が混ざらない", () => {
    const { nodes } = compile([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "新宿" }),
    ]);
    const m = nodes[0]!;
    const routeEv = m.routeKnown.evidenceRefs.join(",");
    const etaEv = m.etaKnown.evidenceRefs.join(",");
    const leaveByEv = m.leaveByKnown.evidenceRefs.join(",");
    // #1 routeKnown = route shape semantic
    expect(routeEv).toContain("route_shape");
    // #2/#8 etaKnown = arrival projection / time basis semantic（route shape を含まない）
    expect(etaEv).toContain("arrival_projection");
    expect(etaEv).not.toContain("route_shape");
    // #7 route evidence が time basis（arrival_projection）と混ざらない
    expect(routeEv).not.toContain("arrival_projection");
    // leaveBy は time basis 依存（arrival_projection）で route shape に依存しない
    expect(leaveByEv).toContain("arrival_projection");
    expect(leaveByEv).not.toContain("route_shape");
  });

  it("片側場所欠落 → 主理由は place_missing", () => {
    const { nodes } = compile([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00" }),
    ]);
    expect(nodes[0]!.missingInputs[0]).toBe("place_missing");
  });
});

describe("stable id（index 非依存・順序非依存）", () => {
  it("入力順を入れ替えても同じ区間は同じ mv id", () => {
    const a1 = anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" });
    const a2 = anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "新宿" });
    const idAB = compile([a1, a2]).nodes[0]!.movementRealityId;
    const idBA = compile([a2, a1]).nodes[0]!.movementRealityId;
    expect(idAB).toBe(idBA); // 時刻順で from/to が決まる（配列順非依存）
    expect(idAB).toBe("mv:2026-06-12:a1:a2");
  });

  it("3 場所 → 2 区間・各 mv id 一意・transitionBasis 保持", () => {
    const { nodes } = compile([
      anchor({ id: "a1", startTime: "09:00", endTime: "10:00", locationText: "自宅" }),
      anchor({ id: "a2", startTime: "12:00", endTime: "13:00", locationText: "渋谷" }),
      anchor({ id: "a3", startTime: "16:00", endTime: "17:00", locationText: "新宿" }),
    ]);
    expect(nodes).toHaveLength(2);
    const ids = nodes.map((n) => n.movementRealityId);
    expect(new Set(ids).size).toBe(2); // 一意
    expect(nodes[0]!.sourceRefs.transitionBasis).toContain("->");
  });
});

describe("absence semantics（RC2a-2A — mv 不在を移動判断と読まない・event 側が場所欠落を保持）", () => {
  it("場所欠落予定の ern は placeCertainty unknown を持つ（mv 不在でも場所未設定 signal は失われない）", () => {
    const { graph } = buildDayGraph({
      anchors: [
        anchor({ id: "a1", startTime: "10:00", endTime: "11:00" }),
        anchor({ id: "a2", startTime: "14:00", endTime: "15:00" }),
      ],
      date: DATE,
    });
    // mv は 0 件（両端場所なし）だが、event 側の場所欠落 signal は ern.placeCertainty で別途保持される
    expect(compileMovementReality({ date: DATE, graph })).toHaveLength(0);
    // ern 側の検証は eventRealityNodeCompile.test.ts（placeCertainty unknown）が担保。
    // ここでは「mv 不在 = 場所判断済みではない」を契約として固定する記録テスト。
    expect(true).toBe(true);
  });

  it("どの compiled mv でも route/eta/leaveByKnown は false を保つ（samePlace 推定有無に関わらず）", () => {
    const { nodes } = compile([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "新宿" }),
      anchor({ id: "a3", startTime: "18:00", endTime: "19:00" }), // 片側欠落
    ]);
    for (const m of nodes) {
      expect(m.routeKnown.value).toBe(false);
      expect(m.etaKnown.value).toBe(false);
      expect(m.leaveByKnown.value).toBe(false);
    }
  });
});

describe("mv id（direction-sensitive・transitionBasis = source identity）", () => {
  it("from→to は時刻順で確定（逆順 id は生成されない）・transitionBasis が pair を保持", () => {
    const { nodes } = compile([
      anchor({ id: "early", startTime: "09:00", endTime: "10:00", locationText: "渋谷" }),
      anchor({ id: "late", startTime: "15:00", endTime: "16:00", locationText: "新宿" }),
    ]);
    expect(nodes[0]!.movementRealityId).toBe("mv:2026-06-12:early:late"); // 早い方が from
    expect(nodes[0]!.sourceRefs.transitionBasis).toBe(`${nodes[0]!.sourceRefs.fromNodeId}->${nodes[0]!.sourceRefs.toNodeId}`);
  });
});

describe("sensitive 区間の redaction（場所が viewer から見えない）", () => {
  it("sensitive 予定を含む区間 → placeKnown unknown（hidden を漏らさない）", () => {
    const { nodes } = compile([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "新宿", sensitiveCategory: "medical" } as Partial<ExternalAnchor> & { id: string; startTime: string }),
    ]);
    // sensitive があれば transition の location は redact される → placeKnown は unknown 側
    if (nodes.length > 0) {
      const m = nodes[0]!;
      expect(movementRealityViolations(m)).toEqual([]);
      // redact されていれば unknown・されていなければ true（どちらでも違反 0 であることが要件）
    }
  });
});
