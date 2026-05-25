/**
 * Phase 3-K-3a — dayGraphTimelinePresentation tests
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md K-3 設計提案 §3 / §4
 *
 * 検証範囲:
 *   - buildEndTimeHint: 4 状態 (explicit / assumed × not / clipped)
 *   - buildTimelineView: 全 node 種類 + transition + sensitive redaction
 *   - shared_view で sensitive event は generic 「予定」
 *   - className に amber/orange なし (= neutral slate のみ、 CEO 補正 4)
 *   - sensitive event の className に aura/blur 系なし (= CEO 補正 3)
 *   - MovementTransition は「→ 移動」 のみ (= duration 出さない、 Negative Capability)
 *   - graph mutation なし
 */

import { describe, expect, it } from "vitest";

import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import {
  buildCompactSummaryView,
  buildEndTimeHint,
  buildTimelineView,
} from "@/lib/plan/dayGraph/dayGraphTimelinePresentation";
import {
  EMPTY_DAY_ANCHORS,
  HEAVY_DAY_ANCHORS,
  MOVEMENT_DAY_ANCHORS,
  SENSITIVE_DAY_ANCHORS,
  SINGLE_DAY_ANCHORS,
} from "@/tests/fixtures/dayGraph";

const DATE = "2026-05-22";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildEndTimeHint — 4 状態
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildEndTimeHint — 4 状態 (= K-1f-α 直交)", () => {
  it("explicit + not clipped → '' (= 通常、 hint なし)", () => {
    expect(buildEndTimeHint("explicit", false)).toBe("");
  });

  it("explicit + clipped → '|'", () => {
    expect(buildEndTimeHint("explicit", true)).toBe("|");
  });

  it("assumed_default + not clipped → '~'", () => {
    expect(buildEndTimeHint("assumed_default", false)).toBe("~");
  });

  it("assumed_default + clipped → '~|'", () => {
    expect(buildEndTimeHint("assumed_default", true)).toBe("~|");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildTimelineView — 基本
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildTimelineView — empty day", () => {
  it("空 anchor → start + gap + end の 3 node、 transition 0", () => {
    const { graph } = buildDayGraph({ anchors: EMPTY_DAY_ANCHORS, date: DATE });
    const tl = buildTimelineView(graph);
    expect(tl.nodes.length).toBe(3);
    expect(tl.nodes[0]!.kind).toBe("start");
    expect(tl.nodes[1]!.kind).toBe("gap");
    expect(tl.nodes[2]!.kind).toBe("end");
    expect(tl.transitions.length).toBe(0);
    expect(Object.keys(tl.transitionsByFromNodeId).length).toBe(0);
  });
});

describe("buildTimelineView — single event", () => {
  it("1 anchor → start / gap / event / gap / end の 5 node", () => {
    const { graph } = buildDayGraph({ anchors: SINGLE_DAY_ANCHORS, date: DATE });
    const tl = buildTimelineView(graph);
    expect(tl.nodes.length).toBe(5);
    expect(tl.nodes.map((n) => n.kind)).toEqual([
      "start",
      "gap",
      "event",
      "gap",
      "end",
    ]);
    const ev = tl.nodes.find((n) => n.kind === "event")!;
    if (ev.kind !== "event") return;
    expect(ev.displayLabel).toBe("カフェ"); // single fixture title
    expect(ev.clickable).toBe(true);
    expect(ev.sensitive).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MovementTransition — 「→ 移動」 のみ (= Negative Capability)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildTimelineView — MovementTransition", () => {
  it("movement day → transition label は '→ 移動' (= duration 含まない)", () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const tl = buildTimelineView(graph);
    expect(tl.transitions.length).toBeGreaterThan(0);
    for (const t of tl.transitions) {
      expect(t.label).toBe("→ 移動");
      // duration / mode / distance 等を含まないこと (= Negative Capability)
      expect(t.label).not.toMatch(/分|min|時間/);
      expect(t.label).not.toMatch(/電車|徒歩|車|タクシー/);
    }
  });

  it("transitionsByFromNodeId map で from EventNode から lookup 可", () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const tl = buildTimelineView(graph);
    for (const t of tl.transitions) {
      expect(tl.transitionsByFromNodeId[t.fromNodeId]).toBeDefined();
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sensitive redaction (= CEO 補正 3、 No Aura)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildTimelineView — sensitive redaction", () => {
  it("sensitive event の displayLabel が raw title を含まない", () => {
    const { graph } = buildDayGraph({ anchors: SENSITIVE_DAY_ANCHORS, date: DATE });
    const tl = buildTimelineView(graph);
    const sens = tl.nodes.filter(
      (n) => n.kind === "event" && n.sensitive,
    );
    expect(sens.length).toBeGreaterThan(0);
    for (const n of sens) {
      if (n.kind !== "event") continue;
      // raw title が漏れない
      expect(n.displayLabel).not.toContain("MRI");
      expect(n.displayLabel).not.toContain("弁護士相談");
      // ariaLabel にも raw title 漏れなし
      expect(n.ariaLabel).not.toContain("MRI");
      expect(n.ariaLabel).not.toContain("弁護士相談");
    }
  });

  it("user_self view: sensitive event は 'category hint' generic (= 「予定 (= 医療系)」)", () => {
    const { graph } = buildDayGraph({ anchors: SENSITIVE_DAY_ANCHORS, date: DATE });
    const tl = buildTimelineView(graph, "user_self");
    const medical = tl.nodes.find(
      (n) => n.kind === "event" && n.sensitive,
    );
    expect(medical).toBeDefined();
    if (medical && medical.kind === "event") {
      expect(medical.displayLabel).toContain("予定");
    }
  });

  it("shared_view: sensitive event は generic '予定' (= category hint なし、 CEO 補正)", () => {
    const { graph } = buildDayGraph({ anchors: SENSITIVE_DAY_ANCHORS, date: DATE });
    const tl = buildTimelineView(graph, "shared_view");
    const sens = tl.nodes.filter(
      (n) => n.kind === "event" && n.sensitive,
    );
    for (const n of sens) {
      if (n.kind !== "event") continue;
      expect(n.displayLabel).toBe("予定"); // 完全 generic
      expect(n.displayLabel).not.toContain("医療");
      expect(n.displayLabel).not.toContain("法務");
    }
  });

  it("sensitive event の className に aura / blur 系 class なし (= CEO 補正 3)", () => {
    const { graph } = buildDayGraph({ anchors: SENSITIVE_DAY_ANCHORS, date: DATE });
    const tl = buildTimelineView(graph);
    const sens = tl.nodes.filter(
      (n) => n.kind === "event" && n.sensitive,
    );
    for (const n of sens) {
      // sensitive 強調系 class を含まない
      expect(n.className).not.toMatch(/blur/);
      expect(n.className).not.toMatch(/shadow-inner/);
      expect(n.className).not.toMatch(/ring-/);
      expect(n.className).not.toMatch(/opacity-/);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Neutral slate only (= CEO 補正 4、 amber/orange 禁止)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildTimelineView — color discipline (= neutral slate only)", () => {
  // 注: /red/ regex は "motion-reduce" に false match するため、
  // Tailwind shade pattern (= "-red-N") で specific に検査する。
  it("全 node の className に amber/orange/red/yellow Tailwind shade が含まれない", () => {
    const { graph } = buildDayGraph({ anchors: HEAVY_DAY_ANCHORS, date: DATE });
    const tl = buildTimelineView(graph);
    for (const n of tl.nodes) {
      expect(n.className).not.toMatch(/amber-/);
      expect(n.className).not.toMatch(/orange-/);
      expect(n.className).not.toMatch(/-red-\d/);
      expect(n.className).not.toMatch(/text-red\b/);
      expect(n.className).not.toMatch(/bg-red\b/);
      expect(n.className).not.toMatch(/border-red\b/);
      expect(n.className).not.toMatch(/yellow-/);
      expect(n.className).not.toMatch(/rose-/);
    }
  });

  it("全 transition の className に warning 色 Tailwind shade なし (= K-3a 設計改訂、 slate のみ)", () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const tl = buildTimelineView(graph);
    for (const t of tl.transitions) {
      expect(t.className).not.toMatch(/amber-/);
      expect(t.className).not.toMatch(/orange-/);
      expect(t.className).not.toMatch(/-red-\d/);
      expect(t.className).not.toMatch(/text-red\b/);
      expect(t.className).not.toMatch(/bg-red\b/);
      expect(t.className).not.toMatch(/border-red\b/);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Memory Chip 階調 (= 採用 革新 1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildTimelineView — Memory Chip 階調 (= K-3c-iii 強化、 3 階層)", () => {
  it("start/end は dashed slate-200 + text-xs (= 最も静か、 階層 1)", () => {
    const { graph } = buildDayGraph({ anchors: EMPTY_DAY_ANCHORS, date: DATE });
    const tl = buildTimelineView(graph);
    const start = tl.nodes.find((n) => n.kind === "start")!;
    const end = tl.nodes.find((n) => n.kind === "end")!;
    expect(start.className).toMatch(/border-dashed/);
    expect(start.className).toMatch(/border-slate-200/);
    expect(start.className).toMatch(/text-xs/);
    expect(end.className).toMatch(/border-dashed/);
    expect(end.className).toMatch(/border-slate-200/);
    expect(end.className).toMatch(/text-xs/);
  });

  it("gap は dashed slate-200 + text-xs (= 階層 1、 start/end と統一 shade)", () => {
    const { graph } = buildDayGraph({ anchors: SINGLE_DAY_ANCHORS, date: DATE });
    const tl = buildTimelineView(graph);
    const gap = tl.nodes.find((n) => n.kind === "gap")!;
    expect(gap.className).toMatch(/border-dashed/);
    expect(gap.className).toMatch(/border-slate-200/);
    expect(gap.className).toMatch(/text-xs/);
  });

  it("movement transition は dashed slate-300 + text-xs (= 階層 2、 中間)", () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const tl = buildTimelineView(graph);
    expect(tl.transitions.length).toBeGreaterThan(0);
    for (const t of tl.transitions) {
      expect(t.className).toMatch(/border-dashed/);
      expect(t.className).toMatch(/border-slate-300/);
      expect(t.className).toMatch(/text-xs/);
    }
  });

  it("event (non-sensitive) は solid slate-400 (= 階層 3、 explicit、 維持)", () => {
    const { graph } = buildDayGraph({ anchors: SINGLE_DAY_ANCHORS, date: DATE });
    const tl = buildTimelineView(graph);
    const ev = tl.nodes.find((n) => n.kind === "event")!;
    expect(ev.className).toMatch(/border-solid/);
    expect(ev.className).toMatch(/border-slate-400/);
  });

  it("階調差 (= event > movement > {boundary, gap}) を className shade で確認", () => {
    const { graph: movementGraph } = buildDayGraph({
      anchors: MOVEMENT_DAY_ANCHORS,
      date: DATE,
    });
    const tl = buildTimelineView(movementGraph);
    const start = tl.nodes.find((n) => n.kind === "start")!;
    const event = tl.nodes.find((n) => n.kind === "event")!;
    const transition = tl.transitions[0]!;
    expect(start.className).toMatch(/slate-200/); // 階層 1
    expect(transition.className).toMatch(/slate-300/); // 階層 2
    expect(event.className).toMatch(/slate-400/); // 階層 3
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// a11y
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildTimelineView — a11y", () => {
  it("全 node に role='listitem'", () => {
    const { graph } = buildDayGraph({ anchors: HEAVY_DAY_ANCHORS, date: DATE });
    const tl = buildTimelineView(graph);
    for (const n of tl.nodes) {
      expect(n.role).toBe("listitem");
    }
  });

  it("全 node に ariaLabel が存在 + 非空", () => {
    const { graph } = buildDayGraph({ anchors: HEAVY_DAY_ANCHORS, date: DATE });
    const tl = buildTimelineView(graph);
    for (const n of tl.nodes) {
      expect(n.ariaLabel).toBeTypeOf("string");
      expect(n.ariaLabel.length).toBeGreaterThan(0);
    }
  });

  it("EventNodeView は clickable=true (= button render trigger)", () => {
    const { graph } = buildDayGraph({ anchors: SINGLE_DAY_ANCHORS, date: DATE });
    const tl = buildTimelineView(graph);
    const ev = tl.nodes.find((n) => n.kind === "event");
    if (ev && ev.kind === "event") expect(ev.clickable).toBe(true);
  });

  it("reduced motion class が含まれる (= prefers-reduced-motion 対応)", () => {
    const { graph } = buildDayGraph({ anchors: SINGLE_DAY_ANCHORS, date: DATE });
    const tl = buildTimelineView(graph);
    for (const n of tl.nodes) {
      expect(n.className).toMatch(/motion-reduce/);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// endTimeHint integration (= EventNode.durationSource / boundaryClipped)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildTimelineView — endTimeHint", () => {
  it("explicit + not clipped event → endTimeHint=''", () => {
    const { graph } = buildDayGraph({ anchors: SINGLE_DAY_ANCHORS, date: DATE });
    const tl = buildTimelineView(graph);
    const ev = tl.nodes.find((n) => n.kind === "event")!;
    if (ev.kind === "event") expect(ev.endTimeHint).toBe("");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// graph mutation 不可
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildTimelineView — graph mutation 不可", () => {
  it("入力 graph を mutate しない", () => {
    const { graph } = buildDayGraph({ anchors: SENSITIVE_DAY_ANCHORS, date: DATE });
    const frozen = JSON.stringify(graph);
    buildTimelineView(graph);
    expect(JSON.stringify(graph)).toBe(frozen);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// K-3c-iii: buildCompactSummaryView (= empty day 1 行 summary)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("K-3c-iii: buildCompactSummaryView — 採用条件", () => {
  it("anchor 0 件 + warnings 0 件 → CompactSummaryView を返す", () => {
    const result = buildDayGraph({ anchors: EMPTY_DAY_ANCHORS, date: DATE });
    expect(result.graph.attributes.anchorCount).toBe(0);
    expect(result.warnings.length).toBe(0);
    const summary = buildCompactSummaryView(result);
    expect(summary).not.toBeNull();
    expect(summary!.kind).toBe("compact_empty");
  });

  it("anchor あり (= anchorCount > 0) → null (= 通常 timeline 採用)", () => {
    const result = buildDayGraph({ anchors: SINGLE_DAY_ANCHORS, date: DATE });
    expect(result.graph.attributes.anchorCount).toBeGreaterThan(0);
    const summary = buildCompactSummaryView(result);
    expect(summary).toBeNull();
  });

  it("warnings あり (= invalid_time 等) → null (= 「予定なし」 誤表示防止、 CEO 補正 2)", () => {
    // invalid startTime の anchor → anchorCount 0 + warning 1
    const result = buildDayGraph({
      anchors: [
        // SINGLE_DAY pattern を base に startTime を壊す
        {
          ...SINGLE_DAY_ANCHORS[0]!,
          startTime: "INVALID",
        },
      ],
      date: DATE,
    });
    // event 化失敗 → anchorCount 0、 ただし warning あり
    expect(result.graph.attributes.anchorCount).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    const summary = buildCompactSummaryView(result);
    expect(summary).toBeNull(); // 通常 timeline に fallback、 「予定なし」 誤表示しない
  });

  it("anchor 0 件 + warnings 0 件 (= 真の空日) の summary shape", () => {
    const result = buildDayGraph({ anchors: EMPTY_DAY_ANCHORS, date: DATE });
    const summary = buildCompactSummaryView(result)!;
    expect(summary.kind).toBe("compact_empty");
    expect(summary.startTime).toBe("06:00"); // default boundary
    expect(summary.endTime).toBe("23:00"); // default boundary
    expect(summary.label).toBe("予定なし");
    expect(summary.ariaLabel).toContain("予定なし");
    expect(summary.ariaLabel).toContain("06:00");
    expect(summary.ariaLabel).toContain("23:00");
  });

  it("summary.className は neutral slate のみ + text-xs (= UI 弱化)", () => {
    const result = buildDayGraph({ anchors: EMPTY_DAY_ANCHORS, date: DATE });
    const summary = buildCompactSummaryView(result)!;
    expect(summary.className).toMatch(/text-xs/);
    expect(summary.className).toMatch(/text-slate-/);
    expect(summary.className).toMatch(/italic/);
    expect(summary.className).not.toMatch(/amber-/);
    expect(summary.className).not.toMatch(/orange-/);
    expect(summary.className).not.toMatch(/-red-\d/);
    expect(summary.className).not.toMatch(/yellow-/);
  });

  it("summary は raw sensitive 文字列を含まない (= 防御、 空日なので元々無関係)", () => {
    const result = buildDayGraph({ anchors: EMPTY_DAY_ANCHORS, date: DATE });
    const summary = buildCompactSummaryView(result)!;
    // 防御: 空日でも sensitive raw が漏れない設計
    expect(summary.label).not.toMatch(/MRI|病院|弁護士/);
    expect(summary.ariaLabel).not.toMatch(/MRI|病院|弁護士/);
  });

  it("user 境界 override (= options.startTime / endTime) も summary に反映", () => {
    const result = buildDayGraph({
      anchors: EMPTY_DAY_ANCHORS,
      date: DATE,
      options: { startTime: "08:00", endTime: "22:00" },
    });
    const summary = buildCompactSummaryView(result)!;
    expect(summary.startTime).toBe("08:00");
    expect(summary.endTime).toBe("22:00");
  });
});
