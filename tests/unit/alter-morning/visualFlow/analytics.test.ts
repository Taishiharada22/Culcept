/**
 * Visual Flow analytics.ts — unit test (W3-PR-13 M4)
 *
 * 検証観点:
 *   §1 validateVisualFlowClientPayload — whitelist / shape 検査
 *   §2 emitVisualFlowClientEvent — fetch 呼び出し shape + fire-and-forget
 *   §3 イベント名 / feature 定数の不変性（event 名を勝手に変えたら即検知）
 *
 * 参照:
 *   - lib/alter-morning/visualFlow/analytics.ts
 *   - docs/alter-morning-pr13-visual-flow-rollout-plan.md §6
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  VISUAL_FLOW_FEATURE,
  VISUAL_FLOW_SERVER_EVENT_NAMES,
  VISUAL_FLOW_CLIENT_EVENT_NAMES,
  VISUAL_FLOW_TELEMETRY_ENDPOINT,
  validateVisualFlowClientPayload,
  emitVisualFlowClientEvent,
  type VisualFlowClientEventPayload,
} from "@/lib/alter-morning/visualFlow/analytics";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 定数テスト（早期検知のため §3 を先）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3 constants", () => {
  it("feature 名は 'alter_morning_visual_flow' 固定", () => {
    expect(VISUAL_FLOW_FEATURE).toBe("alter_morning_visual_flow");
  });

  it("server event は visual_flow_flag_evaluated のみ", () => {
    expect(VISUAL_FLOW_SERVER_EVENT_NAMES).toEqual([
      "visual_flow_flag_evaluated",
    ]);
  });

  it("client event は gate_rejected / script_loaded / map_mounted の 3 本", () => {
    expect(VISUAL_FLOW_CLIENT_EVENT_NAMES).toEqual([
      "visual_flow_gate_rejected",
      "visual_flow_script_loaded",
      "visual_flow_map_mounted",
    ]);
  });

  it("telemetry endpoint URL は固定", () => {
    expect(VISUAL_FLOW_TELEMETRY_ENDPOINT).toBe(
      "/api/alter-morning/visual-flow/telemetry",
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 validateVisualFlowClientPayload
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1 validateVisualFlowClientPayload — reject cases", () => {
  it("null / undefined は body_not_object で reject", () => {
    expect(validateVisualFlowClientPayload(null)).toEqual({
      ok: false,
      reason: "body_not_object",
    });
    expect(validateVisualFlowClientPayload(undefined)).toEqual({
      ok: false,
      reason: "body_not_object",
    });
  });

  it("string は body_not_object で reject", () => {
    expect(validateVisualFlowClientPayload("hello")).toEqual({
      ok: false,
      reason: "body_not_object",
    });
  });

  it("event 欠落は event_missing で reject", () => {
    expect(
      validateVisualFlowClientPayload({ metadata: { reason: "no_browser_key" } }),
    ).toEqual({ ok: false, reason: "event_missing" });
  });

  it("event が whitelist 外（server event 名でも）は reject", () => {
    // server-side の flag_evaluated は client telemetry route には絶対に流れてはいけない
    expect(
      validateVisualFlowClientPayload({
        event: "visual_flow_flag_evaluated",
        metadata: {},
      }),
    ).toEqual({ ok: false, reason: "event_not_whitelisted" });
  });

  it("event が全く関係ない文字列も reject", () => {
    expect(
      validateVisualFlowClientPayload({
        event: "drop_table_users",
        metadata: {},
      }),
    ).toEqual({ ok: false, reason: "event_not_whitelisted" });
  });

  it("metadata が無い / null は metadata_not_object で reject", () => {
    expect(
      validateVisualFlowClientPayload({
        event: "visual_flow_gate_rejected",
      }),
    ).toEqual({ ok: false, reason: "metadata_not_object" });
    expect(
      validateVisualFlowClientPayload({
        event: "visual_flow_gate_rejected",
        metadata: null,
      }),
    ).toEqual({ ok: false, reason: "metadata_not_object" });
  });

  it("gate_rejected: reason が whitelist 外は reject", () => {
    expect(
      validateVisualFlowClientPayload({
        event: "visual_flow_gate_rejected",
        metadata: { reason: "some_other_reason" },
      }),
    ).toEqual({ ok: false, reason: "gate_reason_invalid" });
  });

  it("gate_rejected: pin_count が負数なら reject", () => {
    expect(
      validateVisualFlowClientPayload({
        event: "visual_flow_gate_rejected",
        metadata: { reason: "insufficient_pins", pin_count: -1 },
      }),
    ).toEqual({ ok: false, reason: "gate_pin_count_invalid" });
  });

  it("gate_rejected: pin_count が非整数なら reject", () => {
    expect(
      validateVisualFlowClientPayload({
        event: "visual_flow_gate_rejected",
        metadata: { reason: "insufficient_pins", pin_count: 1.5 },
      }),
    ).toEqual({ ok: false, reason: "gate_pin_count_invalid" });
  });

  it("script_loaded: status が不正なら reject", () => {
    expect(
      validateVisualFlowClientPayload({
        event: "visual_flow_script_loaded",
        metadata: { status: "pending" },
      }),
    ).toEqual({ ok: false, reason: "script_status_invalid" });
  });

  it("map_mounted: pin_count 欠落は reject", () => {
    expect(
      validateVisualFlowClientPayload({
        event: "visual_flow_map_mounted",
        metadata: { fit_bounds_mode: "bounds" },
      }),
    ).toEqual({ ok: false, reason: "map_pin_count_invalid" });
  });

  it("map_mounted: fit_bounds_mode が不正なら reject", () => {
    expect(
      validateVisualFlowClientPayload({
        event: "visual_flow_map_mounted",
        metadata: { pin_count: 3, fit_bounds_mode: "zoom_8" },
      }),
    ).toEqual({ ok: false, reason: "map_fit_bounds_mode_invalid" });
  });
});

describe("§1 validateVisualFlowClientPayload — accept cases", () => {
  it("gate_rejected (no_browser_key, no pin_count) — accept", () => {
    const result = validateVisualFlowClientPayload({
      event: "visual_flow_gate_rejected",
      metadata: { reason: "no_browser_key" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toEqual({
        event: "visual_flow_gate_rejected",
        metadata: { reason: "no_browser_key" },
      });
    }
  });

  it("gate_rejected (insufficient_pins, pin_count=0) — accept", () => {
    const result = validateVisualFlowClientPayload({
      event: "visual_flow_gate_rejected",
      metadata: { reason: "insufficient_pins", pin_count: 0 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.metadata).toEqual({
        reason: "insufficient_pins",
        pin_count: 0,
      });
    }
  });

  it("script_loaded (succeeded, duration_ms=1234) — accept", () => {
    const result = validateVisualFlowClientPayload({
      event: "visual_flow_script_loaded",
      metadata: { status: "succeeded", duration_ms: 1234 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.metadata).toEqual({
        status: "succeeded",
        duration_ms: 1234,
      });
    }
  });

  it("script_loaded (failed, no duration) — accept", () => {
    const result = validateVisualFlowClientPayload({
      event: "visual_flow_script_loaded",
      metadata: { status: "failed" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.metadata).toEqual({ status: "failed" });
    }
  });

  it("map_mounted (pin_count=3, bounds) — accept", () => {
    const result = validateVisualFlowClientPayload({
      event: "visual_flow_map_mounted",
      metadata: { pin_count: 3, fit_bounds_mode: "bounds" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.metadata).toEqual({
        pin_count: 3,
        fit_bounds_mode: "bounds",
      });
    }
  });

  it("map_mounted (pin_count=2, single_fallback) — accept", () => {
    const result = validateVisualFlowClientPayload({
      event: "visual_flow_map_mounted",
      metadata: { pin_count: 2, fit_bounds_mode: "single_fallback" },
    });
    expect(result.ok).toBe(true);
  });

  it("extra fields in metadata は無視される（strict narrowing）", () => {
    // CEO decision #4: whitelist 徹底。余計な field は捨てる（エラーにはしない）
    const result = validateVisualFlowClientPayload({
      event: "visual_flow_script_loaded",
      metadata: {
        status: "succeeded",
        duration_ms: 500,
        __injected: "<script>alert(1)</script>",
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // __injected は narrowing で削除される
      expect(result.payload.metadata).toEqual({
        status: "succeeded",
        duration_ms: 500,
      });
      expect(
        (result.payload.metadata as unknown as Record<string, unknown>).__injected,
      ).toBeUndefined();
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 emitVisualFlowClientEvent — fetch shape + fire-and-forget
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§2 emitVisualFlowClientEvent", () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as { window?: unknown }).window;

  beforeEach(() => {
    // vitest の environment は "node" なので window は undefined 既定。
    // happy path を検証するために最小の Window 様オブジェクトを stub する。
    (globalThis as { window?: unknown }).window = {};
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 202 })) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  it("正しい URL / method / headers / body で fetch を呼ぶ", async () => {
    const payload: VisualFlowClientEventPayload = {
      event: "visual_flow_map_mounted",
      metadata: { pin_count: 4, fit_bounds_mode: "bounds" },
    };
    await emitVisualFlowClientEvent(payload);

    const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/alter-morning/visual-flow/telemetry");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual(payload);
    expect(init.keepalive).toBe(true);
  });

  it("network error が throw されても swallow する（UI 影響ゼロ）", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as typeof fetch;

    await expect(
      emitVisualFlowClientEvent({
        event: "visual_flow_gate_rejected",
        metadata: { reason: "no_browser_key" },
      }),
    ).resolves.toBeUndefined();
  });

  it("SSR 環境（window undefined）では fetch を呼ばない", async () => {
    // window を剥がす（SSR を再現）
    delete (globalThis as { window?: unknown }).window;

    const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    mock.mockClear();

    await emitVisualFlowClientEvent({
      event: "visual_flow_gate_rejected",
      metadata: { reason: "no_browser_key" },
    });

    expect(mock).not.toHaveBeenCalled();
    // afterEach で window は元に戻る
  });
});
