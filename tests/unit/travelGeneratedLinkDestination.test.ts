/**
 * B 抽出 slice — extractGeneratedLinkDestination
 *   confirmed shared-safe な単一 destination のみ候補化・未確定/private/participant/複数 distinct → null・pure・unwired。
 *
 * 設計正本: docs/t11-b-adapter-producer-wiring-design.md（§11 + CEO owner strict 補正）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractGeneratedLinkDestination } from "@/lib/shared/travel/generated-link-destination";
import type { ExtractedSlot } from "@/lib/shared/travel/slot-types";
import type { ConstraintOwner } from "@/lib/shared/travel/core-types";
import type { SlotStatus, SlotFillState } from "@/lib/shared/travel/slot-types";
import type { Visibility } from "@/lib/shared/travel/core-types";

const dest = (over: {
  areaText?: string;
  status?: SlotStatus;
  fillState?: SlotFillState;
  visibility?: Visibility;
  owner?: ConstraintOwner;
} = {}): ExtractedSlot => ({
  key: "destination_area",
  value: { areaText: over.areaText ?? "京都" },
  status: over.status ?? "confirmed",
  fillState: over.fillState ?? "filled",
  confidence: 1,
  owner: over.owner ?? { kind: "shared" },
  visibility: over.visibility ?? "shared",
  evidence: [{ surface: "form_input", refId: "f1" }],
});

const softPref: ExtractedSlot = {
  key: "soft_preference",
  value: { descriptorKey: "prefer", descriptorValue: "nature" },
  status: "normalized",
  fillState: "filled",
  confidence: 0.6,
  owner: { kind: "shared" },
  visibility: "shared",
  evidence: [{ surface: "profile_prior", refId: "m2:x" }],
};

describe("1. confirmed shared-safe → 候補", () => {
  it("1 個の confirmed shared destination → 候補（label/status/visibility/owner）", () => {
    expect(extractGeneratedLinkDestination([dest()])).toEqual({
      label: "京都",
      status: "confirmed",
      visibility: "shared",
      owner: { kind: "shared" },
    });
  });
  it("label は trim される", () => {
    expect(extractGeneratedLinkDestination([dest({ areaText: "  京都  " })])?.label).toBe("京都");
  });
  it("非 destination slot は無視（destination のみ抽出）", () => {
    expect(extractGeneratedLinkDestination([softPref, dest(), softPref])?.label).toBe("京都");
  });
});

describe("2. 未確定/形/privacy → null", () => {
  it("空 areaText（trim 後）→ null", () => {
    expect(extractGeneratedLinkDestination([dest({ areaText: "   " })])).toBeNull();
  });
  it("proposed → null", () => {
    expect(extractGeneratedLinkDestination([dest({ status: "proposed" })])).toBeNull();
  });
  it("normalized（session_context 相当）→ null", () => {
    expect(extractGeneratedLinkDestination([dest({ status: "normalized" })])).toBeNull();
  });
  it("retracted → null", () => {
    expect(extractGeneratedLinkDestination([dest({ status: "retracted" })])).toBeNull();
  });
  it("fillState partial / missing → null", () => {
    expect(extractGeneratedLinkDestination([dest({ fillState: "partial" })])).toBeNull();
    expect(extractGeneratedLinkDestination([dest({ fillState: "missing" })])).toBeNull();
  });
  it("private visibility → null", () => {
    expect(extractGeneratedLinkDestination([dest({ visibility: "private" })])).toBeNull();
  });
  it("participant 所有 → null", () => {
    expect(extractGeneratedLinkDestination([dest({ owner: { kind: "participant", participantId: "P1" } })])).toBeNull();
  });
  it("★ owner absent → null（strict・legacy fallback なし）", () => {
    const noOwner = { ...dest() } as Record<string, unknown>;
    delete noOwner.owner;
    expect(extractGeneratedLinkDestination([noOwner as unknown as ExtractedSlot])).toBeNull();
  });
});

describe("3. 複数 slot の決定論", () => {
  it("同一 areaText の複数 slot → 1 候補（distinct 1）", () => {
    expect(extractGeneratedLinkDestination([dest({ areaText: "京都" }), dest({ areaText: "京都" })])?.label).toBe("京都");
  });
  it("同一 areaText（trim 差）→ 1 候補", () => {
    expect(extractGeneratedLinkDestination([dest({ areaText: "京都" }), dest({ areaText: " 京都 " })])?.label).toBe("京都");
  });
  it("distinct な areaText 2 個 → null（fail-closed・first/last を選ばない）", () => {
    expect(extractGeneratedLinkDestination([dest({ areaText: "京都" }), dest({ areaText: "大阪" })])).toBeNull();
  });
  it("空配列 / 非配列 → null", () => {
    expect(extractGeneratedLinkDestination([])).toBeNull();
    // @ts-expect-error 非配列 runtime 防御
    expect(extractGeneratedLinkDestination(null)).toBeNull();
  });
});

describe("4. determinism / 非破壊", () => {
  it("同入力 → 同出力", () => {
    const slots = [dest()];
    expect(extractGeneratedLinkDestination(slots)).toEqual(extractGeneratedLinkDestination(slots));
  });
  it("入力 slots を mutate しない", () => {
    const slots = [dest({ areaText: "京都" }), dest({ areaText: "大阪" })];
    const before = slots.map((s) => (s.value as { areaText: string }).areaText);
    extractGeneratedLinkDestination(slots);
    expect(slots.map((s) => (s.value as { areaText: string }).areaText)).toEqual(before);
    expect(slots).toHaveLength(2);
  });
});

describe("5. source-contract（pure・生成/配線なし）", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const SRC = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/generated-link-destination.ts"), "utf8"));
  it("生成/preparation helper を呼ばない・URL を作らない", () => {
    for (const f of ["buildGeneratedMapsSearchIntent", "prepareSafeTravelLinkHrefModels", "prepareTravelExternalLinkHrefModels", "MAPS_SEARCH_HANDOFF_BASE", "encodeURIComponent", "new URL(", "fetch("]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("adapter/panel/action/engine/provider/M2/DB/Supabase/Maps/UI を import しない", () => {
    expect(SRC).not.toMatch(/supabase/i);
    expect(SRC).not.toMatch(/\/api\//);
    expect(SRC).not.toMatch(/googleapis|places\.google/i);
    expect(SRC).not.toMatch(/TravelLivePanel|_actions|display-adapter|provider/i);
    expect(SRC).not.toMatch(/useCoAlter|\/talk|coalter/i);
    expect(SRC).not.toMatch(/from ["']next/);
    expect(SRC).not.toMatch(/from ["']react/);
    expect(SRC).not.toMatch(/\bm2\b/i);
  });
  it("booking/action / 禁止 copy を持たない", () => {
    for (const f of ["booking", "calendar", "executionAuthority", "予約する", "この場所にする", "今すぐ行く"]) {
      expect(SRC).not.toContain(f);
    }
  });
});
