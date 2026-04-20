/**
 * [CEO lock 2026-04-20 M0-4 #1/#2] LLM 版 todayReader — injectable client + validation。
 */

import { describe, expect, it } from "vitest";
import { compressForTodayReader } from "@/lib/coalter/understanding/compressTodayInput";
import {
  readTodayLLM,
  validateLLMReading,
  type LLMReadingCandidate,
  type TodayReaderLLMClient,
} from "@/lib/coalter/understanding/todayReaderLLM";
import { MATURE_BUNDLE } from "./fixtures/pairs";

function stubClient(candidate: LLMReadingCandidate | null): TodayReaderLLMClient {
  return {
    infer: async () => candidate as LLMReadingCandidate,
  };
}

function throwingClient(): TodayReaderLLMClient {
  return {
    infer: async () => {
      throw new Error("llm transient");
    },
  };
}

describe("readTodayLLM", () => {
  const input = compressForTodayReader(MATURE_BUNDLE);

  it("client 未注入 → error:no_client", async () => {
    const r = await readTodayLLM(input, undefined);
    expect(r.outcome).toBe("error");
    expect(r.reading).toBeNull();
    if (r.outcome === "error") expect(r.reason).toBe("no_client");
  });

  it("client 例外 → error:exception", async () => {
    const r = await readTodayLLM(input, throwingClient());
    expect(r.outcome).toBe("error");
    if (r.outcome === "error") expect(r.reason).toBe("exception");
  });

  it("client が invalid shape → fallback:invalid_shape", async () => {
    const r = await readTodayLLM(
      input,
      stubClient({
        mode: "WRONG" as never,
        energyBudget: "mid",
        timeBudget: "limited",
        implicitIntent: "",
        latentNeeds: [],
        confidence: 0.5,
      }),
    );
    expect(r.outcome).toBe("fallback");
    if (r.outcome === "fallback") expect(r.reason).toBe("invalid_shape");
  });

  it("client が null → fallback:empty", async () => {
    const r = await readTodayLLM(input, stubClient(null));
    expect(r.outcome).toBe("fallback");
    if (r.outcome === "fallback") expect(r.reason).toBe("empty");
  });

  it("valid 出力 → ok, TodayReading 型で返る", async () => {
    const r = await readTodayLLM(
      input,
      stubClient({
        mode: "connect",
        energyBudget: "mid",
        timeBudget: "limited",
        implicitIntent: "落ち着きを共有する時間",
        latentNeeds: ["安心", "静けさ"],
        confidence: 0.72,
      }),
    );
    expect(r.outcome).toBe("ok");
    if (r.outcome === "ok") {
      expect(r.reading.mode).toBe("connect");
      expect(r.reading.confidence).toBe(0.72);
      expect(r.reading.latentNeeds).toEqual(["安心", "静けさ"]);
    }
  });
});

describe("validateLLMReading", () => {
  it("confidence 1.5 は 1.0 にクランプ", () => {
    const v = validateLLMReading({
      mode: "maintain",
      energyBudget: "mid",
      timeBudget: "limited",
      implicitIntent: "",
      latentNeeds: [],
      confidence: 1.5,
    });
    expect(v?.confidence).toBe(1);
  });

  it("latentNeeds は 3 本に切る + 空文字除外", () => {
    const v = validateLLMReading({
      mode: "maintain",
      energyBudget: "mid",
      timeBudget: "limited",
      implicitIntent: "",
      latentNeeds: ["a", " b ", "", "c", "d"],
      confidence: 0.5,
    });
    expect(v?.latentNeeds).toEqual(["a", "b", "c"]);
  });

  it("非数 confidence → null", () => {
    const v = validateLLMReading({
      mode: "maintain",
      energyBudget: "mid",
      timeBudget: "limited",
      implicitIntent: "",
      latentNeeds: [],
      confidence: Number.NaN,
    });
    expect(v).toBeNull();
  });
});
