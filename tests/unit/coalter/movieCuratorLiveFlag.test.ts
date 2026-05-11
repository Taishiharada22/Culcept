/**
 * D-1-d movieCuratorLiveEnabled flag invariant テスト。
 *
 * 検証軸 (handover §5 / mainstream plan §3.2 元 D-2-d):
 *   - default は false (env 未設定)
 *   - env="true" / "1" / "on" / "yes" で true
 *   - env="false" / "0" / "off" / "no" で false
 *   - env=不正値 で fallback false
 *   - server-only env (NEXT_PUBLIC_ prefix なし)
 *
 * CEO 注意 (本セッション 2026-05-11):
 *   - env を触る test は **afterEach で必ず復元** (他 test への汚染防止)
 */

import { describe, it, expect, afterEach } from "vitest";
import { COALTER_FLAGS } from "@/lib/coalter/flags";

const ENV_KEY = "COALTER_MOVIE_CURATOR_LIVE";
const NEXT_PUBLIC_KEY = "NEXT_PUBLIC_COALTER_MOVIE_CURATOR_LIVE";

describe("COALTER_FLAGS.movieCuratorLiveEnabled — flag invariant (D-1-d)", () => {
  const original = process.env[ENV_KEY];
  const originalPublic = process.env[NEXT_PUBLIC_KEY];

  afterEach(() => {
    if (original === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = original;
    }
    if (originalPublic === undefined) {
      delete process.env[NEXT_PUBLIC_KEY];
    } else {
      process.env[NEXT_PUBLIC_KEY] = originalPublic;
    }
  });

  // ── default OFF ─────────────────────────────────────────────────
  describe("default", () => {
    it("env 未設定 → false (CEO 必須条件 1: default false)", () => {
      delete process.env[ENV_KEY];
      expect(COALTER_FLAGS.movieCuratorLiveEnabled).toBe(false);
    });
  });

  // ── true 解釈 ──────────────────────────────────────────────────
  describe("true 解釈 (normalizeBool)", () => {
    const cases = ["true", "TRUE", "1", "on", "yes", ""];
    it.each(cases)('env="%s" → true', (value) => {
      process.env[ENV_KEY] = value;
      expect(COALTER_FLAGS.movieCuratorLiveEnabled).toBe(true);
    });
  });

  // ── false 解釈 ─────────────────────────────────────────────────
  describe("false 解釈 (normalizeBool)", () => {
    const cases = ["false", "FALSE", "0", "off", "no"];
    it.each(cases)('env="%s" → false', (value) => {
      process.env[ENV_KEY] = value;
      expect(COALTER_FLAGS.movieCuratorLiveEnabled).toBe(false);
    });
  });

  // ── 不正値 fallback ────────────────────────────────────────────
  describe("不正値 fallback", () => {
    const cases = ["invalid", "maybe", "?"];
    it.each(cases)('env="%s" → fallback false', (value) => {
      process.env[ENV_KEY] = value;
      expect(COALTER_FLAGS.movieCuratorLiveEnabled).toBe(false);
    });
  });

  // ── server-only (NEXT_PUBLIC_ prefix を読まない) ───────────────
  describe("server-only env (NEXT_PUBLIC_ prefix 非対応)", () => {
    it("NEXT_PUBLIC_ prefix 付き env を渡しても false (server-only flag)", () => {
      delete process.env[ENV_KEY];
      process.env[NEXT_PUBLIC_KEY] = "true";
      expect(COALTER_FLAGS.movieCuratorLiveEnabled).toBe(false);
    });
  });

  // ── runtime 反映 (rebuild 不要) ────────────────────────────────
  describe("runtime 反映", () => {
    it("test 内で env を切替えると getter 結果も切替わる (rebuild 不要)", () => {
      delete process.env[ENV_KEY];
      expect(COALTER_FLAGS.movieCuratorLiveEnabled).toBe(false);
      process.env[ENV_KEY] = "true";
      expect(COALTER_FLAGS.movieCuratorLiveEnabled).toBe(true);
      process.env[ENV_KEY] = "false";
      expect(COALTER_FLAGS.movieCuratorLiveEnabled).toBe(false);
    });
  });
});
