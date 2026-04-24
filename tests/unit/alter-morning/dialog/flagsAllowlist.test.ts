/**
 * flags.ts allowlist canary — unit test (W3-PR-12.5 Stage 1)
 *
 * 検証観点:
 *   1. dialogStateV2(userId) / placesSearch(userId) の 3 段優先順位
 *      test override > allowlist > global fallback
 *   2. resolveDialogStateV2FlagSource / resolvePlacesSearchFlagSource の戻り値
 *      "allowlist" / "global" / null
 *   3. allowlist CSV の正規化（trim / lowercase / 空要素無視）
 *   4. userId 未指定時は allowlist を skip し global fallback のみ参照
 *
 * 参照:
 *   - lib/alter-morning/dialog/flags.ts
 *   - docs/alter-morning-pr12-production-rollout-plan.md §2 Stage 1
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ALTER_MORNING_FLAGS,
  __setDialogStateV2Override,
  __setPlacesSearchOverride,
  __setVisualFlowOverride,
  resolveDialogStateV2FlagSource,
  resolvePlacesSearchFlagSource,
  resolveVisualFlowFlagSource,
} from "@/lib/alter-morning/dialog/flags";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const USER_C = "33333333-3333-3333-3333-333333333333";

function clearEnv() {
  delete process.env.ALTER_MORNING_DIALOG_STATE_V2;
  delete process.env.ALTER_MORNING_DIALOG_STATE_V2_ALLOWLIST;
  delete process.env.ALTER_MORNING_PLACES_SEARCH;
  delete process.env.ALTER_MORNING_PLACES_SEARCH_ALLOWLIST;
  delete process.env.ALTER_MORNING_VISUAL_FLOW;
  delete process.env.ALTER_MORNING_VISUAL_FLOW_ALLOWLIST;
}

beforeEach(() => {
  clearEnv();
  __setDialogStateV2Override(null);
  __setPlacesSearchOverride(null);
  __setVisualFlowOverride(null);
});

afterEach(() => {
  clearEnv();
  __setDialogStateV2Override(null);
  __setPlacesSearchOverride(null);
  __setVisualFlowOverride(null);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. 既定 (env 未設定) — すべて OFF
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("flags §1 default (env 未設定)", () => {
  it("dialogStateV2() 全て false", () => {
    expect(ALTER_MORNING_FLAGS.dialogStateV2()).toBe(false);
    expect(ALTER_MORNING_FLAGS.dialogStateV2(USER_A)).toBe(false);
    expect(resolveDialogStateV2FlagSource(undefined)).toBe(null);
    expect(resolveDialogStateV2FlagSource(USER_A)).toBe(null);
  });

  it("placesSearch() 全て false", () => {
    expect(ALTER_MORNING_FLAGS.placesSearch()).toBe(false);
    expect(ALTER_MORNING_FLAGS.placesSearch(USER_A)).toBe(false);
    expect(resolvePlacesSearchFlagSource(undefined)).toBe(null);
    expect(resolvePlacesSearchFlagSource(USER_A)).toBe(null);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. global fallback のみ (allowlist 未設定)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("flags §2 global fallback", () => {
  it("DIALOG_STATE_V2=true → 全 user で true、flag_source=global", () => {
    process.env.ALTER_MORNING_DIALOG_STATE_V2 = "true";
    expect(ALTER_MORNING_FLAGS.dialogStateV2()).toBe(true);
    expect(ALTER_MORNING_FLAGS.dialogStateV2(USER_A)).toBe(true);
    expect(resolveDialogStateV2FlagSource(undefined)).toBe("global");
    expect(resolveDialogStateV2FlagSource(USER_A)).toBe("global");
  });

  it("PLACES_SEARCH=true → 全 user で true、flag_source=global", () => {
    process.env.ALTER_MORNING_PLACES_SEARCH = "true";
    expect(ALTER_MORNING_FLAGS.placesSearch()).toBe(true);
    expect(ALTER_MORNING_FLAGS.placesSearch(USER_A)).toBe(true);
    expect(resolvePlacesSearchFlagSource(undefined)).toBe("global");
    expect(resolvePlacesSearchFlagSource(USER_A)).toBe("global");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. allowlist のみ (global false)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("flags §3 allowlist のみ (global false)", () => {
  it("dialogStateV2: allowlist に含まれる user のみ true", () => {
    process.env.ALTER_MORNING_DIALOG_STATE_V2_ALLOWLIST = `${USER_A},${USER_B}`;
    expect(ALTER_MORNING_FLAGS.dialogStateV2(USER_A)).toBe(true);
    expect(ALTER_MORNING_FLAGS.dialogStateV2(USER_B)).toBe(true);
    expect(ALTER_MORNING_FLAGS.dialogStateV2(USER_C)).toBe(false);
    expect(ALTER_MORNING_FLAGS.dialogStateV2()).toBe(false);

    expect(resolveDialogStateV2FlagSource(USER_A)).toBe("allowlist");
    expect(resolveDialogStateV2FlagSource(USER_B)).toBe("allowlist");
    expect(resolveDialogStateV2FlagSource(USER_C)).toBe(null);
    expect(resolveDialogStateV2FlagSource(undefined)).toBe(null);
  });

  it("placesSearch: allowlist に含まれる user のみ true", () => {
    process.env.ALTER_MORNING_PLACES_SEARCH_ALLOWLIST = `${USER_A}`;
    expect(ALTER_MORNING_FLAGS.placesSearch(USER_A)).toBe(true);
    expect(ALTER_MORNING_FLAGS.placesSearch(USER_B)).toBe(false);
    expect(resolvePlacesSearchFlagSource(USER_A)).toBe("allowlist");
    expect(resolvePlacesSearchFlagSource(USER_B)).toBe(null);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. allowlist + global 両方 ON — allowlist が優先される
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("flags §4 allowlist + global — allowlist 優先、外は global", () => {
  it("allowlist user は flag_source=allowlist、外は global", () => {
    process.env.ALTER_MORNING_DIALOG_STATE_V2 = "true";
    process.env.ALTER_MORNING_DIALOG_STATE_V2_ALLOWLIST = `${USER_A}`;
    expect(resolveDialogStateV2FlagSource(USER_A)).toBe("allowlist");
    expect(resolveDialogStateV2FlagSource(USER_B)).toBe("global");
    expect(resolveDialogStateV2FlagSource(undefined)).toBe("global");
    expect(ALTER_MORNING_FLAGS.dialogStateV2(USER_A)).toBe(true);
    expect(ALTER_MORNING_FLAGS.dialogStateV2(USER_B)).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. test override — allowlist / global を無視する
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("flags §5 test override 優先", () => {
  it("override(true) は env を上書きする", () => {
    process.env.ALTER_MORNING_DIALOG_STATE_V2 = "false";
    __setDialogStateV2Override(true);
    expect(ALTER_MORNING_FLAGS.dialogStateV2(USER_A)).toBe(true);
    expect(ALTER_MORNING_FLAGS.dialogStateV2()).toBe(true);
    expect(resolveDialogStateV2FlagSource(USER_A)).toBe("global");
  });

  it("override(false) は allowlist を上書きする", () => {
    process.env.ALTER_MORNING_DIALOG_STATE_V2_ALLOWLIST = `${USER_A}`;
    __setDialogStateV2Override(false);
    expect(ALTER_MORNING_FLAGS.dialogStateV2(USER_A)).toBe(false);
    expect(resolveDialogStateV2FlagSource(USER_A)).toBe(null);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. CSV normalization — trim / lowercase / 空要素
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("flags §6 CSV normalization", () => {
  it("前後空白 + 大文字は normalize される", () => {
    process.env.ALTER_MORNING_DIALOG_STATE_V2_ALLOWLIST = `  ${USER_A.toUpperCase()} ,${USER_B}  `;
    expect(ALTER_MORNING_FLAGS.dialogStateV2(USER_A)).toBe(true);
    expect(ALTER_MORNING_FLAGS.dialogStateV2(USER_A.toUpperCase())).toBe(true);
    expect(ALTER_MORNING_FLAGS.dialogStateV2(USER_B)).toBe(true);
  });

  it("空 CSV / 空要素のみ → 全 user false", () => {
    process.env.ALTER_MORNING_DIALOG_STATE_V2_ALLOWLIST = "";
    expect(ALTER_MORNING_FLAGS.dialogStateV2(USER_A)).toBe(false);
    process.env.ALTER_MORNING_DIALOG_STATE_V2_ALLOWLIST = ",,,  ,";
    expect(ALTER_MORNING_FLAGS.dialogStateV2(USER_A)).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7. dialogStateV2 と placesSearch は独立 — AND gate は呼び元責務
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("flags §7 independence — AND gate は route.ts 側の責務", () => {
  it("placesSearch(userId) は dialogStateV2 の状態を見ない", () => {
    process.env.ALTER_MORNING_PLACES_SEARCH_ALLOWLIST = `${USER_A}`;
    // dialogStateV2 は未設定（OFF）
    expect(ALTER_MORNING_FLAGS.placesSearch(USER_A)).toBe(true);
    expect(ALTER_MORNING_FLAGS.dialogStateV2(USER_A)).toBe(false);
    // AND gate は route.ts 側で `dialogStateV2(userId) && placesSearch(userId)` を書く責務
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8. visualFlow (PR-13 Visual Flow map pin MVP canary)
//
// 検証観点:
//   §8.1 default (env 未設定) — 全 false / flag_source null
//   §8.2 global fallback — env true で全 user true / flag_source=global
//   §8.3 allowlist — CSV に含まれる user のみ true / flag_source=allowlist
//   §8.4 test override — __setVisualFlowOverride が env / allowlist を上書き
//   §8.5 独立性 — visualFlow は dialogStateV2 / placesSearch の状態を見ない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("flags §8 visualFlow (PR-13 canary)", () => {
  it("§8.1 default (env 未設定) — 全 false / flag_source null", () => {
    expect(ALTER_MORNING_FLAGS.visualFlow()).toBe(false);
    expect(ALTER_MORNING_FLAGS.visualFlow(USER_A)).toBe(false);
    expect(resolveVisualFlowFlagSource(undefined)).toBe(null);
    expect(resolveVisualFlowFlagSource(USER_A)).toBe(null);
  });

  it("§8.2 global fallback — env true で全 user true / flag_source=global", () => {
    process.env.ALTER_MORNING_VISUAL_FLOW = "true";
    expect(ALTER_MORNING_FLAGS.visualFlow()).toBe(true);
    expect(ALTER_MORNING_FLAGS.visualFlow(USER_A)).toBe(true);
    expect(ALTER_MORNING_FLAGS.visualFlow(USER_B)).toBe(true);
    expect(resolveVisualFlowFlagSource(undefined)).toBe("global");
    expect(resolveVisualFlowFlagSource(USER_A)).toBe("global");
  });

  it("§8.3 allowlist — CSV に含まれる user のみ true / flag_source=allowlist", () => {
    process.env.ALTER_MORNING_VISUAL_FLOW_ALLOWLIST = `${USER_A},${USER_B}`;
    expect(ALTER_MORNING_FLAGS.visualFlow(USER_A)).toBe(true);
    expect(ALTER_MORNING_FLAGS.visualFlow(USER_B)).toBe(true);
    expect(ALTER_MORNING_FLAGS.visualFlow(USER_C)).toBe(false);
    expect(ALTER_MORNING_FLAGS.visualFlow()).toBe(false);
    expect(resolveVisualFlowFlagSource(USER_A)).toBe("allowlist");
    expect(resolveVisualFlowFlagSource(USER_B)).toBe("allowlist");
    expect(resolveVisualFlowFlagSource(USER_C)).toBe(null);
    expect(resolveVisualFlowFlagSource(undefined)).toBe(null);
  });

  it("§8.3b allowlist + global 両方 ON — allowlist 優先、外は global", () => {
    process.env.ALTER_MORNING_VISUAL_FLOW = "true";
    process.env.ALTER_MORNING_VISUAL_FLOW_ALLOWLIST = `${USER_A}`;
    expect(resolveVisualFlowFlagSource(USER_A)).toBe("allowlist");
    expect(resolveVisualFlowFlagSource(USER_B)).toBe("global");
    expect(resolveVisualFlowFlagSource(undefined)).toBe("global");
    expect(ALTER_MORNING_FLAGS.visualFlow(USER_A)).toBe(true);
    expect(ALTER_MORNING_FLAGS.visualFlow(USER_B)).toBe(true);
  });

  it("§8.4 test override — __setVisualFlowOverride が env / allowlist を上書き", () => {
    process.env.ALTER_MORNING_VISUAL_FLOW = "false";
    __setVisualFlowOverride(true);
    expect(ALTER_MORNING_FLAGS.visualFlow(USER_A)).toBe(true);
    expect(ALTER_MORNING_FLAGS.visualFlow()).toBe(true);
    expect(resolveVisualFlowFlagSource(USER_A)).toBe("global");

    process.env.ALTER_MORNING_VISUAL_FLOW_ALLOWLIST = `${USER_A}`;
    __setVisualFlowOverride(false);
    expect(ALTER_MORNING_FLAGS.visualFlow(USER_A)).toBe(false);
    expect(resolveVisualFlowFlagSource(USER_A)).toBe(null);
  });

  it("§8.5 独立性 — visualFlow は dialogStateV2 / placesSearch の状態を見ない", () => {
    // visualFlow のみ ON、dialogStateV2 / placesSearch は OFF
    process.env.ALTER_MORNING_VISUAL_FLOW_ALLOWLIST = `${USER_A}`;
    expect(ALTER_MORNING_FLAGS.visualFlow(USER_A)).toBe(true);
    expect(ALTER_MORNING_FLAGS.dialogStateV2(USER_A)).toBe(false);
    expect(ALTER_MORNING_FLAGS.placesSearch(USER_A)).toBe(false);

    // dialogStateV2 / placesSearch を ON にしても visualFlow の判定は変わらない
    process.env.ALTER_MORNING_DIALOG_STATE_V2 = "true";
    process.env.ALTER_MORNING_PLACES_SEARCH = "true";
    expect(ALTER_MORNING_FLAGS.visualFlow(USER_A)).toBe(true); // allowlist
    expect(resolveVisualFlowFlagSource(USER_A)).toBe("allowlist"); // 他 flag の影響なし

    // 逆に visualFlow を OFF にしても dialogStateV2 / placesSearch は独立
    delete process.env.ALTER_MORNING_VISUAL_FLOW_ALLOWLIST;
    expect(ALTER_MORNING_FLAGS.visualFlow(USER_A)).toBe(false);
    expect(ALTER_MORNING_FLAGS.dialogStateV2(USER_A)).toBe(true);
    expect(ALTER_MORNING_FLAGS.placesSearch(USER_A)).toBe(true);
  });
});
