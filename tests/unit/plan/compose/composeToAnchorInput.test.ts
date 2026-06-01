import { describe, it, expect } from "vitest";

import type { ComposeDraftState } from "@/lib/plan/compose/composeDraft";
import {
  DEFAULT_RIGIDITY,
  placedDraftsToAnchorInputs,
} from "@/lib/plan/compose/composeToAnchorInput";

const DATE = "2026-06-01";

function placed(
  id: string,
  opts: {
    title?: string;
    locationText?: string;
    rigidity?: "hard" | "soft" | "";
    startMin: number;
    endMin: number | null;
    crossesMidnight?: boolean;
  },
): ComposeDraftState {
  return {
    id,
    core: {
      title: opts.title ?? "予定",
      locationText: opts.locationText ?? "カフェ",
      rigidity: opts.rigidity ?? "hard",
    },
    time: { mode: "none" }, // converter は placement を正とするため mode 非依存
    placement: {
      status: "placed",
      startMin: opts.startMin,
      endMin: opts.endMin,
      crossesMidnight: opts.crossesMidnight ?? false,
      edgeClamped: false,
    },
  };
}

function unplaced(id: string): ComposeDraftState {
  return {
    id,
    core: { title: "下書き", locationText: "カフェ", rigidity: "soft" },
    time: { mode: "none" },
    placement: { status: "unplaced" },
  };
}

describe("4ケースの startTime / endTime 永続（A-0-1）", () => {
  it("開始＋終了 → start + end（15:00–17:00）", () => {
    const { inputs, excluded } = placedDraftsToAnchorInputs(
      [placed("d1", { startMin: 900, endMin: 1020 })],
      DATE,
    );
    expect(excluded).toHaveLength(0);
    expect(inputs).toHaveLength(1);
    const i = inputs[0];
    expect(i.anchorKind).toBe("one_off");
    if (i.anchorKind === "one_off") expect(i.date).toBe(DATE);
    expect(i.startTime).toBe("15:00");
    expect(i.endTime).toBe("17:00");
    expect(i.sourceType).toBe("manual");
  });

  it("終了のみ（resolver が start=end−60 を確定済み）→ start + end", () => {
    const { inputs } = placedDraftsToAnchorInputs(
      [placed("d1", { startMin: 960, endMin: 1020 })],
      DATE,
    );
    expect(inputs[0].startTime).toBe("16:00");
    expect(inputs[0].endTime).toBe("17:00");
  });

  it("開始のみ → start のみ（end=null → endTime 未指定）", () => {
    const { inputs } = placedDraftsToAnchorInputs(
      [placed("d1", { startMin: 600, endMin: null })],
      DATE,
    );
    expect(inputs[0].startTime).toBe("10:00");
    expect(inputs[0].endTime).toBeUndefined();
  });

  it("未定（drop 位置が start）→ start のみ", () => {
    const { inputs } = placedDraftsToAnchorInputs(
      [placed("d1", { startMin: 905, endMin: null })],
      DATE,
    );
    expect(inputs[0].startTime).toBe("15:05");
    expect(inputs[0].endTime).toBeUndefined();
  });
});

describe("日跨ぎは保存除外（CEO 条件）", () => {
  it("crossesMidnight は inputs に入らず excluded(crosses_midnight)", () => {
    const { inputs, excluded } = placedDraftsToAnchorInputs(
      [placed("wrap", { startMin: 1410, endMin: 30, crossesMidnight: true })],
      DATE,
    );
    expect(inputs).toHaveLength(0);
    expect(excluded).toEqual([{ id: "wrap", reason: "crosses_midnight" }]);
  });
});

describe("rigidity 未選択の既定化", () => {
  it("rigidity '' は DEFAULT_RIGIDITY(soft) に既定化", () => {
    const { inputs } = placedDraftsToAnchorInputs(
      [placed("d1", { rigidity: "", startMin: 900, endMin: 1020 })],
      DATE,
    );
    expect(inputs[0].rigidity).toBe(DEFAULT_RIGIDITY);
    expect(inputs[0].rigidity).toBe("soft");
  });
});

describe("検証失敗・対象外", () => {
  it("title 空の placed は excluded(invalid) + errors（防御的）", () => {
    const { inputs, excluded } = placedDraftsToAnchorInputs(
      [placed("bad", { title: "", startMin: 900, endMin: 1020 })],
      DATE,
    );
    expect(inputs).toHaveLength(0);
    expect(excluded[0].id).toBe("bad");
    expect(excluded[0].reason).toBe("invalid");
    expect(excluded[0].errors && excluded[0].errors.length).toBeGreaterThan(0);
  });

  it("unplaced draft は無視（保存対象は placed のみ）", () => {
    const { inputs, excluded } = placedDraftsToAnchorInputs(
      [unplaced("u1"), placed("d1", { startMin: 900, endMin: 1020 })],
      DATE,
    );
    expect(excluded).toHaveLength(0);
    expect(inputs).toHaveLength(1);
  });
});

describe("複数 draft の順序保持", () => {
  it("placed を入力順で inputs 化、wrap は除外", () => {
    const { inputs, excluded } = placedDraftsToAnchorInputs(
      [
        placed("a", { title: "A", startMin: 540, endMin: 600 }),
        placed("wrap", { title: "W", startMin: 1410, endMin: 30, crossesMidnight: true }),
        placed("b", { title: "B", startMin: 900, endMin: null }),
      ],
      DATE,
    );
    expect(inputs.map((i) => i.title)).toEqual(["A", "B"]);
    expect(excluded.map((e) => e.id)).toEqual(["wrap"]);
  });
});
