// tests/unit/plan/postVisit/postVisitAnchorContext.test.ts
// 評価OS Stage 3-B: 経過 anchor → 答え合わせ context の pure 導出を検証。
//   過去×場所判定・recurring/未来/場所なし除外・suppress マッピング・
//   ★placeDescriptor が lens の opaquePlaceKey と一致すること・past_plan trigger。
import { describe, it, expect } from "vitest";
import {
  isPastAnchorWithPlace,
  deriveAnchorElicitFlags,
  PAST_ANCHOR_RECENT_WINDOW_MS,
} from "@/lib/plan/postVisit/postVisitAnchorContext";
import { shouldElicit, type ElicitContext } from "@/lib/plan/postVisit/postVisitElicitation";
import { opaquePlaceKey } from "@/lib/plan/candidateLens/candidateLensPreferenceStore";
import { formatCanonicalLocationText } from "@/lib/shared/canonicalLocationText";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";

function oneOff(over: Partial<ExternalAnchor> = {}): ExternalAnchor {
  return {
    id: "a1", userId: "u1", sourceId: "s1", confirmedAt: "2026-06-20T00:00:00Z",
    anchorKind: "one_off", title: "ランチ", date: "2026-06-21", startTime: "12:00", endTime: "13:00",
    rigidity: "soft", locationText: "ブルーボトル · 東京都江東区",
    ...over,
  } as ExternalAnchor;
}
const NOW = new Date(2026, 5, 21, 18, 0, 0).getTime(); // 2026-06-21 18:00 ローカル（予定後）

describe("isPastAnchorWithPlace — 過去×場所のみ true", () => {
  it("★経過済み×場所あり → true", () => {
    expect(isPastAnchorWithPlace(oneOff(), NOW)).toBe(true);
  });
  it("★未来の予定 → false", () => {
    const future = new Date(2026, 5, 21, 10, 0, 0).getTime(); // 予定(13:00終了)より前
    expect(isPastAnchorWithPlace(oneOff(), future)).toBe(false);
  });
  it("★場所なし → false", () => {
    expect(isPastAnchorWithPlace(oneOff({ locationText: undefined }), NOW)).toBe(false);
    expect(isPastAnchorWithPlace(oneOff({ locationText: "  " }), NOW)).toBe(false);
  });
  it("★recurring（日常）→ false（対象外）", () => {
    const rec = { ...oneOff(), anchorKind: "recurring", validFrom: "2026-06-01" } as unknown as ExternalAnchor;
    expect(isPastAnchorWithPlace(rec, NOW)).toBe(false);
  });
  it("★古すぎ（窓外）→ false", () => {
    const old = oneOff({ date: "2026-05-01" });
    expect(isPastAnchorWithPlace(old, NOW)).toBe(false);
    expect(PAST_ANCHOR_RECENT_WINDOW_MS).toBeGreaterThan(0);
  });
});

describe("deriveAnchorElicitFlags — suppress マッピング + lens キー一致", () => {
  it("★placeDescriptor が lens の opaquePlaceKey と一致（canonical round-trip）", () => {
    // lens 選択時: formatCanonicalLocationText(name, address) を locationText に保存
    const name = "ブルーボトル";
    const address = "東京都江東区";
    const locationText = formatCanonicalLocationText(name, address);
    const f = deriveAnchorElicitFlags(oneOff({ locationText }));
    // lens の Fit-Arc 読込キー = opaquePlaceKey(`${name} ${address}`)
    const lensKey = opaquePlaceKey(`${name} ${address}`);
    expect(opaquePlaceKey(f.placeDescriptor)).toBe(lensKey);
    expect(lensKey).not.toBeNull();
  });
  it("★sensitiveCategory → isSensitive（suppress 用・保存しない）", () => {
    const f = deriveAnchorElicitFlags(oneOff({ sensitiveCategory: "medical" }));
    expect(f.isSensitive).toBe(true);
  });
  it("★rigidity hard → isImportantPlan", () => {
    expect(deriveAnchorElicitFlags(oneOff({ rigidity: "hard" })).isImportantPlan).toBe(true);
    expect(deriveAnchorElicitFlags(oneOff({ rigidity: "soft" })).isImportantPlan).toBe(false);
  });
  it("★home/office/school → isHomeOrWork / transit → isHabitual", () => {
    expect(deriveAnchorElicitFlags(oneOff({ locationCategory: "office" })).isHomeOrWork).toBe(true);
    expect(deriveAnchorElicitFlags(oneOff({ locationCategory: "transit" })).isHabitual).toBe(true);
    expect(deriveAnchorElicitFlags(oneOff({ locationCategory: "cafe" })).isHomeOrWork).toBe(false);
  });
  it("★isPastPlan は常に true", () => {
    expect(deriveAnchorElicitFlags(oneOff()).isPastPlan).toBe(true);
  });
});

describe("past_plan trigger（最低優先度・suppress 安全網）", () => {
  function ctx(over: Partial<ElicitContext> = {}): ElicitContext {
    return {
      isLensProposed: false, isFirstVisit: false, isImportantPlan: false, isDiscoveryDomain: false,
      isPastPlan: false, dwellSignal: null,
      isSensitive: false, isHomeOrWork: false, isHabitual: false, isHighFatigue: false,
      lastSkippedAt: null, lastSimilarElicitAt: null, now: NOW, ...over,
    };
  }
  it("★非suppress の経過予定 → elicit=true / trigger=past_plan", () => {
    const d = shouldElicit(ctx({ isPastPlan: true }));
    expect(d.elicit).toBe(true);
    expect(d.trigger).toBe("past_plan");
  });
  it("★sensitive は suppress が優先（医療予定は聞かない）", () => {
    const d = shouldElicit(ctx({ isPastPlan: true, isSensitive: true }));
    expect(d.elicit).toBe(false);
    expect(d.suppressedBy).toBe("sensitive");
  });
  it("★home/work も suppress", () => {
    expect(shouldElicit(ctx({ isPastPlan: true, isHomeOrWork: true })).elicit).toBe(false);
  });
  it("★情報量の高い trigger が past_plan より優先（lens_proposed 同時 → lens_proposed）", () => {
    const d = shouldElicit(ctx({ isPastPlan: true, isLensProposed: true }));
    expect(d.trigger).toBe("lens_proposed");
  });
});
