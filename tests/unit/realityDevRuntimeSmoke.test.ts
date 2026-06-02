import { describe, it, expect, vi } from "vitest";
import { runRealReadSmoke, type RealSmokeDeps, type RealSmokeReport } from "@/lib/plan/reality/integration/dev-runtime-smoke";
import { assertRedacted } from "@/lib/plan/reality/integration/redaction-guard";
import type { RealityDataSource, SmokeGate } from "@/lib/plan/reality/integration/dev-runtime";
import type { RealityInput } from "@/lib/plan/reality/integration/input-adapter";

const CEO = "ceo-user-id";

function input(n: number, p: Partial<RealityInput> = {}): RealityInput {
  const anchors: RealityInput["anchors"] = {};
  for (let i = 0; i < n; i++) {
    anchors[`anchor-real-${i}`] = {
      governance: { origin: "imported", authority: "import_locked", flexibility: "locked", protectionReasons: ["hard_external"] },
      importance: "important",
      sensitive: false,
    };
  }
  return { mode: "complete", dayNodes: [], anchors, seedTraces: [], ...p };
}

function source(impl?: (u: string) => Promise<RealityInput | null>): RealityDataSource & { spy: ReturnType<typeof vi.fn> } {
  const spy = vi.fn(impl ?? (async () => input(3)));
  return { loadForSmoke: spy as unknown as RealityDataSource["loadForSmoke"], spy };
}
function gate(p: Partial<SmokeGate> = {}): SmokeGate {
  return { nodeEnv: "development", flagEnabled: true, capability: "dev-only", requestedUserId: CEO, allowedDevUserId: CEO, ...p };
}
function deps(p: Partial<RealSmokeDeps> = {}): RealSmokeDeps {
  return { gate: gate(), dataSource: source(), clientContext: "user_rls", date: "2026-06-03", limit: 50, ...p };
}

const ALLOWED_KEYS = ["code", "date", "limit", "recurringIncluded", "redactionPass", "report", "rowsRead", "serviceRoleUsed", "status"];

describe("dev-runtime-smoke — RealSmokeReport は構造的に redacted（許可フィールドのみ）", () => {
  it("happy path: rowsRead=count, report は DevReportRedacted, raw 一切なし", async () => {
    const r = await runRealReadSmoke(deps({ dataSource: source(async () => input(3)) }));
    expect(r.status).toBe("ok");
    expect(r.rowsRead).toBe(3);
    expect(r.recurringIncluded).toBe(false);
    expect(r.serviceRoleUsed).toBe(false);
    expect(r.redactionPass).toBe(true);
    // 構造: 許可キーのみ
    expect(Object.keys(r).sort()).toEqual(["date", "limit", "recurringIncluded", "redactionPass", "report", "rowsRead", "serviceRoleUsed", "status"]);
    // raw（実 id 等）が出ない
    const json = JSON.stringify(r);
    expect(json).not.toContain("anchor-real-"); // 実 anchor id は出ない
    expect(assertRedacted(r.report).clean).toBe(true);
  });

  it("report は counts/distributions のみ（個別時刻・id・category を持たない）", async () => {
    const r = await runRealReadSmoke(deps());
    if (r.status === "ok") {
      expect(Object.keys(r.report).sort()).toEqual([
        "deliveryDistribution", "gateFailureCounts", "invariantViolationCounts",
        "modeDistribution", "noBestRuns", "riskDistribution", "runs", "totalCandidates", "totalRejected",
      ]);
    }
  });
});

describe("dev-runtime-smoke — service_role 拒否（実行時 no-service-role 強制・GPT 点1）", () => {
  it("clientContext=service_role → SERVICE_ROLE_REFUSED・load を呼ばない", async () => {
    const ds = source();
    const r = await runRealReadSmoke(deps({ clientContext: "service_role", dataSource: ds }));
    expect(r.status).toBe("noop");
    expect(r.code).toBe("SERVICE_ROLE_REFUSED");
    expect(r.serviceRoleUsed).toBe(false);
    expect(ds.spy).toHaveBeenCalledTimes(0); // service role では一切読まない
  });
});

describe("dev-runtime-smoke — gate fail-closed（実 read なし）", () => {
  it("production → noop, load 呼ばれない", async () => {
    const ds = source();
    const r = await runRealReadSmoke(deps({ gate: gate({ nodeEnv: "production" }), dataSource: ds }));
    expect(r).toMatchObject({ status: "noop", code: "PRODUCTION", rowsRead: 0 });
    expect(ds.spy).toHaveBeenCalledTimes(0);
  });
  it("flag off → noop, load 呼ばれない", async () => {
    const ds = source();
    await runRealReadSmoke(deps({ gate: gate({ flagEnabled: false }), dataSource: ds }));
    expect(ds.spy).toHaveBeenCalledTimes(0);
  });
  it("CEO 以外 → OUT_OF_SCOPE_USER", async () => {
    const r = await runRealReadSmoke(deps({ gate: gate({ requestedUserId: "x" }) }));
    expect(r.code).toBe("OUT_OF_SCOPE_USER");
  });
});

describe("dev-runtime-smoke — failure は fail-closed・raw なし", () => {
  it("source throw → ADAPTER_DEGRADED（raw を含まない）", async () => {
    const r = await runRealReadSmoke(deps({ dataSource: source(async () => { throw new Error("渋谷の田中皮膚科 rls"); }) }));
    expect(r).toMatchObject({ status: "noop", code: "ADAPTER_DEGRADED" });
    expect(JSON.stringify(r)).not.toContain("渋谷");
  });
  it("source null → NO_INPUT", async () => {
    const r = await runRealReadSmoke(deps({ dataSource: source(async () => null) }));
    expect(r.code).toBe("NO_INPUT");
  });
});

describe("dev-runtime-smoke — report.limit は実効値（>50 を clamp）", () => {
  it("deps.limit=1000 → report.limit=50（CEO 固定条件: 初回 50 以下）", async () => {
    const r = await runRealReadSmoke(deps({ limit: 1000 }));
    expect(r.limit).toBe(50);
  });
});

describe("dev-runtime-smoke — 報告フィールドが GPT 許可集合に一致", () => {
  it("RealSmokeReport の全キーが許可集合の部分集合", async () => {
    const r: RealSmokeReport = await runRealReadSmoke(deps());
    for (const k of Object.keys(r)) expect(ALLOWED_KEYS).toContain(k);
    // date echo は指定日（個別時刻でない）
    expect(r.date).toBe("2026-06-03");
    expect(r.limit).toBe(50);
  });
});
