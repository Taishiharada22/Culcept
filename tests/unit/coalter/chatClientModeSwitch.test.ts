/**
 * Stage 4 L4-f — ModeSwitcher / AutoEscalationBanner / ModeReturnPrompt /
 *                RejectionFlows 構造 invariant test
 *
 * plan v0.3 §7.6 Gate:
 *   - flag OFF で既存 ChatClient 不変 (本 component は L4-l flip まで mount されない)
 *   - flag ON で 3 mode 切替が本番 UI で動作 (modeReducer 整合)
 *   - 拒否 3 分類が独立 UI で動作 (RejectionFlows + AutoEscalationBanner で分離)
 */

import { describe, it, expect } from "vitest";

import ModeSwitcher from "@/app/components/chat/ModeSwitcher";
import AutoEscalationBanner from "@/app/components/chat/AutoEscalationBanner";
import ModeReturnPrompt from "@/app/components/chat/ModeReturnPrompt";
import RejectionFlows from "@/app/components/chat/RejectionFlows";
import { modeReducer } from "@/lib/coalter/presence/modeReducer";

describe("L4-f — module exports", () => {
  it("4 component すべてが function export", () => {
    expect(typeof ModeSwitcher).toBe("function");
    expect(typeof AutoEscalationBanner).toBe("function");
    expect(typeof ModeReturnPrompt).toBe("function");
    expect(typeof RejectionFlows).toBe("function");
  });
});

describe("L4-f modeReducer 整合 — Daily ↔ Travel 直接遷移禁止 (§11.5 / v1.1 §2.3)", () => {
  it("daily + MANUAL_SWITCH(travel) → daily 不変", () => {
    expect(
      modeReducer("daily", { type: "MANUAL_SWITCH", target: "travel" }),
    ).toBe("daily");
  });

  it("travel + MANUAL_SWITCH(daily) → travel 不変", () => {
    expect(
      modeReducer("travel", { type: "MANUAL_SWITCH", target: "daily" }),
    ).toBe("travel");
  });

  it("normal → daily / travel 切替は両方許可", () => {
    expect(
      modeReducer("normal", { type: "MANUAL_SWITCH", target: "daily" }),
    ).toBe("daily");
    expect(
      modeReducer("normal", { type: "MANUAL_SWITCH", target: "travel" }),
    ).toBe("travel");
  });

  it("daily / travel → normal 復帰経路", () => {
    expect(modeReducer("daily", { type: "MANUAL_RETURN" })).toBe("normal");
    expect(modeReducer("travel", { type: "PLAN_COMPLETE" })).toBe("normal");
  });
});

describe("L4-f 構造 invariant — 4 component の独立性 (拒否 3 分類)", () => {
  it("AutoEscalationBanner.tsx に「通常に戻す」reject button が定義済 (§6.6.1 mode_escalation)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/AutoEscalationBanner.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/coalter-auto-escalation-reject/);
    expect(content).toMatch(/onReject/);
    expect(content).toMatch(/§6\.6\.1/);
  });

  it("RejectionFlows.tsx に PROPOSAL_REJECTED + COALTER_RETREAT_REQUESTED の 2 button (§6.6.2 / §6.6.3)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/RejectionFlows.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/PROPOSAL_REJECTED/);
    expect(content).toMatch(/COALTER_RETREAT_REQUESTED/);
    expect(content).toMatch(/coalter-reject-proposal/);
    expect(content).toMatch(/coalter-reject-retreat/);
  });

  it("RejectionFlows は MODE_ESCALATION_REJECTED を発火しない (§6.6.1 は AutoEscalationBanner 専用)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/RejectionFlows.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).not.toMatch(/MODE_ESCALATION_REJECTED/);
  });

  it("ModeSwitcher.tsx は radiogroup role + 3 mode chip (radio 形式)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/ModeSwitcher.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/radiogroup/);
    expect(content).toMatch(/role=["']radio["']/);
    // template literal `coalter-mode-${m}` で 3 mode 全網羅
    expect(content).toMatch(/coalter-mode-\$\{m\}/);
  });
});
