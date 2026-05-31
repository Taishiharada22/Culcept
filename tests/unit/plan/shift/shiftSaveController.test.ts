import { describe, it, expect } from "vitest";
import {
  createShiftSaveController,
  mapActionResultToState,
  type ShiftSaveState,
} from "@/lib/plan/shift/shiftSaveController";
import { HARADA_SPRIX_DICTIONARY } from "@/lib/plan/shift/shiftCodeDictionary";
import {
  SHIFT_IMPORT_ACTION_MESSAGES,
  type ShiftImportActionResult,
  type ShiftImportSaveActionInput,
} from "@/lib/plan/shift/runShiftImportSave";
import type { ShiftReviewCell } from "@/lib/plan/shift/shiftReviewClassification";

const OK_RESULT: ShiftImportActionResult = {
  ok: true,
  summary: {
    sourceId: "s",
    insertedAnchors: 1,
    deletedAnchors: 0,
    insertedIndicators: 1,
    deletedIndicators: 0,
    conflicts: [],
  },
};

// 解決可能・高信頼・空欄なし → gate を通る
const CLEAN_CELLS: ShiftReviewCell[] = [
  { day: 1, date: "2025-07-01", rawCode: "N", confidence: 1 },
  { day: 2, date: "2025-07-02", rawCode: "G", confidence: 1 },
];
// 候補(HREQ)を含むが unresolved でも blank-risk でもない → 止めない
const CANDIDATE_CELLS: ShiftReviewCell[] = [
  { day: 1, date: "2025-07-01", rawCode: "N", confidence: 1 },
  { day: 2, date: "2025-07-02", rawCode: "HREQ", confidence: 1 },
];
// 未知コード → hard block
const UNRESOLVED_CELLS: ShiftReviewCell[] = [
  { day: 1, date: "2025-07-01", rawCode: "N", confidence: 1 },
  { day: 2, date: "2025-07-02", rawCode: "ZZ", confidence: 1 },
];
// 低信頼 → blank-risk（soft confirm）
const BLANK_RISK_CELLS: ShiftReviewCell[] = [
  { day: 1, date: "2025-07-01", rawCode: "N", confidence: 0.5 },
  { day: 2, date: "2025-07-02", rawCode: "G", confidence: 1 },
];

function harness(opts: {
  save: (input: ShiftImportSaveActionInput) => Promise<ShiftImportActionResult>;
  saveEnabled?: boolean;
}) {
  const states: ShiftSaveState[] = [];
  let saveCalls = 0;
  let successCalls = 0;
  const controller = createShiftSaveController({
    save: async (input) => {
      saveCalls += 1;
      return opts.save(input);
    },
    year: 2025,
    month: 7,
    dictionary: HARADA_SPRIX_DICTIONARY,
    saveEnabled: opts.saveEnabled ?? true,
    onStateChange: (s) => states.push(s),
    onSuccess: () => {
      successCalls += 1;
    },
  });
  return {
    controller,
    states,
    getSaveCalls: () => saveCalls,
    getSuccessCalls: () => successCalls,
  };
}

describe("mapActionResultToState", () => {
  it("ok → success（summary 透過）", () => {
    const s = mapActionResultToState(OK_RESULT);
    expect(s.status).toBe("success");
  });
  it("conflict → conflict + dates + safe message", () => {
    const s = mapActionResultToState({
      ok: false,
      kind: "conflict",
      message: SHIFT_IMPORT_ACTION_MESSAGES.conflict,
      dates: ["2025-07-15"],
    });
    expect(s.status).toBe("conflict");
    if (s.status !== "conflict") return;
    expect(s.dates).toEqual(["2025-07-15"]);
    expect(s.message).toBe(SHIFT_IMPORT_ACTION_MESSAGES.conflict);
  });
  it("error/unauthenticated/invalid/duplicate → error（safe message）", () => {
    for (const kind of ["error", "unauthenticated", "invalid", "duplicate"] as const) {
      const s = mapActionResultToState({
        ok: false,
        kind,
        message: SHIFT_IMPORT_ACTION_MESSAGES.error,
        ...(kind === "duplicate" ? { dates: [] } : {}),
      } as ShiftImportActionResult);
      expect(s.status).toBe("error");
    }
  });
  it("disabled → disabled", () => {
    expect(
      mapActionResultToState({
        ok: false,
        kind: "disabled",
        message: SHIFT_IMPORT_ACTION_MESSAGES.disabled,
      }).status
    ).toBe("disabled");
  });
});

describe("createShiftSaveController", () => {
  it("1 unresolved があると保存しない（unresolved_blocked / save 未呼出）", async () => {
    const h = harness({ save: async () => OK_RESULT });
    await h.controller.requestSave(UNRESOLVED_CELLS);
    expect(h.controller.getState().status).toBe("unresolved_blocked");
    expect(h.getSaveCalls()).toBe(0);
  });

  it("2 candidate(HREQ) は保存を止めない（saving → success）", async () => {
    const h = harness({ save: async () => OK_RESULT });
    await h.controller.requestSave(CANDIDATE_CELLS);
    expect(h.getSaveCalls()).toBe(1);
    expect(h.controller.getState().status).toBe("success");
  });

  it("3 blank-risk は最初 soft confirm で止まる（save 未呼出）", async () => {
    const h = harness({ save: async () => OK_RESULT });
    await h.controller.requestSave(BLANK_RISK_CELLS);
    const st = h.controller.getState();
    expect(st.status).toBe("needs_blank_risk_confirmation");
    if (st.status === "needs_blank_risk_confirmation") {
      expect(st.blankRiskDays).toContain(1);
    }
    expect(h.getSaveCalls()).toBe(0);
  });

  it("4 soft confirm 後に保存へ進む（confirmBlankRisk → save 呼出 → success）", async () => {
    const h = harness({ save: async () => OK_RESULT });
    await h.controller.requestSave(BLANK_RISK_CELLS);
    await h.controller.confirmBlankRisk();
    expect(h.getSaveCalls()).toBe(1);
    expect(h.controller.getState().status).toBe("success");
  });

  it("5 saving 中は二重 submit できない（save は 1 回）", async () => {
    let resolve: (v: ShiftImportActionResult) => void = () => {};
    const pending = new Promise<ShiftImportActionResult>((r) => {
      resolve = r;
    });
    const h = harness({ save: () => pending });
    const p1 = h.controller.requestSave(CLEAN_CELLS); // saving（pending）
    const p2 = h.controller.requestSave(CLEAN_CELLS); // inFlight → 無視
    resolve(OK_RESULT);
    await Promise.all([p1, p2]);
    expect(h.getSaveCalls()).toBe(1);
    expect(h.controller.getState().status).toBe("success");
  });

  it("6 success で onSuccess が呼ばれる", async () => {
    const h = harness({ save: async () => OK_RESULT });
    await h.controller.requestSave(CLEAN_CELLS);
    expect(h.getSuccessCalls()).toBe(1);
  });

  it("7 conflict / error は safe message のみ（onSuccess 呼ばれない）", async () => {
    const hc = harness({
      save: async () => ({
        ok: false,
        kind: "conflict",
        message: SHIFT_IMPORT_ACTION_MESSAGES.conflict,
        dates: ["2025-07-15"],
      }),
    });
    await hc.controller.requestSave(CLEAN_CELLS);
    expect(hc.controller.getState().status).toBe("conflict");
    expect(hc.getSuccessCalls()).toBe(0);

    const he = harness({
      save: async () => ({
        ok: false,
        kind: "error",
        message: SHIFT_IMPORT_ACTION_MESSAGES.error,
      }),
    });
    await he.controller.requestSave(CLEAN_CELLS);
    const se = he.controller.getState();
    expect(se.status).toBe("error");
    if (se.status === "error") {
      expect(se.message).toBe(SHIFT_IMPORT_ACTION_MESSAGES.error);
    }
  });

  it("8 saveEnabled false では保存しない（disabled / save 未呼出）", async () => {
    const h = harness({ save: async () => OK_RESULT, saveEnabled: false });
    await h.controller.requestSave(CLEAN_CELLS);
    expect(h.controller.getState().status).toBe("disabled");
    expect(h.getSaveCalls()).toBe(0);
  });

  it("save が throw しても safe error（raw を result に出さない）", async () => {
    const h = harness({
      save: async () => {
        throw new Error("ECONNRESET internal stack");
      },
    });
    await h.controller.requestSave(CLEAN_CELLS);
    const s = h.controller.getState();
    expect(s.status).toBe("error");
    if (s.status === "error") {
      expect(s.message).toBe(SHIFT_IMPORT_ACTION_MESSAGES.error);
      expect(JSON.stringify(s)).not.toContain("ECONNRESET");
    }
  });
});
