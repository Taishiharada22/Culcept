/**
 * [CEO lock 2026-04-20 M0-3 #4] diagnostics emitter kill switch の動作検証。
 *
 *   - デフォルト OFF
 *   - OFF 時 console.info は呼ばれない (完全 no-op)
 *   - ON 時のみ console.info に prefix 付きで出力
 *   - ON 時でも payload 型は UnderstandingDiagnostics のみ（raw text 経路なし）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DIAGNOSTICS_SAMPLE_DEGRADED,
  DIAGNOSTICS_SAMPLE_SUCCESS,
  emitUnderstandingDiagnostics,
  _internal_isDiagnosticsEnabled,
} from "@/lib/coalter/understanding/diagnostics";

describe("diagnostics emitter kill switch", () => {
  const originalEnv = process.env.COALTER_UNDERSTANDING_DIAGNOSTICS;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    if (originalEnv === undefined) {
      delete process.env.COALTER_UNDERSTANDING_DIAGNOSTICS;
    } else {
      process.env.COALTER_UNDERSTANDING_DIAGNOSTICS = originalEnv;
    }
  });

  it("デフォルト (未設定) → OFF、console.info 呼ばれない", () => {
    delete process.env.COALTER_UNDERSTANDING_DIAGNOSTICS;
    expect(_internal_isDiagnosticsEnabled()).toBe(false);
    emitUnderstandingDiagnostics(DIAGNOSTICS_SAMPLE_SUCCESS);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('"0" 設定 → OFF、console.info 呼ばれない', () => {
    process.env.COALTER_UNDERSTANDING_DIAGNOSTICS = "0";
    expect(_internal_isDiagnosticsEnabled()).toBe(false);
    emitUnderstandingDiagnostics(DIAGNOSTICS_SAMPLE_SUCCESS);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('"true" / "on" 等の値 → OFF（"1" 限定）', () => {
    process.env.COALTER_UNDERSTANDING_DIAGNOSTICS = "true";
    expect(_internal_isDiagnosticsEnabled()).toBe(false);
    emitUnderstandingDiagnostics(DIAGNOSTICS_SAMPLE_SUCCESS);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('"1" → ON、[CoAlter] prefix 付きで console.info に出る', () => {
    process.env.COALTER_UNDERSTANDING_DIAGNOSTICS = "1";
    expect(_internal_isDiagnosticsEnabled()).toBe(true);
    emitUnderstandingDiagnostics(DIAGNOSTICS_SAMPLE_SUCCESS);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const [prefix, payload] = consoleSpy.mock.calls[0];
    expect(prefix).toBe("[CoAlter] understanding.diagnostics");
    // payload は UnderstandingDiagnostics 型のまま
    expect(payload).toEqual(DIAGNOSTICS_SAMPLE_SUCCESS);
  });

  it("ON 時の payload キーは許可リスト内のみ（生テキスト無し）", () => {
    process.env.COALTER_UNDERSTANDING_DIAGNOSTICS = "1";
    emitUnderstandingDiagnostics(DIAGNOSTICS_SAMPLE_DEGRADED);
    const allowed = new Set([
      "outcome",
      "lensVersion",
      "understanding_confidence",
      "completeness",
      "source_coverage",
      "latency_ms",
      "missing_domains",
      "computedAt",
      "pairHash",
    ]);
    const payload = consoleSpy.mock.calls[0][1] as Record<string, unknown>;
    for (const key of Object.keys(payload)) {
      expect(allowed.has(key)).toBe(true);
    }
    // 明示的禁止キー
    for (const forbidden of ["quote", "summary", "body", "displayName", "userId"]) {
      expect(payload).not.toHaveProperty(forbidden);
    }
  });
});
