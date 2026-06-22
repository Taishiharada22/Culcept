// tests/unit/plan/postVisit/postVisitAnchorContext.test.ts
// 評価OS Stage 3-B: 経過 anchor → 答え合わせ context の pure 導出を検証。
//   過去×場所判定・recurring/未来/場所なし除外・suppress マッピング・
//   ★placeDescriptor が lens の opaquePlaceKey と一致すること・past_plan trigger。
import { describe, it, expect } from "vitest";
import {
  isPastAnchorWithPlace,
  deriveAnchorElicitFlags,
  selectPostVisitAnchorForDay,
  anchorEndTimestamp,
  PAST_ANCHOR_RECENT_WINDOW_MS,
  type PostVisitDaySignals,
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

describe("selectPostVisitAnchorForDay — one-per-day guard", () => {
  const NO_SIGNALS: PostVisitDaySignals = { lastSkippedAt: () => null, lastSimilarElicitAt: () => null };
  it("★eligible 0件 → null", () => {
    expect(selectPostVisitAnchorForDay([], NOW, NO_SIGNALS)).toBeNull();
    // 未来のみ
    const future = oneOff({ date: "2026-06-25" });
    expect(selectPostVisitAnchorForDay([future], NOW, NO_SIGNALS)).toBeNull();
  });
  it("★eligible 1件 → その anchor", () => {
    const a = oneOff({ id: "x" });
    const sel = selectPostVisitAnchorForDay([a], NOW, NO_SIGNALS);
    expect(sel?.anchor.id).toBe("x");
    expect(sel?.flags.placeDescriptor).toBeTruthy();
  });
  it("★eligible 複数でも 1件だけ・より最近終了したものを優先", () => {
    const earlier = oneOff({ id: "early", endTime: "11:00", locationText: "A · addrA" });
    const later = oneOff({ id: "late", endTime: "15:00", locationText: "B · addrB" });
    const sel = selectPostVisitAnchorForDay([earlier, later], NOW, NO_SIGNALS);
    expect(sel?.anchor.id).toBe("late"); // 15:00 終了が優先
  });
  it("★sensitiveCategory ありは選ばれない", () => {
    const sensitive = oneOff({ id: "s", sensitiveCategory: "medical" });
    expect(selectPostVisitAnchorForDay([sensitive], NOW, NO_SIGNALS)).toBeNull();
  });
  it("★home/work（suppress）は選ばれない", () => {
    const home = oneOff({ id: "h", locationCategory: "home" });
    expect(selectPostVisitAnchorForDay([home], NOW, NO_SIGNALS)).toBeNull();
  });
  it("★recurring・場所なし・未来 は候補から除外（混在でも eligible 1件のみ選ぶ）", () => {
    const rec = { ...oneOff({ id: "r" }), anchorKind: "recurring", validFrom: "2026-06-01" } as unknown as Parameters<typeof selectPostVisitAnchorForDay>[0][number];
    const noPlace = oneOff({ id: "np", locationText: undefined });
    const future = oneOff({ id: "f", date: "2026-06-25" });
    const good = oneOff({ id: "g", endTime: "14:00" });
    const sel = selectPostVisitAnchorForDay([rec, noPlace, future, good], NOW, NO_SIGNALS);
    expect(sel?.anchor.id).toBe("g");
  });
  it("★recent_same signal で suppress → 選ばれない", () => {
    const a = oneOff({ id: "rs" });
    const recent: PostVisitDaySignals = { lastSkippedAt: () => null, lastSimilarElicitAt: () => NOW - 1000 };
    expect(selectPostVisitAnchorForDay([a], NOW, recent)).toBeNull();
  });
  it("★anchorEndTimestamp: one_off は終了時刻 / recurring は null", () => {
    expect(anchorEndTimestamp(oneOff({ endTime: "13:00" }))).toBe(new Date(2026, 5, 21, 13, 0, 0).getTime());
    const rec = { ...oneOff(), anchorKind: "recurring", validFrom: "2026-06-01" } as unknown as ExternalAnchor;
    expect(anchorEndTimestamp(rec)).toBeNull();
  });
});
