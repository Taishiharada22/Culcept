/**
 * provenanceCheckerTargetDate.test.ts
 *
 * 検証カテゴリ:
 *   1. isTargetDateEvidenceToken — Negative (= 固有名詞 / 一般名詞 / 曖昧表現で reject)
 *   2. isTargetDateEvidenceToken — Positive (= Tier 1 / 2 / 3 各 token + boundary 各種で accept)
 *   3. isTargetDateEvidenceToken — 正規化 (= NFKC 全角半角揺れ吸収)
 *   4. checkTargetDateProvenance — 統合 (= default today 汚染防止 / 真正 utterance 維持 / inferred null 化 等)
 */

import { describe, test, expect } from "vitest";
import {
  isTargetDateEvidenceToken,
  checkTargetDateProvenance,
} from "@/lib/alter-morning/comprehension/provenanceChecker";
import type { Provenance } from "@/lib/alter-morning/comprehension/eventSchema";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. isTargetDateEvidenceToken — Negative (= 落とす)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isTargetDateEvidenceToken — Negative (= 固有名詞 / 一般名詞 / 曖昧表現)", () => {
  test("固有名詞内 substring 誤爆を防ぐ - 明日香", () => {
    expect(isTargetDateEvidenceToken("明日香")).toBe(false);
  });

  test("固有名詞内 substring 誤爆を防ぐ - 今日子", () => {
    expect(isTargetDateEvidenceToken("今日子")).toBe(false);
  });

  test("一般名詞 - 渋谷", () => {
    expect(isTargetDateEvidenceToken("渋谷")).toBe(false);
  });

  test("一般名詞 - 祝日", () => {
    expect(isTargetDateEvidenceToken("祝日")).toBe(false);
  });

  test("一般名詞 - 誕生日", () => {
    expect(isTargetDateEvidenceToken("誕生日")).toBe(false);
  });

  test("一般名詞 - 連休", () => {
    expect(isTargetDateEvidenceToken("連休")).toBe(false);
  });

  test("曖昧表現 - 近いうち", () => {
    expect(isTargetDateEvidenceToken("近いうち")).toBe(false);
  });

  test("曖昧表現 - そのうち", () => {
    expect(isTargetDateEvidenceToken("そのうち")).toBe(false);
  });

  test("曖昧表現 - いつか", () => {
    expect(isTargetDateEvidenceToken("いつか")).toBe(false);
  });

  test("人称代名詞 - 私", () => {
    expect(isTargetDateEvidenceToken("私")).toBe(false);
  });

  test("活動 - 仕事", () => {
    expect(isTargetDateEvidenceToken("仕事")).toBe(false);
  });

  test("空文字列", () => {
    expect(isTargetDateEvidenceToken("")).toBe(false);
  });

  test("空白のみ (trim 後 空)", () => {
    expect(isTargetDateEvidenceToken("   ")).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. isTargetDateEvidenceToken — Positive (= 通す)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isTargetDateEvidenceToken — Tier 3 単独", () => {
  test("明日 単独", () => expect(isTargetDateEvidenceToken("明日")).toBe(true));
  test("今日 単独", () => expect(isTargetDateEvidenceToken("今日")).toBe(true));
  test("明後日 単独", () => expect(isTargetDateEvidenceToken("明後日")).toBe(true));
  test("一昨日 単独", () => expect(isTargetDateEvidenceToken("一昨日")).toBe(true));
  test("昨日 単独", () => expect(isTargetDateEvidenceToken("昨日")).toBe(true));
  test("本日 単独", () => expect(isTargetDateEvidenceToken("本日")).toBe(true));
});

describe("isTargetDateEvidenceToken — Tier 3 + 助詞", () => {
  test("明日の朝", () => expect(isTargetDateEvidenceToken("明日の朝")).toBe(true));
  test("今日の予定", () => expect(isTargetDateEvidenceToken("今日の予定")).toBe(true));
  test("来週の月曜", () => expect(isTargetDateEvidenceToken("来週の月曜")).toBe(true));
});

describe("isTargetDateEvidenceToken — Tier 3 + 接尾辞漢字", () => {
  test("明日中", () => expect(isTargetDateEvidenceToken("明日中")).toBe(true));
  test("今日中", () => expect(isTargetDateEvidenceToken("今日中")).toBe(true));
  test("明日朝", () => expect(isTargetDateEvidenceToken("明日朝")).toBe(true));
});

describe("isTargetDateEvidenceToken — Tier 3 + 接尾辞 word", () => {
  test("明日まで", () => expect(isTargetDateEvidenceToken("明日まで")).toBe(true));
  test("明日から", () => expect(isTargetDateEvidenceToken("明日から")).toBe(true));
  test("明日以降", () => expect(isTargetDateEvidenceToken("明日以降")).toBe(true));
});

describe("isTargetDateEvidenceToken — Tier 3 + 句読点 / 空白 boundary", () => {
  test("明日、渋谷 (= 句読点 boundary)", () => {
    expect(isTargetDateEvidenceToken("明日、渋谷")).toBe(true);
  });

  test("明日 渋谷 (= 半角空白 boundary)", () => {
    expect(isTargetDateEvidenceToken("明日 渋谷")).toBe(true);
  });

  test("明日　渋谷 (= 全角空白、 NFKC で半角化)", () => {
    expect(isTargetDateEvidenceToken("明日　渋谷")).toBe(true);
  });
});

describe("isTargetDateEvidenceToken — Tier 3 RELATIVE_WEEK / 曜日", () => {
  test("来週 単独", () => expect(isTargetDateEvidenceToken("来週")).toBe(true));
  test("来週末 (= Tier 2 partial match)", () => {
    expect(isTargetDateEvidenceToken("来週末")).toBe(true);
  });
  test("日曜 単独", () => expect(isTargetDateEvidenceToken("日曜")).toBe(true));
  test("日曜の夜", () => expect(isTargetDateEvidenceToken("日曜の夜")).toBe(true));
  test("月曜日", () => expect(isTargetDateEvidenceToken("月曜日")).toBe(true));
});

describe("isTargetDateEvidenceToken — Tier 1 絶対日付 / 数値相対", () => {
  test("YYYY-MM-DD", () => {
    expect(isTargetDateEvidenceToken("2026-05-08")).toBe(true);
  });
  test("YYYY/MM/DD", () => {
    expect(isTargetDateEvidenceToken("2026/5/8")).toBe(true);
  });
  test("YYYY年MM月DD日", () => {
    expect(isTargetDateEvidenceToken("2026年5月8日")).toBe(true);
  });
  test("M/D", () => expect(isTargetDateEvidenceToken("5/8")).toBe(true));
  test("N日後", () => expect(isTargetDateEvidenceToken("3日後")).toBe(true));
  test("N週間前", () => expect(isTargetDateEvidenceToken("2週間前")).toBe(true));
});

describe("isTargetDateEvidenceToken — Tier 2 月末 / 年末", () => {
  test("月末", () => expect(isTargetDateEvidenceToken("月末")).toBe(true));
  test("年末", () => expect(isTargetDateEvidenceToken("年末")).toBe(true));
  test("週末", () => expect(isTargetDateEvidenceToken("週末")).toBe(true));
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. isTargetDateEvidenceToken — 正規化 (NFKC 全角半角揺れ)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isTargetDateEvidenceToken — 正規化 (NFKC)", () => {
  test("全角数字日付 (２０２６－０５－０８) → NFKC で半角化", () => {
    expect(isTargetDateEvidenceToken("２０２６－０５－０８")).toBe(true);
  });

  test("全角スラッシュ日付 (５／８)", () => {
    expect(isTargetDateEvidenceToken("５／８")).toBe(true);
  });

  test("句読点付き (明日、) → trim 後も「、」 boundary は機能せず末尾扱い", () => {
    // 「明日、」 → trim では削除されない → 「、」 が末尾 → boundary 「、」 OK
    expect(isTargetDateEvidenceToken("明日、")).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. checkTargetDateProvenance — 統合
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const utteranceProv = (over: Partial<Provenance> = {}): Provenance => ({
  source_type: "utterance",
  source_span: [],
  provenance_confidence: "high",
  from_utterance: true,
  ...over,
});

describe("checkTargetDateProvenance — targetDate guard", () => {
  test("targetDate undefined → undefined", () => {
    const result = checkTargetDateProvenance({
      targetDate: undefined,
      provenance: utteranceProv({ source_span: ["明日"] }),
      utterance: "明日 仕事",
    });
    expect(result).toBeUndefined();
  });

  test("targetDate null → undefined", () => {
    const result = checkTargetDateProvenance({
      targetDate: null,
      provenance: utteranceProv({ source_span: ["明日"] }),
      utterance: "明日 仕事",
    });
    expect(result).toBeUndefined();
  });

  test("targetDate 空文字 → undefined", () => {
    const result = checkTargetDateProvenance({
      targetDate: "",
      provenance: utteranceProv({ source_span: ["明日"] }),
      utterance: "明日 仕事",
    });
    expect(result).toBeUndefined();
  });

  test("targetDate blank (空白のみ) → undefined", () => {
    const result = checkTargetDateProvenance({
      targetDate: "   ",
      provenance: utteranceProv({ source_span: ["明日"] }),
      utterance: "明日 仕事",
    });
    expect(result).toBeUndefined();
  });

  test("provenance undefined → undefined", () => {
    const result = checkTargetDateProvenance({
      targetDate: "today",
      provenance: undefined,
      utterance: "仕事",
    });
    expect(result).toBeUndefined();
  });

  test("provenance null → undefined", () => {
    const result = checkTargetDateProvenance({
      targetDate: "today",
      provenance: null,
      utterance: "仕事",
    });
    expect(result).toBeUndefined();
  });
});

describe("checkTargetDateProvenance — default today 汚染防止 (= 固有名詞)", () => {
  test("固有名詞 span (= 「明日香」) → undefined (= llm_explicit 汚染防止)", () => {
    const result = checkTargetDateProvenance({
      targetDate: "today",
      provenance: utteranceProv({ source_span: ["明日香"] }),
      utterance: "明日香とランチ",
    });
    expect(result).toBeUndefined();
  });

  test("固有名詞 span (= 「今日子」) → undefined", () => {
    const result = checkTargetDateProvenance({
      targetDate: "today",
      provenance: utteranceProv({ source_span: ["今日子"] }),
      utterance: "今日子は来る",
    });
    expect(result).toBeUndefined();
  });
});

describe("checkTargetDateProvenance — utterance 系 真正", () => {
  test("真正 utterance + 日付 token → utterance 維持", () => {
    const prov = utteranceProv({ source_span: ["明日"] });
    const result = checkTargetDateProvenance({
      targetDate: "tomorrow",
      provenance: prov,
      utterance: "明日 渋谷",
    });
    expect(result).toBe(prov);
  });

  test("真正 utterance + 句読点 boundary span (= 「明日、渋谷」) → utterance 維持", () => {
    const prov = utteranceProv({ source_span: ["明日、渋谷"] });
    const result = checkTargetDateProvenance({
      targetDate: "tomorrow",
      provenance: prov,
      utterance: "明日、渋谷でランチ",
    });
    expect(result).toBe(prov);
  });

  test("真正 utterance + 空白 boundary span (= 「明日 渋谷」) → utterance 維持", () => {
    const prov = utteranceProv({ source_span: ["明日 渋谷"] });
    const result = checkTargetDateProvenance({
      targetDate: "tomorrow",
      provenance: prov,
      utterance: "明日 渋谷でランチ",
    });
    expect(result).toBe(prov);
  });

  test("真正 utterance + 「明日の朝」 → utterance 維持", () => {
    const prov = utteranceProv({ source_span: ["明日の朝"] });
    const result = checkTargetDateProvenance({
      targetDate: "tomorrow",
      provenance: prov,
      utterance: "明日の朝 ジム",
    });
    expect(result).toBe(prov);
  });

  test("混在 span - 1 つ日付 token あれば utterance 維持", () => {
    const prov = utteranceProv({ source_span: ["明日", "渋谷"] });
    const result = checkTargetDateProvenance({
      targetDate: "tomorrow",
      provenance: prov,
      utterance: "明日 渋谷",
    });
    expect(result).toBe(prov);
  });
});

describe("checkTargetDateProvenance — utterance 系 null 化", () => {
  test("空 source_span → undefined", () => {
    const result = checkTargetDateProvenance({
      targetDate: "today",
      provenance: utteranceProv({ source_span: [] }),
      utterance: "仕事",
    });
    expect(result).toBeUndefined();
  });

  test("source_span が utterance に不在 → undefined", () => {
    const result = checkTargetDateProvenance({
      targetDate: "today",
      provenance: utteranceProv({ source_span: ["明日"] }),
      utterance: "渋谷でランチ",
    });
    expect(result).toBeUndefined();
  });

  test("source_span 実在だが非日付 token → undefined", () => {
    const result = checkTargetDateProvenance({
      targetDate: "today",
      provenance: utteranceProv({ source_span: ["渋谷"] }),
      utterance: "渋谷でランチ",
    });
    expect(result).toBeUndefined();
  });

  test("混在 span 全件非日付 → undefined", () => {
    const result = checkTargetDateProvenance({
      targetDate: "today",
      provenance: utteranceProv({ source_span: ["渋谷", "新宿"] }),
      utterance: "渋谷から新宿",
    });
    expect(result).toBeUndefined();
  });
});

describe("checkTargetDateProvenance — inferred 全件 undefined (= -b strict mode)", () => {
  test("inferred + 空 span → undefined", () => {
    const result = checkTargetDateProvenance({
      targetDate: "today",
      provenance: {
        source_type: "inferred",
        source_span: [],
        provenance_confidence: "low",
        from_utterance: false,
      },
      utterance: "仕事",
    });
    expect(result).toBeUndefined();
  });

  test("inferred + 日付 span でも undefined (= default today inferred 汚染防止)", () => {
    const result = checkTargetDateProvenance({
      targetDate: "today",
      provenance: {
        source_type: "inferred",
        source_span: ["明日"],
        provenance_confidence: "low",
        from_utterance: false,
      },
      utterance: "明日 仕事",
    });
    expect(result).toBeUndefined();
  });
});

describe("checkTargetDateProvenance — baseline / tool", () => {
  test("baseline → そのまま return (= touch しない、 factory で空配列)", () => {
    const prov: Provenance = {
      source_type: "baseline",
      source_span: [],
      provenance_confidence: "medium",
      from_utterance: false,
    };
    const result = checkTargetDateProvenance({
      targetDate: "today",
      provenance: prov,
      utterance: "仕事",
    });
    expect(result).toBe(prov);
  });

  test("tool → そのまま return", () => {
    const prov: Provenance = {
      source_type: "tool",
      source_span: [],
      provenance_confidence: "high",
      from_utterance: false,
    };
    const result = checkTargetDateProvenance({
      targetDate: "today",
      provenance: prov,
      utterance: "仕事",
    });
    expect(result).toBe(prov);
  });
});

describe("checkTargetDateProvenance — pure / mutate なし / deterministic", () => {
  test("input mutate なし", () => {
    const prov = utteranceProv({ source_span: ["明日"] });
    const snapshot = JSON.stringify(prov);
    checkTargetDateProvenance({
      targetDate: "tomorrow",
      provenance: prov,
      utterance: "明日 渋谷",
    });
    expect(JSON.stringify(prov)).toBe(snapshot);
  });

  test("同 input で同 output (= deterministic)", () => {
    const args = {
      targetDate: "tomorrow",
      provenance: utteranceProv({ source_span: ["明日"] }),
      utterance: "明日 渋谷",
    };
    const r1 = checkTargetDateProvenance(args);
    const r2 = checkTargetDateProvenance(args);
    expect(r1).toBe(r2);
  });
});
