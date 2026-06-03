/**
 * SR B1b-2C-1 — assisted row selection pure 座標 model の契約
 *
 * 検証する不変条件:
 *   - 画像本体（Blob/base64/dataURI）は contract に乗らない（型 + parse で構造的に弾く）
 *   - headerBand / personRowBand とも contract 必須（両 valid で CTA active）
 *   - validation / normalization / crop region / fingerprint / storage payload が pure
 */
import { describe, it, expect } from "vitest";
import {
  validateBand,
  validateSelection,
  normalizeBand,
  normalizeSelection,
  suggestBandsFromTap,
  computeCropRegions,
  fnv1a32,
  buildImageFingerprint,
  makeStorageKey,
  toStoredPayload,
  parseStoredPayload,
  DEFAULT_HEADER_OFFSET_RATIO,
  type AssistedRowSelection,
} from "@/lib/plan/shift/assistedRowSelection";

const IMG = { imageW: 1860, imageH: 846 };
const ok = (): AssistedRowSelection => ({
  ...IMG,
  headerBand: { top: 180, bottom: 226 },
  personRowBand: { top: 290, bottom: 350 },
  imageFingerprint: "1234_1860x846_deadbeef",
});

describe("validateBand", () => {
  it("正常 band → issues なし", () => {
    expect(validateBand({ top: 100, bottom: 150 }, 846)).toEqual([]);
  });
  it("top>=bottom → order", () => {
    expect(validateBand({ top: 150, bottom: 100 }, 846).map((i) => i.field)).toContain("order");
  });
  it("bounds 外 → bounds", () => {
    expect(validateBand({ top: -1, bottom: 100 }, 846).map((i) => i.field)).toContain("bounds");
    expect(validateBand({ top: 0, bottom: 1000 }, 846).map((i) => i.field)).toContain("bounds");
  });
  it("低高 (<4px) → height", () => {
    expect(validateBand({ top: 100, bottom: 102 }, 846).map((i) => i.field)).toContain("height");
  });
  it("NaN/Infinity → top/bottom", () => {
    const fs = validateBand({ top: Number.NaN, bottom: Number.POSITIVE_INFINITY }, 846).map((i) => i.field);
    expect(fs).toEqual(expect.arrayContaining(["top", "bottom"]));
  });
});

describe("validateSelection", () => {
  it("両 band valid + 並び順 OK → ok / CTA active", () => {
    const v = validateSelection(ok());
    expect(v.ok).toBe(true);
    expect(v.ctaActive).toBe(true);
    expect(v.headerIssues).toEqual([]);
    expect(v.personRowIssues).toEqual([]);
    expect(v.orderingIssue).toBeNull();
  });
  it("header が personRow より下 → orderingIssue", () => {
    const s = { ...ok(), headerBand: { top: 400, bottom: 450 } };
    const v = validateSelection(s);
    expect(v.ok).toBe(false);
    expect(v.ctaActive).toBe(false);
    expect(v.orderingIssue?.field).toBe("order");
  });
  it("header / personRow が重なる → orderingIssue", () => {
    const s = { ...ok(), headerBand: { top: 200, bottom: 300 } };
    expect(validateSelection(s).orderingIssue?.field).toBe("order");
  });
  it("どちらかの band が invalid → ok=false / orderingIssue は出さない", () => {
    const s = { ...ok(), headerBand: { top: -1, bottom: 100 } };
    const v = validateSelection(s);
    expect(v.ok).toBe(false);
    expect(v.headerIssues.length).toBeGreaterThan(0);
    expect(v.orderingIssue).toBeNull();
  });
});

describe("normalizeBand / normalizeSelection", () => {
  it("整数 snap + clamp", () => {
    expect(normalizeBand({ top: -5.4, bottom: 1000.7 }, 846)).toEqual({ top: 0, bottom: 846 });
    expect(normalizeBand({ top: 100.6, bottom: 200.2 }, 846)).toEqual({ top: 101, bottom: 200 });
  });
  it("top>bottom は swap", () => {
    expect(normalizeBand({ top: 200, bottom: 100 }, 846)).toEqual({ top: 100, bottom: 200 });
  });
  it("normalizeSelection は元 selection を変えない（pure）", () => {
    const s = ok();
    const before = JSON.stringify(s);
    const n = normalizeSelection({ ...s, headerBand: { top: 180.4, bottom: 226.6 } });
    expect(JSON.stringify(s)).toBe(before);
    expect(n.headerBand).toEqual({ top: 180, bottom: 227 });
  });
});

describe("suggestBandsFromTap", () => {
  it("tap 位置から personRow + 直上 header を生成し、ordering OK", () => {
    const { headerBand, personRowBand } = suggestBandsFromTap(320, 846);
    expect(personRowBand.top).toBeLessThan(320);
    expect(personRowBand.bottom).toBeGreaterThan(320);
    expect(headerBand.bottom).toBeLessThanOrEqual(personRowBand.top);
    const v = validateSelection({
      ...IMG,
      headerBand,
      personRowBand,
    });
    expect(v.ok).toBe(true);
  });
  it("画像上端付近の tap でも image 内に clamp（header は image 内）", () => {
    const { headerBand, personRowBand } = suggestBandsFromTap(20, 846);
    expect(headerBand.top).toBeGreaterThanOrEqual(0);
    expect(personRowBand.top).toBeGreaterThanOrEqual(0);
    expect(personRowBand.bottom).toBeLessThanOrEqual(846);
  });
  it("DEFAULT_HEADER_OFFSET_RATIO を使った既定値", () => {
    expect(DEFAULT_HEADER_OFFSET_RATIO).toBeGreaterThan(0);
  });
});

describe("computeCropRegions", () => {
  it("valid → header / personRow の矩形（全幅・y 帯）", () => {
    const r = computeCropRegions(ok());
    expect(r).toEqual({
      header: { left: 0, top: 180, width: 1860, height: 46 },
      personRow: { left: 0, top: 290, width: 1860, height: 60 },
    });
  });
  it("invalid → null（CTA gate と整合）", () => {
    const s: AssistedRowSelection = { ...ok(), headerBand: { top: 400, bottom: 450 } };
    expect(computeCropRegions(s)).toBeNull();
  });
});

describe("fnv1a32 / buildImageFingerprint", () => {
  it("fnv1a32 は決定論・8桁 hex", () => {
    expect(fnv1a32("")).toMatch(/^[0-9a-f]{8}$/);
    expect(fnv1a32("abc")).toBe(fnv1a32("abc"));
    expect(fnv1a32("abc")).not.toBe(fnv1a32("abd"));
  });
  it("buildImageFingerprint は size+wh+hash の決定論キー（画像 byte 不要）", () => {
    const a = buildImageFingerprint({ size: 12345, imageW: 1860, imageH: 846, nameTail: "x.png" });
    const b = buildImageFingerprint({ size: 12345, imageW: 1860, imageH: 846, nameTail: "x.png" });
    expect(a).toBe(b);
    expect(a).toMatch(/^12345_1860x846_[0-9a-f]{8}$/);
    expect(a).not.toBe(buildImageFingerprint({ size: 12346, imageW: 1860, imageH: 846 }));
  });
});

describe("storage payload — 画像本体非格納の構造的保証", () => {
  it("makeStorageKey は prefix + fingerprint", () => {
    expect(makeStorageKey("abc")).toBe("aneurasync:plan:shift:assistedRow:v1:abc");
  });
  it("toStoredPayload は許可 fields のみを返す（Blob/base64/dataURI を含めない）", () => {
    const stored = toStoredPayload({ ...ok() }, "2026-05-31T00:00:00.000Z");
    expect(stored).not.toBeNull();
    expect(Object.keys(stored!).sort()).toEqual(
      ["headerBand", "imageFingerprint", "imageH", "imageW", "personRowBand", "updatedAt"].sort()
    );
    const json = JSON.stringify(stored);
    expect(json).not.toMatch(/base64|data:image|blob:|Blob|dataURI/i);
  });
  it("fingerprint 無し or invalid → null（保存しない）", () => {
    expect(toStoredPayload({ ...ok(), imageFingerprint: undefined }, "t")).toBeNull();
    expect(
      toStoredPayload(
        { ...ok(), headerBand: { top: 400, bottom: 450 } },
        "t"
      )
    ).toBeNull();
  });
  it("parseStoredPayload は許可 fields のみ取り出し、余計な field（image base64 等）は黙って捨てる", () => {
    const stored = toStoredPayload(ok(), "2026-05-31T00:00:00.000Z")!;
    const tainted = { ...stored, imageBase64: "AAA===", dataUri: "data:image/png;base64,XXX" };
    const parsed = parseStoredPayload(tainted);
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed!).sort()).toEqual(
      ["headerBand", "imageFingerprint", "imageH", "imageW", "personRowBand", "updatedAt"].sort()
    );
    expect(JSON.stringify(parsed)).not.toMatch(/base64|dataUri|data:image/i);
  });
  it("parseStoredPayload: 構造不正 / 範囲外 / 型不一致 → null", () => {
    expect(parseStoredPayload(null)).toBeNull();
    expect(parseStoredPayload("x")).toBeNull();
    expect(parseStoredPayload({})).toBeNull();
    expect(
      parseStoredPayload({
        imageFingerprint: "a",
        imageW: 100,
        imageH: 100,
        headerBand: { top: -1, bottom: 50 }, // bounds
        personRowBand: { top: 60, bottom: 90 },
        updatedAt: "t",
      })
    ).toBeNull();
  });
});
