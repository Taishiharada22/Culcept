/**
 * Stage 4 L4-c — HandoffButton test (component 構造、React 描画なし)
 *
 * plan v0.3 §7.3 Gate:
 *   - 明示 tap → 1 回きり broadcast
 *   - 自動 broadcast しない (統合契約 §1.6-3)
 *
 * test strategy: React DOM を使わず、HandoffButton から返る React 要素 shape を確認。
 *   handler 動作 (1 回きりガード) は内部 useRef + setTimeout に依存するため、
 *   構造的検証 + props 検証で代替。実 click 動作は L4-l 統合 E2E で検証。
 */

import { describe, it, expect } from "vitest";

import HandoffButton from "@/app/components/chat/HandoffButton";

describe("L4-c HandoffButton — module export shape", () => {
  it("default export が function (React component)", () => {
    expect(typeof HandoffButton).toBe("function");
  });

  it("component name は HandoffButton", () => {
    expect(HandoffButton.name).toBe("HandoffButton");
  });
});

describe("L4-c HandoffButton — 構造 invariant (auto broadcast 禁止)", () => {
  it("HandoffButton.tsx は publishPresenceSignal / broadcast を直接 import しない (auto-fire 防止)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/HandoffButton.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    const importLines = content
      .split("\n")
      .filter((line) => /^\s*import\s/.test(line))
      .join("\n");
    // bus への直接 publish はしない (handler は親 component から渡される)
    expect(importLines).not.toMatch(/publishPresenceSignal/);
    expect(importLines).not.toMatch(/productionSignalBus/);
    // SyncAdapter にも依存しない (handoff は親 component の責務)
    expect(importLines).not.toMatch(/syncAdapter/);
  });

  it("HandoffButton.tsx に useEffect が存在しない (auto-fire 経路ゼロ)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/HandoffButton.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // useEffect は使わない (auto-fire 防止、明示 tap 経由のみ)
    expect(content).not.toMatch(/useEffect/);
  });

  it("HandoffButton は連投ガード (REFIRE_GUARD_MS) を持つ", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/HandoffButton.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/REFIRE_GUARD_MS/);
    expect(content).toMatch(/firingRef/);
  });
});
