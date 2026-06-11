/**
 * Life Ops L-8a — Card Presenter（pure view-model）。
 *   非断定文言・actionLabel=maxAllowedAction・確認バッジ・医療注記・urgency 並べ替え・placeQuery 透過・pure。
 */
import { describe, it, expect } from "vitest";
import {
  toLifeOpsCardViewModel,
  toLifeOpsCardViewModels,
} from "@/lib/lifeops/card-presenter";
import { assessLifeOpsPermission } from "@/lib/lifeops/permission";
import { getCategorySpec, type LifeOpsCategoryId } from "@/lib/lifeops/category-model";
import type { DueReason, LifeOpsCandidate } from "@/lib/lifeops/candidate-types";

function cand(categoryId: LifeOpsCategoryId, dueReason: DueReason, over: Partial<LifeOpsCandidate> = {}): LifeOpsCandidate {
  const spec = getCategorySpec(categoryId)!;
  return {
    category: spec.id,
    menu: null,
    dueReason,
    suggestedWindow: null,
    placeQuery: spec.placeQueryHint,
    permissionLevelHint: spec.defaultMaxLevelHint,
    riskFlags: spec.typicalRiskFlags,
    ...over,
  };
}
function vm(c: LifeOpsCandidate) {
  return toLifeOpsCardViewModel(c, assessLifeOpsPermission(c));
}
const ASSERTIVE = /した方がいい|必ず|絶対|すべき|べきです|間違いなく/;

const cycleBeyond: DueReason = { kind: "cycle", elapsedDays: 45, typicalIntervalDays: 42, phase: "beyond_typical" };
const cycleWell: DueReason = { kind: "cycle", elapsedDays: 70, typicalIntervalDays: 42, phase: "well_beyond" };
const eventNearing: DueReason = { kind: "event_prep", eventKind: "interview", daysUntilEvent: 5, cyclePhase: "nearing", recommendedLeadDays: 3 };
const deadlineOverdue: DueReason = { kind: "deadline", daysUntilDeadline: -7, leadDays: 21, overdue: true };
const deadlineWithin: DueReason = { kind: "deadline", daysUntilDeadline: 8, leadDays: 30, overdue: false };

describe("L-8a reasonText — 非断定・dueReason 種別", () => {
  it("cycle: 前回からの日数と目安（well_beyond は超過表現）", () => {
    expect(vm(cand("beauty_salon", cycleBeyond)).reasonText).toBe("前回から45日（目安は約42日）");
    expect(vm(cand("beauty_salon", cycleWell)).reasonText).toContain("過ぎています");
  });
  it("event_prep: イベントとタイミング", () => {
    const v = vm(cand("eyebrow", eventNearing));
    expect(v.reasonText).toContain("5日後の面接に向けて");
    expect(v.reasonText).toContain("そろそろ整えるタイミング");
    expect(v.timingHint).toBe("3日前が自然です");
  });
  it("deadline: 超過/残日数", () => {
    expect(vm(cand("tax_filing", deadlineOverdue)).reasonText).toBe("期日を過ぎています");
    expect(vm(cand("license_renewal", deadlineWithin)).reasonText).toBe("期日まで8日です");
  });
  it("全文言が非断定（した方がいい/必ず/べき を含まない）", () => {
    for (const c of [cand("beauty_salon", cycleBeyond), cand("eyebrow", eventNearing), cand("tax_filing", deadlineOverdue)]) {
      const v = vm(c);
      expect(ASSERTIVE.test(v.reasonText)).toBe(false);
      expect(ASSERTIVE.test(v.actionLabel)).toBe(false);
      if (v.timingHint) expect(ASSERTIVE.test(v.timingHint)).toBe(false);
    }
  });
});

describe("L-8a actionLabel / 確認 / リスク注記", () => {
  it("actionLabel は maxAllowedAction に対応", () => {
    expect(vm(cand("beauty_salon", cycleBeyond)).actionLabel).toBe("予約ページへ進めます"); // open_link
    expect(vm(cand("groceries", cycleBeyond)).actionLabel).toBe("候補を出します"); // suggest
    expect(vm(cand("tax_filing", deadlineWithin)).actionLabel).toBe("お知らせします"); // notify
  });
  it("確認必須 → confirmationNote 提示", () => {
    const v = vm(cand("beauty_salon", cycleBeyond)); // appearance_change 等
    expect(v.requiresConfirmation).toBe(true);
    expect(v.confirmationNote).toBe("内容を確認してから進めます");
    expect(v.riskNotes).toEqual(expect.arrayContaining(["見た目が大きく変わります", "個人情報の入力があります"]));
  });
  it("確認不要 → confirmationNote null・riskNotes 空（買い物）", () => {
    const v = vm(cand("groceries", cycleBeyond));
    expect(v.requiresConfirmation).toBe(false);
    expect(v.confirmationNote).toBeNull();
    expect(v.riskNotes).toEqual([]);
  });
  it("医療は『健康に関わるため…』注記・候補止まり", () => {
    const v = vm(cand("dental", cycleBeyond));
    expect(v.riskNotes).toContain("健康に関わるため、提案までにします");
    expect(v.actionLabel).toBe("候補を出します"); // suggest cap
  });
  it("内部コード(level4_5_future_gated/confirmation_required)は riskNotes に出さない", () => {
    const v = vm(cand("beauty_salon", cycleBeyond));
    expect(v.riskNotes.join()).not.toContain("future_gated");
    expect(v.riskNotes.join()).not.toContain("confirmation_required");
  });
});

describe("L-8a urgency / 並べ替え / 透過 / pure", () => {
  it("urgency: 期限超過=overdue / 直近イベント=high / 周期=normal", () => {
    expect(vm(cand("tax_filing", deadlineOverdue)).urgency).toBe("overdue");
    expect(vm(cand("eyebrow", { kind: "event_prep", eventKind: "trip", daysUntilEvent: 2, cyclePhase: "nearing", recommendedLeadDays: 2 })).urgency).toBe("high");
    expect(vm(cand("beauty_salon", cycleBeyond)).urgency).toBe("normal");
  });
  it("toLifeOpsCardViewModels は overdue→high→normal 順（安定）", () => {
    const out = toLifeOpsCardViewModels([
      cand("beauty_salon", cycleBeyond), // normal
      cand("tax_filing", deadlineOverdue), // overdue
      cand("license_renewal", deadlineWithin), // high
    ]);
    expect(out.map((v) => v.urgency)).toEqual(["overdue", "high", "normal"]);
  });
  it("placeQuery 透過・同入力同出力（pure）", () => {
    const c = cand("beauty_salon", cycleBeyond);
    expect(vm(c).placeQuery).toBe("美容室");
    expect(toLifeOpsCardViewModel(c, assessLifeOpsPermission(c))).toEqual(toLifeOpsCardViewModel(c, assessLifeOpsPermission(c)));
  });
});

describe("L-8a bookingLinks 配線（L-6 deep-link → card）", () => {
  it("美容院(open_link 許可)→ hotpepper+google の実リンク", () => {
    const links = vm(cand("beauty_salon", cycleBeyond)).bookingLinks;
    expect(links.map((l) => l.platform)).toEqual(["hotpepper_beauty", "google_maps"]);
    expect(links[0].url).toContain("beauty.hotpepper.jp");
    expect(links[1].url).toContain("google.com/maps");
  });
  it("area を deep-link に反映", () => {
    const c = cand("eyebrow", cycleBeyond);
    const links = toLifeOpsCardViewModel(c, assessLifeOpsPermission(c), { area: "新宿" }).bookingLinks;
    expect(links[0].url).toContain(encodeURIComponent("眉サロン 新宿"));
  });
  it("事務/買い物/医療 → bookingLinks 空（card は fallback ラベル）", () => {
    expect(vm(cand("tax_filing", deadlineWithin)).bookingLinks).toEqual([]);
    expect(vm(cand("groceries", cycleBeyond)).bookingLinks).toEqual([]);
    expect(vm(cand("dental", cycleBeyond)).bookingLinks).toEqual([]);
  });
});
