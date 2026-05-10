/**
 * explicitAnchorExtractor — Layer 1 detector unit test (PR B-2b Commit 4)
 *
 * CEO/GPT 2026-05-02 PR B-2b 規律:
 *   deterministic origin/end detector の挙動を厳格に固定。
 *   - 6 ラベル × 2 origin パターン = 12 origin positive
 *   - 6 ラベル × 5 end movement verb + {label}まで動詞 + 帰宅する = end positive
 *   - negative 9 件 (event where 4 + non-movement verb 2 + {label}まで質問 3)
 */

import { describe, it, expect } from "vitest";
import {
  extractStartPointAnchor,
  extractEndpointAnchor,
} from "@/lib/alter-morning/journey/explicitAnchorExtractor";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// extractStartPointAnchor — origin
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("extractStartPointAnchor — 6 ラベル × 「から」 / 「を出る」 パターン", () => {
  // 6 ラベル × from suffix
  const fromCases: Array<{ utterance: string; expectedLabel: string }> = [
    { utterance: "自宅から新宿でランチ", expectedLabel: "自宅" },
    { utterance: "実家から会社に行く", expectedLabel: "実家" },
    { utterance: "ホテルから渋谷でミーティング", expectedLabel: "ホテル" },
    { utterance: "会社から銀座でディナー", expectedLabel: "会社" },
    { utterance: "オフィスから新橋に移動", expectedLabel: "会社" }, // 正規化: オフィス → 会社
    { utterance: "家から渋谷へ", expectedLabel: "自宅" }, // 正規化: 家 → 自宅
  ];
  for (const { utterance, expectedLabel } of fromCases) {
    it(`「${utterance}」 → ${expectedLabel} (from suffix)`, () => {
      const result = extractStartPointAnchor(utterance);
      expect(result).not.toBeNull();
      expect(result?.kind).toBe("known_label_only");
      if (result?.kind === "known_label_only") {
        expect(result.label).toBe(expectedLabel);
        expect(result.source).toBe("user_declared");
      }
    });
  }

  // 6 ラベル × depart verb (「を出る」)
  const departCases: Array<{ utterance: string; expectedLabel: string }> = [
    { utterance: "自宅を出る", expectedLabel: "自宅" },
    { utterance: "実家を出発する", expectedLabel: "実家" },
    { utterance: "ホテルを出ます", expectedLabel: "ホテル" },
    { utterance: "会社をでよう", expectedLabel: "会社" },
    { utterance: "オフィスを出よう", expectedLabel: "会社" },
    { utterance: "家をでる", expectedLabel: "自宅" },
  ];
  for (const { utterance, expectedLabel } of departCases) {
    it(`「${utterance}」 → ${expectedLabel} (depart verb)`, () => {
      const result = extractStartPointAnchor(utterance);
      expect(result?.kind).toBe("known_label_only");
      if (result?.kind === "known_label_only") {
        expect(result.label).toBe(expectedLabel);
        expect(result.source).toBe("user_declared");
      }
    });
  }

  // 「実家」 と 「家」 の優先 (実家を先に match して 家 の自宅誤検出を防ぐ)
  it("「実家から会社に行く」 → 実家 (家 ではない、優先順位)", () => {
    const result = extractStartPointAnchor("実家から会社に行く");
    expect(result?.kind).toBe("known_label_only");
    if (result?.kind === "known_label_only") {
      expect(result.label).toBe("実家");
    }
  });
});

describe("extractStartPointAnchor — Negative cases (event where、non-movement)", () => {
  // [GPT 規律] event where = origin ではない
  const negativeCases = [
    "ホテルでランチ",
    "会社で打ち合わせ",
    "自宅で作業",
    "家で休む",
    // non-movement verb (「に」 単独)
    "会社に届ける",
    "自宅にメール送る",
    // origin/end 文法ではない単独使用
    "ホテル",
    "自宅",
  ];
  for (const utterance of negativeCases) {
    it(`「${utterance}」 → null (origin 文法ではない)`, () => {
      expect(extractStartPointAnchor(utterance)).toBeNull();
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// extractEndpointAnchor — end
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("extractEndpointAnchor — 6 ラベル × movement verb (に/へ + 5 verb)", () => {
  // 6 ラベル × 5 movement verb = 30 ケース、代表 6 ケースで cover
  const movementCases: Array<{ utterance: string; expectedLabel: string }> = [
    { utterance: "ホテルに泊まる", expectedLabel: "ホテル" },
    { utterance: "実家に帰る", expectedLabel: "実家" },
    { utterance: "自宅へ戻る", expectedLabel: "自宅" },
    { utterance: "会社に向かう", expectedLabel: "会社" },
    { utterance: "オフィスへ行く", expectedLabel: "会社" }, // 正規化
    { utterance: "家に戻る", expectedLabel: "自宅" }, // 正規化
  ];
  for (const { utterance, expectedLabel } of movementCases) {
    it(`「${utterance}」 → ${expectedLabel} (movement verb)`, () => {
      const result = extractEndpointAnchor(utterance);
      expect(result?.kind).toBe("known_label_only");
      if (result?.kind === "known_label_only") {
        expect(result.label).toBe(expectedLabel);
        expect(result.source).toBe("user_explicit_endpoint");
      }
    });
  }
});

describe("extractEndpointAnchor — 「{label}まで{移動動詞}」 パターン", () => {
  it("「会社まで行く」 → 会社", () => {
    const result = extractEndpointAnchor("会社まで行く");
    expect(result?.kind).toBe("known_label_only");
    if (result?.kind === "known_label_only") {
      expect(result.label).toBe("会社");
      expect(result.source).toBe("user_explicit_endpoint");
    }
  });

  it("「自宅まで戻る」 → 自宅", () => {
    const result = extractEndpointAnchor("自宅まで戻る");
    expect(result?.kind).toBe("known_label_only");
  });
});

describe("extractEndpointAnchor — 「帰宅する」 → 自宅 (固定ラベル)", () => {
  it("「19時に帰宅する」 → 自宅", () => {
    const result = extractEndpointAnchor("19時に帰宅する");
    expect(result?.kind).toBe("known_label_only");
    if (result?.kind === "known_label_only") {
      expect(result.label).toBe("自宅");
      expect(result.source).toBe("user_explicit_endpoint");
    }
  });

  it("「帰宅する」 単独 → 自宅", () => {
    const result = extractEndpointAnchor("帰宅する");
    expect(result?.kind).toBe("known_label_only");
    if (result?.kind === "known_label_only") {
      expect(result.label).toBe("自宅");
    }
  });
});

describe("extractEndpointAnchor — Negative cases (CEO/GPT 規律 9 件)", () => {
  // [GPT 規律] event where = end ではない
  const eventWhereCases = [
    "ホテルでランチ",
    "会社で打ち合わせ",
    "自宅で作業",
    "家で休む",
  ];
  for (const utterance of eventWhereCases) {
    it(`event where: 「${utterance}」 → null`, () => {
      expect(extractEndpointAnchor(utterance)).toBeNull();
    });
  }

  // [GPT 規律] non-movement verb (「に」 だが移動動詞ではない)
  const nonMovementVerbCases = [
    "会社に届ける",
    "自宅にメール送る",
  ];
  for (const utterance of nonMovementVerbCases) {
    it(`non-movement verb: 「${utterance}」 → null`, () => {
      expect(extractEndpointAnchor(utterance)).toBeNull();
    });
  }

  // [GPT 規律] 「{label}まで」 単独 (動詞なし) は距離 / 時間 / 経路質問
  const untilQuestionCases = [
    "ホテルまであと10分", // 距離質問
    "会社までどれくらい？", // 時間質問
    "家までの道", // 経路質問
  ];
  for (const utterance of untilQuestionCases) {
    it(`{label}まで 質問: 「${utterance}」 → null`, () => {
      expect(extractEndpointAnchor(utterance)).toBeNull();
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 複合: origin + end が同時にある utterance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("extractStartPointAnchor + extractEndpointAnchor — 同時抽出", () => {
  it("「自宅からホテルに泊まる」 → origin=自宅, end=ホテル", () => {
    const utterance = "自宅からホテルに泊まる";
    const origin = extractStartPointAnchor(utterance);
    const end = extractEndpointAnchor(utterance);

    expect(origin?.kind).toBe("known_label_only");
    if (origin?.kind === "known_label_only") {
      expect(origin.label).toBe("自宅");
      expect(origin.source).toBe("user_declared");
    }

    expect(end?.kind).toBe("known_label_only");
    if (end?.kind === "known_label_only") {
      expect(end.label).toBe("ホテル");
      expect(end.source).toBe("user_explicit_endpoint");
    }
  });

  it("「ホテルから帰宅する」 → origin=ホテル, end=自宅", () => {
    const utterance = "ホテルから帰宅する";
    const origin = extractStartPointAnchor(utterance);
    const end = extractEndpointAnchor(utterance);

    expect(origin?.kind).toBe("known_label_only");
    if (origin?.kind === "known_label_only") {
      expect(origin.label).toBe("ホテル");
    }

    expect(end?.kind).toBe("known_label_only");
    if (end?.kind === "known_label_only") {
      expect(end.label).toBe("自宅"); // 帰宅する → 自宅
    }
  });
});
