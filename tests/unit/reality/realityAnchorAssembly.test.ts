/**
 * 4-A/4-B Anchor Assembly（pure・no-DB）— anchor row → PlanItemSnapshot/HardConstraint・interval-complement gap。
 *   HH/ISO parse・invalid skip・title/label redact・sensitive 時刻のみ・rigidity→governance・gap meaning 捏造なし。
 */
import { describe, it, expect } from "vitest";
import { parseTimeToMinutes, deriveAnchorGovernance, anchorRowToSnapshot, anchorRowsToHardConstraints, type AnchorScheduleRow } from "@/lib/plan/reality/assembly/anchor-schedule-mapper";
import { availableWindowsFromCommitments } from "@/lib/plan/reality/assembly/anchor-gap-adapter";

function row(over: Partial<AnchorScheduleRow> = {}): AnchorScheduleRow {
  return { id: "a1", start_time: "11:00", end_time: "12:00", rigidity: "hard", sensitive_category: null, ...over };
}

describe("4-A parseTimeToMinutes — HH/ISO", () => {
  it("HH:mm / ISO の literal time を分化・不正/日付のみ null", () => {
    expect(parseTimeToMinutes("09:30")).toBe(570);
    expect(parseTimeToMinutes("2026-06-20T09:30:00+09:00")).toBe(570); // ISO literal time
    expect(parseTimeToMinutes("9:05")).toBe(545);
    expect(parseTimeToMinutes("bad")).toBeNull();
    expect(parseTimeToMinutes("25:00")).toBeNull();
    expect(parseTimeToMinutes("2026-06-20")).toBeNull(); // 日付のみ → null
  });
});

describe("4-A deriveAnchorGovernance", () => {
  it("hard→locked+hard_external / soft→movable+tentative / sensitive→locked+user_declared", () => {
    expect(deriveAnchorGovernance("hard", null)).toMatchObject({ authority: "import_locked", flexibility: "locked", protectionReasons: ["hard_external"] });
    expect(deriveAnchorGovernance("soft", null)).toMatchObject({ flexibility: "movable", protectionReasons: ["tentative"] });
    expect(deriveAnchorGovernance("soft", "medical")).toMatchObject({ flexibility: "locked", protectionReasons: ["user_declared"] });
  });
});

describe("4-A anchorRowToSnapshot / HardConstraint", () => {
  it("row→snapshot（title 持ち込まない・governance 付与・end 不明は省略）", () => {
    const s = anchorRowToSnapshot(row())!;
    expect(s.itemId).toBe("a1");
    expect(s.startMin).toBe(660);
    expect(s.endMin).toBe(720);
    expect(s.title).toBeUndefined(); // title なし(redact)
    expect(s.governance?.flexibility).toBe("locked");
    expect(anchorRowToSnapshot(row({ end_time: null }))!.endMin).toBeUndefined(); // end 不明 → 省略
    expect(anchorRowToSnapshot(row({ start_time: "bad" }))).toBeNull(); // start 不明 → null
  });
  it("anchorRowsToHardConstraints: label=null redact・protection は governance 由来・sensitive は時刻のみ", () => {
    const hc = anchorRowsToHardConstraints([row({ start_time: "11:00", end_time: "12:00", rigidity: "hard" }), row({ id: "a2", start_time: "14:00", end_time: "15:00", rigidity: "soft", sensitive_category: "medical" })]);
    expect(hc).toHaveLength(2);
    expect(hc.every((c) => c.label === null)).toBe(true); // redact
    expect(hc[0]!.protection).toBe("hard_external");
    expect(hc[1]!.protection).toBe("user_declared"); // sensitive
    expect(JSON.stringify(hc)).not.toMatch(/medical|11:00|タイトル/); // 詳細漏れなし(時刻は分で・raw 文字列なし)
  });
});

describe("4-B availableWindowsFromCommitments — interval complement", () => {
  it("busy の補集合・meaning は捏造せず null", () => {
    const w = availableWindowsFromCommitments([{ startMinute: 660, endMinute: 720 }], 540, 1200);
    expect(w).toEqual([{ startMinute: 540, endMinute: 660, meaning: null }, { startMinute: 720, endMinute: 1200, meaning: null }]);
  });
  it("overlap は merge・day 境界で clamp・不正 skip", () => {
    const w = availableWindowsFromCommitments([{ startMinute: 600, endMinute: 700 }, { startMinute: 650, endMinute: 720 }, { startMinute: 900, endMinute: 800 }], 540, 1200);
    expect(w).toEqual([{ startMinute: 540, endMinute: 600, meaning: null }, { startMinute: 720, endMinute: 1200, meaning: null }]); // 600-720 merged・900-800 不正 skip
  });
  it("busy なし → 終日 1 窓", () => {
    expect(availableWindowsFromCommitments([], 540, 1200)).toEqual([{ startMinute: 540, endMinute: 1200, meaning: null }]);
  });
  it("終日 busy → 窓なし", () => {
    expect(availableWindowsFromCommitments([{ startMinute: 540, endMinute: 1200 }], 540, 1200)).toEqual([]);
  });
});
