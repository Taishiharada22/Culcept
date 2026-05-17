/**
 * CoAlter AOO Phase B B-1 — `mirrorChannelEnabled` strict flag parser invariant test
 *
 * B-0 plan §3.3 + B-1 preflight CEO 補正 1:
 *   - 既存 `normalizeBool` の "" → true 挙動とは**明示的に異なる**
 *   - Mirror Channel は user との関係に直接影響するため、空文字 / 曖昧値で
 *     意図せず ON になるリスクを排除する
 *   - `process.env.NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED === "true"` のみ true
 *   - unset / "" / "false" / "0" / "1" / "on" / "yes" / 不明値 すべて false
 *   - 既存 `presenceExecutorEnabled` / `presenceObserverEnabled` の normalizeBool 挙動には
 *     触らない (本 test は mirror flag のみを対象、既存 flag の挙動を変えない確認は別 PR)
 *
 * 関連:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164)
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165)
 *   - 既存 normalizeBool 挙動 (参考): tests/unit/coalter/presenceExecutorFlag.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { COALTER_FLAGS } from "@/lib/coalter/flags";

const ENV_KEY = "NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED";

describe("B-1 mirrorChannelEnabled — strict parser invariant (CEO 補正 1)", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env[ENV_KEY];
    delete process.env[ENV_KEY];
  });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  it("env 未設定 → false (既定 OFF)", () => {
    delete process.env[ENV_KEY];
    expect(COALTER_FLAGS.mirrorChannelEnabled).toBe(false);
  });

  it('env="" (空文字) → false [Mirror strict parser: 既存 normalizeBool との明示的相違]', () => {
    // 既存 normalizeBool は "" を true 扱いするが、Mirror flag は strict parser のため false
    process.env[ENV_KEY] = "";
    expect(COALTER_FLAGS.mirrorChannelEnabled).toBe(false);
  });

  it('env="true" → true [strict parser: exact match のみ]', () => {
    process.env[ENV_KEY] = "true";
    expect(COALTER_FLAGS.mirrorChannelEnabled).toBe(true);
  });

  it('env="false" → false', () => {
    process.env[ENV_KEY] = "false";
    expect(COALTER_FLAGS.mirrorChannelEnabled).toBe(false);
  });

  it('曖昧な truthy 値はすべて false [strict parser: "1" / "on" / "yes" 等は受理しない]', () => {
    for (const v of ["1", "on", "yes", "TRUE", "True", "YES", "Yes"]) {
      process.env[ENV_KEY] = v;
      expect(COALTER_FLAGS.mirrorChannelEnabled).toBe(false);
    }
  });

  it('明示的 falsy 値もすべて false ["0" / "off" / "no" / "FALSE" 等]', () => {
    for (const v of ["0", "off", "no", "FALSE", "False", "NO"]) {
      process.env[ENV_KEY] = v;
      expect(COALTER_FLAGS.mirrorChannelEnabled).toBe(false);
    }
  });

  it('不明値 / typo / 前後 whitespace はすべて false', () => {
    for (const v of [
      "maybe",
      "random",
      "2",
      "null",
      "undefined",
      " true ",
      "true ",
      " true",
      "TRUE ",
      "True",
    ]) {
      process.env[ENV_KEY] = v;
      expect(COALTER_FLAGS.mirrorChannelEnabled).toBe(false);
    }
  });

  it('複数回読み取りで安定 (idempotent / 副作用なし)', () => {
    process.env[ENV_KEY] = "true";
    const r1 = COALTER_FLAGS.mirrorChannelEnabled;
    const r2 = COALTER_FLAGS.mirrorChannelEnabled;
    const r3 = COALTER_FLAGS.mirrorChannelEnabled;
    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(r3).toBe(true);
  });
});

describe("B-1 mirrorChannelEnabled — boundary preservation [既存 normalizeBool flag への副作用なし確認]", () => {
  it("getter は既存 normalizeBool helper を呼ばない (strict parser を直接利用)", () => {
    // 実装側で normalizeBool 経由でなく `=== "true"` 直接比較を使うことを確認するため、
    // empty string で false が返ることが normalizeBool の挙動 (空 → true) と一致しないことで間接確認
    process.env[ENV_KEY] = "";
    expect(COALTER_FLAGS.mirrorChannelEnabled).toBe(false);
  });
});

// =============================================================================
// B-5a (2026-05-17): mirrorDiagnosticExposeEnabled strict flag parser
// =============================================================================
//
// B-5a 設計:
//   - 第2 flag、debug global 公開専用 (mirrorChannelEnabled とは独立)
//   - 同じ strict parser (`=== "true"` のみ)
//   - 既定 OFF、production / preview / development 全環境で空 / unset → false
//   - mirrorChannelEnabled と AND 連結で debug global 公開を gate (4-layer defense L1)
//
const DIAG_ENV_KEY = "NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE";

describe("B-5a mirrorDiagnosticExposeEnabled — strict parser invariant", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env[DIAG_ENV_KEY];
    delete process.env[DIAG_ENV_KEY];
  });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env[DIAG_ENV_KEY];
    else process.env[DIAG_ENV_KEY] = originalEnv;
  });

  it("env 未設定 → false (既定 OFF)", () => {
    delete process.env[DIAG_ENV_KEY];
    expect(COALTER_FLAGS.mirrorDiagnosticExposeEnabled).toBe(false);
  });

  it('env="" (空文字) → false [strict parser: normalizeBool 非経由]', () => {
    process.env[DIAG_ENV_KEY] = "";
    expect(COALTER_FLAGS.mirrorDiagnosticExposeEnabled).toBe(false);
  });

  it('env="true" → true', () => {
    process.env[DIAG_ENV_KEY] = "true";
    expect(COALTER_FLAGS.mirrorDiagnosticExposeEnabled).toBe(true);
  });

  it('env="false" → false', () => {
    process.env[DIAG_ENV_KEY] = "false";
    expect(COALTER_FLAGS.mirrorDiagnosticExposeEnabled).toBe(false);
  });

  it('曖昧な truthy 値はすべて false', () => {
    for (const v of ["1", "on", "yes", "TRUE", "True", "YES"]) {
      process.env[DIAG_ENV_KEY] = v;
      expect(COALTER_FLAGS.mirrorDiagnosticExposeEnabled).toBe(false);
    }
  });

  it('前後 whitespace はすべて false', () => {
    for (const v of [" true ", "true ", " true", "TRUE "]) {
      process.env[DIAG_ENV_KEY] = v;
      expect(COALTER_FLAGS.mirrorDiagnosticExposeEnabled).toBe(false);
    }
  });

  it('mirrorChannelEnabled とは独立 (片方 true でも他方が default false)', () => {
    process.env[DIAG_ENV_KEY] = "true";
    delete process.env[ENV_KEY];
    expect(COALTER_FLAGS.mirrorDiagnosticExposeEnabled).toBe(true);
    expect(COALTER_FLAGS.mirrorChannelEnabled).toBe(false);
  });

  it('複数回読み取りで安定 (idempotent)', () => {
    process.env[DIAG_ENV_KEY] = "true";
    expect(COALTER_FLAGS.mirrorDiagnosticExposeEnabled).toBe(true);
    expect(COALTER_FLAGS.mirrorDiagnosticExposeEnabled).toBe(true);
    expect(COALTER_FLAGS.mirrorDiagnosticExposeEnabled).toBe(true);
  });
});
