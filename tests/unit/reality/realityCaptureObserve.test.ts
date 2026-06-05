import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { summarizeWouldCapture } from "@/lib/plan/reality/integration/capture-observe";
import type { CaptureServiceResult } from "@/lib/plan/reality/integration/capture-service";

const SRC = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/capture-observe.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("A1-5-5e summarizeWouldCapture — would-capture projection", () => {
  it("captured + wroteEvidence true → wouldCapture true / wouldEvidence true", () => {
    const s = summarizeWouldCapture({ outcome: "captured", wroteEvidence: true });
    expect(s).toEqual({ wouldCapture: true, wouldEvidence: true, outcome: "captured", reason: null });
  });
  it("captured + wroteEvidence false → wouldCapture true / wouldEvidence false（duration なし/low）", () => {
    const s = summarizeWouldCapture({ outcome: "captured", wroteEvidence: false });
    expect(s).toEqual({ wouldCapture: true, wouldEvidence: false, outcome: "captured", reason: null });
  });
  it("gate_blocked → wouldCapture false / reason=gate reason code", () => {
    const s = summarizeWouldCapture({ outcome: "gate_blocked", reason: "USER_NOT_CANARY" });
    expect(s).toEqual({ wouldCapture: false, wouldEvidence: false, outcome: "gate_blocked", reason: "USER_NOT_CANARY" });
  });
  it("no_intent → wouldCapture false / reason null", () => {
    const s = summarizeWouldCapture({ outcome: "no_intent" });
    expect(s).toEqual({ wouldCapture: false, wouldEvidence: false, outcome: "no_intent", reason: null });
  });
  it("invalid_extraction → wouldCapture false / reason=intake reason code", () => {
    const s = summarizeWouldCapture({ outcome: "invalid_extraction", reason: "raw_field_present" });
    expect(s.wouldCapture).toBe(false);
    expect(s.reason).toBe("raw_field_present");
  });
  it("intake_rejected → wouldCapture false / reason=intake reason code", () => {
    const s = summarizeWouldCapture({ outcome: "intake_rejected", reason: "invalid_date" });
    expect(s.wouldCapture).toBe(false);
    expect(s.reason).toBe("invalid_date");
  });
  it("write_failed → wouldCapture false / reason=write code", () => {
    const s = summarizeWouldCapture({ outcome: "write_failed", code: "no_run" });
    expect(s).toEqual({ wouldCapture: false, wouldEvidence: false, outcome: "write_failed", reason: "no_run" });
  });
  it("全 outcome で reason は code のみ（raw を含まない・redacted）", () => {
    const results: CaptureServiceResult[] = [
      { outcome: "captured", wroteEvidence: true },
      { outcome: "gate_blocked", reason: "KILLED" },
      { outcome: "no_intent" },
      { outcome: "invalid_extraction", reason: "raw_field_present" },
      { outcome: "intake_rejected", reason: "not_object" },
      { outcome: "write_failed", code: "write_failed" },
    ];
    for (const r of results) {
      const s = summarizeWouldCapture(r);
      // reason は短い code（raw 本文でない）か null
      expect(s.reason === null || (typeof s.reason === "string" && s.reason.length < 40)).toBe(true);
    }
  });
});

describe("A1-5-5e summarizeWouldCapture — 静的安全（pure・IO 0）", () => {
  it("Supabase / DB / LLM / server-only を持たない（pure projection）", () => {
    for (const t of ["createClient", "@supabase", ".from(", ".rpc(", ".insert(", "openai", "anthropic", "server-only", "fetch("]) {
      expect(CODE).not.toContain(t);
    }
  });
  it("integration barrel(index.ts) が capture-observe を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/index.ts"), "utf8");
    expect(idx).not.toContain("capture-observe");
  });
});
