/**
 * SR B1b-2C-9-FIX-2 — runExtractShiftDraft の mode 別 parseFormData / dispatch
 *
 * 不変条件:
 *   ① server-side mode は env で再評価（client が FormData に書いても信用しない）
 *   ② combined mode は combined フィールドのみ受理、split のフィールドが混入したら invalid_input
 *   ③ split mode は header/personRow のみ受理、combined が混入したら invalid_input
 *   ④ mode 一致時は adapter が mode 別の chunk input を受ける（split=3 fields / combined=2 fields）
 *   ⑤ raw response / base64 / Blob を outcome に載せない（既存 contract）
 *
 * VLM は呼ばない（fake adapter で adapter input を spy）。env も全 gate を通すよう注入する。
 */
import { describe, it, expect, vi } from "vitest";

import { runExtractShiftDraft } from "@/lib/plan/shift/runExtractShiftDraft";
import type {
  DraftExtractionAdapter,
  DraftExtractionChunkInput,
} from "@/lib/plan/shift/draftExtractionAdapter";

const STAGING_REF = "hjcrvndumgiovyfdacwc";
const PRODUCTION_REF = "aljavfujeqcwnqryjmhl";

function makeEnv(
  vlmInputMode: "split" | "combined" | undefined
): {
  flagOn: boolean;
  supabaseUrl: string;
  geminiApiKey: string;
  vlmModel: string;
  vlmInputMode?: "split" | "combined";
} {
  return {
    flagOn: true,
    supabaseUrl: `https://${STAGING_REF}.supabase.co`,
    geminiApiKey: "test-key",
    vlmModel: "gemini-2.5-pro",
    ...(vlmInputMode ? { vlmInputMode } : {}),
  };
}

// fake adapter: chunk input を spy するだけ。VLM は呼ばない。
function makeSpyAdapter() {
  const calls: DraftExtractionChunkInput[] = [];
  const adapter: DraftExtractionAdapter = {
    extractChunk: vi.fn(async (input: DraftExtractionChunkInput) => {
      calls.push(input);
      // chunk の dayRange に対応した perfect cells を返す
      const { from, to } = input.dayRange;
      return Array.from({ length: to - from + 1 }, (_, i) => ({
        day: from + i,
        rawCode: "H",
        rowLabel: "本人",
      }));
    }),
  };
  return { adapter, calls };
}

function buildSplitFormData(): FormData {
  const fd = new FormData();
  fd.set("header", new Blob(["h"], { type: "image/png" }));
  fd.set("personRow", new Blob(["p"], { type: "image/png" }));
  fd.set("year", "2025");
  fd.set("month", "7");
  fd.set("daysInMonth", "31");
  return fd;
}

function buildCombinedFormData(): FormData {
  const fd = new FormData();
  fd.set("combined", new Blob(["c"], { type: "image/png" }));
  fd.set("year", "2025");
  fd.set("month", "7");
  fd.set("daysInMonth", "31");
  return fd;
}

describe("runExtractShiftDraft — combined mode（server-side env）", () => {
  it("combined env + combined FormData → success / adapter は combined chunk input を受ける", async () => {
    const { adapter, calls } = makeSpyAdapter();
    const r = await runExtractShiftDraft(buildCombinedFormData(), {
      env: makeEnv("combined"),
      stagingRef: STAGING_REF,
      productionRef: PRODUCTION_REF,
      getUserId: async () => "user-1",
      createAdapter: () => adapter,
    });
    expect(r.ok).toBe(true);
    // chunk 1-15 / 16-31 = 2 chunk
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.mode).toBe("combined");
      if (c.mode === "combined") {
        expect(c.combinedBlob).toBeInstanceOf(Blob);
      }
    }
  });

  it("combined env + split FormData → invalid_input（mixed 拒否）", async () => {
    const { adapter, calls } = makeSpyAdapter();
    const r = await runExtractShiftDraft(buildSplitFormData(), {
      env: makeEnv("combined"),
      stagingRef: STAGING_REF,
      productionRef: PRODUCTION_REF,
      getUserId: async () => "user-1",
      createAdapter: () => adapter,
    });
    expect(r.ok).toBe(false);
    expect(r.ok || r.error.kind).toBe("invalid_input");
    expect(calls).toHaveLength(0); // adapter 呼出なし
  });

  it("combined env + 両方混入 → invalid_input（client が嘘 mode を送っても server で拒否）", async () => {
    const { adapter, calls } = makeSpyAdapter();
    const fd = buildCombinedFormData();
    fd.set("header", new Blob(["h"], { type: "image/png" })); // 違反
    const r = await runExtractShiftDraft(fd, {
      env: makeEnv("combined"),
      stagingRef: STAGING_REF,
      productionRef: PRODUCTION_REF,
      getUserId: async () => "user-1",
      createAdapter: () => adapter,
    });
    expect(r.ok).toBe(false);
    expect(r.ok || r.error.kind).toBe("invalid_input");
    expect(calls).toHaveLength(0);
  });
});

describe("runExtractShiftDraft — split mode（既存互換）", () => {
  it("split env + split FormData → success / adapter は split chunk input を受ける", async () => {
    const { adapter, calls } = makeSpyAdapter();
    const r = await runExtractShiftDraft(buildSplitFormData(), {
      env: makeEnv("split"),
      stagingRef: STAGING_REF,
      productionRef: PRODUCTION_REF,
      getUserId: async () => "user-1",
      createAdapter: () => adapter,
    });
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.mode).toBe("split");
      if (c.mode === "split") {
        expect(c.headerBlob).toBeInstanceOf(Blob);
        expect(c.personRowBlob).toBeInstanceOf(Blob);
      }
    }
  });

  it("env 未設定 → 既定 split として扱う", async () => {
    const { adapter, calls } = makeSpyAdapter();
    const r = await runExtractShiftDraft(buildSplitFormData(), {
      env: makeEnv(undefined),
      stagingRef: STAGING_REF,
      productionRef: PRODUCTION_REF,
      getUserId: async () => "user-1",
      createAdapter: () => adapter,
    });
    expect(r.ok).toBe(true);
    expect(calls[0].mode).toBe("split");
  });

  it("split env + combined FormData → invalid_input", async () => {
    const { adapter, calls } = makeSpyAdapter();
    const r = await runExtractShiftDraft(buildCombinedFormData(), {
      env: makeEnv("split"),
      stagingRef: STAGING_REF,
      productionRef: PRODUCTION_REF,
      getUserId: async () => "user-1",
      createAdapter: () => adapter,
    });
    expect(r.ok).toBe(false);
    expect(r.ok || r.error.kind).toBe("invalid_input");
    expect(calls).toHaveLength(0);
  });
});

describe("runExtractShiftDraft — base64 / raw 非露出（既存契約）", () => {
  it("成功 outcome に base64 / blob: / dataURL を含まない", async () => {
    const { adapter } = makeSpyAdapter();
    const r = await runExtractShiftDraft(buildCombinedFormData(), {
      env: makeEnv("combined"),
      stagingRef: STAGING_REF,
      productionRef: PRODUCTION_REF,
      getUserId: async () => "user-1",
      createAdapter: () => adapter,
    });
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/base64|data:image|blob:|dataUri|dataURL/i);
  });
});
