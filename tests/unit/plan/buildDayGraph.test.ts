/**
 * Phase 3-K K-1e — buildDayGraph orchestration tests
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md §6 / §9 / §11
 *
 * 検証範囲:
 *   - 全 representative scenarios で buildDayGraph 成立
 *   - snapshotId deterministic + 形式
 *   - assertDayGraphCompliance 通る (= integrity + redaction)
 *   - warnings 集約
 *   - input mutation 0
 *   - formatDayGraphAsAscii の sensitive 漏洩なし
 */

import { describe, expect, it } from "vitest";

import {
  buildDayGraph,
  computeSnapshotId,
  computeAnchorContentRevision,
} from "@/lib/plan/dayGraph/buildDayGraph";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { formatDayGraphAsAscii } from "@/lib/plan/dayGraph/formatDayGraphAsAscii";
import {
  EMPTY_DAY_ANCHORS,
  HEAVY_DAY_ANCHORS,
  INVALID_DAY_ANCHORS,
  LIGHT_DAY_ANCHORS,
  MOVEMENT_DAY_ANCHORS,
  OVERLAP_DAY_ANCHORS,
  SENSITIVE_DAY_ANCHORS,
  SINGLE_DAY_ANCHORS,
} from "@/tests/fixtures/dayGraph";

const DATE = "2026-05-22";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Representative scenarios
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildDayGraph — Empty day", () => {
  it("anchor 0 → start + 1 large gap + end の 3 nodes", () => {
    const { graph, warnings } = buildDayGraph({
      anchors: EMPTY_DAY_ANCHORS,
      date: DATE,
    });
    expect(warnings.length).toBe(0);
    expect(graph.nodes.length).toBe(3);
    expect(graph.nodes[0]!.kind).toBe("start");
    expect(graph.nodes[1]!.kind).toBe("gap");
    expect(graph.nodes[2]!.kind).toBe("end");
    expect(graph.attributes.anchorCount).toBe(0);
    expect(graph.attributes.dayMood).toBe("recovery");
    expect(graph.attributes.density).toBe("sparse");
    expect(graph.transitions.length).toBe(0);
  });

  it("edges は 2 (= nodes - 1)", () => {
    const { graph } = buildDayGraph({ anchors: EMPTY_DAY_ANCHORS, date: DATE });
    expect(graph.edges.length).toBe(2);
  });
});

describe("buildDayGraph — Single day", () => {
  it("1 anchor → start + gap + event + gap + end の 5 nodes", () => {
    const { graph, warnings } = buildDayGraph({
      anchors: SINGLE_DAY_ANCHORS,
      date: DATE,
    });
    expect(warnings.length).toBe(0);
    expect(graph.nodes.length).toBe(5);
    expect(graph.nodes.map((n) => n.kind)).toEqual([
      "start",
      "gap",
      "event",
      "gap",
      "end",
    ]);
    expect(graph.attributes.anchorCount).toBe(1);
    expect(graph.attributes.dayMood).toBe("light");
    expect(graph.transitions.length).toBe(0);
  });
});

describe("buildDayGraph — Light day (= 2 events、 異 location)", () => {
  it("density=balanced、 transitions 1 件 (= 渋谷↔新宿 等)", () => {
    const { graph } = buildDayGraph({
      anchors: LIGHT_DAY_ANCHORS,
      date: DATE,
    });
    expect(graph.attributes.anchorCount).toBe(2);
    expect(graph.attributes.density).toBe("balanced");
    expect(graph.transitions.length).toBe(1);
  });
});

describe("buildDayGraph — Heavy day", () => {
  it("5 anchors → dayMood=heavy、 density=packed", () => {
    const { graph, warnings } = buildDayGraph({
      anchors: HEAVY_DAY_ANCHORS,
      date: DATE,
    });
    expect(warnings.length).toBe(0);
    expect(graph.attributes.anchorCount).toBe(5);
    expect(graph.attributes.dayMood).toBe("heavy");
    expect(graph.attributes.density).toBe("packed");
  });

  it("hasOverlap=false (= heavy day fixture は時刻重ならない)", () => {
    const { graph } = buildDayGraph({ anchors: HEAVY_DAY_ANCHORS, date: DATE });
    expect(graph.attributes.hasOverlap).toBe(false);
  });
});

describe("buildDayGraph — Sensitive day", () => {
  it("sensitive event は title / locationText が undefined、 displayLabel 安全", () => {
    const { graph } = buildDayGraph({
      anchors: SENSITIVE_DAY_ANCHORS,
      date: DATE,
    });
    expect(graph.attributes.hasSensitive).toBe(true);
    const sensEvents = graph.nodes.filter((n) => n.kind === "event" && n.sensitive);
    expect(sensEvents.length).toBe(2);
    for (const n of sensEvents) {
      if (n.kind !== "event") continue;
      expect(n.title).toBeUndefined();
      expect(n.locationText).toBeUndefined();
      expect(n.displayLabel.length).toBeGreaterThan(0);
    }
  });

  it("sensitive proximity transition は location undefined", () => {
    const { graph } = buildDayGraph({
      anchors: SENSITIVE_DAY_ANCHORS,
      date: DATE,
    });
    for (const t of graph.transitions) {
      if (t.sensitiveProximity) {
        expect(t.fromLocationText).toBeUndefined();
        expect(t.toLocationText).toBeUndefined();
      }
    }
  });
});

describe("buildDayGraph — Overlap day", () => {
  it("時刻 overlap → hasOverlap=true、 events 2 件", () => {
    const { graph } = buildDayGraph({
      anchors: OVERLAP_DAY_ANCHORS,
      date: DATE,
    });
    expect(graph.attributes.hasOverlap).toBe(true);
    const events = graph.nodes.filter((n) => n.kind === "event");
    expect(events.length).toBe(2);
  });
});

describe("buildDayGraph — Movement day", () => {
  it("場所変化 → transitions 生成", () => {
    const { graph } = buildDayGraph({
      anchors: MOVEMENT_DAY_ANCHORS,
      date: DATE,
    });
    // 渋谷 → 新宿、 新宿 → 新宿 (= no transition) で transitions 1 件期待
    expect(graph.transitions.length).toBe(1);
    expect(graph.transitions[0]!.fromNodeId).toBe("move_morning");
    expect(graph.transitions[0]!.toNodeId).toBe("move_afternoon");
  });
});

describe("buildDayGraph — Invalid anchors fixture", () => {
  it("invalid anchors → warnings 配列に集約、 valid のみ graph に含まれる", () => {
    const { graph, warnings } = buildDayGraph({
      anchors: INVALID_DAY_ANCHORS,
      date: DATE,
    });
    expect(warnings.length).toBeGreaterThan(0);
    const events = graph.nodes.filter((n) => n.kind === "event");
    expect(events.length).toBe(1);
    if (events[0] && events[0].kind === "event") {
      expect(events[0].anchorId).toBe("valid");
    }

    const kinds = warnings.map((w) => w.kind);
    expect(kinds).toContain("invalid_time");
    expect(kinds).toContain("anchor_outside_boundary");
    expect(kinds).toContain("end_before_start");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// snapshotId
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("snapshotId — deterministic + 形式", () => {
  it("同 input → 同 snapshotId", () => {
    const r1 = buildDayGraph({ anchors: SINGLE_DAY_ANCHORS, date: DATE });
    const r2 = buildDayGraph({ anchors: SINGLE_DAY_ANCHORS, date: DATE });
    expect(r1.graph.snapshotId).toBe(r2.graph.snapshotId);
  });

  it("anchor 順序を入れ替えても同 snapshotId (= sort 済)", () => {
    const a = SINGLE_DAY_ANCHORS;
    const b = [...SINGLE_DAY_ANCHORS].reverse();
    const ra = buildDayGraph({ anchors: a, date: DATE });
    const rb = buildDayGraph({ anchors: b, date: DATE });
    expect(ra.graph.snapshotId).toBe(rb.graph.snapshotId);
  });

  it("date 違い → 異 snapshotId", () => {
    const r1 = buildDayGraph({ anchors: SINGLE_DAY_ANCHORS, date: "2026-05-22" });
    const r2 = buildDayGraph({ anchors: SINGLE_DAY_ANCHORS, date: "2026-05-23" });
    expect(r1.graph.snapshotId).not.toBe(r2.graph.snapshotId);
  });

  it("options 違い → 異 snapshotId (= minGapMinutes)", () => {
    const r1 = buildDayGraph({ anchors: SINGLE_DAY_ANCHORS, date: DATE, options: { minGapMinutes: 30 } });
    const r2 = buildDayGraph({ anchors: SINGLE_DAY_ANCHORS, date: DATE, options: { minGapMinutes: 60 } });
    expect(r1.graph.snapshotId).not.toBe(r2.graph.snapshotId);
  });

  it("snapshotId 形式: 'daygraph:v2:{date}:{ids}:{start}-{end}:gap{min}:c{contentHash}'", () => {
    const { graph } = buildDayGraph({ anchors: SINGLE_DAY_ANCHORS, date: DATE });
    expect(graph.snapshotId).toMatch(/^daygraph:v2:2026-05-22:single_a:06:00-23:00:gap30:c[0-9a-f]{16}$/);
  });

  it("crypto 不使用、 deterministic string で十分（content revision を末尾に連結）", () => {
    const id = computeSnapshotId({
      date: DATE,
      anchorIds: ["b", "a", "c"],
      startTime: "06:00",
      endTime: "23:00",
      minGapMinutes: 30,
      contentRevision: "0123456789abcdef",
    });
    expect(id).toBe("daygraph:v2:2026-05-22:a,b,c:06:00-23:00:gap30:c0123456789abcdef");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RC2a-6A: content-aware snapshotId（identity root fix）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function anc(over: Partial<ExternalAnchor> & { id: string }): ExternalAnchor {
  return {
    anchorKind: "one_off",
    userId: "u1",
    title: "予定",
    startTime: "10:00",
    endTime: "11:00",
    rigidity: "soft",
    sourceId: "src",
    confirmedAt: "2026-05-01T00:00:00.000Z",
    date: DATE,
    ...over,
  } as ExternalAnchor;
}

function idOf(anchors: ExternalAnchor[]): string {
  return buildDayGraph({ anchors, date: DATE }).graph.snapshotId;
}

describe("RC2a-6A content-aware snapshotId — 同一 anchor ID 集合での内容変更を拾う", () => {
  it("startTime 変更 → snapshotId 変化（v1 では拾えなかった核バグ）", () => {
    expect(idOf([anc({ id: "a1", startTime: "10:00" })])).not.toBe(idOf([anc({ id: "a1", startTime: "13:00" })]));
  });
  it("locationText 変更 → snapshotId 変化", () => {
    expect(idOf([anc({ id: "a1", locationText: "渋谷" })])).not.toBe(idOf([anc({ id: "a1", locationText: "新宿" })]));
  });
  it("rigidity 変更 → snapshotId 変化", () => {
    expect(idOf([anc({ id: "a1", rigidity: "soft" })])).not.toBe(idOf([anc({ id: "a1", rigidity: "hard" })]));
  });
  it("companions 変更 → snapshotId 変化", () => {
    expect(idOf([anc({ id: "a1", companions: ["A"] })])).not.toBe(idOf([anc({ id: "a1", companions: ["A", "B"] })]));
  });
  it("title 変更 → snapshotId 変化", () => {
    expect(idOf([anc({ id: "a1", title: "飲み会" })])).not.toBe(idOf([anc({ id: "a1", title: "商談" })]));
  });
  it("内容完全同一 → snapshotId 一致（決定的）", () => {
    expect(idOf([anc({ id: "a1", locationText: "渋谷", companions: ["A"] })])).toBe(
      idOf([anc({ id: "a1", locationText: "渋谷", companions: ["A"] })]),
    );
  });
  it("sourceId 変更 → snapshotId 変化（DG0-A: rigidity provenance = sourceType→derive に効く derive-affecting field）", () => {
    expect(idOf([anc({ id: "a1", sourceId: "src-manual" })])).not.toBe(idOf([anc({ id: "a1", sourceId: "src-ics" })]));
  });
  it("非 content field（confirmedAt/confidence/externalUid/userId）変更 → snapshotId 不変（derive 読取 0 を確認済・過剰 invalidation しない）", () => {
    const base = idOf([anc({ id: "a1", confirmedAt: "2026-05-01T00:00:00.000Z", confidence: 0.9 })]);
    const other = idOf([anc({ id: "a1", confirmedAt: "2026-05-09T12:34:56.000Z", confidence: 0.3, userId: "u2", externalUid: "uid-x" })]);
    expect(base).toBe(other);
  });
});

describe("RC2a-6A computeAnchorContentRevision — 決定性 / 順序非依存 / privacy", () => {
  it("anchor 配列順を変えても revision 一致（id sort で order 非依存）", () => {
    const a = anc({ id: "a1", locationText: "渋谷" });
    const b = anc({ id: "b2", locationText: "新宿" });
    expect(computeAnchorContentRevision([a, b])).toBe(computeAnchorContentRevision([b, a]));
  });
  it("companions の順序は revision に影響しない（sort 済み）", () => {
    expect(computeAnchorContentRevision([anc({ id: "a1", companions: ["A", "B"] })])).toBe(
      computeAnchorContentRevision([anc({ id: "a1", companions: ["B", "A"] })]),
    );
  });
  it("raw text が snapshotId に直接出ない（FNV は raw 非直載せの fingerprint であって privacy guarantee ではない）", () => {
    // DG0-A: hash は raw text を id に載せないための fingerprint。低エントロピー text は hash でも推測余地が残る点に注意。
    const id = idOf([anc({ id: "a1", title: "極秘商談", locationText: "新宿の病院", companions: ["田中太郎"] })]);
    expect(id.includes("極秘商談")).toBe(false);
    expect(id.includes("新宿の病院")).toBe(false);
    expect(id.includes("田中太郎")).toBe(false);
  });
  it("NFC 正規化: 合成済み/分解済みの同一文字は同一 revision（byte 差を吸収）", () => {
    const composed = "ガ"; // U+30AC
    const decomposed = composed.normalize("NFD"); // U+30AB U+3099（byte 上は別）
    expect(decomposed).not.toBe(composed);
    expect(computeAnchorContentRevision([anc({ id: "a1", locationText: composed })])).toBe(
      computeAnchorContentRevision([anc({ id: "a1", locationText: decomposed })]),
    );
  });
  it("revision は 16 桁 hex（fnv1a64 fingerprint・内容同一の証明ではない）", () => {
    expect(computeAnchorContentRevision([anc({ id: "a1" })])).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Options override
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildDayGraph — options override", () => {
  it("user override boundary", () => {
    const { graph } = buildDayGraph({
      anchors: EMPTY_DAY_ANCHORS,
      date: DATE,
      options: { startTime: "08:00", endTime: "22:00" },
    });
    const start = graph.nodes[0]!;
    const end = graph.nodes[graph.nodes.length - 1]!;
    expect(start.startTime).toBe("08:00");
    expect(end.startTime).toBe("22:00");
    if (start.kind === "start") {
      expect(start.boundaryRationale.type).toBe("user_override");
    }
  });

  it("invalid boundary (= start >= end) → fallback graph + warning", () => {
    const { graph, warnings } = buildDayGraph({
      anchors: SINGLE_DAY_ANCHORS,
      date: DATE,
      options: { startTime: "23:00", endTime: "06:00" },
    });
    // start "23:00" + endTime override "06:00" は両者 valid だが
    // resolveBoundary は両者を valid と認識し、 buildDayGraph で
    // startBoundMin (= 1380) >= endBoundMin (= 360) で fallback 発火
    expect(warnings.some((w) => w.kind === "anchor_outside_boundary")).toBe(true);
    // fallback graph = start + end のみ
    expect(graph.nodes.length).toBe(2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IntegrityContract (= assertDayGraphCompliance) 内部実行
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildDayGraph — IntegrityContract 通過", () => {
  it("全 representative scenarios で assertDayGraphCompliance を通る", () => {
    const scenarios = [
      EMPTY_DAY_ANCHORS,
      SINGLE_DAY_ANCHORS,
      LIGHT_DAY_ANCHORS,
      HEAVY_DAY_ANCHORS,
      SENSITIVE_DAY_ANCHORS,
      OVERLAP_DAY_ANCHORS,
      MOVEMENT_DAY_ANCHORS,
    ];
    for (const anchors of scenarios) {
      expect(() => buildDayGraph({ anchors, date: DATE })).not.toThrow();
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// input mutation 0
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildDayGraph — input mutation 0", () => {
  it("anchors 配列 + 個別 anchor を mutate しない", () => {
    const anchors = [...SENSITIVE_DAY_ANCHORS];
    const frozen = JSON.stringify(anchors);
    buildDayGraph({ anchors, date: DATE });
    expect(JSON.stringify(anchors)).toBe(frozen);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// formatDayGraphAsAscii basic
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatDayGraphAsAscii — basic", () => {
  it("empty day を ASCII 化、 [START] と [END] が含まれる", () => {
    const { graph } = buildDayGraph({ anchors: EMPTY_DAY_ANCHORS, date: DATE });
    const ascii = formatDayGraphAsAscii(graph);
    expect(ascii).toContain("[START]");
    expect(ascii).toContain("[END]");
    expect(ascii).toContain("[GAP]");
    expect(ascii).toContain("DayGraph 2026-05-22");
    expect(ascii).toContain("mood=recovery");
  });

  it("non-sensitive event の displayLabel (= title) が出る", () => {
    const { graph } = buildDayGraph({ anchors: SINGLE_DAY_ANCHORS, date: DATE });
    const ascii = formatDayGraphAsAscii(graph);
    expect(ascii).toContain("カフェ");
  });
});
