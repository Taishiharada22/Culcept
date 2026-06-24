/**
 * Life Ops A-6 — Relationship / Gift Intelligence（pure 契約）。CEO 指定 16 項目を固定。
 *   opaque personRef・identity 非漏洩・Tier A/B 入力制限・freshness・suppression・N選・戦略分散・感情非推定・blocked actions。
 */
import { describe, it, expect } from "vitest";
import {
  isOpaquePersonRef,
  RELATIONSHIP_TOUCHPOINTS,
  getTouchpointSpec,
  listTouchpointsByGroup,
  evaluateSuppression,
  buildContactDraftStructure,
  buildScoutingPrompts,
  assessRelationshipPermission,
  RELATIONSHIP_BLOCKED_ACTIONS,
  FREQUENCY_CAP,
} from "@/lib/lifeops/relationship-model";
import {
  sanitizeDesireSignals,
  desireSignalScore,
  freshnessFromDaysSince,
  distilledProfileToSignals,
  partnerProfileToSignals,
  defaultBudgetBand,
  recommendGifts,
  giftReasonTexts,
  type DesireSignal,
  type GiftIntelligenceInput,
} from "@/lib/lifeops/gift-intelligence";

const REF = "p_friend_001";
const sig = (over: Partial<DesireSignal> = {}): DesireSignal => ({
  source: "wishlist",
  category: "coffee",
  freshness: "fresh",
  strength: "strong",
  confidence: "low", // sanitize が source から再導出することを検証
  ...over,
});
const frame = (touchpointId = "birthday" as const) => ({
  touchpointId,
  relationKind: "close_friend" as const,
  budgetBand: "middle" as const,
  formality: "casual" as const,
});
const richInput = (): GiftIntelligenceInput => ({
  personRef: REF,
  frame: frame(),
  signals: [
    sig({ source: "wishlist", category: "coffee" }),
    sig({ source: "recent_habit", category: "gaming", freshness: "fresh", strength: "medium" }),
    sig({ source: "upcoming_plan", category: "travel", freshness: "fresh", strength: "medium" }),
  ],
});
const EMOTION_ASSERT = /喜ぶはず|喜びます|嬉しいはず|感動します|必ず|absolutely/;

describe("A-6 (1) opaque personRef しか受けない", () => {
  it("opaque token のみ true・email/電話/実名/自由文字列は false", () => {
    expect(isOpaquePersonRef("p_friend_001")).toBe(true);
    expect(isOpaquePersonRef("tanaka@example.com")).toBe(false);
    expect(isOpaquePersonRef("090-1234-5678")).toBe(false);
    expect(isOpaquePersonRef("田中太郎")).toBe(false);
    expect(isOpaquePersonRef("p_ABC")).toBe(false); // 大文字不可・短すぎ
    expect(isOpaquePersonRef("")).toBe(false);
  });
  it("不正 ref では推薦が空（fail-closed）", () => {
    expect(recommendGifts({ ...richInput(), personRef: "tanaka@example.com" })).toEqual([]);
    expect(partnerProfileToSignals({ personRef: "田中", relationKind: "friend", interests: ["coffee"] })).toEqual([]);
  });
});

describe("A-6 (2) personRef / raw identity が presenter に出ない", () => {
  it("推薦フィールド・根拠文・偵察文に personRef が含まれない", () => {
    const recs = recommendGifts(richInput());
    for (const r of recs) {
      expect(r.productDescriptor).not.toContain(REF);
      expect(r.searchQuery).not.toContain(REF);
      expect(r.reasonCodes.join()).not.toContain(REF);
      for (const t of giftReasonTexts(r.reasonCodes)) expect(t).not.toContain(REF);
    }
    for (const p of buildScoutingPrompts("birthday")) expect(p.promptText).not.toContain(REF);
  });
});

describe("A-6 (3) Tier A は同意済み蒸留属性だけ", () => {
  it("distilledProfileToSignals は語彙内の蒸留 signal のみ返す（混入は drop）", () => {
    const out = distilledProfileToSignals({
      personRef: REF,
      consentScopeId: "scope_opaque_1",
      desireSignals: [sig(), sig({ category: "自由記述メモです" }), sig({ source: "sns_scrape" as never })],
      styleFitCategories: ["fashion", "raw_style_note"],
    });
    expect(out.map((s) => s.category).sort()).toEqual(["coffee", "fashion"]); // 語彙外は全て drop
    expect(out.every((s) => ["wishlist", "style_profile"].includes(s.source))).toBe(true);
  });
});

describe("A-6 (4) Tier B は構造化 dimension だけ", () => {
  it("interests/knownNeeds の語彙外は drop・knownNeeds=strong / interests=medium", () => {
    const out = partnerProfileToSignals({
      personRef: REF,
      relationKind: "friend",
      interests: ["coffee", "コーヒーが好きらしい"],
      knownNeeds: ["gadgets"],
    });
    expect(out).toHaveLength(2);
    expect(out.find((s) => s.category === "gadgets")!.strength).toBe("strong");
    expect(out.find((s) => s.category === "coffee")!.strength).toBe("medium");
    expect(out.every((s) => s.source === "manual_structured_hint")).toBe(true);
  });
});

describe("A-6 (5) free text / raw note / contact info を持たない", () => {
  it("sanitize が語彙外 category・未知 source・不正 enum を drop", () => {
    const out = sanitizeDesireSignals([
      sig(),
      sig({ category: "070-0000-0000" }),
      sig({ category: "lineid:abc" }),
      sig({ source: "raw_note" as never }),
      sig({ freshness: "yesterday" as never }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("coffee");
  });
});

describe("A-6 (6) freshness がスコアに効く / (7) wishlist=high / (8) stale は強く出ない", () => {
  it("(6) 同条件で fresh > recent > stale・half-life 境界", () => {
    const f = desireSignalScore(sanitizeDesireSignals([sig({ freshness: "fresh" })])[0]);
    const r = desireSignalScore(sanitizeDesireSignals([sig({ freshness: "recent" })])[0]);
    const s = desireSignalScore(sanitizeDesireSignals([sig({ freshness: "stale" })])[0]);
    expect(f).toBeGreaterThan(r);
    expect(r).toBeGreaterThan(s);
    expect(freshnessFromDaysSince(10)).toBe("fresh");
    expect(freshnessFromDaysSince(30)).toBe("recent");
    expect(freshnessFromDaysSince(90)).toBe("stale");
  });
  it("(7) wishlist は source 由来で high（入力 confidence を信用しない）", () => {
    const [s] = sanitizeDesireSignals([sig({ source: "wishlist", confidence: "low" })]);
    expect(s.confidence).toBe("high");
    const [h] = sanitizeDesireSignals([sig({ source: "recent_habit", confidence: "high" as const })]);
    expect(h.confidence).toBe("low"); // 推測系は低へ
  });
  it("(8) stale wishlist より fresh 推測が勝ち、stale 由来推薦は confidence=low", () => {
    const staleWish = sanitizeDesireSignals([sig({ source: "wishlist", freshness: "stale" })])[0];
    const freshHabit = sanitizeDesireSignals([sig({ source: "recent_habit", freshness: "fresh", category: "gaming" })])[0];
    expect(desireSignalScore(freshHabit)).toBeGreaterThan(desireSignalScore(staleWish)); // 0.4 > 0.2
    const recs = recommendGifts({ personRef: REF, frame: frame(), signals: [sig({ source: "wishlist", freshness: "stale" })] });
    const safe = recs.find((r) => r.strategy === "safe")!;
    expect(safe.confidence).toBe("low"); // 強く出さない
  });
});

describe("A-6 (9) do-not-suggest / mourning が推薦を抑制", () => {
  it("doNotSuggest / keepDistance → 空・mourning は祝い系のみ抑制", () => {
    expect(recommendGifts({ ...richInput(), suppression: { doNotSuggest: true } })).toEqual([]);
    expect(recommendGifts({ ...richInput(), suppression: { keepDistance: true } })).toEqual([]);
    expect(recommendGifts({ ...richInput(), suppression: { mourning: true } })).toEqual([]); // birthday=祝い系
    // mourning でもお礼（reciprocity）は許可
    expect(evaluateSuppression("thank_you_followup", { mourning: true }).allowed).toBe(true);
    expect(evaluateSuppression("birthday", { mourning: true }).reasonCode).toBe("mourning_suppression");
    // frequency cap は contact 群のみ
    expect(evaluateSuppression("casual_checkin", { recentTouchpointCount: FREQUENCY_CAP }).reasonCode).toBe("frequency_cap");
    expect(evaluateSuppression("birthday", { recentTouchpointCount: 9 }).allowed).toBe(true);
  });
});

describe("A-6 (10) N選 / (11) 戦略分散 / (12) 根拠コード由来", () => {
  it("(10) 既定で複数件・maxCount を超えない", () => {
    const recs = recommendGifts(richInput());
    expect(recs.length).toBeGreaterThanOrEqual(4);
    expect(recs.length).toBeLessThanOrEqual(5);
    expect(recommendGifts(richInput(), 3)).toHaveLength(3);
  });
  it("(11) safe / easy / surprise / experience が分散して出る", () => {
    const strategies = recommendGifts(richInput()).map((r) => r.strategy);
    for (const s of ["safe", "easy", "surprise", "experience"]) expect(strategies).toContain(s);
    expect(new Set(strategies).size).toBe(strategies.length); // 同戦略の重複なし
  });
  it("(12) 全推薦が reasonCodes を持ち、文言は code→定数のみ（未知 code は非表示）", () => {
    const recs = recommendGifts(richInput());
    for (const r of recs) {
      expect(r.reasonCodes.length).toBeGreaterThan(0);
      expect(r.reasonCodes).toContain("occasion_birthday");
      expect(giftReasonTexts(r.reasonCodes).length).toBeGreaterThan(0);
    }
    expect(giftReasonTexts(["unknown_code_xyz"])).toEqual([]);
    // wishlist 由来の safe は根拠に wishlist 文言
    const safe = recs.find((r) => r.strategy === "safe")!;
    expect(giftReasonTexts(safe.reasonCodes)).toContain("ご本人が欲しいものとして残している方向に沿っています");
  });
  it("過去贈答カテゴリは回避される（coffee を贈済 → どの推薦にもコーヒーが出ない）", () => {
    const recs = recommendGifts({ ...richInput(), pastGiftCategories: ["coffee"] });
    for (const r of recs) expect(r.productDescriptor).not.toContain("コーヒー"); // 代替なしなら戦略ごと省く
    expect(recs.length).toBeGreaterThan(0); // 他戦略は出続ける
  });
});

describe("A-6 (13) 相手の感情を推定しない", () => {
  it("全根拠文・偵察文が感情断定（喜ぶはず/必ず等）を含まない", () => {
    const recs = recommendGifts(richInput());
    for (const r of recs) for (const t of giftReasonTexts(r.reasonCodes)) expect(EMOTION_ASSERT.test(t)).toBe(false);
    for (const p of buildScoutingPrompts("birthday")) expect(EMOTION_ASSERT.test(p.promptText)).toBe(false);
  });
});

describe("A-6 (14) 自動送信 / 通知 / 購入 / 本文生成が blocked", () => {
  it("permission: max=suggest・blocked に全自動実行系・確認必須", () => {
    const p = assessRelationshipPermission();
    expect(p.maxAllowedAction).toBe("suggest");
    expect(p.requiresExplicitConfirmation).toBe(true);
    for (const a of ["auto_send", "auto_notify", "external_message", "purchase", "reservation", "draft_body_generation"]) {
      expect(p.blockedActions).toContain(a);
    }
    expect(RELATIONSHIP_BLOCKED_ACTIONS).toHaveLength(6);
  });
  it("下書きは構造のみ・bodyGeneration は literal blocked", () => {
    const d = buildContactDraftStructure("long_time_no_contact", "friend");
    expect(d.bodyGeneration).toBe("blocked");
    expect(d.cta).toBe("light_meet");
    expect(buildContactDraftStructure("thank_you_followup", "colleague").opener).toBe("gratitude");
    expect(buildContactDraftStructure("thank_you_followup", "colleague").tone).toBe("formal");
  });
});

describe("A-6 taxonomy / 既定予算", () => {
  it("touchpoint は 25 種・3 群", () => {
    expect(RELATIONSHIP_TOUCHPOINTS).toHaveLength(25);
    expect(listTouchpointsByGroup("celebration_gift")).toHaveLength(12);
    expect(listTouchpointsByGroup("reciprocity")).toHaveLength(6);
    expect(listTouchpointsByGroup("contact")).toHaveLength(7);
    expect(getTouchpointSpec("unknown_x")).toBeUndefined();
  });
  it("非 gift touchpoint では推薦しない・偵察は gift 対象のみ", () => {
    expect(recommendGifts({ ...richInput(), frame: { ...frame(), touchpointId: "casual_checkin" } })).toEqual([]);
    expect(buildScoutingPrompts("casual_checkin")).toEqual([]);
    expect(buildScoutingPrompts("birthday").length).toBeGreaterThan(0);
  });
  it("既定予算: 結婚=high・partner誕生日=high・お礼=low・fallback=middle", () => {
    expect(defaultBudgetBand("friend", "marriage")).toBe("high");
    expect(defaultBudgetBand("partner", "birthday")).toBe("high");
    expect(defaultBudgetBand("acquaintance", "birthday")).toBe("low");
    expect(defaultBudgetBand("colleague", "thank_you_followup")).toBe("low");
    expect(defaultBudgetBand("family", "visit_family")).toBe("middle");
  });
  it("pure: 同入力同出力", () => {
    expect(recommendGifts(richInput())).toEqual(recommendGifts(richInput()));
  });
});
