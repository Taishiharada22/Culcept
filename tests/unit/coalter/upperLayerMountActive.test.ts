/**
 * Stage 4 B-1 — UpperLayerMount active wire test
 *
 * plan v0.3 B-1 完了条件:
 *   1. placeholder 文字列が消える
 *   2. S0 state header が本番 talk page に表示される (mapStateToStatusLabel("S0") = "見守り中")
 *   3. ModeSwitcher が表示される (UpperLayerShell が ModeSwitcher を内蔵)
 *   4. Daily / Travel / 通常 切替が UI 反映 (modeReducer 経由、別 file の test で coverage)
 *   5. flag OFF なら既存通り null (既存 chatClientUpperLayerMount.test.ts と invariant 共有)
 *   6. 既存 tests が回帰しない (本 file は新規追加のみ、既存 test 修正なし)
 *
 * test strategy:
 *   - 関数 invoke 方式 (CEO 指示 2026-04-29、新規 dep 追加禁止)
 *   - render は不要、pure mapping function を直接 invoke
 *   - UpperLayerMount() の関数 invoke は既存 chatClientUpperLayerMount.test.ts で
 *     coverage 済 → 本 file は B-1 で追加された pure helper のみ test
 *
 * 不変 (CEO 指示):
 *   - @testing-library/react は install しない、関数 invoke のみで coverage
 *   - 既存 test (chatClientUpperLayerMount.test.ts 等) は touch しない
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  mapStateToComponent,
  mapStateToStatusLabel,
} from "@/app/components/chat/states/UpperLayerStateRenderer";
import S0Observing from "@/app/components/chat/states/S0Observing";
import S1Approaching from "@/app/components/chat/states/S1Approaching";
import S2Opening from "@/app/components/chat/states/S2Opening";
import S3Awaiting from "@/app/components/chat/states/S3Awaiting";
import S4Understanding from "@/app/components/chat/states/S4Understanding";
import S5Bridging from "@/app/components/chat/states/S5Bridging";
import S6ReadyForProposal from "@/app/components/chat/states/S6ReadyForProposal";
import S7ProposalShown from "@/app/components/chat/states/S7ProposalShown";
import S8Cooldown from "@/app/components/chat/states/S8Cooldown";
import UpperLayerMount from "@/app/components/chat/UpperLayerMount";
import { PRESENCE_STATES } from "@/lib/coalter/presence/types";

const ENV_KEY = "NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR";
let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalEnv;
});

// ─────────────────────────────────────────────
// 完了条件 1 & 5: placeholder 消失 + flag OFF で null
// ─────────────────────────────────────────────

describe("B-1 完了条件 1 & 5 — placeholder 消失 + flag OFF で null", () => {
  it("flag OFF: UpperLayerMount() === null (既存 invariant 維持)", () => {
    delete process.env[ENV_KEY];
    expect(UpperLayerMount()).toBeNull();
  });

  it("flag ON: UpperLayerMount() の type は function (UpperLayerMountActive)", () => {
    process.env[ENV_KEY] = "true";
    const result = UpperLayerMount() as React.ReactElement | null;
    expect(result).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const type = (result as any)?.type;
    expect(typeof type).toBe("function");
  });

  it("UpperLayerMount.tsx に L4-a placeholder 文字列が残っていない", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // 削除確認: L4-a placeholder text が **render 内** に残っていないこと
    // (comment に「L4-a placeholder」の記述は残してよい、history として)
    // L62 の "🔵 CoAlter 上部レイヤー (Stage 4 L4-a placeholder、L4-b/f/g/h で本番化)"
    // の文字列は削除されているはず
    expect(content).not.toContain(
      "🔵 CoAlter 上部レイヤー (Stage 4 L4-a placeholder、L4-b/f/g/h で本番化)",
    );
  });
});

// ─────────────────────────────────────────────
// 完了条件 2: S0 state header の statusLabel mapping
// ─────────────────────────────────────────────

describe("B-1 完了条件 2 — mapStateToStatusLabel (S0-S8 → label) 完全網羅", () => {
  it("S0 → 見守り中", () => {
    expect(mapStateToStatusLabel("S0")).toBe("見守り中");
  });

  it("S1 → 見守り中 (S0 と共通、preview 仕様)", () => {
    expect(mapStateToStatusLabel("S1")).toBe("見守り中");
  });

  it("S2 → 発話中", () => {
    expect(mapStateToStatusLabel("S2")).toBe("発話中");
  });

  it("S3 → 返答待ち", () => {
    expect(mapStateToStatusLabel("S3")).toBe("返答待ち");
  });

  it("S4 → 理解更新中", () => {
    expect(mapStateToStatusLabel("S4")).toBe("理解更新中");
  });

  it("S5 → 発話中 (S2/S7 と共通、preview 仕様)", () => {
    expect(mapStateToStatusLabel("S5")).toBe("発話中");
  });

  it("S6 → 提案準備中", () => {
    expect(mapStateToStatusLabel("S6")).toBe("提案準備中");
  });

  it("S7 → 発話中 (S2/S5 と共通)", () => {
    expect(mapStateToStatusLabel("S7")).toBe("発話中");
  });

  it("S8 → 退出", () => {
    expect(mapStateToStatusLabel("S8")).toBe("退出");
  });

  it("9 状態すべて非空 string を返す", () => {
    for (const s of PRESENCE_STATES) {
      const label = mapStateToStatusLabel(s);
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────
// 完了条件 3 & 5: state → component mapping (UpperLayerStateRenderer 経由)
// ─────────────────────────────────────────────

describe("B-1 完了条件 3 — mapStateToComponent (S0-S8 → component) 完全網羅", () => {
  it("S0 → S0Observing", () => {
    expect(mapStateToComponent("S0")).toBe(S0Observing);
  });

  it("S1 → S1Approaching", () => {
    expect(mapStateToComponent("S1")).toBe(S1Approaching);
  });

  it("S2 → S2Opening", () => {
    expect(mapStateToComponent("S2")).toBe(S2Opening);
  });

  it("S3 → S3Awaiting", () => {
    expect(mapStateToComponent("S3")).toBe(S3Awaiting);
  });

  it("S4 → S4Understanding", () => {
    expect(mapStateToComponent("S4")).toBe(S4Understanding);
  });

  it("S5 → S5Bridging", () => {
    expect(mapStateToComponent("S5")).toBe(S5Bridging);
  });

  it("S6 → S6ReadyForProposal", () => {
    expect(mapStateToComponent("S6")).toBe(S6ReadyForProposal);
  });

  it("S7 → S7ProposalShown", () => {
    expect(mapStateToComponent("S7")).toBe(S7ProposalShown);
  });

  it("S8 → S8Cooldown", () => {
    expect(mapStateToComponent("S8")).toBe(S8Cooldown);
  });

  it("9 状態すべて function (React component) を返す", () => {
    for (const s of PRESENCE_STATES) {
      const C = mapStateToComponent(s);
      expect(typeof C).toBe("function");
    }
  });
});

// ─────────────────────────────────────────────
// 構造 invariant: 本番側に preview と独立した file が存在 + ModeSwitcher 内蔵
// ─────────────────────────────────────────────

describe("B-1 構造 invariant — 本番 file 存在確認", () => {
  it("UpperLayerShell.tsx は本番 ModeSwitcher を import (内蔵)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/states/UpperLayerShell.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // 本番 ModeSwitcher を import していること
    expect(content).toMatch(
      /from\s+["']@\/app\/components\/chat\/ModeSwitcher["']/,
    );
    // mode + onSwitchMode を props として受ける signature
    expect(content).toContain("mode: PresenceMode");
    expect(content).toContain("onSwitchMode:");
  });

  it("usePresenceExecutor.ts は本番 location (app/components/chat/hooks/) に存在", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/usePresenceExecutor.ts",
    );
    expect(fs.existsSync(file)).toBe(true);
  });

  it("UpperLayerMount.tsx は usePresenceExecutor + UpperLayerStateRenderer を mount", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(
      /from\s+["']\.\/hooks\/usePresenceExecutor["']/,
    );
    expect(content).toMatch(
      /from\s+["']\.\/states\/UpperLayerStateRenderer["']/,
    );
    // MANUAL_SWITCH dispatch (mode 切替経路の core)
    expect(content).toContain("MANUAL_SWITCH");
  });

  it("ChatClient.tsx に touch していない (UpperLayerMount import 1 行のみ維持)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/(culcept)/talk/[threadId]/ChatClient.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // UpperLayerMount は import されている (既存の wiring)
    expect(content).toMatch(
      /import\s+UpperLayerMount\s+from\s+["']@\/app\/components\/chat\/UpperLayerMount["']/,
    );
    // <UpperLayerMount /> が JSX で mount されている
    expect(content).toContain("<UpperLayerMount />");
  });
});
