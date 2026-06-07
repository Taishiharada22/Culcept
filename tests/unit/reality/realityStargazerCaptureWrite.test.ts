/**
 * A1-5-9-0/1 Stargazer Capture Write Integration — 静的 wiring 検証
 *   本流 /api/stargazer/alter は 10500 行で handler を直接 unit-test できないため、
 *   capture write の配線を **route source の静的検証** で固定する。
 *   fire-and-forget / never-throw / gate / default-off の挙動は fireMorningCapture の
 *   既存 unit test（realityAlterMorningCaptureObserve.test.ts）が担保する。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROUTE = fs.readFileSync(path.join(process.cwd(), "app/api/stargazer/alter/route.ts"), "utf8");
// コメントを除いた実コード（コメント内の文字列で誤判定しない）
const CODE = ROUTE.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("A1-5-9-0/1 capture write wiring — import", () => {
  it("fireMorningCapture を alter-morning-capture-observe から import", () => {
    expect(CODE).toMatch(/import\s*\{[^}]*\bfireMorningCapture\b[^}]*\}\s*from\s*"@\/lib\/plan\/reality\/integration\/alter-morning-capture-observe"/);
  });
  it("MorningCaptureClient 型を import（A1-5-11-5: write=RPC + read=dedup provider・RpcCapableClient cast は廃止）", () => {
    expect(CODE).toContain("MorningCaptureClient");
    expect(CODE).not.toContain("RpcCapableClient");
  });
});

describe("A1-5-9-0/1 capture write wiring — fire-and-forget call", () => {
  it("fireMorningCapture(message, userId, supabase as unknown as MorningCaptureClient) を呼ぶ", () => {
    expect(CODE).toMatch(/fireMorningCapture\(\s*message\s*,\s*userId\s*,\s*supabase as unknown as MorningCaptureClient\s*\)/);
  });
  it("fire-and-forget（await しない）", () => {
    expect(CODE).not.toMatch(/await\s+fireMorningCapture/);
  });
  it("二重防御 try/catch で囲む（response 不変）", () => {
    // fireMorningCapture 呼出が try ブロック内（直前に try、近傍に catch）
    const idx = CODE.indexOf("fireMorningCapture(message");
    expect(idx).toBeGreaterThan(0);
    const before = CODE.slice(Math.max(0, idx - 120), idx);
    const after = CODE.slice(idx, idx + 160);
    expect(before).toContain("try {");
    expect(after).toContain("catch");
  });
});

describe("A1-5-9-0/1 capture write wiring — gating / 配置 / 後方互換", () => {
  it("morning turn のみ発火（morningResponse && phase!==\"skipped\" gate）", () => {
    // capture 呼出の直前 gate（surface read と同条件）
    const idx = CODE.indexOf("fireMorningCapture(message");
    const before = CODE.slice(Math.max(0, idx - 220), idx);
    expect(before).toMatch(/morningResponse && morningResponse\.phase !== "skipped"/);
  });
  it("surface read（A1-5-8-2）を先に算出してから capture（prior read → current write の順）", () => {
    const surfaceIdx = CODE.indexOf("resolveMorningProtocolCaptureFragment");
    const captureIdx = CODE.indexOf("fireMorningCapture(message");
    expect(surfaceIdx).toBeGreaterThan(0);
    expect(captureIdx).toBeGreaterThan(surfaceIdx); // surface を先に
  });
  it("既存 surface read（captureCandidateFragment）を壊していない（後方互換）", () => {
    expect(CODE).toContain("captureCandidateFragment");
    expect(CODE).toContain("buildMorningCaptureSurface");
  });
  it("既存 morningProtocol assembly を壊していない（setMorningPlan 相当の morningProtocol.plan 出力）", () => {
    expect(CODE).toContain("morningProtocol:");
    // A1-6-7: serve は servedMorningPlan（= morningResponse.plan を flag-gated consumed reflection した結果）。
    //   plan 出力は維持（servedMorningPlan の source は morningResponse?.plan ?? null・flag off 時は同一）。
    expect(CODE).toContain("plan: servedMorningPlan");
    expect(CODE).toContain("morningResponse?.plan ?? null");
  });
});

describe("A1-5-9-0/1 capture write 安全性（fireMorningCapture 契約・static）", () => {
  const OBS = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/alter-morning-capture-observe.ts"), "utf8");
  it("fireMorningCapture は void 同期返却（fire-and-forget・Promise を返さない）", () => {
    expect(OBS).toMatch(/export function fireMorningCapture\([^)]*\)\s*:\s*void/);
  });
  it("default 両 flag off → no-op（decideCaptureMode: 両 off → null → 即 return）", () => {
    expect(OBS).toContain("if (mode === null) return;");
  });
  it("never-throw（sync 構築 error を握りつぶす try/catch）", () => {
    expect(OBS).toContain("// sync 構築 error も握りつぶし");
  });
  it("gate が production hard block（resolveMorningObserveGate→evaluateCaptureGate 経由）", () => {
    expect(OBS).toContain("resolveMorningObserveGate");
  });
});
