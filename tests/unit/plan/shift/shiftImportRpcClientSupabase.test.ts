import { describe, it, expect } from "vitest";
import {
  createSupabaseShiftImportRpcClient,
  mapToRpcArgs,
  SHIFT_IMPORT_RPC_FUNCTION,
  type RpcCaller,
} from "@/lib/plan/shift/shiftImportRpcClientSupabase";
import { SHIFT_IMPORT_SAVE_FAILED_MESSAGE } from "@/lib/plan/shift/shiftImportRpcResponse";
import type { ShiftImportRpcParams } from "@/lib/plan/shift/shiftImportRpc";

const PARAMS: ShiftImportRpcParams = {
  userId: "user-1",
  importRange: { start: "2025-07-01", endExclusive: "2025-08-01" },
  source: { originalFilename: "july.png" },
  anchors: [
    {
      date: "2025-07-06",
      title: "夜勤",
      startTime: "18:00",
      endTime: "06:45",
      rigidity: "hard",
    },
  ],
  indicators: [
    {
      date: "2025-07-03",
      kind: "off",
      label: "公休",
      countsAsPublicHoliday: true,
      rawCode: "H",
      semanticType: "public_holiday",
    },
  ],
};
const OK_SUMMARY = {
  sourceId: "src-1",
  insertedAnchors: 1,
  deletedAnchors: 0,
  insertedIndicators: 1,
  deletedIndicators: 0,
  conflicts: [],
};

function harness(
  behavior:
    | { kind: "return"; data: unknown; error: unknown }
    | { kind: "throw"; error: unknown }
) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const logged: unknown[] = [];
  const caller: RpcCaller = async (fn, args) => {
    calls.push({ fn, args });
    if (behavior.kind === "throw") throw behavior.error;
    return { data: behavior.data, error: behavior.error };
  };
  const client = createSupabaseShiftImportRpcClient(caller, {
    logDetail: (d) => logged.push(d),
  });
  return { client, calls, logged };
}

describe("mapToRpcArgs", () => {
  it("ShiftImportRpcParams → p_* 引数（half-open range, camelCase keys そのまま）", () => {
    const args = mapToRpcArgs(PARAMS);
    expect(args.p_user_id).toBe("user-1");
    expect(args.p_range_start).toBe("2025-07-01");
    expect(args.p_range_end).toBe("2025-08-01"); // endExclusive
    expect(args.p_anchors).toBe(PARAMS.anchors);
    expect(args.p_indicators).toBe(PARAMS.indicators);
    expect(args.p_source).toBe(PARAMS.source);
  });
});

describe("createSupabaseShiftImportRpcClient", () => {
  it("success → status ok + summary 透過、正しい関数名/引数で呼ぶ、logDetail なし", async () => {
    const { client, calls, logged } = harness({
      kind: "return",
      data: { status: "ok", summary: OK_SUMMARY },
      error: null,
    });
    const r = await client.importShiftRoster(PARAMS);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.summary.sourceId).toBe("src-1");
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe(SHIFT_IMPORT_RPC_FUNCTION);
    expect(calls[0].args.p_range_end).toBe("2025-08-01");
    expect(logged).toHaveLength(0);
  });

  it("conflict → status conflict + dates（safe reason 維持）、logDetail なし", async () => {
    const { client, logged } = harness({
      kind: "return",
      data: { status: "conflict", dates: ["2025-07-03"] },
      error: null,
    });
    const r = await client.importShiftRoster(PARAMS);
    expect(r.status).toBe("conflict");
    if (r.status !== "conflict") return;
    expect(r.dates).toEqual(["2025-07-03"]);
    expect(logged).toHaveLength(0);
  });

  it("DB raw error → safe error（raw が result に漏れない）、logDetail に raw", async () => {
    const { client, logged } = harness({
      kind: "return",
      data: null,
      error: { code: "23514", message: "violates check constraint secret-detail" },
    });
    const r = await client.importShiftRoster(PARAMS);
    expect(r.status).toBe("error");
    if (r.status !== "error") return;
    expect(r.message).toBe(SHIFT_IMPORT_SAVE_FAILED_MESSAGE);
    expect(JSON.stringify(r)).not.toContain("secret-detail");
    expect(logged).toHaveLength(1);
  });

  it("RPC 未接続（function 不在 PGRST202）→ safe error（fallback せず）、logDetail に raw", async () => {
    const { client, logged } = harness({
      kind: "return",
      data: null,
      error: { code: "PGRST202", message: "Could not find the function ..." },
    });
    const r = await client.importShiftRoster(PARAMS);
    expect(r.status).toBe("error");
    expect(logged).toHaveLength(1);
  });

  it("想定外 shape → safe error、logDetail に観測情報", async () => {
    const { client, logged } = harness({
      kind: "return",
      data: { unexpected: true },
      error: null,
    });
    const r = await client.importShiftRoster(PARAMS);
    expect(r.status).toBe("error");
    expect(logged).toHaveLength(1);
  });

  it("rpc 呼び出し自体が throw（network 等）→ safe error、logDetail に raw", async () => {
    const { client, logged } = harness({
      kind: "throw",
      error: new Error("ECONNRESET internal stack"),
    });
    const r = await client.importShiftRoster(PARAMS);
    expect(r.status).toBe("error");
    if (r.status !== "error") return;
    expect(r.message).toBe(SHIFT_IMPORT_SAVE_FAILED_MESSAGE);
    expect(JSON.stringify(r)).not.toContain("ECONNRESET");
    expect(logged).toHaveLength(1);
  });
});
