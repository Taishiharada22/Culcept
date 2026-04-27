/**
 * Stage 2 L2-c — presenceReducer state machine test
 *
 * plan §5.3 Gate (5 シナリオ):
 *   ① 基本フロー S0 → S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8
 *   ② 緊急短縮 S0 → S2 (critical signal)
 *   ③ 退出 S7 → S8
 *   ④ 再起動 S8 → S0
 *   ⑤ 未許可遷移で state 不変
 */

import { describe, it, expect } from "vitest";

import {
  presenceReducer,
  initialPresenceState,
  type PresenceEvent,
  type PresenceReducerState,
} from "@/lib/coalter/presence/reducer";
import type { PresenceSignal } from "@/lib/coalter/presence/types";

const sig = (
  kind: PresenceSignal["kind"],
  strength: PresenceSignal["strength"] = "strong",
): PresenceSignal => ({
  kind,
  strength,
  detectedAt: 0,
});

const apply = (
  state: PresenceReducerState,
  ...events: PresenceEvent[]
): PresenceReducerState => events.reduce(presenceReducer, state);

// ─────────────────────────────────────────────
// ① 基本フロー
// ─────────────────────────────────────────────

describe("L2-c reducer — ① 基本フロー S0→S1→S2→...→S8 (v1.1 §8.3)", () => {
  it("初期 state は S0", () => {
    expect(initialPresenceState().state).toBe("S0");
  });

  it("S0 + explicit signal → S1 (consent チェック前段階)", () => {
    const next = presenceReducer(initialPresenceState(), {
      type: "SIGNAL",
      signal: sig("explicit", "strong"),
    });
    expect(next.state).toBe("S1");
  });

  it("基本フロー全体: S0 → S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8", () => {
    const events: PresenceEvent[] = [
      { type: "SIGNAL", signal: sig("explicit") },
      { type: "S1_ENTRY_OK" },
      { type: "S2_ACCEPTED" },
      { type: "S3_RESPONSE" },
      { type: "S4_DONE" },
      { type: "S5_DONE" },
      { type: "S6_PROPOSE" },
      { type: "S7_DONE" },
    ];
    const expected = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"];
    let s: PresenceReducerState = initialPresenceState();
    for (let i = 0; i < events.length; i++) {
      s = presenceReducer(s, events[i]);
      expect(s.state).toBe(expected[i]);
    }
  });

  it("S6 → S5 (もう少し整理する) も許可 (UI spec §4.3.7)", () => {
    let s = apply(initialPresenceState(), { type: "SIGNAL", signal: sig("explicit") });
    s = apply(
      s,
      { type: "S1_ENTRY_OK" },
      { type: "S2_ACCEPTED" },
      { type: "S3_RESPONSE" },
      { type: "S4_DONE" },
      { type: "S5_DONE" },
    );
    expect(s.state).toBe("S6");
    s = presenceReducer(s, { type: "S6_REWORK" });
    expect(s.state).toBe("S5");
  });

  it("S5 → S8 直行 (S5_DIRECT_EXIT、提案価値低時、§8.3)", () => {
    let s = apply(
      initialPresenceState(),
      { type: "SIGNAL", signal: sig("explicit") },
      { type: "S1_ENTRY_OK" },
      { type: "S2_ACCEPTED" },
      { type: "S3_RESPONSE" },
      { type: "S4_DONE" },
    );
    expect(s.state).toBe("S5");
    s = presenceReducer(s, { type: "S5_DIRECT_EXIT" });
    expect(s.state).toBe("S8");
  });
});

// ─────────────────────────────────────────────
// ② 緊急短縮 (runtime §1.5 不可侵)
// ─────────────────────────────────────────────

describe("L2-c reducer — ② 緊急短縮 (S0 → S2 critical 短縮、v1.1 §8.4)", () => {
  it("S0 + critical signal → S2 (S1 スキップ)", () => {
    const next = presenceReducer(initialPresenceState(), {
      type: "SIGNAL",
      signal: sig("critical", "strong"),
    });
    expect(next.state).toBe("S2");
  });

  it("S0 + explicit signal は S2 にならない (S1 経由、§1.5 重要原則)", () => {
    const next = presenceReducer(initialPresenceState(), {
      type: "SIGNAL",
      signal: sig("explicit", "strong"),
    });
    expect(next.state).toBe("S1");
  });

  it("S0 + manual_restart は S1 (critical のみ短縮、他 4 kind は S1 経由)", () => {
    expect(
      presenceReducer(initialPresenceState(), {
        type: "SIGNAL",
        signal: sig("manual_restart"),
      }).state,
    ).toBe("S1");
    expect(
      presenceReducer(initialPresenceState(), {
        type: "SIGNAL",
        signal: sig("mode_promotion"),
      }).state,
    ).toBe("S1");
  });

  it("S0 + signal strength=none → state 不変", () => {
    const next = presenceReducer(initialPresenceState(), {
      type: "SIGNAL",
      signal: sig("implicit", "none"),
    });
    expect(next.state).toBe("S0");
  });
});

// ─────────────────────────────────────────────
// ③ 退出 (§8.5 任意状態 → S8)
// ─────────────────────────────────────────────

describe("L2-c reducer — ③ 退出 (S7 → S8 / 任意状態 → S8、§8.5)", () => {
  it("S7 → S8 via S7_DONE", () => {
    const s: PresenceReducerState = { state: "S7" };
    const next = presenceReducer(s, { type: "S7_DONE" });
    expect(next.state).toBe("S8");
  });

  it("EXIT event は S0 / S8 以外の全状態から S8 へ遷移", () => {
    const fromStates: Array<PresenceReducerState["state"]> = [
      "S1",
      "S2",
      "S3",
      "S4",
      "S5",
      "S6",
      "S7",
    ];
    for (const state of fromStates) {
      const next = presenceReducer({ state }, { type: "EXIT" });
      expect(next.state).toBe("S8");
    }
  });

  it("EXIT from S0 → state 不変 (§8.5: 退出条件は 1 ターン進行後、S0 で退出は意味なし)", () => {
    expect(presenceReducer({ state: "S0" }, { type: "EXIT" }).state).toBe("S0");
  });

  it("EXIT from S8 → state 不変 (既に S8)", () => {
    expect(presenceReducer({ state: "S8" }, { type: "EXIT" }).state).toBe("S8");
  });
});

// ─────────────────────────────────────────────
// ④ 再起動 (§8.6 S8 → S0)
// ─────────────────────────────────────────────

describe("L2-c reducer — ④ 再起動 (S8 → S0、§8.6)", () => {
  it("S8 + RESTART → S0", () => {
    const next = presenceReducer({ state: "S8" }, { type: "RESTART" });
    expect(next.state).toBe("S0");
  });

  it("S8 + manual_restart signal → S0 (§8.6 経路)", () => {
    const next = presenceReducer({ state: "S8" }, {
      type: "SIGNAL",
      signal: sig("manual_restart", "strong"),
    });
    expect(next.state).toBe("S0");
  });

  it("S8 + critical signal は S0 不変 (再起動条件は manual のみ、auto 5 分は L2-l)", () => {
    const next = presenceReducer({ state: "S8" }, {
      type: "SIGNAL",
      signal: sig("critical", "strong"),
    });
    expect(next.state).toBe("S8");
  });

  it("非 S8 状態に RESTART は state 不変", () => {
    for (const state of ["S0", "S1", "S2", "S3", "S4", "S5", "S6", "S7"] as const) {
      const next = presenceReducer({ state }, { type: "RESTART" });
      expect(next.state).toBe(state);
    }
  });
});

// ─────────────────────────────────────────────
// ⑤ 未許可遷移で state 不変 (defensive)
// ─────────────────────────────────────────────

describe("L2-c reducer — ⑤ 未許可遷移は state 不変 (defensive)", () => {
  it("S0 + S6_PROPOSE は state 不変 (S0 は S6 経由しない)", () => {
    expect(
      presenceReducer({ state: "S0" }, { type: "S6_PROPOSE" }).state,
    ).toBe("S0");
  });

  it("S2 + S6_PROPOSE → state 不変", () => {
    expect(
      presenceReducer({ state: "S2" }, { type: "S6_PROPOSE" }).state,
    ).toBe("S2");
  });

  it("S5 + S6_PROPOSE → state 不変 (S5 → S7 直接遷移は許可されない)", () => {
    expect(
      presenceReducer({ state: "S5" }, { type: "S6_PROPOSE" }).state,
    ).toBe("S5");
  });

  it("S0 + S1_ENTRY_OK → state 不変 (S1_ENTRY_OK は S1 から S2)", () => {
    expect(
      presenceReducer({ state: "S0" }, { type: "S1_ENTRY_OK" }).state,
    ).toBe("S0");
  });

  it("途中状態に signal が追加で来ても state 不変 (S2 中の暗黙 signal 等)", () => {
    expect(
      presenceReducer({ state: "S2" }, {
        type: "SIGNAL",
        signal: sig("implicit", "soft"),
      }).state,
    ).toBe("S2");
  });

  it("途中状態の critical signal も state 不変 (urgency は別 phase L2-k)", () => {
    expect(
      presenceReducer({ state: "S5" }, {
        type: "SIGNAL",
        signal: sig("critical", "strong"),
      }).state,
    ).toBe("S5");
  });
});
