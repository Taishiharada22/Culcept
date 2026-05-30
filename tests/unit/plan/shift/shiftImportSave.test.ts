import { describe, it, expect } from "vitest";
import {
  executeShiftImportSave,
  isShiftImportSaveEnabled,
} from "@/lib/plan/shift/shiftImportSave";
import { createInMemoryShiftImportRepository } from "@/lib/plan/shift/shiftImportRepositoryMemory";
import { HARADA_SPRIX_DICTIONARY } from "@/lib/plan/shift/shiftCodeDictionary";

function deps() {
  let n = 0;
  return {
    idFactory: () => `id-${(n += 1).toString().padStart(3, "0")}`,
    now: () => "2025-07-15T00:00:00.000Z",
  };
}

describe("executeShiftImportSave", () => {
  it("unresolved があれば保存を試みず blocked_unresolved（store 空）", async () => {
    const repo = createInMemoryShiftImportRepository(deps());
    const out = await executeShiftImportSave(
      {
        userId: "user-1",
        cells: [
          { date: "2025-07-06", rawCode: "N" }, // 夜勤（valid）
          { date: "2025-07-09", rawCode: "???" }, // unknown → unresolved
        ],
        dictionary: HARADA_SPRIX_DICTIONARY,
        source: { originalFilename: "july.png" },
      },
      repo
    );

    expect(out.status).toBe("blocked_unresolved");
    if (out.status !== "blocked_unresolved") return;
    expect(out.skipped.some((s) => s.reason === "unknown_code")).toBe(true);
    expect(repo._isEmpty()).toBe(true); // ★ 保存を試みていない
  });

  it("全 resolved なら atomic 保存（勤務=anchor / 休み=day_indicator / 空セルは無視）", async () => {
    const repo = createInMemoryShiftImportRepository(deps());
    const out = await executeShiftImportSave(
      {
        userId: "user-1",
        cells: [
          { date: "2025-07-06", rawCode: "N" }, // 夜勤 → anchor
          { date: "2025-07-03", rawCode: "H" }, // 公休 → day_indicator(off)
          { date: "2025-07-02", rawCode: "HREQ" }, // 希望休 → day_indicator(off_request)
          { date: "2025-07-01", rawCode: "BD" }, // 休み → day_indicator(off)
          { date: "2025-07-25", rawCode: "" }, // 空セル → 何も生成しない
        ],
        dictionary: HARADA_SPRIX_DICTIONARY,
        source: { originalFilename: "july.png" },
      },
      repo
    );

    expect(out.status).toBe("saved");
    if (out.status !== "saved") return;
    expect(out.result.ok).toBe(true);
    if (!out.result.ok) return;
    const saved = out.result; // const に束ねて closure 内でも narrow を保持
    expect(saved.anchors.length).toBeGreaterThanOrEqual(1); // 夜勤
    expect(saved.dayIndicators.length).toBeGreaterThanOrEqual(2); // H/BD/HREQ
    expect(saved.anchors.every((a) => a.sourceId === saved.source.id)).toBe(true);
    // store に commit 済み
    expect(repo._allSources()).toHaveLength(1);
  });

  it("保存失敗（commit 注入）でも outcome は saved + result.ok=false、store は空（atomic）", async () => {
    const repo = createInMemoryShiftImportRepository({
      ...deps(),
      failDuringCommit: true,
    });
    const out = await executeShiftImportSave(
      {
        userId: "user-1",
        cells: [{ date: "2025-07-06", rawCode: "N" }],
        dictionary: HARADA_SPRIX_DICTIONARY,
        source: {},
      },
      repo
    );
    expect(out.status).toBe("saved");
    if (out.status !== "saved") return;
    expect(out.result.ok).toBe(false);
    expect(repo._isEmpty()).toBe(true);
  });
});

describe("isShiftImportSaveEnabled", () => {
  it("env 未設定なら false（本番デフォルト dormant）", () => {
    expect(isShiftImportSaveEnabled()).toBe(false);
  });
});
