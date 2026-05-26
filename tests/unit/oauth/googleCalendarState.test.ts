/**
 * P3-A-1-1-c — googleCalendarState helper unit test
 *
 * 検証範囲:
 *   - generateState: 異なる呼び出しで state が異なる (= randomness)
 *   - signState + verifyState: round-trip valid
 *   - verifyState: tampered signature → reason='signature'
 *   - verifyState: malformed (= no separator / empty parts) → reason='format'
 *   - verifyState: wrong secret → reason='signature'
 *   - verifyState: 異なる長さの hmac → reason='signature' (= timing attack 防止)
 */

import { describe, expect, it } from "vitest";

import {
  generateState,
  signState,
  verifyState,
} from "@/lib/oauth/googleCalendarState";

const TEST_SECRET = "test-secret-for-unit-only-do-not-use-in-prod";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("generateState", () => {
  it("base64url の state を生成 + cookie value に '.' 区切りで含む", () => {
    const r = generateState(TEST_SECRET);
    expect(r.state).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
    expect(r.state.length).toBeGreaterThan(20); // 32 bytes base64url = 約 43 文字
    expect(r.signedCookieValue).toContain(".");
    expect(r.signedCookieValue.startsWith(`${r.state}.`)).toBe(true);
  });

  it("呼び出すたびに異なる state を返す (= randomness)", () => {
    const r1 = generateState(TEST_SECRET);
    const r2 = generateState(TEST_SECRET);
    expect(r1.state).not.toBe(r2.state);
    expect(r1.signedCookieValue).not.toBe(r2.signedCookieValue);
  });
});

describe("signState + verifyState round-trip", () => {
  it("同じ secret で sign → verify → ok: true, state 復元", () => {
    const { state, signedCookieValue } = generateState(TEST_SECRET);
    const v = verifyState(signedCookieValue, TEST_SECRET);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.state).toBe(state);
  });

  it("既存 state を signState して verifyState round-trip", () => {
    const state = "abc-test-state-123";
    const cookieValue = signState(state, TEST_SECRET);
    const v = verifyState(cookieValue, TEST_SECRET);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.state).toBe(state);
  });
});

describe("verifyState — format errors", () => {
  it("separator なし → reason='format'", () => {
    const v = verifyState("no-separator-here", TEST_SECRET);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("format");
  });

  it("separator のみ (= 空 state、 空 hmac) → reason='format'", () => {
    const v = verifyState(".", TEST_SECRET);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("format");
  });

  it("state 空 (= '.xxx') → reason='format'", () => {
    const v = verifyState(".somehmac", TEST_SECRET);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("format");
  });

  it("hmac 空 (= 'state.') → reason='format'", () => {
    const v = verifyState("somestate.", TEST_SECRET);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("format");
  });

  it("空文字 → reason='format'", () => {
    const v = verifyState("", TEST_SECRET);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("format");
  });
});

describe("verifyState — signature errors", () => {
  it("tampered signature → reason='signature'", () => {
    const { state, signedCookieValue } = generateState(TEST_SECRET);
    // 末尾 1 文字を改竄
    const tampered = signedCookieValue.slice(0, -1) + (signedCookieValue.endsWith("A") ? "B" : "A");
    const v = verifyState(tampered, TEST_SECRET);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("signature");
    // state を改竄しない確認 (= 別の意図しない falsy reason ではない)
    expect(tampered.startsWith(`${state}.`)).toBe(true);
  });

  it("wrong secret → reason='signature'", () => {
    const { signedCookieValue } = generateState(TEST_SECRET);
    const v = verifyState(signedCookieValue, "different-secret");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("signature");
  });

  it("hmac 部分の長さが異なる (= 短い) → reason='signature'", () => {
    const { state } = generateState(TEST_SECRET);
    const malformedShort = `${state}.tooshort`;
    const v = verifyState(malformedShort, TEST_SECRET);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("signature");
  });
});
