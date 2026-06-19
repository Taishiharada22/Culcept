/**
 * RO-2 D1+D2+D3 — LeaveByLines（buffer-bucket 二段）+ PrepTimeModel + wakeAt/prepareAt（AND ゲート）。
 *   pure・injected fixtures のみ。ETA 未供給 → 全段 null（dormant）。prep 単独生成禁止。
 * 正本設計: docs/reality-os-ro2-mobility-control-tower-design.md（RO-2 D1/D2/D3）
 */
import { describe, it, expect } from "vitest";
import {
  buildLeaveByLines,
  leaveByLinesViolations,
  unresolvedLeaveByLines,
  GUARANTEE_LANGUAGE_FORBIDDEN,
  type BuildLeaveByLinesInputV0,
} from "@/lib/plan/realityCore/leaveByLines";
import { computePrepTimeV0 } from "@/lib/plan/realityCore/prepTimeModel";
import { heuristicAttribute, unknownAttribute, realityAttributeViolations } from "@/lib/plan/realityCore/realityAttribute";

const ARRIVAL = "2026-06-20T14:00:00+09:00";
const prep40 = heuristicAttribute<number>(40, 0.3, ["prep"]);

function input(over: Partial<BuildLeaveByLinesInputV0> = {}): BuildLeaveByLinesInputV0 {
  return { arrivalTargetInstant: ARRIVAL, durMin: 42, prepTime: prep40, ...over };
}

describe("RO-2 D2 PrepTimeModel（heuristic ≤0.35・debugOnly）", () => {
  it("#1 朝外出+睡眠不足+雨+対人 → base40+10+5+5=60・heuristic・confidence≤0.35・debugOnly", () => {
    const p = computePrepTimeV0({ isOutgoing: true, timeBand: "morning", sleepShort: true, rain: true, interpersonalOrFormal: true });
    expect(p.value).toBe(60);
    expect(p.status).toBe("heuristic");
    expect(p.confidence).toBeLessThanOrEqual(0.35);
    expect(p.displayPolicy).toBe("debugOnly");
    expect(realityAttributeViolations("prep", p)).toEqual([]);
  });
  it("#2 在宅は短い（base12）", () => {
    const p = computePrepTimeV0({ isOutgoing: false, timeBand: "afternoon", sleepShort: false, rain: false, interpersonalOrFormal: false });
    expect(p.value).toBe(12);
  });
});

describe("RO-2 D1 LeaveByLines（buffer-bucket 二段）", () => {
  it("#3 ETA 供給 → recommended(12:48) ≤ hard(13:13)・bandGapMin=25(large30-floor5)", () => {
    const l = buildLeaveByLines(input());
    expect(l.recommended.value).toBe("2026-06-20T12:48:00+09:00"); // 14:00 −(42+30)
    expect(l.hard.value).toBe("2026-06-20T13:13:00+09:00"); // 14:00 −(42+5)
    expect(l.bandGapMin).toBe(25);
    expect(leaveByLinesViolations(l)).toEqual([]);
  });
  it("#4 hard は保証でない: displayPolicy=notActionable + guarantee_language_forbidden reasonCode", () => {
    const l = buildLeaveByLines(input());
    expect(l.hard.displayPolicy).toBe("notActionable");
    expect(l.hardReasonCodes).toContain(GUARANTEE_LANGUAGE_FORBIDDEN);
  });
  it("#5 prepTime は recommended/hard 生成に流入しない（buffer_floor=5 で hard 確定・prep 非依存）", () => {
    const lWithPrep = buildLeaveByLines(input({ prepTime: heuristicAttribute<number>(99, 0.3, ["prep"]) }));
    const lNoPrep = buildLeaveByLines(input({ prepTime: unknownAttribute<number>() }));
    // prepTime を変えても recommended/hard は不変（prep は派生にのみ使う）
    expect(lWithPrep.recommended.value).toBe(lNoPrep.recommended.value);
    expect(lWithPrep.hard.value).toBe(lNoPrep.hard.value);
  });
  it("#6 buffer_floor=5 分（CEO v0.2・0 でない）", () => {
    const l = buildLeaveByLines(input());
    // hard = arrival −(dur+5) = 14:00 −47 = 13:13。floor=0 なら 13:18 になる
    expect(l.hard.value).toBe("2026-06-20T13:13:00+09:00");
  });
});

describe("RO-2 D3 wakeAt/prepareAt（recommended ∧ prepTime の AND ゲート）", () => {
  it("#7 双解決 → wakeAt(12:08)=recommended−prepTime・prepareAt(12:28)=recommended−ceil(prep/2)", () => {
    const l = buildLeaveByLines(input()); // recommended 12:48・prep 40
    expect(l.wakeAt.value).toBe("2026-06-20T12:08:00+09:00"); // 12:48 −40
    expect(l.prepareAt.value).toBe("2026-06-20T12:28:00+09:00"); // 12:48 −20
    expect(l.wakeAt.status).toBe("heuristic"); // prepTime 由来ゆえ heuristic
    expect(l.wakeAt.confidence).toBeLessThanOrEqual(0.35);
  });
  it("#8 prepTime null → wakeAt/prepareAt null（recommended 解決でも prep 単独で出さない）", () => {
    const l = buildLeaveByLines(input({ prepTime: unknownAttribute<number>() }));
    expect(l.recommended.value).not.toBeNull();
    expect(l.wakeAt.value).toBeNull();
    expect(l.prepareAt.value).toBeNull();
    expect(leaveByLinesViolations(l)).toEqual([]);
  });
});

describe("RO-2 D1 dormant（ETA 未供給 → 全段 null・偽生成しない）", () => {
  it("#9 arrival=null → 全 4 段 null・bandGapMin null・whyUnresolved 先頭 eta_source_missing", () => {
    const l = buildLeaveByLines(input({ arrivalTargetInstant: null }));
    expect(l.recommended.value).toBeNull();
    expect(l.hard.value).toBeNull();
    expect(l.wakeAt.value).toBeNull();
    expect(l.prepareAt.value).toBeNull();
    expect(l.bandGapMin).toBeNull();
    expect(l.whyUnresolved[0]).toBe("eta_source_missing");
    expect(leaveByLinesViolations(l)).toEqual([]);
  });
  it("#10 durMin=null → dormant", () => {
    const l = buildLeaveByLines(input({ durMin: null }));
    expect(l.recommended.value).toBeNull();
    expect(leaveByLinesViolations(l)).toEqual([]);
  });
  it("#11 unresolvedLeaveByLines helper", () => {
    const l = unresolvedLeaveByLines();
    expect(l.recommended.value).toBeNull();
    expect(l.whyUnresolved).toEqual(["eta_source_missing"]);
  });
  it("#12 INV 違反検出: 偽 wakeAt を recommended=null に注入 → 違反", () => {
    const l = unresolvedLeaveByLines();
    const bad = { ...l, wakeAt: heuristicAttribute<string>("2026-06-20T12:00:00+09:00", 0.3, ["x"]) };
    expect(leaveByLinesViolations(bad).some((m) => m.includes("recommended.value≠null を要する") || m.includes("prep 単独生成禁止"))).toBe(true);
  });
});
