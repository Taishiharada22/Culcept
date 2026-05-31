/**
 * SR B1b-2C-8-c-3 — runDraftExtractionSubmit orchestrator（DI・node）
 *
 * 不変条件（fake crop / fake action・VLM 非実行）:
 *   ① success: crops 成功 + action ok → {kind:"cells", cells, year, month}。onActionStart 1 回。
 *   ② action error: action !ok → {kind:"error", message}。onActionStart 1 回。
 *   ③ invalid_selection: crops null → {kind:"invalid_selection"}。**callAction 未呼出・onActionStart 未発火**。
 *   ④ FormData field: header/personRow(Blob) + year/month/daysInMonth（文字列）。
 *   ⑤ onActionStart は crop 成功後・callAction 前に発火（順序）。
 *   ⑥ outcome に base64 / raw response / Blob を載せない。
 */
import { describe, it, expect, vi } from "vitest";

import {
  runDraftExtractionSubmit,
  type DraftExtractionSubmitDeps,
} from "@/lib/plan/shift/runDraftExtractionSubmit";
import type { AssistedCropOutput } from "@/lib/plan/shift/assistedCropGenerator";
import type { ExtractShiftDraftResult } from "@/lib/plan/shift/runExtractShiftDraft";
import type { ShiftReviewCell } from "@/lib/plan/shift/shiftReviewClassification";

const REGION = { left: 0, top: 0, width: 10, height: 10 };

/** fake crop output（小さな Blob 2 枚）。 */
function fakeCrops(): AssistedCropOutput {
  return {
    header: {
      blob: new Blob(["h"], { type: "image/png" }),
      region: REGION,
      mimeType: "image/png",
    },
    personRow: {
      blob: new Blob(["p"], { type: "image/png" }),
      region: REGION,
      mimeType: "image/png",
    },
    selection: {
      imageW: 100,
      imageH: 100,
      headerBand: { top: 0, bottom: 10 },
      personRowBand: { top: 20, bottom: 40 },
    },
    regions: { header: REGION, personRow: REGION },
  };
}

const CELLS: ShiftReviewCell[] = [
  { day: 1, date: "2025-07-01", rawCode: "N", confidence: 1 },
  { day: 2, date: "2025-07-02", rawCode: "H", confidence: 1 },
];

function baseDeps(
  over: Partial<DraftExtractionSubmitDeps> = {}
): DraftExtractionSubmitDeps {
  return {
    year: 2025,
    month: 7,
    daysInMonth: 31,
    generateCrops: async () => fakeCrops(),
    callAction: async () => ({
      ok: true,
      cells: CELLS,
      chunkSummary: { perChunkCounts: [2] },
    }),
    ...over,
  };
}

describe("runDraftExtractionSubmit — success", () => {
  it("crops 成功 + action ok → cells outcome（year/month 同梱）", async () => {
    const onActionStart = vi.fn();
    const outcome = await runDraftExtractionSubmit(baseDeps({ onActionStart }));
    expect(outcome).toEqual({ kind: "cells", cells: CELLS, year: 2025, month: 7 });
    expect(onActionStart).toHaveBeenCalledTimes(1);
  });

  it("FormData は header/personRow(Blob) + year/month/daysInMonth（文字列）", async () => {
    let captured: FormData | null = null;
    const callAction = vi.fn(async (fd: FormData): Promise<ExtractShiftDraftResult> => {
      captured = fd;
      return { ok: true, cells: CELLS, chunkSummary: { perChunkCounts: [2] } };
    });
    await runDraftExtractionSubmit(baseDeps({ callAction }));

    expect(captured).not.toBeNull();
    const fd = captured as unknown as FormData;
    expect(fd.get("header")).toBeInstanceOf(Blob);
    expect(fd.get("personRow")).toBeInstanceOf(Blob);
    expect(fd.get("year")).toBe("2025");
    expect(fd.get("month")).toBe("7");
    expect(fd.get("daysInMonth")).toBe("31");
  });
});

describe("runDraftExtractionSubmit — action error", () => {
  it("action !ok → error outcome（safe message を素通し）", async () => {
    const onActionStart = vi.fn();
    const outcome = await runDraftExtractionSubmit(
      baseDeps({
        onActionStart,
        callAction: async () => ({
          ok: false,
          error: { kind: "timeout", message: "読み取りに時間がかかっています。" },
        }),
      })
    );
    expect(outcome).toEqual({
      kind: "error",
      message: "読み取りに時間がかかっています。",
    });
    expect(onActionStart).toHaveBeenCalledTimes(1);
  });
});

describe("runDraftExtractionSubmit — invalid_selection（crops null）", () => {
  it("crops null → invalid_selection。callAction も onActionStart も発火しない", async () => {
    const callAction = vi.fn(async (): Promise<ExtractShiftDraftResult> => ({
      ok: true,
      cells: CELLS,
      chunkSummary: { perChunkCounts: [2] },
    }));
    const onActionStart = vi.fn();
    const outcome = await runDraftExtractionSubmit(
      baseDeps({ generateCrops: async () => null, callAction, onActionStart })
    );
    expect(outcome).toEqual({ kind: "invalid_selection" });
    expect(callAction).not.toHaveBeenCalled();
    expect(onActionStart).not.toHaveBeenCalled();
  });
});

describe("runDraftExtractionSubmit — 順序 & 安全性", () => {
  it("onActionStart は crop 成功後・callAction 前（順序）", async () => {
    const order: string[] = [];
    await runDraftExtractionSubmit(
      baseDeps({
        generateCrops: async () => {
          order.push("crops");
          return fakeCrops();
        },
        onActionStart: () => order.push("actionStart"),
        callAction: async () => {
          order.push("callAction");
          return { ok: true, cells: CELLS, chunkSummary: { perChunkCounts: [2] } };
        },
      })
    );
    expect(order).toEqual(["crops", "actionStart", "callAction"]);
  });

  it("cells outcome に base64 / raw / blob を載せない", async () => {
    const outcome = await runDraftExtractionSubmit(baseDeps());
    const json = JSON.stringify(outcome);
    expect(json).not.toMatch(/base64|data:image|blob:/i);
    // cells outcome の keys は kind/cells/year/month のみ
    expect(Object.keys(outcome).sort()).toEqual(["cells", "kind", "month", "year"]);
  });
});
