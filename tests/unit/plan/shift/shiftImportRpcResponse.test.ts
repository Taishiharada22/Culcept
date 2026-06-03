import { describe, it, expect } from "vitest";
import {
  mapShiftImportRpcResponse,
  SHIFT_IMPORT_SAVE_FAILED_MESSAGE,
} from "@/lib/plan/shift/shiftImportRpcResponse";

const OK_SUMMARY = {
  sourceId: "src-1",
  insertedAnchors: 2,
  deletedAnchors: 1,
  insertedIndicators: 3,
  deletedIndicators: 0,
  conflicts: [],
};

describe("mapShiftImportRpcResponse — error sanitization", () => {
  it("DB error → status error + safe message。raw SQL message が result に漏れない", () => {
    const rawError = {
      code: "P0001",
      message: "shift import: duplicate anchor date",
      details: "internal detail",
      hint: null,
    };
    const { result, logDetail } = mapShiftImportRpcResponse({
      data: null,
      error: rawError,
    });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.message).toBe(SHIFT_IMPORT_SAVE_FAILED_MESSAGE);
    // ★ raw SQL message / detail が result のどこにも漏れない
    expect(JSON.stringify(result)).not.toContain("duplicate anchor date");
    expect(JSON.stringify(result)).not.toContain("internal detail");
    // raw は logDetail 側にのみ存在
    expect(logDetail).toBeDefined();
  });

  it("42501（owner guard）→ status error + safe、logDetail は forbidden に分類（mapPostgrestError 透過）", () => {
    const rawError = { code: "42501", message: "unauthorized" };
    const { result, logDetail } = mapShiftImportRpcResponse({
      data: null,
      error: rawError,
    });
    expect(result.status).toBe("error");
    expect((logDetail as { kind?: string })?.kind).toBe("forbidden");
  });

  it("conflict → safe reason 維持（status conflict + dates）、logDetail なし", () => {
    const { result, logDetail } = mapShiftImportRpcResponse({
      data: { status: "conflict", dates: ["2025-07-03"] },
      error: null,
    });
    expect(result.status).toBe("conflict");
    if (result.status !== "conflict") return;
    expect(result.dates).toEqual(["2025-07-03"]);
    expect(logDetail).toBeUndefined();
  });

  it("success path → 不変（status ok + summary）、logDetail なし", () => {
    const { result, logDetail } = mapShiftImportRpcResponse({
      data: { status: "ok", summary: OK_SUMMARY },
      error: null,
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.summary.sourceId).toBe("src-1");
    expect(result.summary.deletedIndicators).toBe(0);
    expect(logDetail).toBeUndefined();
  });

  it("想定外 shape → status error + safe、logDetail に reason（fallback でなく観測）", () => {
    const { result, logDetail } = mapShiftImportRpcResponse({
      data: { foo: "bar" },
      error: null,
    });
    expect(result.status).toBe("error");
    expect((logDetail as { reason?: string })?.reason).toBe(
      "unexpected_rpc_shape"
    );
  });
});
