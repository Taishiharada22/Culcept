/**
 * Life Ops L-7 — Permission Layer（pure）。
 *   「勝手に予約/購入/連絡/送信しない」を全カテゴリで固定・医療/admin/準備の自動禁止・確認必須・L4/L5 future-gated。
 */
import { describe, it, expect } from "vitest";
import {
  assessLifeOpsPermission,
  isActionAllowed,
  type LifeOpsAction,
} from "@/lib/lifeops/permission";
import { listCategories, getCategorySpec, type LifeOpsCategoryId } from "@/lib/lifeops/category-model";
import type { LifeOpsCandidate } from "@/lib/lifeops/candidate-types";

/** L-1 spec から candidate を作る（permission は hint+risk のみ参照）。 */
function candFor(id: LifeOpsCategoryId, over: Partial<LifeOpsCandidate> = {}): LifeOpsCandidate {
  const spec = getCategorySpec(id)!;
  return {
    category: spec.id,
    menu: null,
    dueReason: { kind: "cycle", elapsedDays: 1, typicalIntervalDays: 1, phase: "beyond_typical" },
    suggestedWindow: null,
    placeQuery: spec.placeQueryHint,
    permissionLevelHint: spec.defaultMaxLevelHint,
    riskFlags: spec.typicalRiskFlags,
    ...over,
  };
}
const ACTIONS: readonly LifeOpsAction[] = ["observe", "notify", "suggest", "open_link", "assist_input", "auto_execute"];

describe("L-7 「勝手にやらない」を全カテゴリで固定（最重要・安全不変）", () => {
  it("全 20 カテゴリ: auto_execute / assist_input は blocked・許可されない", () => {
    for (const spec of listCategories()) {
      const a = assessLifeOpsPermission(candFor(spec.id));
      expect(a.blockedActions).toEqual(["assist_input", "auto_execute"]);
      expect(isActionAllowed("auto_execute", a)).toBe(false); // 自動予約/購入/送信しない
      expect(isActionAllowed("assist_input", a)).toBe(false); // フォーム自動入力しない
    }
  });
  it("全 20 カテゴリ: maxAllowedAction は open_link(L3)以下（L4/L5 を超えない）", () => {
    const RANK: Record<LifeOpsAction, number> = { observe: 0, notify: 1, suggest: 2, open_link: 3, assist_input: 4, auto_execute: 5 };
    for (const spec of listCategories()) {
      const a = assessLifeOpsPermission(candFor(spec.id));
      expect(RANK[a.maxAllowedAction]).toBeLessThanOrEqual(RANK.open_link);
    }
  });
});

describe("L-7 医療 / admin / 準備の自動禁止と上限", () => {
  it("医療(health_sensitive)は suggest 以下・確認必須・自動禁止", () => {
    for (const id of ["dental", "health_check", "eye_care", "medication"] as LifeOpsCategoryId[]) {
      const a = assessLifeOpsPermission(candFor(id));
      expect(["observe", "notify", "suggest"]).toContain(a.maxAllowedAction); // open_link 出さない
      expect(a.requiresExplicitConfirmation).toBe(true);
      expect(a.reasonCodes).toContain("medical_no_auto_suggest_cap");
      expect(isActionAllowed("open_link", a)).toBe(false); // 医療は予約導線も出さない
    }
  });
  it("admin(事務)は notify 止まり・自動禁止", () => {
    for (const id of ["license_renewal", "passport_renewal", "tax_filing"] as LifeOpsCategoryId[]) {
      const a = assessLifeOpsPermission(candFor(id));
      expect(a.maxAllowedAction).toBe("notify");
      expect(isActionAllowed("open_link", a)).toBe(false);
    }
  });
  it("準備(服/資料/荷造り)は notify 止まり", () => {
    expect(assessLifeOpsPermission(candFor("outfit_prep")).maxAllowedAction).toBe("notify");
    expect(assessLifeOpsPermission(candFor("packing")).maxAllowedAction).toBe("notify");
  });
});

describe("L-7 美容 / 買い物の帰結", () => {
  it("美容院: open_link まで・確認必須(appearance_change/nomination)", () => {
    const a = assessLifeOpsPermission(candFor("beauty_salon"));
    expect(a.maxAllowedAction).toBe("open_link");
    expect(a.requiresExplicitConfirmation).toBe(true);
    expect(a.reasonCodes).toEqual(expect.arrayContaining(["risk_appearance_change", "risk_nomination", "confirmation_required"]));
    expect(isActionAllowed("open_link", a)).toBe(true); // 予約導線への誘導は可
    expect(isActionAllowed("auto_execute", a)).toBe(false); // でも自動はしない
  });
  it("脱毛: 金銭 risk で確認必須・自動禁止", () => {
    const a = assessLifeOpsPermission(candFor("hair_removal"));
    expect(a.requiresExplicitConfirmation).toBe(true);
    expect(a.reasonCodes).toEqual(expect.arrayContaining(["risk_high_cost", "risk_cancellation_fee", "risk_card_required"]));
    expect(isActionAllowed("auto_execute", a)).toBe(false);
  });
  it("買い物: suggest 止まり・確認不要", () => {
    const a = assessLifeOpsPermission(candFor("groceries"));
    expect(a.maxAllowedAction).toBe("suggest");
    expect(a.requiresExplicitConfirmation).toBe(false);
    expect(a.reasonCodes).toEqual([]);
  });
});

describe("L-7 L4/L5 future-gated・isActionAllowed 境界", () => {
  it("hint L5 を与えても open_link に cap・level4_5_future_gated", () => {
    const a = assessLifeOpsPermission(candFor("beauty_salon", { permissionLevelHint: "L5", riskFlags: [] }));
    expect(a.maxAllowedAction).toBe("open_link");
    expect(a.reasonCodes).toContain("level4_5_future_gated");
    expect(isActionAllowed("auto_execute", a)).toBe(false);
  });
  it("isActionAllowed: max=suggest なら observe/notify/suggest 可・open_link 以上不可", () => {
    const a = assessLifeOpsPermission(candFor("dental")); // suggest cap
    expect(isActionAllowed("observe", a)).toBe(true);
    expect(isActionAllowed("notify", a)).toBe(true);
    expect(isActionAllowed("suggest", a)).toBe(true);
    expect(isActionAllowed("open_link", a)).toBe(false);
  });
  it("pure: 同入力同出力・reasonCodes に重複なし", () => {
    const c = candFor("beauty_salon");
    expect(assessLifeOpsPermission(c)).toEqual(assessLifeOpsPermission(c));
    const a = assessLifeOpsPermission(c);
    expect(new Set(a.reasonCodes).size).toBe(a.reasonCodes.length);
  });
  it("全 action が ACTIONS の範囲（型健全）", () => {
    const a = assessLifeOpsPermission(candFor("beauty_salon"));
    expect(ACTIONS).toContain(a.maxAllowedAction);
    for (const b of a.blockedActions) expect(ACTIONS).toContain(b);
  });
});
