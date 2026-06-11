/**
 * Life Ops L-1 — 生活行動カテゴリ模型（pure 辞書）。
 *   body_appearance 10 + pre_event_prep 5・MVP=美容院/眉のみ・level は L0–L5・health_sensitive は医療4つだけ・runtime 防御。
 */
import { describe, it, expect } from "vitest";
import {
  LIFE_OPS_CATEGORY_MODEL,
  getCategorySpec,
  listCategories,
  listMvpCategories,
  listByGroup,
  isHealthSensitive,
  type LifeOpsCategorySpec,
  type LifeOpsDefaultMaxLevelHint,
} from "@/lib/lifeops/category-model";

const LEVELS: readonly LifeOpsDefaultMaxLevelHint[] = ["L0", "L1", "L2", "L3", "L4", "L5"];
const MEDICAL = ["dental", "health_check", "eye_care", "medication"];
const COSMETIC = ["beauty_salon", "eyebrow", "nail", "eyelash", "hair_removal", "bodywork"];

describe("L-1 カテゴリ模型 — 構造", () => {
  it("各 spec は label 非空・id は辞書 key と一致・group は既定群", () => {
    const GROUPS = new Set(["body_appearance", "pre_event_prep", "daily_upkeep", "money_admin", "growth"]); // L-1 で spec 定義済の群
    for (const s of listCategories()) {
      expect(GROUPS.has(s.group)).toBe(true);
      expect(s.label.length).toBeGreaterThan(0);
      expect(LIFE_OPS_CATEGORY_MODEL[s.id]).toBe(s);
    }
  });
  it("辞書と一覧は同数（31 = 身体外見10 + 予定前準備5 + 生活維持5 + 事務6 + 成長5・重複なし）", () => {
    const ids = listCategories().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(31);
    expect(Object.keys(LIFE_OPS_CATEGORY_MODEL)).toHaveLength(ids.length);
  });
  it("defaultMaxLevelHint は L0–L5 のいずれか", () => {
    for (const s of listCategories()) expect(LEVELS).toContain(s.defaultMaxLevelHint);
  });
  it("placeQueryHint は文字列 or null（外部 API を示唆しない）", () => {
    for (const s of listCategories()) {
      expect(s.placeQueryHint === null || typeof s.placeQueryHint === "string").toBe(true);
    }
    expect(getCategorySpec("medication")!.placeQueryHint).toBeNull(); // 補充は店舗検索なし
  });
});

describe("L-1 MVP は美容院・眉のみ（A.9）", () => {
  it("listMvpCategories = beauty_salon / eyebrow の 2 件", () => {
    expect(listMvpCategories().map((s) => s.id).sort()).toEqual(["beauty_salon", "eyebrow"]);
  });
  it("それ以外は mvp=false（語彙定義だけ）", () => {
    for (const s of listCategories()) {
      if (s.id !== "beauty_salon" && s.id !== "eyebrow") expect(s.mvp).toBe(false);
    }
  });
});

describe("L-1 health_sensitive は医療系のみ", () => {
  it("医療 4 つに立つ", () => {
    for (const id of MEDICAL) expect(isHealthSensitive(id)).toBe(true);
  });
  it("美容/wellness には立たない", () => {
    for (const id of COSMETIC) expect(isHealthSensitive(id)).toBe(false);
  });
});

describe("L-1 実行レベルヒント — cosmetic=L3 / medical=L1–2 分離", () => {
  it("美容/wellness は L3（予約導線可・riskFlag が auto 阻止）", () => {
    for (const id of COSMETIC) expect(getCategorySpec(id)!.defaultMaxLevelHint).toBe("L3");
  });
  it("医療は L1–L2（通知/候補のみ）", () => {
    expect(getCategorySpec("dental")!.defaultMaxLevelHint).toBe("L2");
    expect(getCategorySpec("eye_care")!.defaultMaxLevelHint).toBe("L2");
    expect(getCategorySpec("health_check")!.defaultMaxLevelHint).toBe("L1");
    expect(getCategorySpec("medication")!.defaultMaxLevelHint).toBe("L1");
  });
});

describe("L-1 安全リスクフラグ（A.4）", () => {
  it("美容院に外見変更・指名、脱毛にキャンセル料・高額", () => {
    const salon = getCategorySpec("beauty_salon")!.typicalRiskFlags;
    expect(salon).toContain("appearance_change");
    expect(salon).toContain("nomination");
    const epi = getCategorySpec("hair_removal")!.typicalRiskFlags;
    expect(epi).toEqual(expect.arrayContaining(["high_cost", "cancellation_fee", "card_required"]));
  });
});

describe("L-1 helper — runtime 防御", () => {
  it("getCategorySpec(未知 id) = undefined・isHealthSensitive(未知)=false", () => {
    expect(getCategorySpec("unknown_xyz")).toBeUndefined();
    expect(getCategorySpec("")).toBeUndefined();
    expect(isHealthSensitive("unknown_xyz")).toBe(false);
  });
  it("listByGroup: body_appearance=10 / pre_event_prep=5 / daily_upkeep=5 / money_admin=6 / 未定義群は空", () => {
    expect(listByGroup("body_appearance")).toHaveLength(10);
    expect(listByGroup("pre_event_prep")).toHaveLength(5);
    expect(listByGroup("daily_upkeep")).toHaveLength(5); // 補充2 + 家事(洗濯/掃除/ゴミ出し)3
    expect(listByGroup("money_admin")).toHaveLength(6); // deadline 3 + recurring 3
    expect(listByGroup("growth")).toHaveLength(5); // 筋トレ/勉強/読書/週次レビュー/スキル練習
    expect(listByGroup("relationship")).toEqual([]); // 未定義群（関係は未着手）
  });
  it("cyclic: 身体外見メンテ=true / 予定前準備・事務=false / 生活維持は混在(補充・洗濯掃除=true・ゴミ出し=false)", () => {
    for (const s of listByGroup("body_appearance")) expect(s.cyclic).toBe(true);
    for (const s of listByGroup("pre_event_prep")) expect(s.cyclic).toBe(false);
    for (const s of listByGroup("money_admin")) expect(s.cyclic).toBe(false);
    expect(getCategorySpec("laundry")!.cyclic).toBe(true);
    expect(getCategorySpec("groceries")!.cyclic).toBe(true);
    expect(getCategorySpec("garbage")!.cyclic).toBe(false); // weekly recurring
  });
  it("daily_upkeep（買い物/日用品）は L2・placeQuery あり・risk なし", () => {
    const groceries = getCategorySpec("groceries")!;
    expect(groceries.group).toBe("daily_upkeep");
    expect(groceries.defaultMaxLevelHint).toBe("L2");
    expect(groceries.placeQueryHint).toBe("スーパー");
    expect(groceries.typicalRiskFlags).toEqual([]);
    expect(getCategorySpec("daily_necessities")!.placeQueryHint).toBe("ドラッグストア");
  });
});

// 型の satisfies チェック（spec 形が崩れていないこと）
describe("L-1 型整合", () => {
  it("spec は LifeOpsCategorySpec を満たす", () => {
    const s: LifeOpsCategorySpec = getCategorySpec("beauty_salon")!;
    expect(s.id).toBe("beauty_salon");
  });
});
