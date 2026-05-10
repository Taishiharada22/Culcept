/**
 * explicitDayOriginFactory (OP-3C-2) — comprehensive test
 *
 * CEO 規律 (重要不変条件):
 *   - `set_journey_origin` のみ出力、 `add_travel_edge` を絶対に出さない
 *   - payload.kind は既存 JourneyAnchorState.kind 3 値のみ (= known_exact /
 *     known_label_only / unknown)
 *   - payload.source は既存 AnchorSource enum 内 (= user_declared を採用)
 *   - payload に coords / lat / lng / segmentOrigin / segmentDestination 不在
 *
 * 責務分離 (CEO 2026-05-06):
 *   - 同一 matched span では責務を分ける
 *   - 同一 utterance 全体では travel edge と explicit day-origin が両方出てもよい
 *   - 「自宅から始めて 8 時東京駅から渋谷へ」 → 本 factory: 自宅、 OP-3C-1: 東京駅→渋谷
 *
 * 検証カテゴリ:
 *   1. CEO 必須 positive (= 4 cases)
 *   2. CEO 必須 negative travel edge (= 4 cases)
 *   3. CEO 必須 negative 集合 (= 3 cases)
 *   4. CEO 必須 negative 非場所 noun (= 「作業/プロジェクト/会議スタート」)
 *   5. Pattern 群別採用 (= A/B/C)
 *   6. ambiguous reject
 *   7. classification-aware length
 *   8. temporal prefix + particle (= は) strip
 *   9. 複合発話 (= 自宅から始めて + 東京駅から渋谷へ)
 *   10. payload.kind / source / coords 不在 invariant
 *   11. add_travel_edge を返さない invariant
 *   12. envelope metadata (= priority 950 等)
 *   13. pure function
 */

import { describe, it, expect } from "vitest";
import {
  explicitDayOriginFactory,
  type ExplicitDayOriginInput,
} from "@/lib/alter-morning/comprehension/operationFactories/explicitDayOriginFactory";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. CEO 必須 positive (= 4 cases)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayOriginFactory (OP-3C-2) — CEO 必須 positive", () => {
  it("「自宅から一日を始める」 → set_journey_origin: 自宅", () => {
    const result = explicitDayOriginFactory({ utterance: "自宅から一日を始める" });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("set_journey_origin");
    expect(result[0].payload.kind).toBe("known_label_only");
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("自宅");
      expect(result[0].payload.source).toBe("user_declared");
    }
  });

  it("「明日はホテルを起点にする」 → set_journey_origin: ホテル", () => {
    const result = explicitDayOriginFactory({
      utterance: "明日はホテルを起点にする",
    });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("set_journey_origin");
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("ホテル");
    }
  });

  it("「東京駅を1日の起点にする」 → set_journey_origin: 東京駅", () => {
    const result = explicitDayOriginFactory({
      utterance: "東京駅を1日の起点にする",
    });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("東京駅");
    }
  });

  it("「朝は家スタート」 → set_journey_origin: 家", () => {
    const result = explicitDayOriginFactory({ utterance: "朝は家スタート" });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("家");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. CEO 必須 negative — travel edge utterance (= 4 cases)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayOriginFactory (OP-3C-2) — CEO 必須 negative travel edge", () => {
  it("「東京駅から渋谷へ」 → 空配列 (= signal keyword 不在)", () => {
    const result = explicitDayOriginFactory({ utterance: "東京駅から渋谷へ" });
    expect(result).toEqual([]);
  });

  it("「東京駅を8時に出て渋谷へ」 → 空配列", () => {
    const result = explicitDayOriginFactory({
      utterance: "東京駅を8時に出て渋谷へ",
    });
    expect(result).toEqual([]);
  });

  it("「自宅から渋谷へ」 → 空配列", () => {
    const result = explicitDayOriginFactory({ utterance: "自宅から渋谷へ" });
    expect(result).toEqual([]);
  });

  it("「ホテルから東京駅へ」 → 空配列", () => {
    const result = explicitDayOriginFactory({ utterance: "ホテルから東京駅へ" });
    expect(result).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. CEO 必須 negative — 集合 (= 3 cases)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayOriginFactory (OP-3C-2) — CEO 必須 negative 集合", () => {
  it("「東京駅集合」 → 空配列 (= 集合場所 ≠ 1日の起点)", () => {
    const result = explicitDayOriginFactory({ utterance: "東京駅集合" });
    expect(result).toEqual([]);
  });

  it("「東京駅で集合」 → 空配列", () => {
    const result = explicitDayOriginFactory({ utterance: "東京駅で集合" });
    expect(result).toEqual([]);
  });

  it("「東京駅に集合」 → 空配列", () => {
    const result = explicitDayOriginFactory({ utterance: "東京駅に集合" });
    expect(result).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. CEO 必須 negative — 非場所 noun (= 「作業スタート」 等)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayOriginFactory (OP-3C-2) — CEO 必須 negative 非場所 noun", () => {
  it("「作業スタート」 → 空配列 (= 活動 ≠ 場所)", () => {
    const result = explicitDayOriginFactory({ utterance: "作業スタート" });
    expect(result).toEqual([]);
  });

  it("「プロジェクトスタート」 → 空配列", () => {
    const result = explicitDayOriginFactory({
      utterance: "プロジェクトスタート",
    });
    expect(result).toEqual([]);
  });

  it("「会議スタート」 → 空配列", () => {
    const result = explicitDayOriginFactory({ utterance: "会議スタート" });
    expect(result).toEqual([]);
  });

  it("「仕事スタート」 → 空配列 (= NON_PLACE_NOUNS 拡張)", () => {
    const result = explicitDayOriginFactory({ utterance: "仕事スタート" });
    expect(result).toEqual([]);
  });

  it("「ミーティングスタート」 → 空配列", () => {
    const result = explicitDayOriginFactory({
      utterance: "ミーティングスタート",
    });
    expect(result).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. Pattern A (Xから始める系)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayOriginFactory (OP-3C-2) — Pattern A (Xから始める)", () => {
  it("「自宅から始める」 → 自宅", () => {
    const result = explicitDayOriginFactory({ utterance: "自宅から始める" });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("自宅");
    }
  });

  it("「自宅から1日を始める」 → 自宅 (= 「1日」 半角)", () => {
    const result = explicitDayOriginFactory({
      utterance: "自宅から1日を始める",
    });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("自宅");
    }
  });

  it("「ホテルから始まる」 → ホテル", () => {
    const result = explicitDayOriginFactory({ utterance: "ホテルから始まる" });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("ホテル");
    }
  });

  it("「自宅から始めて」 → 自宅", () => {
    const result = explicitDayOriginFactory({ utterance: "自宅から始めて" });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("自宅");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. Pattern B (Xを起点系)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayOriginFactory (OP-3C-2) — Pattern B (Xを起点)", () => {
  it("「東京駅を起点にする」 → 東京駅", () => {
    const result = explicitDayOriginFactory({
      utterance: "東京駅を起点にする",
    });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("東京駅");
    }
  });

  it("「東京駅を始点にする」 → 東京駅", () => {
    const result = explicitDayOriginFactory({
      utterance: "東京駅を始点にする",
    });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("東京駅");
    }
  });

  it("「ホテルを出発地にする」 → ホテル", () => {
    const result = explicitDayOriginFactory({
      utterance: "ホテルを出発地にする",
    });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("ホテル");
    }
  });

  it("「東京駅を一日の起点にする」 → 東京駅 (= 「一日」 漢字)", () => {
    const result = explicitDayOriginFactory({
      utterance: "東京駅を一日の起点にする",
    });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("東京駅");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. Pattern C (Xスタート系)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayOriginFactory (OP-3C-2) — Pattern C (Xスタート)", () => {
  it("「家スタート」 → 家", () => {
    const result = explicitDayOriginFactory({ utterance: "家スタート" });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("家");
    }
  });

  it("「自宅からスタート」 → 自宅", () => {
    const result = explicitDayOriginFactory({ utterance: "自宅からスタート" });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("自宅");
    }
  });

  it("「東京駅スタート」 → 東京駅 (= public POI、 length 3 OK)", () => {
    const result = explicitDayOriginFactory({ utterance: "東京駅スタート" });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("東京駅");
    }
  });

  it("「東京駅からスタート」 → 東京駅", () => {
    const result = explicitDayOriginFactory({
      utterance: "東京駅からスタート",
    });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("東京駅");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. ambiguous reject
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayOriginFactory (OP-3C-2) — ambiguous reject", () => {
  it("「そこから始める」 → 空配列", () => {
    const result = explicitDayOriginFactory({ utterance: "そこから始める" });
    expect(result).toEqual([]);
  });

  it("「ここを起点にする」 → 空配列", () => {
    const result = explicitDayOriginFactory({ utterance: "ここを起点にする" });
    expect(result).toEqual([]);
  });

  it("「あそこスタート」 → 空配列", () => {
    const result = explicitDayOriginFactory({ utterance: "あそこスタート" });
    expect(result).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. classification-aware length
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayOriginFactory (OP-3C-2) — classification-aware length", () => {
  it("「家スタート」 → 採用 (= private_semantic length 1 OK)", () => {
    const result = explicitDayOriginFactory({ utterance: "家スタート" });
    expect(result).toHaveLength(1);
  });

  it("「うちから始める」 → 採用 (= private_semantic length 2 OK)", () => {
    const result = explicitDayOriginFactory({ utterance: "うちから始める" });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("うち");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 10. temporal prefix + particle strip (CEO 修正対応)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayOriginFactory (OP-3C-2) — temporal + particle strip", () => {
  it("「明日はホテルを起点にする」 → ホテル (= 明日 + は strip)", () => {
    const result = explicitDayOriginFactory({
      utterance: "明日はホテルを起点にする",
    });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("ホテル");
    }
  });

  it("「今日は自宅から一日を始める」 → 自宅 (= 今日 + は strip)", () => {
    const result = explicitDayOriginFactory({
      utterance: "今日は自宅から一日を始める",
    });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("自宅");
    }
  });

  it("「朝は家スタート」 → 家 (= 朝 + は strip)", () => {
    const result = explicitDayOriginFactory({ utterance: "朝は家スタート" });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("家");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 11. 複合発話 (CEO 必須テスト)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayOriginFactory (OP-3C-2) — 複合発話 (CEO 必須)", () => {
  it("「自宅から始めて、東京駅から渋谷へ」 → 自宅 のみ (= 句読点で分離)", () => {
    const result = explicitDayOriginFactory({
      utterance: "自宅から始めて、東京駅から渋谷へ",
    });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("set_journey_origin");
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("自宅");
    }
  });

  it("「自宅から始めて8時東京駅から渋谷へ」 → 自宅 (= 句読点なし、 anchor 跨ぎ trim)", () => {
    // CEO 必須: 同一 utterance で travel edge と explicit day-origin が両方出てよい。
    // 本 factory は 自宅 を返す。 travel edge (= 東京駅→渋谷) は OP-3C-1 の責務。
    const result = explicitDayOriginFactory({
      utterance: "自宅から始めて8時東京駅から渋谷へ",
    });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("set_journey_origin");
    // **本 factory は add_travel_edge を絶対に出さない**
    expect((result[0].type as string)).not.toBe("add_travel_edge");
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("自宅");
    }
  });

  it("「明日は東京駅を起点にする、ホテルから始める」 → 東京駅 のみ (= 最初の valid 採用)", () => {
    const result = explicitDayOriginFactory({
      utterance: "明日は東京駅を起点にする、ホテルから始める",
    });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("東京駅");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 12. anchor 跨ぎ trim (= 病的入力)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayOriginFactory (OP-3C-2) — anchor 跨ぎ trim", () => {
  it("「東京駅から渋谷を起点にする」 → 渋谷 (= 「から」 anchor 跨ぎ trim)", () => {
    // 病的入力。 lazy match の m[1] = 「東京駅から渋谷」 を anchor trim で 「渋谷」 に。
    const result = explicitDayOriginFactory({
      utterance: "東京駅から渋谷を起点にする",
    });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("渋谷");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 13. NFKC normalize
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayOriginFactory (OP-3C-2) — NFKC", () => {
  it("「東京駅を１日の起点にする」 → 東京駅 (= 全角「１」)", () => {
    const result = explicitDayOriginFactory({
      utterance: "東京駅を１日の起点にする",
    });
    expect(result).toHaveLength(1);
    if (result[0].payload.kind === "known_label_only") {
      expect(result[0].payload.label).toBe("東京駅");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 14. 【CEO 重要規律】 invariants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayOriginFactory (OP-3C-2) — 【CEO 重要規律】 invariants", () => {
  it("【invariant】 どの入力でも add_travel_edge を絶対に返さない", () => {
    const inputs = [
      // positive (CEO 必須)
      "自宅から一日を始める",
      "明日はホテルを起点にする",
      "東京駅を1日の起点にする",
      "朝は家スタート",
      // CEO 必須 negative travel edge
      "東京駅から渋谷へ",
      "東京駅を8時に出て渋谷へ",
      "自宅から渋谷へ",
      "ホテルから東京駅へ",
      // CEO 必須 negative 集合
      "東京駅集合",
      "東京駅で集合",
      "東京駅に集合",
      // CEO 必須 negative 非場所 noun
      "作業スタート",
      "プロジェクトスタート",
      "会議スタート",
      // 複合発話
      "自宅から始めて8時東京駅から渋谷へ",
      "自宅から始めて、東京駅から渋谷へ",
    ];
    for (const utterance of inputs) {
      const result = explicitDayOriginFactory({ utterance });
      for (const env of result) {
        expect(env.type).toBe("set_journey_origin");
        expect((env.type as string)).not.toBe("add_travel_edge");
        expect((env.type as string)).not.toBe("set_journey_end");
        expect((env.type as string)).not.toBe("resolve_place_candidate");
        expect((env.type as string)).not.toBe("set_target_date");
        // payload に segment* field が絶対に存在しない
        expect((env.payload as Record<string, unknown>).segmentOrigin).toBeUndefined();
        expect((env.payload as Record<string, unknown>).segmentDestination).toBeUndefined();
        expect((env.payload as Record<string, unknown>).segmentDepartureTime).toBeUndefined();
      }
    }
  });

  it("【invariant】 travel edge / 集合 / 非場所 noun 全 negative は空配列", () => {
    const negativeOnly = [
      "東京駅から渋谷へ",
      "東京駅を8時に出て渋谷へ",
      "自宅から渋谷へ",
      "ホテルから東京駅へ",
      "東京駅集合",
      "東京駅で集合",
      "東京駅に集合",
      "作業スタート",
      "プロジェクトスタート",
      "会議スタート",
    ];
    for (const utterance of negativeOnly) {
      const result = explicitDayOriginFactory({ utterance });
      expect(result, utterance).toEqual([]);
    }
  });

  it("【invariant】 payload.kind は JourneyAnchorState 既存 3 値のみ", () => {
    const result = explicitDayOriginFactory({ utterance: "自宅から始める" });
    expect(result).toHaveLength(1);
    const validKinds = ["known_exact", "known_label_only", "unknown"];
    expect(validKinds).toContain(result[0].payload.kind);
  });

  it("【invariant】 payload.source は AnchorSource 既存 enum 内", () => {
    const result = explicitDayOriginFactory({ utterance: "自宅から始める" });
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
      // OP-3C-2 では user_declared を採用
      expect(result[0].payload.source).toBe("user_declared");
    }
  });

  it("【invariant】 payload に coords / lat / lng は不在 (= grounding 別 layer)", () => {
    const result = explicitDayOriginFactory({ utterance: "自宅から始める" });
    expect(result).toHaveLength(1);
    expect((result[0].payload as Record<string, unknown>).lat).toBeUndefined();
    expect((result[0].payload as Record<string, unknown>).lng).toBeUndefined();
    expect((result[0].payload as Record<string, unknown>).coords).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 15. envelope metadata
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayOriginFactory (OP-3C-2) — envelope metadata", () => {
  it("source = regex_deterministic / priority = 950 / confidence = high", () => {
    const result = explicitDayOriginFactory({ utterance: "自宅から始める" });
    expect(result[0].source).toBe("regex_deterministic");
    expect(result[0].priority).toBe(950);
    expect(result[0].confidence).toBe("high");
  });

  it("provenance.source_type = utterance / from_utterance = true", () => {
    const result = explicitDayOriginFactory({ utterance: "自宅から始める" });
    expect(result[0].provenance.source_type).toBe("utterance");
    expect(result[0].provenance.from_utterance).toBe(true);
    expect(result[0].provenance.source_span).toEqual(["自宅から始める"]);
  });

  it("trace.ruleId に pattern 名が encode される", () => {
    const a = explicitDayOriginFactory({ utterance: "自宅から始める" });
    expect(a[0].trace?.ruleId).toBe("explicitDayOrigin.kara_hajime");

    const b = explicitDayOriginFactory({ utterance: "東京駅を起点にする" });
    expect(b[0].trace?.ruleId).toBe("explicitDayOrigin.wo_kiten");

    const c = explicitDayOriginFactory({ utterance: "家スタート" });
    expect(c[0].trace?.ruleId).toBe("explicitDayOrigin.start");
  });

  it("sourceTurnIndex 反映", () => {
    const result = explicitDayOriginFactory({
      utterance: "自宅から始める",
      sourceTurnIndex: 7,
    });
    expect(result[0].trace?.sourceTurnIndex).toBe(7);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 16. pure function
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("explicitDayOriginFactory (OP-3C-2) — pure function", () => {
  it("input mutate しない", () => {
    const input: ExplicitDayOriginInput = {
      utterance: "明日はホテルを起点にする",
      sourceTurnIndex: 1,
    };
    const snapshot = JSON.stringify(input);
    explicitDayOriginFactory(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("同じ input で同じ output (= deterministic)", () => {
    const input: ExplicitDayOriginInput = { utterance: "自宅から始める" };
    const r1 = explicitDayOriginFactory(input);
    const r2 = explicitDayOriginFactory(input);
    expect(r1).toEqual(r2);
  });

  it("空 utterance → 空配列", () => {
    const result = explicitDayOriginFactory({ utterance: "" });
    expect(result).toEqual([]);
  });

  it("signal keyword なし utterance → 空配列", () => {
    const result = explicitDayOriginFactory({ utterance: "東京駅で会議" });
    expect(result).toEqual([]);
  });
});
