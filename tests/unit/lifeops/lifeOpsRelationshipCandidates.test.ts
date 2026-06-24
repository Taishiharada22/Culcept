/**
 * Life Ops A-6 — Relationship Candidate Generator（pure）。CEO 指定 18 項目を固定。
 *   touchpoint candidate が主・gift は optional・suppression fail-closed・低圧 redacted・collector 末尾合流。
 */
import { describe, it, expect } from "vitest";
import {
  generateRelationshipCandidates,
  isWithinPostEventWindow,
  type RelationshipObservation,
} from "@/lib/lifeops/relationship-candidates";
import { collectLifeOpsCandidates } from "@/lib/lifeops/candidate-collector";
import { toLifeOpsCardViewModel } from "@/lib/lifeops/card-presenter";
import { assessLifeOpsPermission } from "@/lib/lifeops/permission";
import { assessRelationshipPermission } from "@/lib/lifeops/relationship-model";
import type { DesireSignal } from "@/lib/lifeops/gift-intelligence";

const NOW = "2026-06-12T00:00:00Z";
const REF = "p_friend_001";

function obs(over: Partial<RelationshipObservation> = {}): RelationshipObservation {
  return { personRef: REF, relationKind: "close_friend", touchpointId: "birthday", dateISO: "1996-06-15", ...over };
}
const wishlistSignal: DesireSignal = { source: "wishlist", category: "coffee", freshness: "fresh", strength: "strong", confidence: "high" };
// 送信誘導・感情推定・断定の NG 語彙（CEO 指定）
const NG = /今すぐ|送信|寂しが|関係が悪|必ず|喜びます/;

function vm(c: ReturnType<typeof generateRelationshipCandidates>[number]) {
  return toLifeOpsCardViewModel(c, assessLifeOpsPermission(c));
}

describe("A-6 (1)(2) annual touchpoint の候補化", () => {
  it("(1) birthday: 記念日(6/15)が 3 日後 → 候補化・daysUntil=3", () => {
    const [c] = generateRelationshipCandidates([obs()], NOW);
    expect(c).toBeDefined();
    expect(c.category).toBe("relationship_care");
    if (c.dueReason.kind === "relationship") {
      expect(c.dueReason.touchpointId).toBe("birthday");
      expect(c.dueReason.daysUntil).toBe(3);
    }
  });
  it("(2) anniversary も同様・lead(7日)外なら候補化しない", () => {
    const [c] = generateRelationshipCandidates([obs({ touchpointId: "anniversary", dateISO: "2020-06-18" })], NOW);
    expect(c.dueReason.kind).toBe("relationship");
    expect(generateRelationshipCandidates([obs({ dateISO: "1996-08-01" })], NOW)).toEqual([]); // 50日先
  });
});

describe("A-6 (3) cadence / (4) followup / (5) post-event", () => {
  it("(3) long_time_no_contact: close_friend 閾値60日超で候補化・未満は出ない", () => {
    const hit = generateRelationshipCandidates([obs({ touchpointId: "long_time_no_contact", dateISO: undefined, daysSinceLastContact: 75 })], NOW);
    expect(hit).toHaveLength(1);
    if (hit[0].dueReason.kind === "relationship") expect(hit[0].dueReason.daysSince).toBe(75);
    expect(generateRelationshipCandidates([obs({ touchpointId: "long_time_no_contact", dateISO: undefined, daysSinceLastContact: 30 })], NOW)).toEqual([]);
  });
  it("(4) thank_you_followup: 期限3日前以内 or overdue で候補化", () => {
    const near = generateRelationshipCandidates([obs({ touchpointId: "thank_you_followup", dateISO: undefined, followupDueISO: "2026-06-14" })], NOW);
    expect(near).toHaveLength(1);
    const over = generateRelationshipCandidates([obs({ touchpointId: "thank_you_followup", dateISO: undefined, followupDueISO: "2026-06-10" })], NOW);
    if (over[0].dueReason.kind === "relationship") expect(over[0].dueReason.overdue).toBe(true);
    expect(generateRelationshipCandidates([obs({ touchpointId: "thank_you_followup", dateISO: undefined, followupDueISO: "2026-06-30" })], NOW)).toEqual([]);
  });
  it("(5) post_event_result_check: 終了後 1〜5 日の window 内のみ", () => {
    expect(generateRelationshipCandidates([obs({ touchpointId: "post_event_result_check", dateISO: "2026-06-10" })], NOW)).toHaveLength(1); // 2日後
    expect(generateRelationshipCandidates([obs({ touchpointId: "post_event_result_check", dateISO: "2026-06-12" })], NOW)).toEqual([]); // 当日(min1)
    expect(generateRelationshipCandidates([obs({ touchpointId: "post_event_result_check", dateISO: "2026-06-01" })], NOW)).toEqual([]); // 11日前(max5超)
    expect(isWithinPostEventWindow("2026-06-10", NOW, 1, 5)).toBe(true);
    expect(isWithinPostEventWindow("broken", NOW, 1, 5)).toBe(false);
  });
});

describe("A-6 (6)(7)(8)(9)(10) fail-closed / suppression", () => {
  it("(6) invalid personRef（email/実名）は候補化されない", () => {
    expect(generateRelationshipCandidates([obs({ personRef: "tanaka@example.com" })], NOW)).toEqual([]);
    expect(generateRelationshipCandidates([obs({ personRef: "田中太郎" })], NOW)).toEqual([]);
  });
  it("(7) do_not_suggest では候補 0", () => {
    expect(generateRelationshipCandidates([obs({ suppression: { doNotSuggest: true } })], NOW)).toEqual([]);
  });
  it("(8) mourning 中は celebration gift（birthday）が候補化されない", () => {
    expect(generateRelationshipCandidates([obs({ suppression: { mourning: true } })], NOW)).toEqual([]);
  });
  it("(9) thank_you 系は mourning でも許可される", () => {
    const out = generateRelationshipCandidates(
      [obs({ touchpointId: "thank_you_followup", dateISO: undefined, followupDueISO: "2026-06-13", suppression: { mourning: true } })],
      NOW,
    );
    expect(out).toHaveLength(1);
  });
  it("(10) frequency cap で contact 系が抑制される", () => {
    expect(
      generateRelationshipCandidates(
        [obs({ touchpointId: "long_time_no_contact", dateISO: undefined, daysSinceLastContact: 100, suppression: { recentTouchpointCount: 3 } })],
        NOW,
      ),
    ).toEqual([]);
  });
});

describe("A-6 (11)(12) gift optional metadata", () => {
  it("(11) gift touchpoint に signal があれば giftRecommendations（最大3）が付く", () => {
    const [c] = generateRelationshipCandidates([obs({ desireSignals: [wishlistSignal] })], NOW);
    if (c.dueReason.kind === "relationship") {
      expect(c.dueReason.giftRecommendations).toBeDefined();
      expect(c.dueReason.giftRecommendations!.length).toBeGreaterThan(0);
      expect(c.dueReason.giftRecommendations!.length).toBeLessThanOrEqual(3);
    }
  });
  it("(12) signal がなければ gift なしでも touchpoint candidate は成立", () => {
    const [c] = generateRelationshipCandidates([obs()], NOW);
    expect(c).toBeDefined();
    if (c.dueReason.kind === "relationship") expect(c.dueReason.giftRecommendations).toBeUndefined();
  });
  it("全 low-confidence（stale のみ）の gift は添付しない（candidate は残る）", () => {
    const stale: DesireSignal = { ...wishlistSignal, freshness: "stale" };
    const [c] = generateRelationshipCandidates([obs({ desireSignals: [stale] })], NOW);
    expect(c).toBeDefined();
    if (c.dueReason.kind === "relationship") expect(c.dueReason.giftRecommendations).toBeUndefined();
  });
});

describe("A-6 (13)(14) presenter redaction / 低圧", () => {
  it("(13) personRef / raw identity が presenter に出ない・title は touchpoint label", () => {
    const [c] = generateRelationshipCandidates([obs({ desireSignals: [wishlistSignal] })], NOW);
    const v = vm(c);
    expect(v.title).toBe("誕生日");
    for (const text of [v.title, v.reasonText, v.timingHint ?? "", v.actionLabel]) expect(text).not.toContain(REF);
  });
  it("(14) 感情推定・送信誘導の文言が出ない（全 touchpoint）", () => {
    const cases = generateRelationshipCandidates(
      [
        obs(),
        obs({ touchpointId: "long_time_no_contact", dateISO: undefined, daysSinceLastContact: 100 }),
        obs({ touchpointId: "thank_you_followup", dateISO: undefined, followupDueISO: "2026-06-10" }), // overdue
        obs({ touchpointId: "pre_event_encouragement", dateISO: "2026-06-13" }),
        obs({ touchpointId: "post_event_result_check", dateISO: "2026-06-10" }),
      ],
      NOW,
    );
    expect(cases.length).toBe(5);
    for (const c of cases) {
      const v = vm(c);
      expect(NG.test(v.reasonText)).toBe(false);
      if (v.timingHint) expect(NG.test(v.timingHint)).toBe(false);
    }
    // 文言例の確認（低圧）
    expect(vm(cases[1]).reasonText).toBe("最近少し間が空いています。軽く近況を思い出しておくと自然です");
    expect(vm(cases[2]).reasonText).toBe("お礼を一言だけ整えておくと、気持ちよく区切れます");
  });
  it("gift 添付時のみ控えめな案内が補足行に出る（商品名は出さない）", () => {
    const [withGift] = generateRelationshipCandidates([obs({ desireSignals: [wishlistSignal] })], NOW);
    expect(vm(withGift).timingHint).toBe("相手の最近の関心に沿った贈り物の候補を用意できます");
    expect(vm(withGift).timingHint).not.toContain("コーヒー");
    const [noGift] = generateRelationshipCandidates([obs()], NOW);
    expect(vm(noGift).timingHint).toBeNull();
  });
});

describe("A-6 (15) blocked actions / (16) collector 合流", () => {
  it("(15) auto_send / purchase / draft_body_generation が blocked（正本=assessRelationshipPermission）", () => {
    const p = assessRelationshipPermission();
    for (const a of ["auto_send", "auto_notify", "external_message", "purchase", "reservation", "draft_body_generation"]) {
      expect(p.blockedActions).toContain(a);
    }
    expect(p.maxAllowedAction).toBe("suggest");
  });
  it("(16) collector に合流し、deadline を押しのけず末尾寄り・人物×接点ごとに dedup されない", () => {
    const out = collectLifeOpsCandidates(
      {
        deadlineObservations: [{ categoryId: "tax_filing", deadlineISO: "2026-06-05" }], // overdue
        relationshipObservations: [
          obs(),
          obs({ personRef: "p_friend_002", touchpointId: "thank_you_followup", dateISO: undefined, followupDueISO: "2026-06-13" }),
        ],
      },
      NOW,
    );
    expect(out[0].category).toBe("tax_filing"); // deadline が先頭のまま
    const rel = out.filter((c) => c.category === "relationship_care");
    expect(rel).toHaveLength(2); // 人物×接点で独立（dedup key 拡張）
    expect(out.indexOf(rel[0])).toBeGreaterThan(out.indexOf(out[0])); // 末尾寄り
  });
  it("pure: 同入力同出力", () => {
    const i = [obs({ desireSignals: [wishlistSignal] })];
    expect(generateRelationshipCandidates(i, NOW)).toEqual(generateRelationshipCandidates(i, NOW));
  });
});
