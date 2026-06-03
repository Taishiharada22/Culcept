import { describe, it, expect } from "vitest";
import { createInMemoryShiftImportRepository } from "@/lib/plan/shift/shiftImportRepositoryMemory";
import type { ShiftImportBundleInput } from "@/lib/plan/shift/shiftImportRepository";
import type { CreateExternalAnchorInput } from "@/lib/plan/external-anchor-input";
import type { ShiftDayImportIndicator } from "@/lib/plan/shift/shiftImportAdapter";

function deps() {
  let n = 0;
  return {
    idFactory: () => `id-${(n += 1).toString().padStart(3, "0")}`,
    now: () => "2025-07-15T00:00:00.000Z",
  };
}

const VALID_ANCHORS: CreateExternalAnchorInput[] = [
  {
    anchorKind: "one_off",
    date: "2025-07-04",
    title: "日勤",
    startTime: "09:00",
    endTime: "18:00",
    rigidity: "hard",
    sourceType: "shift_image",
  },
  {
    anchorKind: "one_off",
    date: "2025-07-06",
    title: "夜勤",
    startTime: "18:00",
    endTime: "06:45",
    rigidity: "hard",
    sourceType: "shift_image",
  },
];

const VALID_INDICATORS: ShiftDayImportIndicator[] = [
  {
    date: "2025-07-03",
    kind: "off",
    label: "公休",
    countsAsPublicHoliday: true,
    rawCode: "H",
    semanticType: "public_holiday",
  },
  {
    date: "2025-07-02",
    kind: "off_request",
    label: "希望休",
    countsAsPublicHoliday: false,
    rawCode: "HREQ",
    semanticType: "off_request",
  },
];

const VALID_BUNDLE: ShiftImportBundleInput = {
  source: { originalFilename: "july.png" },
  anchors: VALID_ANCHORS,
  dayIndicators: VALID_INDICATORS,
};

describe("InMemoryShiftImportRepository.saveShiftImportBundle", () => {
  it("全 valid → source+anchors+indicators を保存、source-first で sourceId 注入", async () => {
    const repo = createInMemoryShiftImportRepository(deps());
    const r = await repo.saveShiftImportBundle("user-1", VALID_BUNDLE);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source.sourceType).toBe("shift_image");
    expect(r.source.userId).toBe("user-1");
    expect(r.anchors).toHaveLength(2);
    expect(r.dayIndicators).toHaveLength(2);
    // source-first: 全 anchor / indicator が source.id を参照
    expect(r.anchors.every((a) => a.sourceId === r.source.id)).toBe(true);
    expect(r.dayIndicators.every((d) => d.sourceId === r.source.id)).toBe(true);
    // 確認済み保存（confirmedAt 付与）
    expect(r.anchors.every((a) => a.confirmedAt.length > 0)).toBe(true);
    // 翌日跨ぎ夜勤の endTime そのまま
    expect(r.anchors.find((a) => a.date === "2025-07-06")?.endTime).toBe("06:45");
    // store にも反映
    expect(repo._allSources()).toHaveLength(1);
    expect(repo._allAnchors()).toHaveLength(2);
    expect(repo._allDayIndicators()).toHaveLength(2);
  });

  it("anchor が 1 件 invalid → 全体 reject、store は空（部分保存しない）", async () => {
    const repo = createInMemoryShiftImportRepository(deps());
    const bad: ShiftImportBundleInput = {
      ...VALID_BUNDLE,
      anchors: [
        VALID_ANCHORS[0],
        { ...VALID_ANCHORS[1], startTime: "99:99" } as CreateExternalAnchorInput, // 不正
      ],
    };
    const r = await repo.saveShiftImportBundle("user-1", bad);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.kind === "anchor_invalid")).toBe(true);
    expect(repo._isEmpty()).toBe(true); // ★ 無書込
  });

  it("indicator が invalid（label 空）→ 全体 reject、store は空", async () => {
    const repo = createInMemoryShiftImportRepository(deps());
    const bad: ShiftImportBundleInput = {
      ...VALID_BUNDLE,
      dayIndicators: [{ ...VALID_INDICATORS[0], label: "   " }],
    };
    const r = await repo.saveShiftImportBundle("user-1", bad);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.kind === "indicator_invalid")).toBe(true);
    expect(repo._isEmpty()).toBe(true);
  });

  it("off_request なのに公休フラグ true → indicator_invalid、無書込", async () => {
    const repo = createInMemoryShiftImportRepository(deps());
    const bad: ShiftImportBundleInput = {
      ...VALID_BUNDLE,
      dayIndicators: [
        { ...VALID_INDICATORS[1], countsAsPublicHoliday: true }, // off_request + public
      ],
    };
    const r = await repo.saveShiftImportBundle("user-1", bad);
    expect(r.ok).toBe(false);
    expect(repo._isEmpty()).toBe(true);
  });

  it("commit 段で失敗注入 → 全 valid でも persistence_failed、store は空（rollback）", async () => {
    const repo = createInMemoryShiftImportRepository({
      ...deps(),
      failDuringCommit: true,
    });
    const r = await repo.saveShiftImportBundle("user-1", VALID_BUNDLE);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0].kind).toBe("persistence_failed");
    expect(repo._isEmpty()).toBe(true); // ★ atomic rollback
  });

  it("空 bundle（anchors/indicators 0）→ source のみ保存して ok", async () => {
    const repo = createInMemoryShiftImportRepository(deps());
    const r = await repo.saveShiftImportBundle("user-1", {
      source: {},
      anchors: [],
      dayIndicators: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.anchors).toHaveLength(0);
    expect(r.dayIndicators).toHaveLength(0);
    expect(repo._allSources()).toHaveLength(1);
  });
});
