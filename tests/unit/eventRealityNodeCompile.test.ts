/**
 * compileEventRealityNodes（RC1c）— CEO RC1 GO の検証必須 8 項目の fixture
 * 正本: docs/reality-core-guardrail-r05.md / CEO 追加ガード 1-8
 */
import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { ExternalAnchorSource } from "@/lib/plan/external-anchor-source";
import {
  compileEventRealityNodes,
  eventRealityNodeViolations,
} from "@/lib/plan/realityCore/compileEventRealityNodes";
import { EVENT_REALITY_ATTRIBUTE_KEYS } from "@/lib/plan/realityCore/eventRealityNode";
import {
  HEURISTIC_CONFIDENCE_MAX,
  realityAttributeViolations,
  unknownAttribute,
} from "@/lib/plan/realityCore/realityAttribute";

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

function source(id: string, sourceType: ExternalAnchorSource["sourceType"]): ExternalAnchorSource {
  return { id, sourceType } as unknown as ExternalAnchorSource;
}

const SOURCES = [source("src-manual", "manual"), source("src-ics", "ics")];

function compile(anchors: ExternalAnchor[], sources: ExternalAnchorSource[] = SOURCES) {
  const { graph } = buildDayGraph({ anchors, date: DATE });
  return compileEventRealityNodes({ date: DATE, graph, anchors, sources });
}

describe("provenance invariants（全 10 属性が RealityAttribute・裸の値なし）", () => {
  it("compile 出力の全属性が status/displayPolicy/source/evidence 規約に適合（違反 0）", () => {
    const nodes = compile([
      anchor({ id: "a1", title: "ジム", startTime: "10:00", endTime: "11:00" }),
      anchor({ id: "a2", title: "会議", startTime: "14:00", endTime: "15:00", rigidity: "hard", sourceId: "src-ics" }),
    ]);
    expect(nodes).toHaveLength(2);
    for (const n of nodes) {
      expect(eventRealityNodeViolations(n)).toEqual([]);
      for (const key of EVENT_REALITY_ATTRIBUTE_KEYS) {
        const a = n[key];
        expect(a).toHaveProperty("status");
        expect(a).toHaveProperty("displayPolicy");
        expect(a).toHaveProperty("source");
        expect(a).toHaveProperty("confidence");
        expect(a).toHaveProperty("evidenceRefs");
      }
    }
  });

  it("壊れた attribute（unknown なのに値あり）は機械検証で FAIL する", () => {
    const broken = { ...unknownAttribute<number>(), value: 0.5 };
    expect(realityAttributeViolations("x", broken).length).toBeGreaterThan(0);
  });
});

describe("leave-by は null/unresolved を維持（ガード 8 — 偽 deadline 禁止）", () => {
  it("leaveBy.value=null・departureStatus=unresolved・whyUnresolved 明示", () => {
    const [n] = compile([anchor({ id: "a1", startTime: "10:00", endTime: "11:00" })]);
    expect(n.leaveBy.value).toBeNull();
    expect(n.leaveBy.status).toBe("unknown");
    expect(n.leaveBy.displayPolicy).toBe("hidden"); // 「出発期限」として表示されない
    expect(n.departureStatus.value).toBe("unresolved");
    expect(n.leaveBy.whyUnresolved).toContain("eta_source_missing");
  });
  it("場所なし → place_missing / 場所あり → route_missing", () => {
    const nodes = compile([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00" }), // locationText なし
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "渋谷" }),
    ]);
    const noPlace = nodes.find((n) => n.sourceRefs.anchorId === "a1")!;
    const withPlace = nodes.find((n) => n.sourceRefs.anchorId === "a2")!;
    expect(noPlace.leaveBy.whyUnresolved).toContain("place_missing");
    expect(withPlace.leaveBy.whyUnresolved).toContain("route_missing");
    expect(withPlace.leaveBy.value).toBeNull(); // 場所があっても deadline は出さない
  });
});

describe("delayImpact を断定しない（ガード 4 — 構造のみの cascadeSensitivity）", () => {
  it("delayImpact という field は存在しない", () => {
    const [n] = compile([anchor({ id: "a1", startTime: "10:00", endTime: "11:00" })]);
    expect("delayImpact" in n).toBe(false);
  });
  it("後続 strict あり → cascadeSensitivity true（debugOnly）/ なし → false", () => {
    const nodes = compile([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00" }),
      anchor({ id: "a2", title: "会議", startTime: "14:00", endTime: "15:00", rigidity: "hard" }),
    ]);
    const first = nodes.find((n) => n.sourceRefs.anchorId === "a1")!;
    const last = nodes.find((n) => n.sourceRefs.anchorId === "a2")!;
    // a2（会議・hard）の latencyTolerance が strict/tight なら a1 は構造的に波及し得る
    if (last.fixedness.value!.latencyTolerance === "strict" || last.fixedness.value!.latencyTolerance === "tight") {
      expect(first.cascadeSensitivity.value).toBe(true);
    }
    expect(last.cascadeSensitivity.value).toBe(false); // 最後尾の後続には strict が無い
    expect(first.cascadeSensitivity.displayPolicy).toBe("debugOnly");
    expect(last.cascadeSensitivity.displayPolicy).toBe("debugOnly");
  });
});

describe("energyCost は heuristic・confidence ≤0.35・debugOnly（ガード 7）", () => {
  it("status=heuristic / confidence ≤ 上限 / displayPolicy=debugOnly / 値 0-1", () => {
    const [n] = compile([anchor({ id: "a1", title: "作業", startTime: "10:00", endTime: "12:00" })]);
    expect(n.energyCost.status).toBe("heuristic");
    expect(n.energyCost.confidence).toBeLessThanOrEqual(HEURISTIC_CONFIDENCE_MAX);
    expect(n.energyCost.displayPolicy).toBe("debugOnly");
    expect(n.energyCost.value).toBeGreaterThanOrEqual(0);
    expect(n.energyCost.value).toBeLessThanOrEqual(1);
  });
});

describe("permission / eligibility は unknown なら blocked 側（ガード 6）", () => {
  it("sources に無い sourceId（unknown origin）→ permission 0 + blocked・全 canSuggest false・要確認", () => {
    const [n] = compile([anchor({ id: "a1", startTime: "10:00", endTime: "11:00", sourceId: "src-ghost" })]);
    expect(n.resolvedOrigin).toBe("unknown");
    expect(n.permissionLevel.status).toBe("blocked");
    expect(n.permissionLevel.value).toBe(0);
    expect(n.changeEligibility.status).toBe("blocked");
    const e = n.changeEligibility.value!;
    expect(e.canSuggestMove).toBe(false);
    expect(e.canSuggestShorten).toBe(false);
    expect(e.canSuggestSkip).toBe(false);
    expect(e.requiresConfirmation).toBe(true);
    expect(e.requiresExternalCommunication).toBe(true);
  });
  it("imported（ics）→ 要確認 / user soft 非対人 → move 提案可・Level 2 上限", () => {
    const nodes = compile([
      anchor({ id: "a1", title: "ジム", startTime: "10:00", endTime: "11:00" }), // manual soft
      anchor({ id: "a2", title: "通院", startTime: "14:00", endTime: "15:00", rigidity: "hard", sourceId: "src-ics" }),
    ]);
    const gym = nodes.find((n) => n.sourceRefs.anchorId === "a1")!;
    const imported = nodes.find((n) => n.sourceRefs.anchorId === "a2")!;
    expect(gym.changeEligibility.value!.canSuggestMove).toBe(true);
    expect(gym.permissionLevel.value).toBe(2);
    expect(imported.changeEligibility.value!.requiresConfirmation).toBe(true);
    expect(imported.permissionLevel.value).toBeLessThanOrEqual(1);
    for (const n of nodes) expect(n.permissionLevel.value!).toBeLessThanOrEqual(2); // v0 上限
  });
  it("対人の可能性（social/work verb）→ requiresConfirmation 側に倒す", () => {
    const [n] = compile([anchor({ id: "a1", title: "友達とごはん", startTime: "19:00", endTime: "21:00" })]);
    if (n.verb === "social" || n.verb === "work") {
      expect(n.changeEligibility.value!.requiresConfirmation).toBe(true);
      expect(n.changeEligibility.value!.canSuggestMove).toBe(false);
    }
  });
});

describe("stable identity（ガード 3 — index 非依存・順序非依存・reload 不変）", () => {
  const a1 = anchor({ id: "a1", startTime: "10:00", endTime: "11:00" });
  const a2 = anchor({ id: "a2", startTime: "14:00", endTime: "15:00" });

  it("id は ern:<date>:<anchorId> 形式・sourceRefs/snapshotId を保持", () => {
    const [n] = compile([a1]);
    expect(n.eventRealityNodeId).toBe(`ern:${DATE}:a1`);
    expect(n.sourceRefs.anchorId).toBe("a1");
    expect(n.sourceRefs.dayGraphNodeId).toBeTruthy();
    expect(n.sourceRefs.dayGraphSnapshotId).toBeTruthy();
  });

  it("入力順を入れ替えても同じ anchor は同じ id（配列 index 不使用）", () => {
    const idsAB = new Map(compile([a1, a2]).map((n) => [n.sourceRefs.anchorId, n.eventRealityNodeId]));
    const idsBA = new Map(compile([a2, a1]).map((n) => [n.sourceRefs.anchorId, n.eventRealityNodeId]));
    expect(idsAB.get("a1")).toBe(idsBA.get("a1"));
    expect(idsAB.get("a2")).toBe(idsBA.get("a2"));
  });

  it("再 compile（reload 相当）でも id 不変・cascadeSensitivity も順序非依存", () => {
    const first = compile([a1, a2]);
    const second = compile([a2, a1]);
    for (const n of first) {
      const m = second.find((x) => x.eventRealityNodeId === n.eventRealityNodeId)!;
      expect(m).toBeDefined();
      expect(m.cascadeSensitivity.value).toBe(n.cascadeSensitivity.value);
    }
  });
});

describe("subjectiveDate（05:00 境界）と unknown の表示規律", () => {
  it("02:00 開始の予定は前日の主観日に属する", () => {
    // boundary 既定 06:00-23:00 のため 02:00 は boundary 外 warning になる可能性 → boundary を広げて検証
    const { graph } = buildDayGraph({
      anchors: [anchor({ id: "a1", startTime: "02:00", endTime: "03:00" })],
      date: DATE,
      options: { startTime: "00:00", endTime: "23:00" },
    });
    const [n] = compileEventRealityNodes({ date: DATE, graph, anchors: [anchor({ id: "a1", startTime: "02:00" })], sources: SOURCES });
    expect(n.subjectiveDate).toBe("2026-06-11");
  });
  it("unknown 属性（placeCertainty / interpersonalLoad / movementRequired 無信号）は visible にならない", () => {
    const [n] = compile([anchor({ id: "a1", startTime: "10:00", endTime: "11:00" })]);
    expect(n.placeCertainty.displayPolicy).not.toBe("visible");
    expect(n.placeCertainty.value).toBeNull();
    expect(n.interpersonalLoad.displayPolicy).not.toBe("visible");
    expect(n.movementRequired.value).toBeNull(); // transition 無し → 「不要」と断定しない
  });
});
