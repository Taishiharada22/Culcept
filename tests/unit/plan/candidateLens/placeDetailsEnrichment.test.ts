import { describe, it, expect, vi, afterEach } from "vitest";
import {
  PLACE_DETAILS_FIELD_MASK,
  PLACE_DETAILS_FIELD_LIST,
  FORBIDDEN_FIELDS,
  isFieldMaskSafe,
  resolveEnrichment,
  deriveOpenState,
  buildEnrichedHours,
  createEnrichmentMemo,
  ENRICHMENT_FETCH_POLICY,
  PLACE_DETAILS_ENRICH_FETCH_ENABLED,
  PLACE_DETAILS_ENRICH_UI_ENABLED,
  isPlaceDetailsFetchEnabled,
  isPlaceDetailsUiEnabled,
  type PlaceDetailsEnrichment,
} from "@/lib/plan/candidateLens/placeDetailsEnrichment";
import { FakePlaceDetailsAdapter, FAKE_ENRICHMENTS } from "@/lib/plan/candidateLens/placeDetailsAdapter";
import { buildPlaceAttributes } from "@/lib/plan/candidateLens/placeAttributeModel";

afterEach(() => vi.unstubAllEnvs());

// ───────────────────────── 3. field mask 固定 ─────────────────────────
describe("P4-a field mask 固定", () => {
  it("★field mask 完全一致（定数 1 つ・id,photos,regularOpeningHours）", () => {
    expect(PLACE_DETAILS_FIELD_MASK).toBe("id,photos,regularOpeningHours");
    expect(PLACE_DETAILS_FIELD_LIST).toEqual(["id", "photos", "regularOpeningHours"]);
    expect(PLACE_DETAILS_FIELD_MASK).toBe(PLACE_DETAILS_FIELD_LIST.join(","));
  });

  it("★+Atmosphere field 混入防止（takeout/dineIn/serves*/goodFor*/restroom/outdoorSeating/reviews を含まない）", () => {
    const inMask = new Set(PLACE_DETAILS_FIELD_LIST);
    for (const f of ["takeout", "delivery", "dineIn", "reservable", "servesCoffee", "servesBreakfast", "goodForChildren", "goodForGroups", "restroom", "outdoorSeating", "reviews"]) {
      expect(inMask.has(f)).toBe(false);
      expect(FORBIDDEN_FIELDS).toContain(f);
    }
  });

  it("★reviews / rating / priceLevel / accessibilityOptions を混ぜない", () => {
    const inMask = new Set(PLACE_DETAILS_FIELD_LIST);
    for (const f of ["reviews", "rating", "userRatingCount", "priceLevel", "accessibilityOptions", "editorialSummary"]) {
      expect(inMask.has(f)).toBe(false);
    }
  });

  it("★禁止フィールドとの交差ゼロ（isFieldMaskSafe）", () => {
    const forbidden = new Set(FORBIDDEN_FIELDS);
    expect(PLACE_DETAILS_FIELD_LIST.some((f) => forbidden.has(f))).toBe(false);
    expect(isFieldMaskSafe()).toBe(true);
  });
});

// ───────────────────────── 2. honesty mapping ─────────────────────────
describe("P4-a honesty mapping — resolveEnrichment", () => {
  it("★写真あり(photoUri+attribution) → photoDisplayable=true・photoMediaUrl・attribution 運搬", () => {
    const r = resolveEnrichment(FAKE_ENRICHMENTS.fake_withPhotoAndHours);
    expect(r.photoDisplayable).toBe(true);
    expect(r.photoMediaUrl).toMatch(/^https:\/\/lh3\.googleusercontent\.com\//);
    expect(r.photoAttributions.length).toBeGreaterThan(0);
    expect(r.photoAttributions[0]!.displayName).toBe("Taro Y.");
  });

  it("★写真なし → abstract tile fallback（photoDisplayable=false・URL/attributions 空）", () => {
    const r = resolveEnrichment(FAKE_ENRICHMENTS.fake_hoursOnly);
    expect(r.photoDisplayable).toBe(false);
    expect(r.photoMediaUrl).toBeNull();
    expect(r.photoAttributions).toEqual([]);
  });

  it("★photoUri ありでも attribution が無い → photo 非表示（CEO ルール・abstract）", () => {
    const r = resolveEnrichment(FAKE_ENRICHMENTS.fake_photoNoAttribution);
    expect(r.photoDisplayable).toBe(false);
    expect(r.photoMediaUrl).toBeNull();
  });

  it("★attribution ありでも media 失敗(photoUri=null) → photo 非表示（abstract fallback）", () => {
    const r = resolveEnrichment(FAKE_ENRICHMENTS.fake_photoMediaFailed);
    expect(r.photoDisplayable).toBe(false);
    expect(r.photoMediaUrl).toBeNull();
  });

  it("★営業時間あり → confirmed（open）", () => {
    const r = resolveEnrichment(FAKE_ENRICHMENTS.fake_withPhotoAndHours);
    expect(r.hoursConfirmed).toBe(true);
    expect(r.openState).toBe("open");
    expect(r.hoursLines.length).toBeGreaterThan(0);
  });

  it("★営業時間なし → unconfirmed 据置（hoursConfirmed=false・openState=unknown）", () => {
    const r = resolveEnrichment(FAKE_ENRICHMENTS.fake_photoOnly);
    expect(r.hoursConfirmed).toBe(false);
    expect(r.openState).toBe("unknown");
    expect(r.hoursLines).toEqual([]);
  });

  it("★open/closed/unknown 導出（openNow true/false/null）— null は推測しない", () => {
    expect(deriveOpenState(true)).toBe("open");
    expect(deriveOpenState(false)).toBe("closed");
    expect(deriveOpenState(null)).toBe("unknown");
    // fixture: openNow=false → closed
    expect(resolveEnrichment(FAKE_ENRICHMENTS.fake_hoursOnly).openState).toBe("closed");
    // fixture: openNow=null → unknown（曜日記述はあっても開閉は推測しない）
    const unk = resolveEnrichment(FAKE_ENRICHMENTS.fake_hoursOpenNowNull);
    expect(unk.hoursConfirmed).toBe(true); // 営業時間データ自体はある
    expect(unk.openState).toBe("unknown"); // が、現在開閉は unknown
    expect(buildEnrichedHours({ openNow: null, weekdayDescriptions: [] }).openState).toBe("unknown");
  });
});

// ───────────────────────── attribution contract ─────────────────────────
describe("P4-a attribution contract", () => {
  it("★photo displayable な場合、author attribution を表示可能な shape に必ず含める", () => {
    const r = resolveEnrichment(FAKE_ENRICHMENTS.fake_withPhotoAndHours);
    expect(r.photoDisplayable).toBe(true);
    expect(Array.isArray(r.photoAttributions)).toBe(true); // 表示可能な shape を常に持つ
    expect("photoAttributions" in r).toBe(true);
  });

  it("★Powered by Google を表示できる contract（showGoogleAttribution）", () => {
    // 写真 or 営業時間を実表示する時 true、未表示時 false
    expect(resolveEnrichment(FAKE_ENRICHMENTS.fake_withPhotoAndHours).showGoogleAttribution).toBe(true);
    expect(resolveEnrichment(FAKE_ENRICHMENTS.fake_photoOnly).showGoogleAttribution).toBe(true); // 写真のみでも true
    expect(resolveEnrichment(FAKE_ENRICHMENTS.fake_hoursOnly).showGoogleAttribution).toBe(true); // 営業時間のみでも true
    expect(resolveEnrichment(FAKE_ENRICHMENTS.fake_empty).showGoogleAttribution).toBe(false); // 何も表示しない → false
  });

  it("★attribution shape なしで photo displayable にならない（photoDisplayable=true ⟹ photoAttributions 定義済み）", () => {
    for (const e of Object.values(FAKE_ENRICHMENTS)) {
      const r = resolveEnrichment(e);
      if (r.photoDisplayable) {
        expect(r.photoAttributions).toBeDefined();
        expect(Array.isArray(r.photoAttributions)).toBe(true);
      }
    }
  });
});

// ───────────────────────── fail-open ─────────────────────────
describe("P4-a fail-open", () => {
  it("★error/timeout fixture → mapper は throw せず全 fallback", () => {
    const r = resolveEnrichment(FAKE_ENRICHMENTS.fake_errorTimeout);
    expect(r.photoDisplayable).toBe(false);
    expect(r.hoursConfirmed).toBe(false);
    expect(r.showGoogleAttribution).toBe(false);
    expect(r.openState).toBe("unknown");
  });

  it("★enrichment=null → 全 fallback（P4 前と同一の表示意図）", () => {
    const r = resolveEnrichment(null);
    expect(r).toEqual({ photoDisplayable: false, photoMediaUrl: null, photoAttributions: [], hoursConfirmed: false, openState: "unknown", hoursLines: [], showGoogleAttribution: false });
  });

  it("★Fake adapter は reject しない（既知/未知 placeId とも resolve）", async () => {
    const adapter = new FakePlaceDetailsAdapter();
    await expect(adapter.fetchDetails("fake_withPhotoAndHours")).resolves.toBeTruthy();
    await expect(adapter.fetchDetails("unknown_id_xyz")).resolves.toMatchObject({ placeId: "unknown_id_xyz", fetchStatus: "ok", photo: null, hours: null });
  });

  it("★error fixture の fetchStatus/error 形（kind=timeout・PII/キー非含有）", () => {
    const e = FAKE_ENRICHMENTS.fake_errorTimeout;
    expect(e.fetchStatus).toBe("error");
    expect(e.error?.kind).toBe("timeout");
    expect(e.error?.message).not.toMatch(/AIza|key=/i);
  });
});

// ───────────────────────── Wi-Fi/電源/静か/雰囲気 を実値化できない証明 ─────────────────────────
describe("P4-a honesty: Wi-Fi/電源/静か/雰囲気 を実値化しない", () => {
  it("★enrichment 型に wifi/power/quiet/ambience のキーが無い（compile-time + runtime）", () => {
    const e: PlaceDetailsEnrichment = FAKE_ENRICHMENTS.fake_withPhotoAndHours;
    // @ts-expect-error wifi は PlaceDetailsEnrichment に存在しない
    void e.wifi;
    // @ts-expect-error power は存在しない
    void e.power;
    // @ts-expect-error quiet は存在しない
    void e.quiet;
    // @ts-expect-error ambience は存在しない
    void e.ambience;
    // @ts-expect-error social は存在しない
    void e.social;
    const keys = Object.keys(e);
    for (const k of ["wifi", "power", "quiet", "crowd", "ambience", "social"]) {
      expect(keys).not.toContain(k);
    }
  });

  it("★resolution 出力にも wifi/power/quiet/雰囲気 相当のキーが現れない", () => {
    const allowed = ["photoDisplayable", "photoMediaUrl", "photoAttributions", "hoursConfirmed", "openState", "hoursLines", "showGoogleAttribution"];
    for (const e of Object.values(FAKE_ENRICHMENTS)) {
      const r = resolveEnrichment(e);
      expect(Object.keys(r).sort()).toEqual([...allowed].sort());
    }
  });

  it("★base 属性モデルは P4-a で不変（wifi/power/quiet/hours/photo は依然 null）", () => {
    const attrs = buildPlaceAttributes({ name: "X", address: "東京都", lat: 35.6, lng: 139.8, types: ["cafe"], distanceMeters: 300 });
    for (const k of ["wifi", "power", "quiet", "crowd", "social_fit", "hours", "photo"] as const) {
      expect(attrs[k].value).toBeNull();
    }
  });
});

// ───────────────────────── no persistent cache / fetch policy ─────────────────────────
describe("P4-a no persistent cache / fetch policy", () => {
  it("★session memo は in-memory のみ（Map・空で開始・永続層へ触れない）", () => {
    const memo = createEnrichmentMemo();
    expect(memo instanceof Map).toBe(true);
    expect(memo.size).toBe(0);
    memo.set("a", FAKE_ENRICHMENTS.fake_empty);
    expect(memo.get("a")).toBe(FAKE_ENRICHMENTS.fake_empty);
  });

  it("★fetch policy: timeout1500 / retry0 / persist=false", () => {
    expect(ENRICHMENT_FETCH_POLICY.timeoutMs).toBe(1500);
    expect(ENRICHMENT_FETCH_POLICY.retries).toBe(0);
    expect(ENRICHMENT_FETCH_POLICY.persist).toBe(false);
  });
});

// ───────────────────────── flags ─────────────────────────
describe("P4-a flags（UI/fetch 分離・default OFF・production hard block）", () => {
  it("★fetch flag default OFF", () => {
    expect(PLACE_DETAILS_ENRICH_FETCH_ENABLED).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    expect(isPlaceDetailsFetchEnabled()).toBe(false);
  });

  it("★UI flag default OFF（fetch と独立）", () => {
    expect(PLACE_DETAILS_ENRICH_UI_ENABLED).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    expect(isPlaceDetailsUiEnabled()).toBe(false);
  });

  it("★production hard block（両 flag）", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isPlaceDetailsFetchEnabled()).toBe(false);
    expect(isPlaceDetailsUiEnabled()).toBe(false);
    expect(true && process.env.NODE_ENV !== "production").toBe(false);
  });
});
