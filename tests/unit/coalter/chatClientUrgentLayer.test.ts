/**
 * Stage 4 L4-h — Urgent layer 本番 component test
 *
 * plan v0.3 §7.8 Gate:
 *   - critical signal 3 種で urgent 起動 (Stage 2 L2-k で検証済、本 phase は UI shape のみ)
 *   - §8.6.3 禁止組み合わせが本番 UI で enforce
 *   - §8.6.4 トーン連続性 (CEO 確認、目視)
 */

import { describe, it, expect } from "vitest";

import UrgentLayer from "@/app/components/chat/UrgentLayer";
import UrgentMessageCard from "@/app/components/chat/UrgentMessageCard";
import UrgentRelease from "@/app/components/chat/UrgentRelease";
import {
  detectUrgent,
} from "@/lib/coalter/presence/urgentTrigger";
import {
  checkCoexistence,
} from "@/lib/coalter/presence/urgentMemoryPriority";
import { adaptCritical } from "@/lib/coalter/presence/signalAdapter";

describe("L4-h — module exports (3 components)", () => {
  it("UrgentLayer / UrgentMessageCard / UrgentRelease が function export", () => {
    expect(typeof UrgentLayer).toBe("function");
    expect(typeof UrgentMessageCard).toBe("function");
    expect(typeof UrgentRelease).toBe("function");
  });
});

describe("L4-h critical signal 3 種で urgent decision (Stage 2 L2-k 整合)", () => {
  it("dignity_violation → dominant_card", () => {
    const r = detectUrgent({
      signal: adaptCritical({ trigger: "dignity_violation", detectedAt: 0 }),
      presenceState: "S2",
    });
    expect(r?.category).toBe("dignity_violation");
    expect(r?.form).toBe("dominant_card");
  });

  it("rupture_detected → dominant_card", () => {
    const r = detectUrgent({
      signal: adaptCritical({ trigger: "rupture_detected", detectedAt: 0 }),
      presenceState: "S5",
    });
    expect(r?.category).toBe("rupture_detected");
    expect(r?.form).toBe("dominant_card");
  });

  it("safety_concern → dominant_card", () => {
    const r = detectUrgent({
      signal: adaptCritical({ trigger: "safety_concern", detectedAt: 0 }),
      presenceState: "S2",
    });
    expect(r?.category).toBe("safety_concern");
    expect(r?.form).toBe("dominant_card");
  });
});

describe("L4-h §8.6.3 同時出現禁止 — 構造的 enforce (本番でも維持)", () => {
  it("urgent + S7 同居 → checkCoexistence が違反検出 (UI 側で本 component を mount しない)", () => {
    const r = checkCoexistence({
      urgentActive: true,
      urgentForm: "dominant_card",
      presenceState: "S7",
    });
    expect(r.ok).toBe(false);
    expect(r.violationIndex).toBe(4);
  });

  it("urgent + memory drawer 開放 → 違反", () => {
    const r = checkCoexistence({
      urgentActive: true,
      urgentForm: "dominant_card",
      memoryDrawerOpen: true,
      presenceState: "S5",
    });
    expect(r.ok).toBe(false);
    expect(r.violationIndex).toBe(0);
  });
});

describe("L4-h 構造 invariant — §8.5.5 文字数上限 (追跡口調排除)", () => {
  it("UrgentMessageCard に MESSAGE_CHAR_LIMIT 定数 (40) が定義済", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UrgentMessageCard.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/MESSAGE_CHAR_LIMIT\s*=\s*40/);
    expect(content).toMatch(/length\s*>\s*MESSAGE_CHAR_LIMIT/);
  });

  it("UrgentMessageCard に警告アイコン (⚠️ / ❌ / ✗) なし (§8.5.5 §6.8 継承)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UrgentMessageCard.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).not.toMatch(/⚠️/);
    expect(content).not.toMatch(/❌/);
    expect(content).not.toMatch(/✗/);
  });

  it("UrgentLayer は 3 form (dominant_card / overlay_banner / inline_cue) を switch 分岐", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UrgentLayer.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/case\s*["']dominant_card["']/);
    expect(content).toMatch(/case\s*["']overlay_banner["']/);
    expect(content).toMatch(/case\s*["']inline_cue["']/);
  });
});
