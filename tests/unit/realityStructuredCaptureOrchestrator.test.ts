import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  runStructuredCapturePipeline,
  type StructuredCapturePipelineInput,
} from "@/lib/plan/reality/integration/structured-capture-orchestrator";
import {
  createFakeCaptureWriteClient,
  createNoRunCaptureWriteClient,
} from "@/lib/plan/reality/integration/capture-write-repository";
import {
  createRpcCaptureWriteClient,
  createFakeRpcClient,
  createNoRunRpcClient,
  CAPTURE_RPC_NAME,
} from "@/lib/plan/reality/integration/capture-rpc-adapter";
import { FORBIDDEN_INTAKE_FIELDS } from "@/lib/plan/reality/seed-capture-intake";

const SEED_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";
const CAPTURED = "2026-06-05T10:00:00Z";
// raw 漏れ検出用 sentinel（結果/payload に現れてはならない）
const RAW_SENTINEL = "RAW_LEAK_SENTINEL_発話本文_xyz";

function extracted(p: Record<string, unknown> = {}): Record<string, unknown> {
  return { confidence: 0.9, source: "chat", desiredDate: "2026-06-06", desiredTimeHint: "morning", actionShape: "full_go", ...p };
}
function pipelineInput(p: Record<string, unknown> = {}): StructuredCapturePipelineInput {
  return { seedId: SEED_ID, userId: USER_ID, capturedAt: CAPTURED, extracted: extracted(p) };
}
const SRC = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/structured-capture-orchestrator.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("A1-5-4d-1 orchestrator — valid path（fake CaptureWriteClient・DB write 0）", () => {
  it("valid → intake PASS → draft → no-run write 1 回（ok）", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runStructuredCapturePipeline(pipelineInput({ explicitDuration: { durationMin: 60, confidence: "high" } }), fake);
    expect(r.ok).toBe(true);
    if (r.ok && r.stage === "write") {
      expect(r.stage).toBe("write");
      expect(r.code).toBe("ok");
      expect(r.wroteEvidence).toBe(true);
    }
    expect(fake.writes.length).toBe(1); // write seam を 1 回だけ呼ぶ
    expect(fake.writes[0]?.seed.id).toBe(SEED_ID);
  });
  it("explicitDuration high → seed + evidence payload（wroteEvidence=true）", async () => {
    const fake = createFakeCaptureWriteClient();
    await runStructuredCapturePipeline(pipelineInput({ explicitDuration: { durationMin: 60, confidence: "high" } }), fake);
    const p = fake.writes[0]!;
    expect(p.evidence).not.toBeNull();
    expect(p.evidence?.duration_min).toBe(60);
    expect(p.evidence?.source).toBe("seed_explicit");
    expect(p.evidence?.confidence).toBe("high");
    expect(p.evidence?.seed_id).toBe(SEED_ID);
  });
  it("explicitDuration なし → seed のみ payload（wroteEvidence=false）", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runStructuredCapturePipeline(pipelineInput(), fake);
    expect(fake.writes[0]?.evidence).toBeNull();
    if (r.ok) expect(r.wroteEvidence).toBe(false);
  });
  it("explicitDuration low → evidence 化されず seed のみ（wroteEvidence=false・write は 1 回）", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runStructuredCapturePipeline(pipelineInput({ explicitDuration: { durationMin: 60, confidence: "low" } }), fake);
    expect(fake.writes.length).toBe(1);
    expect(fake.writes[0]?.evidence).toBeNull();
    if (r.ok) expect(r.wroteEvidence).toBe(false);
  });
  it("seedId/userId/capturedAt は server 注入（extracted の同名 key を無視）", async () => {
    const fake = createFakeCaptureWriteClient();
    await runStructuredCapturePipeline(
      { seedId: SEED_ID, userId: USER_ID, capturedAt: CAPTURED, extracted: { confidence: 0.9, source: "chat", seedId: "EVIL", userId: "EVIL", capturedAt: "EVIL" } },
      fake
    );
    const p = fake.writes[0]!;
    expect(p.seed.id).toBe(SEED_ID);
    expect(p.seed.user_id).toBe(USER_ID);
    expect(p.seed.captured_at).toBe(CAPTURED);
  });
});

describe("A1-5-4d-1 orchestrator — RPC-backed path（createRpcCaptureWriteClient・実 RPC 実行 0）", () => {
  it("valid → .rpc を 1 回（CAPTURE_RPC_NAME・structured-only args・DB write 0）", async () => {
    const rpc = createFakeRpcClient();
    const r = await runStructuredCapturePipeline(
      pipelineInput({ explicitDuration: { durationMin: 60, confidence: "high" }, sourceRef: "chat-msg_1" }),
      createRpcCaptureWriteClient(rpc)
    );
    expect(r.ok).toBe(true);
    expect(rpc.calls.length).toBe(1);
    expect(rpc.calls[0]?.fn).toBe(CAPTURE_RPC_NAME);
    expect(Object.keys(rpc.calls[0]!.args).sort()).toEqual(["p_evidence", "p_seed", "p_user_id"]);
    expect(rpc.calls[0]?.args.p_seed.id).toBe(SEED_ID);
    expect(rpc.calls[0]?.args.p_evidence?.seed_id).toBe(SEED_ID);
  });
  it("no-run RPC client → no_run（実 .rpc 実行 0・実 DB 接続 0）", async () => {
    const r = await runStructuredCapturePipeline(pipelineInput(), createRpcCaptureWriteClient(createNoRunRpcClient()));
    expect(r.ok).toBe(false);
    if (!r.ok && r.stage === "write") expect(r.code).toBe("no_run");
  });
  it("RPC error → write_failed（失敗分類が orchestrator に伝播）", async () => {
    const r = await runStructuredCapturePipeline(
      pipelineInput(),
      createRpcCaptureWriteClient(createFakeRpcClient({ error: { message: "boom", code: "23514" } }))
    );
    expect(r.ok).toBe(false);
    if (!r.ok && r.stage === "write") expect(r.code).toBe("write_failed");
  });
});

describe("A1-5-4d-1 orchestrator — fail-closed（raw / 不正 → write 0）", () => {
  it("raw field 混入（8 種）→ intake reject → write 0・raw 値が結果に出ない", async () => {
    for (const f of FORBIDDEN_INTAKE_FIELDS) {
      const fake = createFakeCaptureWriteClient();
      const r = await runStructuredCapturePipeline(pipelineInput({ [f]: RAW_SENTINEL }), fake);
      expect(r.ok).toBe(false);
      if (!r.ok && r.stage === "intake") {
        expect(r.reason).toBe("raw_field_present");
        expect(r.field).toBe(f);
      }
      expect(fake.writes.length).toBe(0); // intake reject → write 呼ばれない
      expect(JSON.stringify(r)).not.toContain(RAW_SENTINEL); // raw 値が結果に漏れない
    }
  });
  it("不正 structured（date/time_hint/action_shape/confidence/source/source_ref/explicit）→ write 0", async () => {
    const cases: Record<string, unknown>[] = [
      { desiredDate: "2026-13-45" },
      { desiredTimeHint: "midnight" },
      { actionShape: "bogus" },
      { confidence: 1.5 },
      { source: "email" },
      { sourceRef: "カフェで仕事したい" },
      { explicitDuration: { durationMin: 1, confidence: "high" } },
      { explicitDuration: { durationMin: 60, confidence: "medium" } },
    ];
    for (const c of cases) {
      const fake = createFakeCaptureWriteClient();
      const r = await runStructuredCapturePipeline(pipelineInput(c), fake);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.stage).toBe("intake");
      expect(fake.writes.length).toBe(0);
    }
  });
  it("not_object（raw 発話 string）→ intake reject → write 0", async () => {
    const fake = createFakeCaptureWriteClient();
    const r = await runStructuredCapturePipeline(
      { seedId: SEED_ID, userId: USER_ID, capturedAt: CAPTURED, extracted: "今日カフェで仕事したい" },
      fake
    );
    expect(r.ok).toBe(false);
    if (!r.ok && r.stage === "intake") expect(r.reason).toBe("not_object");
    expect(fake.writes.length).toBe(0);
  });
});

describe("A1-5-4d-1 orchestrator — raw firewall end-to-end / source_ref opaque", () => {
  it("valid path: 記録された RPC args JSON に raw field 名が出ない", async () => {
    const rpc = createFakeRpcClient();
    await runStructuredCapturePipeline(
      pipelineInput({ explicitDuration: { durationMin: 60, confidence: "high" }, sourceRef: "chat-msg_1" }),
      createRpcCaptureWriteClient(rpc)
    );
    const json = JSON.stringify(rpc.calls[0]!.args);
    for (const raw of ["signal", "desiredAction", "desired_action", "raw_text", "title", "location", "prompt", "transcript"]) {
      expect(json).not.toContain(raw);
    }
  });
  it("source_ref は opaque として payload に保持（raw 本文化しない）", async () => {
    const rpc = createFakeRpcClient();
    await runStructuredCapturePipeline(
      pipelineInput({ explicitDuration: { durationMin: 60, confidence: "high" }, sourceRef: "chat-msg_abc.123" }),
      createRpcCaptureWriteClient(rpc)
    );
    expect(rpc.calls[0]?.args.p_seed.source_ref).toBe("chat-msg_abc.123");
    expect(rpc.calls[0]?.args.p_evidence?.source_ref).toBe("chat-msg_abc.123");
  });
});

describe("A1-5-4d-1 orchestrator — owner/linkage 構造的不変（mismatch 発生不能）", () => {
  // pipeline は単一 input から seed/evidence 両 draft を導出するため owner/linkage は常に整合。
  // → orchestrator 経由で mismatch を生成できず「mismatch → write 0」は vacuously 成立。
  //   write seam の owner_mismatch/seed_link_mismatch guard は A1-5-4b-1/4 で実証済の defense-in-depth。
  it("生成 payload は常に owner/linkage 整合（seed.user_id===evidence.user_id===userId, evidence.seed_id===seed.id===seedId）", async () => {
    const fake = createFakeCaptureWriteClient();
    await runStructuredCapturePipeline(pipelineInput({ explicitDuration: { durationMin: 60, confidence: "high" } }), fake);
    const p = fake.writes[0]!;
    expect(p.seed.user_id).toBe(USER_ID);
    expect(p.evidence?.user_id).toBe(USER_ID);
    expect(p.evidence?.user_id).toBe(p.seed.user_id); // owner 整合
    expect(p.evidence?.seed_id).toBe(p.seed.id); // seed linkage 整合
    expect(p.seed.id).toBe(SEED_ID);
  });
});

describe("A1-5-4d-1 orchestrator — 静的安全（DB/RPC/LLM/runtime 0）", () => {
  it("実 DB 接続・実 write を持たない（createClient/@supabase/.from/.rpc/.insert/.update/.delete/.upsert 不在）", () => {
    for (const t of ["createClient", "@supabase", ".from(", ".rpc(", ".insert(", ".update(", ".delete(", ".upsert("]) {
      expect(CODE).not.toContain(t);
    }
  });
  it("service_role を持たない", () => {
    expect(CODE).not.toContain("service_role");
  });
  it("LLM / prompt 実装を持たない（structured 出力は前段で確定済）", () => {
    expect(CODE).not.toContain("openai");
    expect(CODE).not.toContain("anthropic");
    expect(CODE).not.toContain("completion");
  });
  it("server-only 境界を宣言（write seam と同じ server 境界・client bundle 取り込み禁止）", () => {
    expect(CODE).toContain("server-only");
  });
  it("barrel(integration/index.ts) が structured-capture-orchestrator を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/index.ts"), "utf8");
    expect(idx).not.toContain("structured-capture-orchestrator");
  });
});
