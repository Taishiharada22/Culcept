import { describe, it, expect, vi, afterEach } from "vitest";
import {
  runRealityShadowSmoke,
  evaluateSmokeGate,
  enforceRedaction,
  type SmokeGate,
  type RealityDataSource,
  type SmokeDeps,
} from "@/lib/plan/reality/integration/dev-runtime";
import { assertRedacted } from "@/lib/plan/reality/integration/redaction-guard";
import type { ShadowSummary } from "@/lib/plan/reality/integration/shadow-runner";
import type { RealityInput } from "@/lib/plan/reality/integration/input-adapter";
import type { BestActionCandidate, CandidateMetrics } from "@/lib/plan/reality/best-action";
import type { ChangeSet } from "@/lib/plan/reality/change-set";
import type { SourceTrace } from "@/lib/plan/reality/source-trace";

const CEO = "ceo-user-id";

// 既定: gate 全通過
function gate(p: Partial<SmokeGate> = {}): SmokeGate {
  return { nodeEnv: "development", flagEnabled: true, capability: "dev-only", requestedUserId: CEO, allowedDevUserId: CEO, ...p };
}

// allowlist 済 RealityInput（title/location は型に存在しない）
function input(p: Partial<RealityInput> = {}): RealityInput {
  return {
    mode: "complete",
    dayNodes: [{ id: "anchor-real-1", startMin: 540, endMin: 600, importance: "high", hard: true }],
    anchors: { "anchor-real-1": { governance: { origin: "imported", authority: "import_locked", flexibility: "locked", protectionReasons: ["hard_external"] }, importance: "important", sensitive: false } },
    seedTraces: [],
    ...p,
  };
}

// mock data source（実 DB を読まない）
function source(impl?: (userId: string) => Promise<RealityInput | null>): RealityDataSource & { spy: ReturnType<typeof vi.fn> } {
  const spy = vi.fn(impl ?? (async () => input()));
  return { loadForSmoke: spy as unknown as RealityDataSource["loadForSmoke"], spy };
}

function deps(p: Partial<SmokeDeps> = {}): SmokeDeps {
  return { gate: gate(), dataSource: source(), ...p };
}

afterEach(() => vi.restoreAllMocks());

describe("dev-runtime — gate fail-closed（CEO 条件）", () => {
  it("production は必ず no-op", () => {
    expect(evaluateSmokeGate(gate({ nodeEnv: "production" }))).toEqual({ pass: false, code: "PRODUCTION" });
  });
  it("flag off → no-op", () => {
    expect(evaluateSmokeGate(gate({ flagEnabled: false }))).toEqual({ pass: false, code: "FLAG_OFF" });
  });
  it("capability 欠落 → no-op", () => {
    expect(evaluateSmokeGate(gate({ capability: undefined }))).toEqual({ pass: false, code: "NO_CAPABILITY" });
  });
  it("CEO 以外の user → no-op（OUT_OF_SCOPE）", () => {
    expect(evaluateSmokeGate(gate({ requestedUserId: "someone-else" }))).toEqual({ pass: false, code: "OUT_OF_SCOPE_USER" });
  });
  it("allowedDevUserId 未設定 → 誰も許可しない", () => {
    expect(evaluateSmokeGate(gate({ allowedDevUserId: undefined }))).toEqual({ pass: false, code: "OUT_OF_SCOPE_USER" });
  });
  it("全条件満たすと pass", () => {
    expect(evaluateSmokeGate(gate())).toEqual({ pass: true });
  });
});

describe("dev-runtime — gate fail 時は実データを読まない（spy 0 回）", () => {
  it("production: loadForSmoke は呼ばれない", async () => {
    const ds = source();
    const r = await runRealityShadowSmoke(deps({ gate: gate({ nodeEnv: "production" }), dataSource: ds }));
    expect(r).toEqual({ status: "noop", code: "PRODUCTION" });
    expect(ds.spy).toHaveBeenCalledTimes(0); // 実データ未接触
  });
  it("flag off: loadForSmoke は呼ばれない", async () => {
    const ds = source();
    const r = await runRealityShadowSmoke(deps({ gate: gate({ flagEnabled: false }), dataSource: ds }));
    expect(r).toEqual({ status: "noop", code: "FLAG_OFF" });
    expect(ds.spy).toHaveBeenCalledTimes(0);
  });
  it("out-of-scope user: loadForSmoke は呼ばれない", async () => {
    const ds = source();
    await runRealityShadowSmoke(deps({ gate: gate({ requestedUserId: "x" }), dataSource: ds }));
    expect(ds.spy).toHaveBeenCalledTimes(0);
  });
});

describe("dev-runtime — happy path（gate pass → redacted のみ）", () => {
  it("redacted summary を返し allowlist-clean", async () => {
    const r = await runRealityShadowSmoke(deps());
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(assertRedacted(r.summary).clean).toBe(true);
      expect(r.summary.mode).toBe("complete"); // 実 input の mode が反映
    }
  });
  it("real-ish な anchor id は出力に出ない（候補 id も ephemeral 化）", async () => {
    const trace: SourceTrace = { kind: "seed", ref: "s1", reason: "目的", confidence: 0.8 };
    const cs: ChangeSet = { id: "anchor-real-1", ops: [{ kind: "add", itemId: "x", after: { itemId: "x", startMin: 540, endMin: 600 } }], reason: "r", sourceTraces: [trace] };
    const m: CandidateMetrics = { feasible: true, wholePartCoherent: true, recoveryProtected: true, deadlineSatisfied: true, goalAttainment: 0.8, rhythmFit: 0.7, slackHealth: 0.7, overpack: 0.1, contextSwitches: 1, instability: 0, correctionMisalignment: 0.1 };
    const cand: BestActionCandidate = { id: "anchor-real-1", changeSet: cs, sourceTraces: [trace], metrics: m, proposedDisposition: "confirm" };
    const r = await runRealityShadowSmoke(deps({ candidates: [cand] }));
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(JSON.stringify(r.summary)).not.toContain("anchor-real-1"); // 実 id が ephemeral 化
      expect(r.summary.bestRef).toBe("c0");
    }
  });
});

describe("dev-runtime — seeds 二重防御（読まない + 万一入っても捨てる）", () => {
  it("source が誤って seedTrace(自由文) を返しても出力に出ない", async () => {
    const leaky = input({ seedTraces: [{ kind: "seed", ref: "seed-uuid", reason: "渋谷で田中さんと打ち合わせ", confidence: 0.7 }] });
    const r = await runRealityShadowSmoke(deps({ dataSource: source(async () => leaky) }));
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      const json = JSON.stringify(r.summary);
      expect(json).not.toContain("渋谷"); // 自由文 reason は捨てられ出力に出ない
      expect(json).not.toContain("seed-uuid");
    }
  });
  it("RealityDataSource 型に seed 読取メソッドは無い（構造で seeds 不可）", () => {
    const ds: RealityDataSource = source();
    expect(Object.keys(ds).filter((k) => /seed/i.test(k))).toEqual([]);
    expect("loadForSmoke" in ds).toBe(true);
  });
});

describe("dev-runtime — failure は全て fail-closed・raw なし", () => {
  it("source が throw → ADAPTER_DEGRADED（raw を含まない）", async () => {
    const r = await runRealityShadowSmoke(deps({ dataSource: source(async () => { throw new Error("渋谷の田中皮膚科 db error"); }) }));
    expect(r).toEqual({ status: "noop", code: "ADAPTER_DEGRADED" });
    expect(JSON.stringify(r)).not.toContain("渋谷"); // error メッセージの raw を漏らさない
  });
  it("source が null → NO_INPUT", async () => {
    const r = await runRealityShadowSmoke(deps({ dataSource: source(async () => null) }));
    expect(r).toEqual({ status: "noop", code: "NO_INPUT" });
  });
});

describe("dev-runtime — enforceRedaction（producer 自己表明）", () => {
  const clean: ShadowSummary = {
    mode: "complete", candidateCount: 0, bestRef: null, rejected: [], deliveryMode: null, invariantViolations: [], risk: "none",
    line: "mode=complete candidates=0 best=none rejected=0 delivery=none violations=0 risk=none",
  };
  it("clean summary → ok", () => {
    expect(enforceRedaction(clean)).toEqual({ status: "ok", summary: clean });
  });
  it("raw を含む summary → blocked（offendingCount のみ・raw なし）", () => {
    const dirty: ShadowSummary = { ...clean, bestRef: "渋谷の田中皮膚科" };
    const r = enforceRedaction(dirty);
    expect(r.status).toBe("blocked");
    if (r.status === "blocked") {
      expect(r.code).toBe("REDACTION_BLOCKED");
      expect(r.offendingCount).toBe(1);
    }
    expect(JSON.stringify(r)).not.toContain("渋谷"); // 検出結果に raw を載せない
  });
});

describe("dev-runtime — console を一切使わない（output policy）", () => {
  it("happy path も失敗 path も console.log/error/warn を呼ばない", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await runRealityShadowSmoke(deps()); // ok
    await runRealityShadowSmoke(deps({ gate: gate({ nodeEnv: "production" }) })); // noop
    await runRealityShadowSmoke(deps({ dataSource: source(async () => { throw new Error("x"); }) })); // degraded
    expect(log).toHaveBeenCalledTimes(0);
    expect(error).toHaveBeenCalledTimes(0);
    expect(warn).toHaveBeenCalledTimes(0);
  });
});
