/**
 * B-D-A — prepareTravelExternalLinkHrefModels
 *   confirmed shared-safe destination/entity（+任意 manual）→ 既存 ladder で href model[] 合成。
 *   生成は Tier1-C 経由のみ・manual 捏造なし・配線なし・pure。
 *
 * 設計正本: docs/t11-bd-producer-consumer-links-wiring-design.md（§13 A slice）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prepareTravelExternalLinkHrefModels } from "@/lib/shared/travel/travel-external-link-preparation";
import { buildSafeTravelLinkIntent } from "@/lib/shared/travel/safe-link";
import { MAPS_SEARCH_HANDOFF_BASE } from "@/lib/shared/travel/generated-maps-search";

const sharedConfirmedDest = { label: "京都", status: "confirmed" as const, visibility: "shared" as const };

describe("1. destination 由来 generated link", () => {
  it("confirmed shared destination → generated Maps href model 1 本", () => {
    const out = prepareTravelExternalLinkHrefModels({ destination: sharedConfirmedDest });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("external_handoff");
    expect(out[0].handoffUrl).toBe(MAPS_SEARCH_HANDOFF_BASE + encodeURIComponent("京都"));
    expect(out[0].label).toBe("地図で検索する");
    expect(out[0].rendered).toBe(false);
  });
  it("confirmed private destination → 生成なし", () => {
    expect(prepareTravelExternalLinkHrefModels({ destination: { ...sharedConfirmedDest, visibility: "private" } })).toEqual([]);
  });
  it("participant 所有（owner 非 shared）→ 生成なし", () => {
    expect(
      prepareTravelExternalLinkHrefModels({ destination: { ...sharedConfirmedDest, owner: { kind: "participant", participantId: "P1" } } }),
    ).toEqual([]);
  });
  it("owner shared 明示 → 生成あり", () => {
    const out = prepareTravelExternalLinkHrefModels({ destination: { ...sharedConfirmedDest, owner: { kind: "shared" } } });
    expect(out).toHaveLength(1);
  });
  it("unconfirmed / missing / 空ラベル → 生成なし", () => {
    expect(prepareTravelExternalLinkHrefModels({ destination: { ...sharedConfirmedDest, status: "unconfirmed" } })).toEqual([]);
    expect(prepareTravelExternalLinkHrefModels({ destination: { ...sharedConfirmedDest, status: "missing" } })).toEqual([]);
    expect(prepareTravelExternalLinkHrefModels({ destination: { ...sharedConfirmedDest, label: "  " } })).toEqual([]);
  });
});

describe("2. entity 由来 generated link", () => {
  it("confirmed shared entity → generated Maps href model", () => {
    const out = prepareTravelExternalLinkHrefModels({ entity: { label: "金閣寺", confirmed: true, visibility: "shared" } });
    expect(out).toHaveLength(1);
    expect(out[0].handoffUrl).toBe(MAPS_SEARCH_HANDOFF_BASE + encodeURIComponent("金閣寺"));
  });
  it("unconfirmed entity → 生成なし", () => {
    expect(prepareTravelExternalLinkHrefModels({ entity: { label: "金閣寺", confirmed: false, visibility: "shared" } })).toEqual([]);
  });
  it("private entity → 生成なし", () => {
    expect(prepareTravelExternalLinkHrefModels({ entity: { label: "金閣寺", confirmed: true, visibility: "private" } })).toEqual([]);
  });
});

describe("3. manual intents（捏造しない・供給時のみ・順序/dedupe は Preparation 経由）", () => {
  it("manual 未供給 → manual は出ない（destination のみ）", () => {
    const out = prepareTravelExternalLinkHrefModels({ destination: sharedConfirmedDest });
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("地図で検索する"); // generated のみ・manual は捏造されない
  });
  it("manual 供給時は含まれ、manual→generated の順", () => {
    const manual = buildSafeTravelLinkIntent({ inertUrl: "https://a.com/1", source: "user_provided", label: "外部で確認する", destinationStatus: "confirmed" })!;
    const out = prepareTravelExternalLinkHrefModels({ destination: sharedConfirmedDest, manualIntents: [manual] });
    expect(out.map((m) => m.handoffUrl)).toEqual([
      "https://a.com/1", // user_provided（表示順 0）
      MAPS_SEARCH_HANDOFF_BASE + encodeURIComponent("京都"), // generated（表示順 3）
    ]);
  });
  it("同一 handoffUrl は Preparation で dedupe（先勝ち）", () => {
    const sameUrl = MAPS_SEARCH_HANDOFF_BASE + encodeURIComponent("京都");
    const manualMaps = buildSafeTravelLinkIntent({ inertUrl: sameUrl, source: "manual_maps", label: "地図で見る", destinationStatus: "confirmed" })!;
    const out = prepareTravelExternalLinkHrefModels({ destination: sharedConfirmedDest, manualIntents: [manualMaps] });
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("地図で見る"); // manual_maps（表示順 2）が generated（3）より先
  });
});

describe("4. determinism / 非破壊 / 空入力", () => {
  it("同入力 → 同出力", () => {
    const input = { destination: sharedConfirmedDest };
    expect(prepareTravelExternalLinkHrefModels(input)).toEqual(prepareTravelExternalLinkHrefModels(input));
  });
  it("manualIntents 配列を mutate しない", () => {
    const manual = buildSafeTravelLinkIntent({ inertUrl: "https://a.com/1", source: "user_provided", label: "x", destinationStatus: "confirmed" })!;
    const arr = [manual];
    prepareTravelExternalLinkHrefModels({ destination: sharedConfirmedDest, manualIntents: arr });
    expect(arr).toHaveLength(1); // 不変
  });
  it("空入力 → []", () => {
    expect(prepareTravelExternalLinkHrefModels({})).toEqual([]);
    // @ts-expect-error 非 object runtime 防御
    expect(prepareTravelExternalLinkHrefModels(null)).toEqual([]);
  });
});

describe("5. source-contract（pure・既存 ladder 再利用・配線/外部なし）", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const SRC = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/travel-external-link-preparation.ts"), "utf8"));
  it("既存 ladder を再利用（buildGeneratedMapsSearchIntent + prepareSafeTravelLinkHrefModels）", () => {
    expect(SRC).toContain("buildGeneratedMapsSearchIntent");
    expect(SRC).toContain("prepareSafeTravelLinkHrefModels");
  });
  it("URL 自前生成/fetch/Maps API なし", () => {
    for (const f of ["MAPS_SEARCH_HANDOFF_BASE", "encodeURIComponent", "new URL(", "fetch(", "XMLHttpRequest", "scrape", "googleapis", "places.google", "geocode", "webSearch", "web_search"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("adapter/panel/action/engine/provider/M2/DB/Supabase/UI を import しない", () => {
    expect(SRC).not.toMatch(/supabase/i);
    expect(SRC).not.toMatch(/\/api\//);
    expect(SRC).not.toMatch(/TravelLivePanel|_actions|display-adapter|\bengine\b|provider|personalization/i);
    expect(SRC).not.toMatch(/useCoAlter|\/talk|coalter/i);
    expect(SRC).not.toMatch(/from ["']next/);
    expect(SRC).not.toMatch(/from ["']react/);
    expect(SRC).not.toMatch(/\bm2\b/i);
  });
  it("booking/action / 禁止 copy を持たない", () => {
    for (const f of ["booking", "calendar", "executionAuthority", "予約する", "空きあり", "最安", "この場所にする", "スケジュールに追加", "今すぐ行く", "この案で決定"]) {
      expect(SRC).not.toContain(f);
    }
  });
});
