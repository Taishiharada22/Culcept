/**
 * SR A4 visual smoke V-1 — dev preview gate + 合成 fixture の contract（node・pure）
 * positive runtime（warning 発火）は V-2 Playwright に回す。本 test は gate / fixture / no-leak を固定。
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

import { isA4SmokePreviewEnabled } from "@/app/(culcept)/plan/dev-a4-smoke/a4SmokeGate";
import {
  A4_SMOKE_CELLS,
  A4_SMOKE_GEOMETRY,
  A4_SMOKE_BLANK_DAYS,
  A4_SMOKE_TARGET_DAY,
  a4SmokeContentRegion,
} from "@/app/(culcept)/plan/dev-a4-smoke/a4SmokeFixture";
import { normalizeRawCode } from "@/lib/plan/shift/shiftCodeDictionary";

describe("A4 smoke gate（auth 回避 route の強い gate）", () => {
  it("flag OFF → false（route notFound）", () => {
    expect(isA4SmokePreviewEnabled({ flag: undefined, nodeEnv: "development" })).toBe(false);
    expect(isA4SmokePreviewEnabled({ flag: "false", nodeEnv: "development" })).toBe(false);
    expect(isA4SmokePreviewEnabled({ flag: "1", nodeEnv: "development" })).toBe(false);
  });

  it("production → false（flag ON でも notFound）", () => {
    expect(isA4SmokePreviewEnabled({ flag: "true", nodeEnv: "production" })).toBe(false);
  });

  it("flag ON + non-production → true", () => {
    expect(isA4SmokePreviewEnabled({ flag: "true", nodeEnv: "development" })).toBe(true);
    expect(isA4SmokePreviewEnabled({ flag: "true", nodeEnv: "test" })).toBe(true);
  });
});

describe("A4 smoke fixture（合成・rawCode 空欄 target）", () => {
  it("target day は rawCode 空欄（P1 対象）+ blankDays に含まれる", () => {
    const target = A4_SMOKE_CELLS.find((c) => c.day === A4_SMOKE_TARGET_DAY);
    expect(target).toBeDefined();
    expect(normalizeRawCode(target!.rawCode)).toBe("");
    expect(A4_SMOKE_BLANK_DAYS).toContain(A4_SMOKE_TARGET_DAY);
  });

  it("target 以外は非空（warning が target に限定される）", () => {
    for (const c of A4_SMOKE_CELLS) {
      if (c.day === A4_SMOKE_TARGET_DAY) continue;
      expect(normalizeRawCode(c.rawCode)).not.toBe("");
    }
  });

  it("content region は geometry 内（draw=read の単一点）", () => {
    const r = a4SmokeContentRegion();
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(A4_SMOKE_GEOMETRY.imageWidth);
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
  });

  it("fixture export は raw 画像/base64 を含まない（structured fixture のみ）", () => {
    const json = JSON.stringify(A4_SMOKE_CELLS) + JSON.stringify(A4_SMOKE_GEOMETRY);
    expect(json).not.toMatch(/data:image|base64/i);
  });
});

describe("A4 smoke route source（commit に raw 画像/base64 を含まない）", () => {
  it("fixture / client source に base64 画像を直書きしていない（runtime ObjectURL のみ）", () => {
    const files = [
      "app/(culcept)/plan/dev-a4-smoke/a4SmokeFixture.ts",
      "app/(culcept)/plan/dev-a4-smoke/DevA4SmokeClient.tsx",
      "app/(culcept)/plan/dev-a4-smoke/page.tsx",
    ];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/data:image\/[a-z+]+;base64,/i);
    }
  });
});
