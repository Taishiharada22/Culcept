/**
 * handoffAnalytics.ts — unit test (W3-PR-12.5 Stage 1)
 *
 * 検証観点:
 *   1. flag_source=null（canary 外）なら emit しない
 *   2. flag_source="allowlist" / "global" なら emit する
 *   3. outcome.kind 別の metadata shape（candidate_count / provider_reason / skip_reason）
 *   4. trackStargazerEvent が fire-and-forget（await しない）
 *
 * 参照:
 *   - lib/alter-morning/search/handoffAnalytics.ts
 *   - lib/alter-morning/dialog/flags.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/stargazer/analytics", () => ({
  trackStargazerEvent: vi.fn(async () => true),
}));

import { trackStargazerEvent } from "@/lib/stargazer/analytics";
import {
  emitShadowStateEvent,
  emitHandoffOutcomeEvent,
} from "@/lib/alter-morning/search/handoffAnalytics";
import {
  __setDialogStateV2Override,
  __setPlacesSearchOverride,
} from "@/lib/alter-morning/dialog/flags";

const trackMock = trackStargazerEvent as unknown as ReturnType<typeof vi.fn>;

const USER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

beforeEach(() => {
  trackMock.mockClear();
  __setDialogStateV2Override(null);
  __setPlacesSearchOverride(null);
  delete process.env.ALTER_MORNING_DIALOG_STATE_V2;
  delete process.env.ALTER_MORNING_DIALOG_STATE_V2_ALLOWLIST;
  delete process.env.ALTER_MORNING_PLACES_SEARCH;
  delete process.env.ALTER_MORNING_PLACES_SEARCH_ALLOWLIST;
});

afterEach(() => {
  __setDialogStateV2Override(null);
  __setPlacesSearchOverride(null);
  delete process.env.ALTER_MORNING_DIALOG_STATE_V2;
  delete process.env.ALTER_MORNING_DIALOG_STATE_V2_ALLOWLIST;
  delete process.env.ALTER_MORNING_PLACES_SEARCH;
  delete process.env.ALTER_MORNING_PLACES_SEARCH_ALLOWLIST;
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. emitShadowStateEvent — flag_source gate
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("emitShadowStateEvent §1 flag_source gate", () => {
  it("canary 外 (flag OFF) → emit しない", () => {
    emitShadowStateEvent({
      userId: USER,
      sessionId: "ms_x",
      targetEventId: "e2",
      eventChanged: true,
      shadowStatus: "search_handoff_blocking",
      narrowStep: 2,
      readyForHandoff: true,
      targetSelectionReason: "prev_phase_not_clarifying_plan_presented",
    });
    expect(trackMock).not.toHaveBeenCalled();
  });

  it("allowlist ON → emit される、flag_source=allowlist", () => {
    process.env.ALTER_MORNING_DIALOG_STATE_V2_ALLOWLIST = USER;
    emitShadowStateEvent({
      userId: USER,
      sessionId: "ms_x",
      targetEventId: "e2",
      eventChanged: true,
      shadowStatus: "search_handoff_blocking",
      narrowStep: 2,
      readyForHandoff: true,
      targetSelectionReason: "prev_phase_not_clarifying_plan_presented",
    });
    expect(trackMock).toHaveBeenCalledTimes(1);
    const call = trackMock.mock.calls[0][0] as {
      event: string;
      feature: string;
      metadata: Record<string, unknown>;
    };
    expect(call.event).toBe("alter_morning_shadow_state");
    expect(call.feature).toBe("alter_morning");
    expect(call.metadata.flag_source).toBe("allowlist");
    expect(call.metadata.target_event_id).toBe("e2");
    expect(call.metadata.event_changed).toBe(true);
    expect(call.metadata.shadow_status).toBe("search_handoff_blocking");
    expect(call.metadata.narrow_step).toBe(2);
    expect(call.metadata.ready_for_handoff).toBe(true);
    expect(call.metadata.target_selection_reason).toBe(
      "prev_phase_not_clarifying_plan_presented",
    );
    expect(call.metadata.schema_version).toBeDefined();
  });

  it("global ON → emit される、flag_source=global", () => {
    process.env.ALTER_MORNING_DIALOG_STATE_V2 = "true";
    emitShadowStateEvent({
      userId: USER,
      sessionId: null,
      targetEventId: null,
      eventChanged: false,
      shadowStatus: "stable",
      narrowStep: null,
      readyForHandoff: false,
      targetSelectionReason: "fallback",
    });
    expect(trackMock).toHaveBeenCalledTimes(1);
    const call = trackMock.mock.calls[0][0] as {
      metadata: Record<string, unknown>;
    };
    expect(call.metadata.flag_source).toBe("global");
    expect(call.metadata.session_id).toBe(null);
    expect(call.metadata.narrow_step).toBe(null);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. emitHandoffOutcomeEvent — outcome.kind ごとの metadata shape
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("emitHandoffOutcomeEvent §2 metadata shape", () => {
  beforeEach(() => {
    process.env.ALTER_MORNING_PLACES_SEARCH_ALLOWLIST = USER;
  });

  it("presented_from_api → candidate_count 含む", () => {
    emitHandoffOutcomeEvent({
      userId: USER,
      sessionId: "ms_x",
      outcome: {
        kind: "presented_from_api",
        fingerprint: "pf:v1|a=新宿|ch=マック",
        candidateCount: 5,
      },
      latencyMs: 420,
    });
    const call = trackMock.mock.calls[0][0] as {
      event: string;
      metadata: Record<string, unknown>;
    };
    expect(call.event).toBe("alter_morning_handoff_outcome");
    expect(call.metadata.outcome_kind).toBe("presented_from_api");
    expect(call.metadata.candidate_count).toBe(5);
    expect(call.metadata.fingerprint).toBe("pf:v1|a=新宿|ch=マック");
    expect(call.metadata.latency_ms).toBe(420);
    expect(call.metadata.flag_source).toBe("allowlist");
  });

  it("zero_from_api → candidate_count 無し", () => {
    emitHandoffOutcomeEvent({
      userId: USER,
      sessionId: "ms_x",
      outcome: { kind: "zero_from_api", fingerprint: "pf:v1|a=x|ch=y" },
      latencyMs: 200,
    });
    const call = trackMock.mock.calls[0][0] as {
      metadata: Record<string, unknown>;
    };
    expect(call.metadata.outcome_kind).toBe("zero_from_api");
    expect(call.metadata.candidate_count).toBeUndefined();
  });

  it("error → provider_reason / log_class 含む", () => {
    emitHandoffOutcomeEvent({
      userId: USER,
      sessionId: "ms_x",
      outcome: {
        kind: "error",
        fingerprint: "pf:v1|a=x|ch=y",
        logClass: "provider_failure",
        reason: "api_key_missing",
      },
      latencyMs: 10,
    });
    const call = trackMock.mock.calls[0][0] as {
      metadata: Record<string, unknown>;
    };
    expect(call.metadata.outcome_kind).toBe("error");
    expect(call.metadata.provider_reason).toBe("api_key_missing");
    expect(call.metadata.log_class).toBe("provider_failure");
  });

  it("skip_gate → skip_reason 含む", () => {
    emitHandoffOutcomeEvent({
      userId: USER,
      sessionId: "ms_x",
      outcome: {
        kind: "skip_gate",
        fingerprint: "pf:v1|a=x|ch=y",
        reason: "status_not_handoff",
      },
      latencyMs: 3,
    });
    const call = trackMock.mock.calls[0][0] as {
      metadata: Record<string, unknown>;
    };
    expect(call.metadata.outcome_kind).toBe("skip_gate");
    expect(call.metadata.skip_reason).toBe("status_not_handoff");
  });

  it("skip_idempotent → 追加 metadata なし", () => {
    emitHandoffOutcomeEvent({
      userId: USER,
      sessionId: "ms_x",
      outcome: { kind: "skip_idempotent", fingerprint: "pf:v1|a=x|ch=y" },
      latencyMs: 1,
    });
    const call = trackMock.mock.calls[0][0] as {
      metadata: Record<string, unknown>;
    };
    expect(call.metadata.outcome_kind).toBe("skip_idempotent");
    expect(call.metadata.candidate_count).toBeUndefined();
    expect(call.metadata.skip_reason).toBeUndefined();
    expect(call.metadata.provider_reason).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. fire-and-forget — emit は throw しない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3 fire-and-forget", () => {
  it("trackStargazerEvent が reject してもemit 呼び出しは throw しない", async () => {
    process.env.ALTER_MORNING_DIALOG_STATE_V2_ALLOWLIST = USER;
    trackMock.mockImplementationOnce(() => Promise.reject(new Error("db down")));
    expect(() =>
      emitShadowStateEvent({
        userId: USER,
        sessionId: "ms_x",
        targetEventId: "e2",
        eventChanged: true,
        shadowStatus: "search_handoff_blocking",
        narrowStep: 2,
        readyForHandoff: true,
        targetSelectionReason: "r",
      }),
    ).not.toThrow();
    // 非同期 promise rejection が次 tick で unhandled にならないか確認
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
});
