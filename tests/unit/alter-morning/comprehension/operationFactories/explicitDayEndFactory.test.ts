/**
 * explicitDayEndFactory (OP-3C-3) — comprehensive test
 *
 * CEO 規律 (重要不変条件):
 *   - `set_journey_end` のみ出力、 `add_travel_edge` / `set_journey_origin` を
 *     絶対に出さない
 *   - payload.kind は既存 JourneyAnchorState.kind 3 値のみ
 *   - payload.source = "user_explicit_endpoint" (= 既存 AnchorSource enum)
 *   - payload に coords / lat / lng / segmentOrigin / segmentDestination 不在
 *
 * CEO 修正 3 点 (2026-05-06):
 *   1. 「泊まる」 単独採用、 ただし メタ発話 (= 予定/相談/場所/候補/予約) は reject
 *   2. Pattern 文頭固定しない → 句読点 split で全 segment 走査
 *   3. Pattern C の prefix strip を明示 (= 「夜はホテル」/「最後はホテル」/「終点はホテル」 → ホテル)
 *
 * 検証カテゴリ (16 describe block):
 *   1. CEO 必須 positive 帰る系 (= 最後/最終的/夜)
 *   2. CEO 必須 positive 終点 noun
 *   3. CEO 必須 positive 泊まる
 *   4. CEO 必須 positive 文中 (= CEO 修正 2)
 *   5. CEO 必須 positive prefix strip (= CEO 修正 3、 夜は/最後は/終点はホテルで泊まる)
 *   6. CEO 必須 negative travel edge
 *   7. CEO 必須 negative 集合
 *   8. CEO 必須 negative activity / intermediate / day-origin
 *   9. CEO 必須 negative 泊まるメタ発話 (= CEO 修正 1)
 *   10. ambiguous reject
 *   11. 「Xに帰る」 単独 reject (= prefix なし → empty)
 *   12. classification-aware length
 *   13. 共存 invariant (= OP-3C-2 と並走想定 negative test)
 *   14. invariants (= add_travel_edge / set_journey_origin 絶対不出 / kind / source / coords)
 *   15. envelope metadata (= priority 950 等)
 *   16. pure function
 */

import { describe, it, expect } from "vitest";
import {
  explicitDayEndFactory,
  type ExplicitDayEndInput,
} from "@/lib/alter-morning/comprehension/operationFactories/explicitDayEndFactory";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. CEO 必須 positive — 帰る系 (最後/最終/夜 prefix)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayEndFactory (OP-3C-3) — 帰る系 positive", () => {
  it("「最後は自宅に帰る」 → set_journey_end: 自宅", () => {
    const result = explicitDayEndFactory({ utterance: "最後は自宅に帰る" });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("set_journey_end");
    expect(result[0].payload.kind).toBe("known_label_only");
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("自宅");
      expect(result[0].payload.source).toBe("user_explicit_endpoint");
    }
  });

  it("「最終的にはホテルに戻る」 → ホテル", () => {
    const result = explicitDayEndFactory({
      utterance: "最終的にはホテルに戻る",
    });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("ホテル");
    }
  });

  it("「夜は自宅に帰る」 → 自宅", () => {
    const result = explicitDayEndFactory({ utterance: "夜は自宅に帰る" });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("自宅");
    }
  });

  it("「最後は東京駅に着く」 → 東京駅", () => {
    const result = explicitDayEndFactory({ utterance: "最後は東京駅に着く" });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("東京駅");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. CEO 必須 positive — 終点 noun
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayEndFactory (OP-3C-3) — 終点 noun positive", () => {
  it("「終点は家」 → 家", () => {
    const result = explicitDayEndFactory({ utterance: "終点は家" });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("家");
    }
  });

  it("「最後は東京駅」 → 東京駅", () => {
    const result = explicitDayEndFactory({ utterance: "最後は東京駅" });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("東京駅");
    }
  });

  it("「終わりは自宅」 → 自宅", () => {
    const result = explicitDayEndFactory({ utterance: "終わりは自宅" });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("自宅");
    }
  });

  it("「最終地点はホテル」 → ホテル", () => {
    const result = explicitDayEndFactory({ utterance: "最終地点はホテル" });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("ホテル");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. CEO 必須 positive — 泊まる
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayEndFactory (OP-3C-3) — 泊まる positive", () => {
  it("「ホテルで泊まる」 → ホテル", () => {
    const result = explicitDayEndFactory({ utterance: "ホテルで泊まる" });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("ホテル");
    }
  });

  it("「ホテルに泊まる」 → ホテル", () => {
    const result = explicitDayEndFactory({ utterance: "ホテルに泊まる" });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("ホテル");
    }
  });

  it("「自宅で泊まる」 → 自宅 (= private_semantic OK)", () => {
    const result = explicitDayEndFactory({ utterance: "自宅で泊まる" });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("自宅");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. CEO 必須 positive — 文中 (CEO 修正 2: 文頭固定しない)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayEndFactory (OP-3C-3) — 文中の day-end (CEO 修正 2)", () => {
  it("「明日は朝から仕事して、最後は自宅に帰る」 → 自宅", () => {
    const result = explicitDayEndFactory({
      utterance: "明日は朝から仕事して、最後は自宅に帰る",
    });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("set_journey_end");
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("自宅");
    }
  });

  it("「渋谷で会議して、夜はホテルに戻る」 → ホテル", () => {
    const result = explicitDayEndFactory({
      utterance: "渋谷で会議して、夜はホテルに戻る",
    });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("ホテル");
    }
  });

  it("「自宅から始めて、最後はホテルで泊まる」 → ホテル", () => {
    const result = explicitDayEndFactory({
      utterance: "自宅から始めて、最後はホテルで泊まる",
    });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("ホテル");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. CEO 必須 positive — prefix strip (CEO 修正 3)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayEndFactory (OP-3C-3) — Pattern C prefix strip (CEO 修正 3)", () => {
  it("「夜はホテルで泊まる」 → ホテル (= 「夜は」 strip)", () => {
    const result = explicitDayEndFactory({ utterance: "夜はホテルで泊まる" });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("ホテル");
    }
  });

  it("「最後はホテルで泊まる」 → ホテル (= 「最後は」 strip)", () => {
    const result = explicitDayEndFactory({ utterance: "最後はホテルで泊まる" });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("ホテル");
    }
  });

  it("「終点はホテルで泊まる」 → ホテル (= 「終点は」 strip)", () => {
    const result = explicitDayEndFactory({ utterance: "終点はホテルで泊まる" });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("ホテル");
    }
  });

  it("「最終的にはホテルで泊まる」 → ホテル", () => {
    const result = explicitDayEndFactory({
      utterance: "最終的にはホテルで泊まる",
    });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("ホテル");
    }
  });

  it("「最終地点はホテルで泊まる」 → ホテル", () => {
    const result = explicitDayEndFactory({
      utterance: "最終地点はホテルで泊まる",
    });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("ホテル");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. CEO 必須 negative — travel edge
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayEndFactory (OP-3C-3) — travel edge negative", () => {
  it("「東京駅から渋谷へ」 → 空配列 (= day-end signal なし)", () => {
    const result = explicitDayEndFactory({ utterance: "東京駅から渋谷へ" });
    expect(result).toEqual([]);
  });

  it("「渋谷から自宅へ」 → 空配列 (= 自宅 が segmentDestination 位置だが signal なし)", () => {
    const result = explicitDayEndFactory({ utterance: "渋谷から自宅へ" });
    expect(result).toEqual([]);
  });

  it("「ホテルから東京駅へ」 → 空配列", () => {
    const result = explicitDayEndFactory({ utterance: "ホテルから東京駅へ" });
    expect(result).toEqual([]);
  });

  it("「東京駅を8時に出て渋谷へ」 → 空配列", () => {
    const result = explicitDayEndFactory({
      utterance: "東京駅を8時に出て渋谷へ",
    });
    expect(result).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. CEO 必須 negative — 集合
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayEndFactory (OP-3C-3) — 集合 negative", () => {
  it("「東京駅集合」 → 空配列", () => {
    const result = explicitDayEndFactory({ utterance: "東京駅集合" });
    expect(result).toEqual([]);
  });

  it("「ホテル集合」 → 空配列", () => {
    const result = explicitDayEndFactory({ utterance: "ホテル集合" });
    expect(result).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. CEO 必須 negative — activity / intermediate / day-origin
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayEndFactory (OP-3C-3) — activity/intermediate/day-origin negative", () => {
  it("「ホテルで打ち合わせ」 → 空配列 (= 打ち合わせ は対象外)", () => {
    const result = explicitDayEndFactory({ utterance: "ホテルで打ち合わせ" });
    expect(result).toEqual([]);
  });

  it("「カフェで仕事」 → 空配列", () => {
    const result = explicitDayEndFactory({ utterance: "カフェで仕事" });
    expect(result).toEqual([]);
  });

  it("「途中で東京駅に寄る」 → 空配列 (= 寄る は対象外)", () => {
    const result = explicitDayEndFactory({ utterance: "途中で東京駅に寄る" });
    expect(result).toEqual([]);
  });

  it("「自宅から始める」 → 空配列 (= day-origin)", () => {
    const result = explicitDayEndFactory({ utterance: "自宅から始める" });
    expect(result).toEqual([]);
  });

  it("「家スタート」 → 空配列 (= day-origin)", () => {
    const result = explicitDayEndFactory({ utterance: "家スタート" });
    expect(result).toEqual([]);
  });

  it("「明日はホテルを起点にする」 → 空配列 (= day-origin)", () => {
    const result = explicitDayEndFactory({
      utterance: "明日はホテルを起点にする",
    });
    expect(result).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. CEO 必須 negative — 泊まる メタ発話 (CEO 修正 1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayEndFactory (OP-3C-3) — 泊まる メタ発話 negative (CEO 修正 1)", () => {
  it("「ホテルに泊まる予定を確認する」 → 空配列 (= 予定 メタ)", () => {
    const result = explicitDayEndFactory({
      utterance: "ホテルに泊まる予定を確認する",
    });
    expect(result).toEqual([]);
  });

  it("「ホテルで泊まる相談をする」 → 空配列 (= 相談 メタ)", () => {
    const result = explicitDayEndFactory({
      utterance: "ホテルで泊まる相談をする",
    });
    expect(result).toEqual([]);
  });

  it("「泊まる場所を探す」 → 空配列 (= X 不在)", () => {
    const result = explicitDayEndFactory({ utterance: "泊まる場所を探す" });
    expect(result).toEqual([]);
  });

  it("「家で泊まる場所を探す」 → 空配列 (= 場所 メタ)", () => {
    const result = explicitDayEndFactory({
      utterance: "家で泊まる場所を探す",
    });
    expect(result).toEqual([]);
  });

  it("「ホテルに泊まる候補を見る」 → 空配列 (= 候補 メタ)", () => {
    const result = explicitDayEndFactory({
      utterance: "ホテルに泊まる候補を見る",
    });
    expect(result).toEqual([]);
  });

  it("「ホテルで泊まる予約を取る」 → 空配列 (= 予約 メタ)", () => {
    const result = explicitDayEndFactory({
      utterance: "ホテルで泊まる予約を取る",
    });
    expect(result).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 10. ambiguous reject
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayEndFactory (OP-3C-3) — ambiguous reject", () => {
  it("「最後はそこに帰る」 → 空配列 (= そこ ambiguous)", () => {
    const result = explicitDayEndFactory({ utterance: "最後はそこに帰る" });
    expect(result).toEqual([]);
  });

  it("「終点はここ」 → 空配列 (= ここ ambiguous)", () => {
    const result = explicitDayEndFactory({ utterance: "終点はここ" });
    expect(result).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 11. 「Xに帰る」 単独 reject (= 最後/最終/夜 prefix 必須)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayEndFactory (OP-3C-3) — 帰る系 prefix 必須 invariant", () => {
  it("「自宅に帰る」 単独 → 空配列 (= prefix なし、 intermediate との分離)", () => {
    const result = explicitDayEndFactory({ utterance: "自宅に帰る" });
    expect(result).toEqual([]);
  });

  it("「ホテルに戻る」 単独 → 空配列", () => {
    const result = explicitDayEndFactory({ utterance: "ホテルに戻る" });
    expect(result).toEqual([]);
  });

  it("「東京駅に着く」 単独 → 空配列", () => {
    const result = explicitDayEndFactory({ utterance: "東京駅に着く" });
    expect(result).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 12. classification-aware length
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayEndFactory (OP-3C-3) — classification-aware length", () => {
  it("「終点は家」 → 採用 (= private_semantic length 1 OK)", () => {
    const result = explicitDayEndFactory({ utterance: "終点は家" });
    expect(result).toHaveLength(1);
  });

  it("「最後はうち」 → 採用 (= private_semantic length 2 OK)", () => {
    const result = explicitDayEndFactory({ utterance: "最後はうち" });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("うち");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 13. 共存 invariant (= OP-3C-2 / OP-3C-1 と並走想定)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayEndFactory (OP-3C-3) — 共存 invariant", () => {
  it("「自宅から始めて、ホテルで泊まる」 → 本 factory: ホテル のみ (= 自宅 は OP-3C-2 責務)", () => {
    const result = explicitDayEndFactory({
      utterance: "自宅から始めて、ホテルで泊まる",
    });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("set_journey_end");
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("ホテル");
    }
  });

  it("「自宅から始めて、東京駅から渋谷へ、夜はホテルで泊まる」 → ホテル (= travel edge / day-origin は別責務)", () => {
    const result = explicitDayEndFactory({
      utterance: "自宅から始めて、東京駅から渋谷へ、夜はホテルで泊まる",
    });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("ホテル");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 14. 【CEO 重要規律】 invariants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayEndFactory (OP-3C-3) — 【CEO 重要規律】 invariants", () => {
  it("【invariant】 どの入力でも add_travel_edge / set_journey_origin を絶対に返さない", () => {
    const inputs = [
      // positive
      "最後は自宅に帰る",
      "最終的にはホテルに戻る",
      "夜は自宅に帰る",
      "終点は家",
      "最後は東京駅",
      "ホテルで泊まる",
      "ホテルに泊まる",
      "明日は朝から仕事して、最後は自宅に帰る",
      "渋谷で会議して、夜はホテルに戻る",
      "自宅から始めて、最後はホテルで泊まる",
      "夜はホテルで泊まる",
      "最後はホテルで泊まる",
      "終点はホテルで泊まる",
      // CEO 必須 negative travel edge
      "東京駅から渋谷へ",
      "渋谷から自宅へ",
      "ホテルから東京駅へ",
      // CEO 必須 negative 集合 / activity / intermediate / day-origin
      "東京駅集合",
      "ホテル集合",
      "ホテルで打ち合わせ",
      "途中で東京駅に寄る",
      "自宅から始める",
      "家スタート",
      // CEO 必須 negative 泊まるメタ
      "ホテルに泊まる予定を確認する",
      "ホテルで泊まる相談をする",
      "泊まる場所を探す",
      "家で泊まる場所を探す",
    ];
    for (const utterance of inputs) {
      const result = explicitDayEndFactory({ utterance });
      for (const env of result) {
        expect(env.type).toBe("set_journey_end");
        expect((env.type as string)).not.toBe("add_travel_edge");
        expect((env.type as string)).not.toBe("set_journey_origin");
        expect((env.type as string)).not.toBe("resolve_place_candidate");
        expect((env.type as string)).not.toBe("set_target_date");
        // payload に segment* / origin field 不在
        expect((env.payload as Record<string, unknown>).segmentOrigin).toBeUndefined();
        expect((env.payload as Record<string, unknown>).segmentDestination).toBeUndefined();
        expect((env.payload as Record<string, unknown>).segmentDepartureTime).toBeUndefined();
      }
    }
  });

  it("【invariant】 travel edge / 集合 / activity / day-origin / 泊まるメタ 全 negative は空配列", () => {
    const negativeOnly = [
      "東京駅から渋谷へ",
      "渋谷から自宅へ",
      "ホテルから東京駅へ",
      "東京駅集合",
      "ホテル集合",
      "ホテルで打ち合わせ",
      "カフェで仕事",
      "途中で東京駅に寄る",
      "自宅から始める",
      "家スタート",
      "明日はホテルを起点にする",
      "ホテルに泊まる予定を確認する",
      "ホテルで泊まる相談をする",
      "泊まる場所を探す",
      "家で泊まる場所を探す",
      // 帰る単独 reject
      "自宅に帰る",
      "ホテルに戻る",
    ];
    for (const utterance of negativeOnly) {
      const result = explicitDayEndFactory({ utterance });
      expect(result, utterance).toEqual([]);
    }
  });

  it("【invariant】 payload.kind は JourneyAnchorState 既存 3 値のみ", () => {
    const result = explicitDayEndFactory({ utterance: "最後は自宅に帰る" });
    expect(result).toHaveLength(1);
    const validKinds = ["known_exact", "known_label_only", "unknown"];
    expect(validKinds).toContain(result[0].payload.kind);
  });

  it("【invariant】 payload.source は AnchorSource 既存 enum 内 (= user_explicit_endpoint)", () => {
    const result = explicitDayEndFactory({ utterance: "最後は自宅に帰る" });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      const validSources = [
        "current",
        "registered_home",
        "user_declared",
        "previous_day_endpoint",
        "previous_day_assumed_endpoint",
        "default_round_trip",
        "comprehension_explicit",
        "user_explicit_endpoint",
        "user_override",
      ];
      expect(validSources).toContain(result[0].payload.source);
      expect(result[0].payload.source).toBe("user_explicit_endpoint");
    }
  });

  it("【invariant】 payload に coords / lat / lng は不在 (= grounding 別 layer)", () => {
    const result = explicitDayEndFactory({ utterance: "最後は自宅に帰る" });
    expect(result).toHaveLength(1);
    expect((result[0].payload as Record<string, unknown>).lat).toBeUndefined();
    expect((result[0].payload as Record<string, unknown>).lng).toBeUndefined();
    expect((result[0].payload as Record<string, unknown>).coords).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 15. envelope metadata
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayEndFactory (OP-3C-3) — envelope metadata", () => {
  it("source = regex_deterministic / priority = 950 / confidence = high", () => {
    const result = explicitDayEndFactory({ utterance: "最後は自宅に帰る" });
    expect(result[0].source).toBe("regex_deterministic");
    expect(result[0].priority).toBe(950);
    expect(result[0].confidence).toBe("high");
  });

  it("provenance.source_type = utterance / from_utterance = true", () => {
    const result = explicitDayEndFactory({ utterance: "最後は自宅に帰る" });
    expect(result[0].provenance.source_type).toBe("utterance");
    expect(result[0].provenance.from_utterance).toBe(true);
  });

  it("trace.ruleId に pattern 名が encode される", () => {
    const a = explicitDayEndFactory({ utterance: "最後は自宅に帰る" });
    expect(a[0].trace?.ruleId).toBe("explicitDayEnd.saigo_kaeru");

    const c = explicitDayEndFactory({ utterance: "ホテルで泊まる" });
    expect(c[0].trace?.ruleId).toBe("explicitDayEnd.tomaru");

    const b = explicitDayEndFactory({ utterance: "終点は家" });
    expect(b[0].trace?.ruleId).toBe("explicitDayEnd.shuten_wa");
  });

  it("sourceTurnIndex 反映", () => {
    const result = explicitDayEndFactory({
      utterance: "最後は自宅に帰る",
      sourceTurnIndex: 9,
    });
    expect(result[0].trace?.sourceTurnIndex).toBe(9);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 16. pure function
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayEndFactory (OP-3C-3) — pure function", () => {
  it("input mutate しない", () => {
    const input: ExplicitDayEndInput = {
      utterance: "最後は自宅に帰る",
      sourceTurnIndex: 1,
    };
    const snapshot = JSON.stringify(input);
    explicitDayEndFactory(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("同じ input で同じ output (= deterministic)", () => {
    const input: ExplicitDayEndInput = { utterance: "ホテルで泊まる" };
    const r1 = explicitDayEndFactory(input);
    const r2 = explicitDayEndFactory(input);
    expect(r1).toEqual(r2);
  });

  it("空 utterance → 空配列", () => {
    const result = explicitDayEndFactory({ utterance: "" });
    expect(result).toEqual([]);
  });

  it("signal なし utterance → 空配列", () => {
    const result = explicitDayEndFactory({ utterance: "東京駅で会議" });
    expect(result).toEqual([]);
  });
});
