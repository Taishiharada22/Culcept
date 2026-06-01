/**
 * SR B1b-2C-4-a — planDraftExtraction の契約
 *
 * 不変条件:
 *   - Blob / base64 / dataURL / File は入力・出力に出現しない
 *   - chunkBoundaries 既定 [15] → 1-15 / 16-末
 *   - chunkBoundaries 異常値（範囲外/重複/NaN/floats）を防御的に正規化
 *   - prompt に B1b-1R 硬化文言と range が反映される
 *   - daysInMonth < 1 → chunks = []
 */
import { describe, it, expect } from "vitest";
import {
  buildChunkRanges,
  DEFAULT_CHUNK_BOUNDARIES,
  normalizeChunkBoundaries,
  planDraftExtraction,
  type DraftExtractionPlan,
  type DraftExtractionPlanInput,
} from "@/lib/plan/shift/draftExtractionPlanner";

const KNOWN = ["H", "HREQ", "E", "E-18", "N", "L", "G", "BD"];
const baseInput: DraftExtractionPlanInput = {
  year: 2026,
  month: 6,
  daysInMonth: 30,
  knownCodes: KNOWN,
};

describe("normalizeChunkBoundaries", () => {
  it("既定は [15]", () => {
    expect(DEFAULT_CHUNK_BOUNDARIES).toEqual([15]);
    expect(normalizeChunkBoundaries(undefined, 30)).toEqual([15]);
  });
  it("範囲外 / NaN / float / 重複 を捨て、unique sorted に", () => {
    expect(normalizeChunkBoundaries([0, 1, 15, 15, 30, 31, NaN, 10.6, -5], 30)).toEqual([1, 10, 15]);
  });
  it("空配列なら chunks=[1..N] になる（境目なし）", () => {
    expect(normalizeChunkBoundaries([], 30)).toEqual([]);
  });
});

describe("buildChunkRanges", () => {
  it("既定（[15], daysInMonth=30）→ [1-15, 16-30]", () => {
    expect(buildChunkRanges(30, undefined)).toEqual([
      { from: 1, to: 15 },
      { from: 16, to: 30 },
    ]);
  });
  it("[10,20], daysInMonth=31 → [1-10, 11-20, 21-31]", () => {
    expect(buildChunkRanges(31, [10, 20])).toEqual([
      { from: 1, to: 10 },
      { from: 11, to: 20 },
      { from: 21, to: 31 },
    ]);
  });
  it("boundaries=[] → 1 chunk", () => {
    expect(buildChunkRanges(28, [])).toEqual([{ from: 1, to: 28 }]);
  });
});

describe("planDraftExtraction", () => {
  it("既定: 2 chunk / 各 chunk に dayRange + prompt", () => {
    const p = planDraftExtraction(baseInput);
    expect(p.chunks).toHaveLength(2);
    expect(p.chunks[0].dayRange).toEqual({ from: 1, to: 15 });
    expect(p.chunks[1].dayRange).toEqual({ from: 16, to: 30 });
    for (const c of p.chunks) expect(typeof c.prompt).toBe("string");
  });

  it("prompt に B1b-1R 硬化文言と range が入る", () => {
    const p = planDraftExtraction(baseInput);
    const promptC1 = p.chunks[0].prompt;
    expect(promptC1).toContain("失敗モード対策");
    expect(promptC1).toContain("併合しない");
    expect(promptC1).toContain("前後の並び(sequence)から推測");
    expect(promptC1).toContain("1日〜15日");
    // knownCodes が反映される
    expect(promptC1).toContain("HREQ");
  });

  it("daysInMonth=0 → chunks=[]", () => {
    expect(planDraftExtraction({ ...baseInput, daysInMonth: 0 }).chunks).toEqual([]);
  });

  it("plan の output type に Blob / base64 / dataURL が出現しない（構造的禁止）", () => {
    const p: DraftExtractionPlan = planDraftExtraction(baseInput);
    const json = JSON.stringify(p);
    expect(json).not.toMatch(/blob:|data:image|base64|Blob|dataUri|dataURL/i);
  });

  // ── SR B1b-2C-9-FIX-2: mode 別 prompt 切替 ──
  it("vlmInputMode 未指定 → 既定 split / split prompt が組まれる", () => {
    const p = planDraftExtraction(baseInput);
    expect(p.vlmInputMode).toBe("split");
    // split prompt は combined 専用文言を含まない
    expect(p.chunks[0].prompt).not.toContain("上下 2 段");
    expect(p.chunks[0].prompt).not.toContain("前詰めしない");
  });

  it("vlmInputMode='combined' → combined prompt が組まれる（上下2段 / 同一縦列 / 前詰め禁止 / 空欄保持）", () => {
    const p = planDraftExtraction({ ...baseInput, vlmInputMode: "combined" });
    expect(p.vlmInputMode).toBe("combined");
    for (const c of p.chunks) {
      expect(c.prompt).toContain("上下 2 段");
      expect(c.prompt).toContain("同じ縦列が同じ日付に対応");
      expect(c.prompt).toContain("前詰めしない");
      expect(c.prompt).toContain("空欄として出力");
      expect(c.prompt).toContain("chunk 範囲外");
    }
  });

  it("vlmInputMode='split' → 既存 split prompt を維持（互換）", () => {
    const p = planDraftExtraction({ ...baseInput, vlmInputMode: "split" });
    expect(p.vlmInputMode).toBe("split");
    expect(p.chunks[0].prompt).not.toContain("上下 2 段");
  });
});
