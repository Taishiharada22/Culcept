/**
 * A1-5-11-4 Capture Write Policy Wiring — fake/no-run tests
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.61
 *
 * 目的: A1-5-11-3 の pure policy（decideCaptureWrite / computeCaptureExpiry）を
 *   **capture write runtime path（orchestrator runStructuredCapturePipeline + service runCaptureService）** へ
 *   optional DI として通した配線を検証する。
 *   - policy 未指定 → **既存挙動不変**（dedup なし・TTL 注入なし）。
 *   - policy 指定時のみ: read-before-write dedup（重複 active fresh → suppress・writeClient 0 回）+ TTL（expires_at 初期値）。
 *   - suppress 出力に raw/source_ref/UUID を出さない。provider error は fail-open（write 継続）。
 *
 * 安全境界（厳守・本テストで担保）:
 *   - **実 DB write 0 / 実 RPC 0 / Supabase 接続 0**（fake write client・no-network）。deterministic（now 注入）。
 *   - **fireMorningCapture（live entry）は未活性化**: read client plumbing（route 経由）が要るため本 slice では通さない（次境界）。
 *     → 静的に「alter-morning-capture-observe が policy を import/参照しない」＝ production 挙動変更 0 を確認。
 *   - **route.ts 非接触**: route が policy を参照しないことを静的に確認。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { runStructuredCapturePipeline } from "@/lib/plan/reality/integration/structured-capture-orchestrator";
import { runCaptureService, type CaptureServiceInput } from "@/lib/plan/reality/integration/capture-service";
import { summarizeWouldCapture } from "@/lib/plan/reality/integration/capture-observe";
import { createFakeCaptureWriteClient } from "@/lib/plan/reality/integration/capture-write-repository";
import { createExtractedFakeExtractor } from "@/lib/plan/reality/seed-extractor-contract";
import type { CaptureWritePolicyDeps } from "@/lib/plan/reality/integration/capture-write-policy";
import type { CandidateLifecycleEntry, CandidateLifecycleStatus } from "@/lib/plan/reality/integration/candidate-lifecycle-guard";
import type { CaptureGateInput } from "@/lib/plan/reality/capture-gate";

const USER = "11111111-1111-1111-1111-111111111111";
const SEED = "22222222-2222-2222-2222-222222222222";
const STAGING_URL = "https://hjcrvndumgiovyfdacwc.supabase.co";
const NOW = Date.parse("2026-06-05T10:00:00.000Z");
const CAP = "2026-06-05T10:00:00.000Z";
const DAY = 24 * 60 * 60 * 1000;

// extracted: untrusted structured output（intake が再検証）。VALID_HIGH 同型。candidate key = full_go|2026-06-06|morning|60。
const EXTRACTED_DATED = { confidence: 0.9, source: "chat", desiredDate: "2026-06-06", desiredTimeHint: "morning", actionShape: "full_go", explicitDuration: { durationMin: 60, confidence: "high" } };
// undated（desiredDate なし）。candidate key = full_go|_|morning|60。
const EXTRACTED_UNDATED = { confidence: 0.9, source: "chat", desiredTimeHint: "morning", actionShape: "full_go", explicitDuration: { durationMin: 60, confidence: "high" } };

function pipeInput(extracted: unknown = EXTRACTED_DATED) {
  return { seedId: SEED, userId: USER, capturedAt: CAP, extracted };
}
function policy(existing: readonly CandidateLifecycleEntry[], extra: Partial<CaptureWritePolicyDeps> = {}): CaptureWritePolicyDeps {
  return { existingActive: async () => existing, nowMs: NOW, ...extra };
}
/** candidate（full_go|2026-06-06|morning|60）と同構造・active・fresh・非 expired = suppress を起こす既存。 */
function blockingEntry(p: Partial<CandidateLifecycleEntry> = {}): CandidateLifecycleEntry {
  return {
    seedRef: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    status: "active",
    capturedAtMs: NOW - 60_000, // 1 分前＝fresh
    expiresAtMs: null, // 失効なし＝非 expired
    actionShape: "full_go",
    desiredDate: "2026-06-06",
    desiredTimeHint: "morning",
    durationMin: 60,
    confidence: 0.8,
    ...p,
  };
}
function gate(p: Partial<CaptureGateInput> = {}): CaptureGateInput {
  return { liveEnabled: true, killed: false, nodeEnv: "development", supabaseUrl: STAGING_URL, requestedUserId: USER, canaryUserIds: [USER], ...p };
}
function serviceInput(): CaptureServiceInput {
  return { gate: gate(), extraction: { utterance: "RAW_UTTERANCE_SENTINEL", nowIso: CAP, sourceRef: "chat-msg_1" }, seedId: SEED, capturedAt: CAP };
}

// ── 1. dedup（read-before-write） ──
describe("A1-5-11-4 orchestrator policy wiring — dedup（read-before-write）", () => {
  it("policy 未指定 → 既存挙動不変（write 1 / stage write / dedup なし）", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runStructuredCapturePipeline(pipeInput(), fake); // policy なし
    expect(r).toMatchObject({ ok: true, stage: "write" });
    expect(fake.writes.length).toBe(1);
  });

  it("no existing active → writeClient 1 回（insert）", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runStructuredCapturePipeline(pipeInput(), fake, policy([]));
    expect(r).toMatchObject({ ok: true, stage: "write" });
    expect(fake.writes.length).toBe(1);
  });

  it("same structural active fresh seed exists → writeClient 0 回（suppress）", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runStructuredCapturePipeline(pipeInput(), fake, policy([blockingEntry()]));
    expect(r).toEqual({ ok: true, stage: "suppressed", wroteEvidence: false });
    expect(fake.writes.length).toBe(0); // writeClient を呼ばない
  });

  it("stale existing（same key・capture 古い）→ writeClient 1 回", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runStructuredCapturePipeline(pipeInput(), fake, policy([blockingEntry({ capturedAtMs: NOW - 30 * DAY })]));
    expect(r).toMatchObject({ ok: true, stage: "write" });
    expect(fake.writes.length).toBe(1);
  });

  it("expired existing（same key・expiresAt 過去）→ writeClient 1 回", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runStructuredCapturePipeline(pipeInput(), fake, policy([blockingEntry({ expiresAtMs: NOW - 1000 })]));
    expect(r).toMatchObject({ ok: true, stage: "write" });
    expect(fake.writes.length).toBe(1);
  });

  it("consumed / rejected / expired status の既存 → writeClient 1 回（status filter で重複扱いしない）", async () => {
    for (const s of ["consumed", "rejected", "expired"] as CandidateLifecycleStatus[]) {
      const fake = createFakeCaptureWriteClient();
      const r = await runStructuredCapturePipeline(pipeInput(), fake, policy([blockingEntry({ status: s })]));
      expect(r).toMatchObject({ ok: true, stage: "write" });
      expect(fake.writes.length).toBe(1);
    }
  });

  it("different structure（duration / actionShape / date / timeHint 違い）→ writeClient 1 回", async () => {
    const variants: Array<Partial<CandidateLifecycleEntry>> = [
      { durationMin: 120 },
      { actionShape: "bounded_go" },
      { desiredDate: "2026-06-08" },
      { desiredTimeHint: "evening" },
    ];
    for (const v of variants) {
      const fake = createFakeCaptureWriteClient();
      const r = await runStructuredCapturePipeline(pipeInput(), fake, policy([blockingEntry(v)]));
      expect(r).toMatchObject({ ok: true, stage: "write" });
      expect(fake.writes.length).toBe(1);
    }
  });

  it("複数既存（fresh blocking 含む）→ suppress / 全て stale → insert", async () => {
    const fresh = blockingEntry({ seedRef: "f1111111-1111-4111-8111-111111111111" });
    const stale = blockingEntry({ seedRef: "s1111111-1111-4111-8111-111111111111", capturedAtMs: NOW - 30 * DAY });
    const f1 = createFakeCaptureWriteClient();
    expect(await runStructuredCapturePipeline(pipeInput(), f1, policy([stale, fresh]))).toMatchObject({ stage: "suppressed" });
    expect(f1.writes.length).toBe(0);
    const f2 = createFakeCaptureWriteClient();
    expect(await runStructuredCapturePipeline(pipeInput(), f2, policy([stale]))).toMatchObject({ stage: "write" });
    expect(f2.writes.length).toBe(1);
  });

  it("provider error → fail-open（existing=[] 扱い → writeClient 1 回・data loss 回避）", async () => {
    const fake = createFakeCaptureWriteClient();
    const errPolicy: CaptureWritePolicyDeps = { existingActive: async () => { throw new Error("provider boom"); }, nowMs: NOW };
    const r = await runStructuredCapturePipeline(pipeInput(), fake, errPolicy);
    expect(r).toMatchObject({ ok: true, stage: "write" });
    expect(fake.writes.length).toBe(1);
  });

  it("deterministic（同入力 → 同 stage・同 write 回数）", async () => {
    const a = createFakeCaptureWriteClient();
    const b = createFakeCaptureWriteClient();
    const ra = await runStructuredCapturePipeline(pipeInput(), a, policy([blockingEntry()]));
    const rb = await runStructuredCapturePipeline(pipeInput(), b, policy([blockingEntry()]));
    expect(ra).toEqual(rb);
    expect(a.writes.length).toBe(b.writes.length);
  });
});

// ── 2. TTL（expires_at 初期値） ──
describe("A1-5-11-4 orchestrator policy wiring — TTL（expires_at）", () => {
  it("insert 時（dated）→ expires_at = その日の終端", async () => {
    const fake = createFakeCaptureWriteClient();
    await runStructuredCapturePipeline(pipeInput(EXTRACTED_DATED), fake, policy([]));
    expect(fake.writes[0]?.seed.expires_at).toBe("2026-06-06T23:59:59.999Z");
  });

  it("insert 時（undated）→ expires_at = now + 14 日（undated seed にも TTL が入る）", async () => {
    const fake = createFakeCaptureWriteClient();
    await runStructuredCapturePipeline(pipeInput(EXTRACTED_UNDATED), fake, policy([]));
    expect(fake.writes[0]?.seed.expires_at).toBe(new Date(NOW + 14 * DAY).toISOString());
  });

  it("ttlDays override → undated expires_at = now + ttlDays（policy 透過）", async () => {
    const fake = createFakeCaptureWriteClient();
    await runStructuredCapturePipeline(pipeInput(EXTRACTED_UNDATED), fake, policy([], { ttlDays: 7 }));
    expect(fake.writes[0]?.seed.expires_at).toBe(new Date(NOW + 7 * DAY).toISOString());
  });

  it("policy 未指定 → expires_at = null（TTL 注入なし＝既存挙動・undated never-expire）", async () => {
    const fake = createFakeCaptureWriteClient();
    await runStructuredCapturePipeline(pipeInput(EXTRACTED_UNDATED), fake); // policy なし
    expect(fake.writes[0]?.seed.expires_at).toBeNull();
  });

  it("insert 時 seed は依然 active・evidence 同梱（TTL 注入が他フィールドを壊さない）", async () => {
    const fake = createFakeCaptureWriteClient();
    await runStructuredCapturePipeline(pipeInput(EXTRACTED_DATED), fake, policy([]));
    expect(fake.writes[0]?.seed.status).toBe("active");
    expect(fake.writes[0]?.seed.action_shape).toBe("full_go");
    expect(fake.writes[0]?.evidence?.duration_min).toBe(60);
  });
});

// ── 3. suppress 出力 redaction ──
describe("A1-5-11-4 suppress 出力 redaction（raw/source_ref/UUID なし）", () => {
  it("suppressed pipeline result に UUID / source_ref / seedRef / raw を出さない", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runStructuredCapturePipeline(pipeInput(), fake, policy([blockingEntry()]));
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i); // UUID 形なし
    for (const leak of ["source_ref", "seedRef", "signal", "desired_action", "utterance", SEED, USER]) {
      expect(json).not.toContain(leak);
    }
    // 形は { ok, stage, wroteEvidence } のみ
    expect(Object.keys(r).sort()).toEqual(["ok", "stage", "wroteEvidence"]);
  });
});

// ── 4. service 配線（suppressed outcome + summary） ──
describe("A1-5-11-4 service 配線 — suppressed outcome + summary", () => {
  it("runCaptureService（policy=blocking）→ { outcome: 'suppressed' }・write 0・redacted", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runCaptureService(serviceInput(), { extractor: createExtractedFakeExtractor(EXTRACTED_DATED), writeClient: fake, policy: policy([blockingEntry()]) });
    expect(r).toEqual({ outcome: "suppressed" });
    expect(fake.writes.length).toBe(0);
    expect(Object.keys(r)).toEqual(["outcome"]);
    const json = JSON.stringify(r);
    expect(json).not.toContain(SEED);
    expect(json).not.toContain(USER);
  });

  it("runCaptureService（policy=[]）→ captured・write 1（policy 経由でも insert は通常通り）", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runCaptureService(serviceInput(), { extractor: createExtractedFakeExtractor(EXTRACTED_DATED), writeClient: fake, policy: policy([]) });
    expect(r.outcome).toBe("captured");
    expect(fake.writes.length).toBe(1);
  });

  it("runCaptureService（policy 未指定）→ captured・write 1（既存挙動不変）", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runCaptureService(serviceInput(), { extractor: createExtractedFakeExtractor(EXTRACTED_DATED), writeClient: fake });
    expect(r.outcome).toBe("captured");
    expect(fake.writes.length).toBe(1);
  });

  it("summarizeWouldCapture(suppressed) → wouldCapture/Evidence false・outcome suppressed・reason code", () => {
    expect(summarizeWouldCapture({ outcome: "suppressed" })).toEqual({
      wouldCapture: false,
      wouldEvidence: false,
      outcome: "suppressed",
      reason: "duplicate_active_fresh",
    });
  });
});

// ── 5. 静的安全（production 非接触 / A1-5-11-5 で live entry 活性化 / orchestrator·service は policy 透過で DB 非接触） ──
describe("A1-5-11-4/5 静的安全 — production 非接触 / fireMorningCapture 活性化(A1-5-11-5) / orchestrator·service DB 非接触", () => {
  function stripped(rel: string): string {
    const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
    return src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  }

  it("fireMorningCapture（alter-morning-capture-observe）は A1-5-11-5 で write policy を活性化（loadActiveCandidateEntries + CaptureWritePolicyDeps + existingActive を参照・flags off は no-op 維持）", () => {
    const code = stripped("lib/plan/reality/integration/alter-morning-capture-observe.ts");
    for (const t of ["loadActiveCandidateEntries", "CaptureWritePolicyDeps", "existingActive"]) {
      expect(code).toContain(t);
    }
  });

  it("route（app/api/alter-morning/plan/route.ts）は write policy を参照しない（route.ts 変更 0 の担保）", () => {
    const rel = "app/api/alter-morning/plan/route.ts";
    if (!fs.existsSync(path.join(process.cwd(), rel))) return; // path 不在なら skip（boundary は observe 側で担保）
    const code = stripped(rel);
    for (const t of ["capture-write-policy", "decideCaptureWrite", "computeCaptureExpiry"]) {
      expect(code).not.toContain(t);
    }
  });

  it("orchestrator は実 DB/network/Date.now を持ち込まない（policy nowMs 注入・実 write 0）", () => {
    const code = stripped("lib/plan/reality/integration/structured-capture-orchestrator.ts");
    for (const t of ["createClient", "@supabase", '.from("', ".rpc(", ".insert(", ".update(", ".delete(", "fetch(", "Date.now"]) {
      expect(code).not.toContain(t);
    }
  });

  it("capture-service は policy 透過で実 DB/network を持ち込まない", () => {
    const code = stripped("lib/plan/reality/integration/capture-service.ts");
    for (const t of ["createClient", "@supabase", '.from("', ".rpc(", ".insert(", ".update(", ".delete(", "fetch(", "Date.now"]) {
      expect(code).not.toContain(t);
    }
  });
});
