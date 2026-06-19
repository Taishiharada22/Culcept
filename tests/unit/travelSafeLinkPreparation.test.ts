/**
 * Safe Link Preparation Wiring A+B — prepareSafeTravelLinkHrefModels
 *   既構築 intents → 順序付き・dedupe 済 href model[]・marker 整合 guard・Tier1-B 再利用・生成/fetch なし。
 *
 * 設計正本: docs/t11-safe-link-preparation-wiring-design.md（§13 + CEO marker guard 補正）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  prepareSafeTravelLinkHrefModels,
  SOURCE_DISPLAY_ORDER,
} from "@/lib/shared/travel/safe-link-preparation";
import { buildSafeTravelLinkIntent } from "@/lib/shared/travel/safe-link";
import { buildGeneratedMapsSearchIntent } from "@/lib/shared/travel/generated-maps-search";
import type { SafeTravelLinkIntent, SafeTravelLinkSource } from "@/lib/shared/travel/safe-link-types";

/** raw intent 構築（guard 検証用に generated marker を任意に注入）。 */
const intent = (over: Partial<SafeTravelLinkIntent> & { source: SafeTravelLinkSource; value: string }): SafeTravelLinkIntent => ({
  source: over.source,
  externalReference: { kind: "url", value: over.value, inert: true },
  label: over.label ?? "外部で確認する",
  eligibility: over.eligibility ?? "eligible",
  inert: true,
  actionable: false,
  rendered: false,
  fetched: false,
  ...(over.generated !== undefined ? { generated: over.generated } : {}),
});

const manual = (source: SafeTravelLinkSource, value: string, label?: string) =>
  buildSafeTravelLinkIntent({ inertUrl: value, source, label: label ?? "外部で確認する", destinationStatus: "confirmed" })!;

const generated = (query = "京都") =>
  buildGeneratedMapsSearchIntent({ query, destinationStatus: "confirmed", visibility: "shared", label: "地図で検索する" })!;

describe("1. eligible intent → href model（各 source）", () => {
  it("manual user_provided / official / maps + generated_maps_search が全て href model 化", () => {
    const out = prepareSafeTravelLinkHrefModels([
      manual("user_provided", "https://a.com/1"),
      manual("manual_official", "https://b.com/2"),
      manual("manual_maps", "https://c.com/3"),
      generated("嵐山"),
    ]);
    expect(out).toHaveLength(4);
    expect(out.every((m) => m.kind === "external_handoff" && m.rendered === false)).toBe(true);
  });
  it("invalid/ineligible intent は drop", () => {
    const out = prepareSafeTravelLinkHrefModels([
      buildSafeTravelLinkIntent({ inertUrl: "javascript:alert(1)", source: "user_provided", label: "x", destinationStatus: "confirmed" })!, // invalid_url
      buildSafeTravelLinkIntent({ inertUrl: "https://ok.com/1", source: "user_provided", label: "y", destinationStatus: "unconfirmed" })!, // ineligible_unconfirmed
      manual("manual_maps", "https://keep.com/1"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].handoffUrl).toBe("https://keep.com/1");
  });
  it("空 / 非配列 → []", () => {
    expect(prepareSafeTravelLinkHrefModels([])).toEqual([]);
    // @ts-expect-error 非配列 runtime 防御
    expect(prepareSafeTravelLinkHrefModels(null)).toEqual([]);
  });
});

describe("2. source 表示順 + 同 source 入力順保持 + dedupe", () => {
  it("出力順は user_provided → manual_official → manual_maps → generated_maps_search", () => {
    // 入力はわざと逆順
    const out = prepareSafeTravelLinkHrefModels([
      generated("京都"),
      manual("manual_maps", "https://c.com/1"),
      manual("manual_official", "https://b.com/1"),
      manual("user_provided", "https://a.com/1"),
    ]);
    expect(out.map((m) => m.handoffUrl)).toEqual([
      "https://a.com/1",
      "https://b.com/1",
      "https://c.com/1",
      generated("京都").externalReference.value,
    ]);
  });
  it("同 source 内は入力順を保持（stable）", () => {
    const out = prepareSafeTravelLinkHrefModels([
      manual("user_provided", "https://a.com/first"),
      manual("user_provided", "https://a.com/second"),
      manual("user_provided", "https://a.com/third"),
    ]);
    expect(out.map((m) => m.handoffUrl)).toEqual([
      "https://a.com/first",
      "https://a.com/second",
      "https://a.com/third",
    ]);
  });
  it("同一 handoffUrl は dedupe（先勝ち）", () => {
    const out = prepareSafeTravelLinkHrefModels([
      manual("user_provided", "https://dup.com/x", "先"),
      manual("manual_maps", "https://dup.com/x", "後"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("先"); // 表示順で先（user_provided）が残る
  });
});

describe("3. generated marker 整合 guard", () => {
  it("generated_maps_search + generated:true → 受理", () => {
    const out = prepareSafeTravelLinkHrefModels([intent({ source: "generated_maps_search", value: "https://g.com/1", generated: true })]);
    expect(out).toHaveLength(1);
  });
  it("generated_maps_search + generated 欠落 → drop", () => {
    const out = prepareSafeTravelLinkHrefModels([intent({ source: "generated_maps_search", value: "https://g.com/1" })]);
    expect(out).toHaveLength(0);
  });
  it("generated_maps_search + generated:false → drop", () => {
    const out = prepareSafeTravelLinkHrefModels([intent({ source: "generated_maps_search", value: "https://g.com/1", generated: false })]);
    expect(out).toHaveLength(0);
  });
  it("manual source + generated:true → drop（矛盾）", () => {
    const out = prepareSafeTravelLinkHrefModels([intent({ source: "user_provided", value: "https://m.com/1", generated: true })]);
    expect(out).toHaveLength(0);
  });
  it("manual source + generated 欠落/false → 受理", () => {
    const out = prepareSafeTravelLinkHrefModels([
      intent({ source: "manual_official", value: "https://m.com/1" }),
      intent({ source: "manual_maps", value: "https://m.com/2", generated: false }),
    ]);
    expect(out).toHaveLength(2);
  });
});

describe("4. determinism / idempotent / 非破壊", () => {
  it("同入力 → 同出力（deterministic）", () => {
    const input = [manual("user_provided", "https://a.com/1"), generated("京都")];
    expect(prepareSafeTravelLinkHrefModels(input)).toEqual(prepareSafeTravelLinkHrefModels(input));
  });
  it("入力配列を mutate しない", () => {
    const input = [manual("manual_maps", "https://c.com/1"), manual("user_provided", "https://a.com/1")];
    const snapshot = input.map((x) => x.externalReference.value);
    prepareSafeTravelLinkHrefModels(input);
    expect(input.map((x) => x.externalReference.value)).toEqual(snapshot); // 順序/内容不変
  });
  it("SOURCE_DISPLAY_ORDER は表示順のみ（4 source・ランキングでない）", () => {
    expect(SOURCE_DISPLAY_ORDER).toEqual({ user_provided: 0, manual_official: 1, manual_maps: 2, generated_maps_search: 3 });
  });
});

describe("5. source-contract（helper 純度・生成/fetch/UI なし・Tier1-B 再利用）", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const SRC = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/safe-link-preparation.ts"), "utf8"));
  it("Tier1-B helper を再利用する（buildSafeTravelLinkHrefModel を呼ぶ）", () => {
    expect(SRC).toContain("buildSafeTravelLinkHrefModel");
  });
  it("生成しない（buildGeneratedMapsSearchIntent を import/呼ばない・URL 生成なし）", () => {
    expect(SRC).not.toContain("buildGeneratedMapsSearchIntent");
    expect(SRC).not.toContain("MAPS_SEARCH_HANDOFF_BASE");
    for (const f of ["encodeURIComponent", "new URL(", "fetch(", "XMLHttpRequest", "scrape", "googleapis", "places.google", "geocode", "webSearch", "web_search"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("engine/provider/M2/DB/Supabase/app-UI/CoAlter/talk を import しない", () => {
    expect(SRC).not.toMatch(/supabase/i);
    expect(SRC).not.toMatch(/\/api\//);
    expect(SRC).not.toMatch(/useCoAlter|\/talk|coalter/i);
    expect(SRC).not.toMatch(/from ["']next/);
    expect(SRC).not.toMatch(/from ["']react/);
    expect(SRC).not.toMatch(/from ["'][^"']*(components|app\/|engine|provider|personalization)/i);
    expect(SRC).not.toMatch(/\bm2\b/i);
  });
  it("booking/action / 禁止 copy を持たない", () => {
    for (const f of ["booking", "calendar", "executionAuthority", "予約する", "空きあり", "最安", "この場所にする", "スケジュールに追加", "今すぐ行く", "この案で決定"]) {
      expect(SRC).not.toContain(f);
    }
  });
});
