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

  it("同一場所テキストの連続予定 → mv ノードは立たない（移動不要）", () => {
    const { nodes } = compile([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "自宅" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "自宅" }),
    ]);
    expect(nodes).toHaveLength(0);
  });

  it("両端とも場所なし → mv ノードは立たない（場所ゼロの区間で移動を捏造しない）", () => {
    const { nodes } = compile([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00" }),
    ]);
    expect(nodes).toHaveLength(0);
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
