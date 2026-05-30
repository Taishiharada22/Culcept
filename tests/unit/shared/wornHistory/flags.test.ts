import { describe, it, expect, afterEach } from "vitest";

import { WORN_HISTORY_FLAGS } from "@/lib/shared/wornHistory";

const ENV = "NEXT_PUBLIC_WORN_HISTORY_ENGINE_READS_CORPUS";
const env = process.env as Record<string, string | undefined>;

describe("WORN_HISTORY_FLAGS.engineReadsCorpus", () => {
  afterEach(() => {
    delete env[ENV];
  });

  it("env 未設定なら default false", () => {
    delete env[ENV];
    expect(WORN_HISTORY_FLAGS.engineReadsCorpus()).toBe(false);
  });

  it("env true / on / 1 / yes で true", () => {
    for (const v of ["true", "on", "1", "yes", "TRUE"]) {
      env[ENV] = v;
      expect(WORN_HISTORY_FLAGS.engineReadsCorpus()).toBe(true);
    }
  });

  it("env false / off / 0 / no で false", () => {
    for (const v of ["false", "off", "0", "no"]) {
      env[ENV] = v;
      expect(WORN_HISTORY_FLAGS.engineReadsCorpus()).toBe(false);
    }
  });

  it("不正値・空白は false（既定にフォールバック）", () => {
    for (const v of ["maybe", "", "   ", "2", "enable"]) {
      env[ENV] = v;
      expect(WORN_HISTORY_FLAGS.engineReadsCorpus()).toBe(false);
    }
  });

  it("override が最優先（env を無視）", () => {
    env[ENV] = "true";
    expect(WORN_HISTORY_FLAGS.engineReadsCorpus(false)).toBe(false);
    delete env[ENV];
    expect(WORN_HISTORY_FLAGS.engineReadsCorpus(true)).toBe(true);
  });

  it("client-safe: 呼び出しは throw しない", () => {
    delete env[ENV];
    expect(() => WORN_HISTORY_FLAGS.engineReadsCorpus()).not.toThrow();
  });
});
