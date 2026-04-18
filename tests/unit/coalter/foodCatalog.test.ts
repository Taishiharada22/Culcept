/**
 * CoAlter Phase B Commit 1: foodCatalog.parseFoodVenues 回帰テスト
 *
 * 不変条件:
 *   1. name 抽出失敗 venue は出力に含まれない（hard drop ゲート）
 *   2. candidateId は stable material のみから生成（snippet / URL path 非依存）
 *   3. 同一店舗が別 search で出ても同一 candidateId
 *   4. 全半角違い（「焼肉 ABC」vs「焼肉ＡＢＣ」）は同一 candidateId に寄る
 *   5. 駅 fallback: station が null なら area を使う
 *   6. confidence: name 単独 = 0.0、全フィールド + 既知ドメイン = 1.0（上限）
 *   7. FoodVenue は entity として ActivityCandidate.entity に入る（extends ではない）
 */

import { describe, it, expect } from "vitest";

import {
  parseFoodVenues,
  extractFoodVenueName,
  extractStation,
  extractArea,
  extractPriceBand,
  extractOpeningHours,
  extractSourceDomain,
  normalizeForId,
  makeFoodCandidateId,
} from "@/lib/coalter/foodCatalog";
import type { SearchCandidate } from "@/lib/coalter/types";

// ──────────── helpers ────────────

function sc(overrides: Partial<SearchCandidate>): SearchCandidate {
  return {
    title: "",
    description: "",
    externalRating: null,
    practicalInfo: null,
    source: "tabelog",
    url: "https://tabelog.com/tokyo/xxxx",
    ...overrides,
  };
}

// ──────────── 抽出ヘルパ ────────────

describe("extractFoodVenueName", () => {
  it("『店名』の括弧から抽出", () => {
    expect(extractFoodVenueName("『焼肉ABC』渋谷店 - 食べログ", "")).toBe("焼肉ABC");
  });

  it("パイプ分割で食べログ meta を除外", () => {
    expect(extractFoodVenueName("焼肉ABC 渋谷店 | 食べログ", "")).toBe(
      "焼肉ABC 渋谷店",
    );
  });

  it("ハイフン区切りで meta を除外", () => {
    expect(extractFoodVenueName("鮨 かねさか - Retty", "")).toBe("鮨 かねさか");
  });

  it("listicle タイトルは弾く", () => {
    expect(
      extractFoodVenueName("渋谷のおすすめ居酒屋10選 | 食べログ", ""),
    ).toBeNull();
  });

  it("ジャンル名単体は弾く", () => {
    expect(extractFoodVenueName("焼肉", "")).toBeNull();
  });

  it("30 文字超は弾く", () => {
    expect(
      extractFoodVenueName("a".repeat(50), ""),
    ).toBeNull();
  });
});

describe("extractStation", () => {
  it("〇〇駅 のみ", () => {
    expect(extractStation("渋谷駅徒歩5分")).toBe("渋谷駅");
  });

  it("出口付き", () => {
    expect(extractStation("新宿駅東口より3分")).toBe("新宿駅東口");
  });

  it("駅が無ければ null", () => {
    expect(extractStation("渋谷区道玄坂1-2-3")).toBeNull();
  });
});

describe("extractArea", () => {
  it("主要エリア名", () => {
    expect(extractArea("西麻布の隠れ家")).toBe("西麻布");
    expect(extractArea("代官山ヒルサイド")).toBe("代官山");
  });

  it("区 + 町名", () => {
    expect(extractArea("渋谷区道玄坂")).toContain("渋谷区");
  });

  it("未知エリアは null", () => {
    expect(extractArea("どこかの知らない町")).toBeNull();
  });
});

describe("extractPriceBand", () => {
  it("¥ レンジ", () => {
    expect(extractPriceBand("¥3,000〜¥3,999")).toBe("¥3,000〜¥3,999");
  });

  it("円 レンジ", () => {
    expect(extractPriceBand("3,000円〜4,000円")).toBe("3,000円〜4,000円");
  });

  it("予算", () => {
    expect(extractPriceBand("平均予算 5,000 円")).toContain("5,000");
  });

  it("該当なし → null", () => {
    expect(extractPriceBand("おすすめの店")).toBeNull();
  });
});

describe("extractOpeningHours", () => {
  it("17:00〜24:00", () => {
    expect(extractOpeningHours("営業時間 17:00〜24:00")).toBe("17:00〜24:00");
  });

  it("HH:MM-HH:MM", () => {
    expect(extractOpeningHours("11:30-14:30 ランチ")).toBe("11:30〜14:30");
  });

  it("時刻なしは null", () => {
    expect(extractOpeningHours("定休日：月曜")).toBeNull();
  });
});

describe("extractSourceDomain", () => {
  it("hostname を返す（www 剥離）", () => {
    expect(extractSourceDomain("https://www.tabelog.com/tokyo/abc")).toBe(
      "tabelog.com",
    );
  });

  it("null は空文字", () => {
    expect(extractSourceDomain(null)).toBe("");
  });

  it("不正 URL は空文字", () => {
    expect(extractSourceDomain("not a url")).toBe("");
  });
});

// ──────────── normalizeForId ────────────

describe("normalizeForId", () => {
  it("全半角を統一", () => {
    expect(normalizeForId("焼肉ＡＢＣ")).toBe(normalizeForId("焼肉ABC"));
  });

  it("空白を除去", () => {
    expect(normalizeForId("焼肉 ABC")).toBe(normalizeForId("焼肉ABC"));
  });

  it("駅サフィックス剥離", () => {
    expect(normalizeForId("渋谷駅")).toBe(normalizeForId("渋谷"));
  });

  it("記号を除去", () => {
    expect(normalizeForId("『焼肉・ABC』")).toBe(normalizeForId("焼肉ABC"));
  });

  it("null / undefined は空文字", () => {
    expect(normalizeForId(null)).toBe("");
    expect(normalizeForId(undefined)).toBe("");
  });
});

// ──────────── makeFoodCandidateId ────────────

describe("makeFoodCandidateId", () => {
  it("全半角違いでも同一 ID に寄る", () => {
    const a = makeFoodCandidateId({
      sourceDomain: "tabelog.com",
      name: "焼肉 ABC",
      station: "渋谷駅",
      area: null,
    });
    const b = makeFoodCandidateId({
      sourceDomain: "tabelog.com",
      name: "焼肉ＡＢＣ",
      station: "渋谷",
      area: null,
    });
    expect(a).toBe(b);
  });

  it("station null のとき area が fallback", () => {
    const a = makeFoodCandidateId({
      sourceDomain: "tabelog.com",
      name: "焼肉ABC",
      station: null,
      area: "渋谷",
    });
    const b = makeFoodCandidateId({
      sourceDomain: "tabelog.com",
      name: "焼肉ABC",
      station: "渋谷駅",
      area: null,
    });
    expect(a).toBe(b);
  });

  it("sourceDomain が違えば別 ID（cross-source dedup は非対象）", () => {
    const a = makeFoodCandidateId({
      sourceDomain: "tabelog.com",
      name: "焼肉ABC",
      station: "渋谷駅",
      area: null,
    });
    const b = makeFoodCandidateId({
      sourceDomain: "retty.me",
      name: "焼肉ABC",
      station: "渋谷駅",
      area: null,
    });
    expect(a).not.toBe(b);
  });

  it("name が違えば別 ID", () => {
    const a = makeFoodCandidateId({
      sourceDomain: "tabelog.com",
      name: "焼肉ABC",
      station: "渋谷駅",
      area: null,
    });
    const b = makeFoodCandidateId({
      sourceDomain: "tabelog.com",
      name: "焼肉XYZ",
      station: "渋谷駅",
      area: null,
    });
    expect(a).not.toBe(b);
  });
});

// ──────────── parseFoodVenues: メインゲート ────────────

describe("parseFoodVenues: name 必須ゲート", () => {
  it("store name 取れない venue は出力に含まれない", () => {
    const input: SearchCandidate[] = [
      sc({
        title: "渋谷のおすすめ居酒屋10選",
        description: "人気店を紹介！",
        url: "https://example.com/listicle",
      }),
      sc({
        title: "『焼肉ABC』渋谷店",
        description: "渋谷駅徒歩5分、¥3,000〜¥4,000",
        url: "https://tabelog.com/tokyo/A1303/A130301/13012345/",
      }),
    ];
    const out = parseFoodVenues(input);
    // listicle は drop、焼肉ABC のみ残る
    expect(out.length).toBe(1);
    expect(out[0].entity.name).toBe("焼肉ABC");
  });

  it("全 venue が name なしなら空 catalog", () => {
    const input: SearchCandidate[] = [
      sc({
        title: "東京グルメランキング",
        description: "今週のランキング発表",
      }),
    ];
    expect(parseFoodVenues(input).length).toBe(0);
  });
});

// ──────────── parseFoodVenues: entity composition ────────────

describe("parseFoodVenues: FoodVenue は entity として入る（extends ではない）", () => {
  it("ActivityCandidate に candidateId / entity / domain がある", () => {
    const input: SearchCandidate[] = [
      sc({
        title: "『焼肉ABC』渋谷店 - 食べログ",
        description: "渋谷駅徒歩5分 ¥3,000〜¥3,999 食べログ 3.52 営業 17:00〜24:00",
        url: "https://tabelog.com/tokyo/xxxx",
      }),
    ];
    const out = parseFoodVenues(input);
    expect(out.length).toBe(1);
    const c = out[0];
    expect(c.domain).toBe("food");
    expect(c.candidateId).toContain("food:tabelog.com");
    expect(c.entity.name).toBe("焼肉ABC");
    expect(c.entity.station).toBe("渋谷駅");
    expect(c.entity.priceBand).toBe("¥3,000〜¥3,999");
    expect(c.entity.openingHours).toBe("17:00〜24:00");
    expect(c.entity.rating).toContain("3.52");
    // FoodVenue は candidateId を持たない（composition 境界）
    expect(
      (c.entity as unknown as { candidateId?: string }).candidateId,
    ).toBeUndefined();
  });
});

// ──────────── parseFoodVenues: dedup ────────────

describe("parseFoodVenues: 同一 candidateId は先勝ちで 1 件", () => {
  it("同一店舗が同一 sourceDomain から 2 回出ても 1 件（stable material 一致）", () => {
    // 表記差（全半角・空白）は normalizeForId で吸収される。
    // station/area も一致している必要がある（欠落時は別 ID で正しい挙動）。
    const input: SearchCandidate[] = [
      sc({
        title: "『焼肉ABC』渋谷店",
        description: "渋谷駅徒歩5分 おすすめ",
        url: "https://tabelog.com/tokyo/A/1",
      }),
      sc({
        title: "『焼肉 ABC』渋谷店",
        description: "渋谷駅から近い人気店",
        url: "https://tabelog.com/tokyo/A/2",
      }),
    ];
    const out = parseFoodVenues(input);
    expect(out.length).toBe(1);
  });

  it("別 sourceDomain なら別 candidateId で残る（cross-source dedup 非対象）", () => {
    const input: SearchCandidate[] = [
      sc({
        title: "『焼肉ABC』渋谷店",
        description: "渋谷駅徒歩5分",
        url: "https://tabelog.com/tokyo/A/1",
      }),
      sc({
        title: "『焼肉ABC』渋谷店",
        description: "渋谷駅徒歩5分",
        url: "https://retty.me/area/xxx",
      }),
    ];
    const out = parseFoodVenues(input);
    expect(out.length).toBe(2);
    expect(out[0].sourceDomain).not.toBe(out[1].sourceDomain);
  });
});

// ──────────── parseFoodVenues: confidence ────────────

describe("parseFoodVenues: confidence 加点", () => {
  it("name 単独 + unknown domain = 0.0", () => {
    const input: SearchCandidate[] = [
      sc({
        title: "『焼肉ABC』",
        description: "渋谷の店",
        url: "https://example.com/foo",
      }),
    ];
    const out = parseFoodVenues(input);
    expect(out.length).toBe(1);
    expect(out[0].confidence).toBe(0);
  });

  it("全フィールド + 既知ドメインは 1.0 上限", () => {
    const input: SearchCandidate[] = [
      sc({
        title: "『焼肉ABC』渋谷店",
        description:
          "渋谷駅徒歩5分 ¥3,000〜¥3,999 食べログ 3.52 営業 17:00〜24:00",
        url: "https://tabelog.com/tokyo/A1303/13012345/",
      }),
    ];
    const out = parseFoodVenues(input);
    expect(out.length).toBe(1);
    expect(out[0].confidence).toBe(1);
  });

  it("既知ドメインなら +0.10 が乗る", () => {
    const knownInput: SearchCandidate[] = [
      sc({
        title: "『焼肉ABC』",
        description: "どこかの店",
        url: "https://tabelog.com/tokyo/A/1",
      }),
    ];
    const unknownInput: SearchCandidate[] = [
      sc({
        title: "『焼肉XYZ』",
        description: "どこかの店",
        url: "https://example.com/foo",
      }),
    ];
    const a = parseFoodVenues(knownInput)[0];
    const b = parseFoodVenues(unknownInput)[0];
    expect(a.confidence).toBeGreaterThan(b.confidence);
    expect(a.confidence - b.confidence).toBeCloseTo(0.1, 2);
  });
});

// ──────────── parseFoodVenues: defaults ────────────

describe("parseFoodVenues: 未実装フィールドの default", () => {
  it("durationEstimate=null / bestTimeWindows=[] / reservationNeed='unknown'", () => {
    const input: SearchCandidate[] = [
      sc({
        title: "『焼肉ABC』",
        description: "渋谷駅",
        url: "https://tabelog.com/tokyo/A/1",
      }),
    ];
    const out = parseFoodVenues(input);
    expect(out[0].durationEstimate).toBeNull();
    expect(out[0].bestTimeWindows).toEqual([]);
    expect(out[0].reservationNeed).toBe("unknown");
  });
});
