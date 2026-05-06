/**
 * OP-5.2 shadowComparator.test.ts — compareShadowVsLegacy の test
 *
 * 検証カテゴリ:
 *   1. targetDate match / mismatch
 *   2. journeyOrigin match
 *   3. journeyOrigin mismatch (kind / source / label)
 *   4. journeyOrigin missing in op5 / legacy
 *   5. journeyEnd 同上
 *   6. travelEdges count match / mismatch
 *   7. 【CEO invariant】 出力 ShadowComparison に danger key が再帰的に存在しない
 *   8. 【CEO invariant】 出力に raw label / utterance / coords が含まれない
 *   9. 【CEO invariant】 enum value `"different_label"` は許可される (= key 名禁止と区別)
 *   10. pure (= input mutate / deterministic)
 */

import { describe, it, expect } from "vitest";
import {
  compareShadowVsLegacy,
  type LegacyShadowSnapshot,
  type ShadowComparison,
} from "@/lib/alter-morning/op5/shadowComparator";
import { runShadowOrchestrator } from "@/lib/alter-morning/op5/shadowOrchestrator";
import type { ShadowOrchestratorResult } from "@/lib/alter-morning/op5/shadowOrchestrator";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function runOrchestrator(utterance: string): ShadowOrchestratorResult {
  return runShadowOrchestrator({
    utterance,
    actualToday: "2026-05-06",
  });
}

function emptyLegacy(): LegacyShadowSnapshot {
  return {
    targetDate: null,
    journeyOriginKind: null,
    journeyOriginSource: null,
    journeyOriginLabel: null,
    journeyEndKind: null,
    journeyEndSource: null,
    journeyEndLabel: null,
    segmentsCount: 0,
  };
}

/**
 * 危険 key list (= **key 名**禁止、 enum value としては許可)。
 *
 * 注: `mismatchCategory: "different_label"` は許可。 出力の **key 名** "label" /
 * "rawLabel" を禁止する。
 */
const DANGER_KEYS = [
  "utterance",
  "rawUtterance",
  "label",
  "rawLabel",
  "userId",
  "user_id",
  "lat",
  "lng",
  "coords",
  "coordinate",
  "payload",
  "matchedSpan",
  "source_span",
  "sourceSpan",
  "provenance",
  "trace",
  "emittedCandidates",
  "dispatchResult",
  "morningPlan",
  "planState",
];

function findDangerKeys(
  obj: unknown,
  path: ReadonlyArray<string> = [],
): string[] {
  const found: string[] = [];
  if (obj === null || obj === undefined) return found;
  if (typeof obj !== "object") return found;

  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      found.push(...findDangerKeys(item, [...path, `[${i}]`]));
    });
    return found;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (DANGER_KEYS.includes(key)) {
      found.push([...path, key].join("."));
    }
    found.push(...findDangerKeys(value, [...path, key]));
  }
  return found;
}

const DANGER_RAW_VALUES = [
  "自宅",
  "ホテル",
  "東京駅",
  "渋谷",
  "新宿",
  "うち",
  "実家",
  "家",
  "会社",
  "職場",
  "カフェ",
];

function containsAnyRawValue(obj: unknown): string | null {
  const json = JSON.stringify(obj);
  for (const v of DANGER_RAW_VALUES) {
    if (json.includes(v)) return v;
  }
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. targetDate
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("compareShadowVsLegacy — targetDate", () => {
  it("legacy targetDate === op5 system_default → match", () => {
    const op5 = runOrchestrator(""); // 空 → system_default = actualToday
    const legacy: LegacyShadowSnapshot = {
      ...emptyLegacy(),
      targetDate: "2026-05-06",
    };
    const cmp = compareShadowVsLegacy(legacy, op5);
    expect(cmp.targetDate.match).toBe(true);
  });

  it("legacy targetDate ≠ op5 → mismatch", () => {
    const op5 = runOrchestrator(""); // op5 → 2026-05-06
    const legacy: LegacyShadowSnapshot = {
      ...emptyLegacy(),
      targetDate: "2026-05-07",
    };
    const cmp = compareShadowVsLegacy(legacy, op5);
    expect(cmp.targetDate.match).toBe(false);
  });

  it("両方 null → match", () => {
    // op5 actualToday を invalid にして system_default 不生成にする想定の代替: legacy null
    // ただし orchestrator は actualToday を必須にしているので、 ここでは op5 が null を返す状況は
    // 直接作れない。 代わりに「op5 selected あり / legacy null」 の mismatch を確認する次 case で代替。
    const op5 = runOrchestrator("");
    const legacy: LegacyShadowSnapshot = {
      ...emptyLegacy(),
      targetDate: null,
    };
    const cmp = compareShadowVsLegacy(legacy, op5);
    expect(cmp.targetDate.match).toBe(false); // legacy null vs op5 "2026-05-06"
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. journeyOrigin match
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("compareShadowVsLegacy — journeyOrigin match", () => {
  it("両方 null/unknown → match", () => {
    const op5 = runOrchestrator("");
    const legacy = emptyLegacy();
    const cmp = compareShadowVsLegacy(legacy, op5);
    expect(cmp.journeyOrigin.match).toBe(true);
    expect(cmp.journeyOrigin.mismatchCategory).toBe("match");
  });

  it("両方 同 label → match (= kind/source/label 全一致)", () => {
    const op5 = runOrchestrator("自宅から始める"); // op5 → 自宅 / known_label_only / user_declared
    const legacy: LegacyShadowSnapshot = {
      ...emptyLegacy(),
      targetDate: "2026-05-06",
      journeyOriginKind: "known_label_only",
      journeyOriginSource: "user_declared",
      journeyOriginLabel: "自宅",
    };
    const cmp = compareShadowVsLegacy(legacy, op5);
    expect(cmp.journeyOrigin.match).toBe(true);
    expect(cmp.journeyOrigin.mismatchCategory).toBe("match");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. journeyOrigin mismatch
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("compareShadowVsLegacy — journeyOrigin mismatch", () => {
  it("kind 違い → 'different_kind'", () => {
    const op5 = runOrchestrator("自宅から始める"); // op5 known_label_only
    const legacy: LegacyShadowSnapshot = {
      ...emptyLegacy(),
      targetDate: "2026-05-06",
      journeyOriginKind: "known_exact",
      journeyOriginSource: "user_declared",
      journeyOriginLabel: "自宅",
    };
    const cmp = compareShadowVsLegacy(legacy, op5);
    expect(cmp.journeyOrigin.match).toBe(false);
    expect(cmp.journeyOrigin.mismatchCategory).toBe("different_kind");
  });

  it("kind 同じ / source 違い → 'different_source'", () => {
    const op5 = runOrchestrator("自宅から始める"); // op5 source = user_declared
    const legacy: LegacyShadowSnapshot = {
      ...emptyLegacy(),
      targetDate: "2026-05-06",
      journeyOriginKind: "known_label_only",
      journeyOriginSource: "current",
      journeyOriginLabel: "自宅",
    };
    const cmp = compareShadowVsLegacy(legacy, op5);
    expect(cmp.journeyOrigin.match).toBe(false);
    expect(cmp.journeyOrigin.mismatchCategory).toBe("different_source");
  });

  it("kind / source 同じ / label 違い → 'different_label'", () => {
    const op5 = runOrchestrator("自宅から始める"); // op5 label = 自宅
    const legacy: LegacyShadowSnapshot = {
      ...emptyLegacy(),
      targetDate: "2026-05-06",
      journeyOriginKind: "known_label_only",
      journeyOriginSource: "user_declared",
      journeyOriginLabel: "ホテル", // 違う label
    };
    const cmp = compareShadowVsLegacy(legacy, op5);
    expect(cmp.journeyOrigin.match).toBe(false);
    expect(cmp.journeyOrigin.mismatchCategory).toBe("different_label");
  });

  it("legacy 不在 / op5 あり → 'missing_in_legacy'", () => {
    const op5 = runOrchestrator("自宅から始める");
    const legacy = emptyLegacy(); // legacy null
    const cmp = compareShadowVsLegacy(legacy, op5);
    expect(cmp.journeyOrigin.match).toBe(false);
    expect(cmp.journeyOrigin.mismatchCategory).toBe("missing_in_legacy");
  });

  it("op5 不在 / legacy あり → 'missing_in_op5'", () => {
    const op5 = runOrchestrator(""); // op5 origin = null
    const legacy: LegacyShadowSnapshot = {
      ...emptyLegacy(),
      targetDate: "2026-05-06",
      journeyOriginKind: "known_label_only",
      journeyOriginSource: "registered_home",
      journeyOriginLabel: "自宅",
    };
    const cmp = compareShadowVsLegacy(legacy, op5);
    expect(cmp.journeyOrigin.match).toBe(false);
    expect(cmp.journeyOrigin.mismatchCategory).toBe("missing_in_op5");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. journeyEnd
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("compareShadowVsLegacy — journeyEnd", () => {
  it("両方 同 label → match", () => {
    const op5 = runOrchestrator("ホテルで泊まる");
    const legacy: LegacyShadowSnapshot = {
      ...emptyLegacy(),
      targetDate: "2026-05-06",
      journeyEndKind: "known_label_only",
      journeyEndSource: "user_explicit_endpoint",
      journeyEndLabel: "ホテル",
    };
    const cmp = compareShadowVsLegacy(legacy, op5);
    expect(cmp.journeyEnd.match).toBe(true);
    expect(cmp.journeyEnd.mismatchCategory).toBe("match");
  });

  it("op5 不在 / legacy あり → 'missing_in_op5'", () => {
    const op5 = runOrchestrator("");
    const legacy: LegacyShadowSnapshot = {
      ...emptyLegacy(),
      targetDate: "2026-05-06",
      journeyEndKind: "known_label_only",
      journeyEndSource: "user_explicit_endpoint",
      journeyEndLabel: "ホテル",
    };
    const cmp = compareShadowVsLegacy(legacy, op5);
    expect(cmp.journeyEnd.mismatchCategory).toBe("missing_in_op5");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. travelEdges count
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("compareShadowVsLegacy — travelEdges count", () => {
  it("両方 0 → countMatch true", () => {
    const op5 = runOrchestrator("");
    const legacy = emptyLegacy();
    const cmp = compareShadowVsLegacy(legacy, op5);
    expect(cmp.travelEdges.legacyCount).toBe(0);
    expect(cmp.travelEdges.op5Count).toBe(0);
    expect(cmp.travelEdges.countMatch).toBe(true);
  });

  it("両方 1 → countMatch true", () => {
    const op5 = runOrchestrator("東京駅から渋谷へ"); // op5 1 件
    const legacy: LegacyShadowSnapshot = {
      ...emptyLegacy(),
      targetDate: "2026-05-06",
      segmentsCount: 1,
    };
    const cmp = compareShadowVsLegacy(legacy, op5);
    expect(cmp.travelEdges.legacyCount).toBe(1);
    expect(cmp.travelEdges.op5Count).toBe(1);
    expect(cmp.travelEdges.countMatch).toBe(true);
  });

  it("legacy 0 / op5 1 → countMatch false", () => {
    const op5 = runOrchestrator("東京駅から渋谷へ");
    const legacy = emptyLegacy();
    const cmp = compareShadowVsLegacy(legacy, op5);
    expect(cmp.travelEdges.countMatch).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. 【CEO invariant】 danger key 再帰検査
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("compareShadowVsLegacy — 【CEO invariant】 danger key 再帰検査", () => {
  it("【invariant】 出力に danger key が再帰的に存在しない", () => {
    const op5 = runOrchestrator("自宅から始めて、東京駅から渋谷へ、夜はホテルで泊まる");
    const legacy: LegacyShadowSnapshot = {
      targetDate: "2026-05-06",
      journeyOriginKind: "known_label_only",
      journeyOriginSource: "user_declared",
      journeyOriginLabel: "自宅",
      journeyEndKind: "known_label_only",
      journeyEndSource: "user_explicit_endpoint",
      journeyEndLabel: "ホテル",
      segmentsCount: 1,
    };
    const cmp = compareShadowVsLegacy(legacy, op5);
    expect(findDangerKeys(cmp)).toEqual([]);
  });

  it("【invariant】 多様な mismatch でも danger key が出ない", () => {
    const inputs = [
      { utterance: "", legacy: emptyLegacy() },
      { utterance: "自宅から始める", legacy: emptyLegacy() },
      {
        utterance: "東京駅から渋谷へ",
        legacy: {
          ...emptyLegacy(),
          targetDate: "2026-05-06",
          segmentsCount: 1,
        } as LegacyShadowSnapshot,
      },
      {
        utterance: "ホテルで泊まる",
        legacy: {
          ...emptyLegacy(),
          journeyEndKind: "known_label_only" as const,
          journeyEndSource: "user_explicit_endpoint" as const,
          journeyEndLabel: "違うホテル",
        },
      },
    ];
    for (const { utterance, legacy } of inputs) {
      const op5 = runOrchestrator(utterance);
      const cmp = compareShadowVsLegacy(legacy, op5);
      const danger = findDangerKeys(cmp);
      expect(danger, `utterance=${utterance}, paths=${danger.join(",")}`).toEqual(
        [],
      );
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. 【CEO invariant】 raw value (= 「自宅」 等) が出力に含まれない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("compareShadowVsLegacy — 【CEO invariant】 raw value 検査", () => {
  it("【invariant】 legacy / op5 両方に raw label が含まれていても、 出力に raw が漏れない", () => {
    const op5 = runOrchestrator("自宅から始める"); // op5 label = 自宅
    const legacy: LegacyShadowSnapshot = {
      ...emptyLegacy(),
      targetDate: "2026-05-06",
      journeyOriginKind: "known_label_only",
      journeyOriginSource: "registered_home",
      journeyOriginLabel: "ホテル", // 違う label
      journeyEndKind: "known_label_only",
      journeyEndSource: "user_explicit_endpoint",
      journeyEndLabel: "東京駅",
    };
    const cmp = compareShadowVsLegacy(legacy, op5);
    expect(containsAnyRawValue(cmp)).toBeNull();
  });

  it("【invariant】 mismatchCategory 'different_label' でも raw label が出力に出ない", () => {
    const op5 = runOrchestrator("自宅から始める");
    const legacy: LegacyShadowSnapshot = {
      ...emptyLegacy(),
      targetDate: "2026-05-06",
      journeyOriginKind: "known_label_only",
      journeyOriginSource: "user_declared",
      journeyOriginLabel: "違う場所",
    };
    const cmp = compareShadowVsLegacy(legacy, op5);
    expect(cmp.journeyOrigin.mismatchCategory).toBe("different_label");
    expect(containsAnyRawValue(cmp)).toBeNull();
    // ただし enum value としての "different_label" は存在してよい (= raw でない)
    expect(JSON.stringify(cmp)).toContain("different_label");
  });

  it("【invariant】 多様な input で raw が漏れない (= 系統検証)", () => {
    const utterances = [
      "自宅から始める",
      "東京駅から渋谷へ",
      "最後はホテルで泊まる",
      "うちから新宿へ",
      "会社で打ち合わせ",
      "実家に帰る",
    ];
    for (const utterance of utterances) {
      const op5 = runOrchestrator(utterance);
      const legacy: LegacyShadowSnapshot = {
        ...emptyLegacy(),
        targetDate: "2026-05-06",
        journeyOriginKind: "known_label_only",
        journeyOriginSource: "user_declared",
        journeyOriginLabel: "自宅",
        journeyEndKind: "known_label_only",
        journeyEndSource: "user_explicit_endpoint",
        journeyEndLabel: "ホテル",
        segmentsCount: 1,
      };
      const cmp = compareShadowVsLegacy(legacy, op5);
      const raw = containsAnyRawValue(cmp);
      expect(raw, `utterance=${utterance}, raw=${raw}`).toBeNull();
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. 【CEO invariant】 enum value "different_label" は許可される
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("compareShadowVsLegacy — 【CEO invariant】 enum value 許可", () => {
  it("【invariant】 mismatchCategory enum value 6 種に同 label key 名が混入しない", () => {
    const op5 = runOrchestrator("自宅から始める");
    const legacy: LegacyShadowSnapshot = {
      ...emptyLegacy(),
      targetDate: "2026-05-06",
      journeyOriginKind: "known_label_only",
      journeyOriginSource: "user_declared",
      journeyOriginLabel: "違う場所",
    };
    const cmp = compareShadowVsLegacy(legacy, op5);
    // enum value としての "different_label" は許可
    expect(cmp.journeyOrigin.mismatchCategory).toBe("different_label");
    // ただし key 名 "label" / "rawLabel" は出力に存在しない
    const dangerPaths = findDangerKeys(cmp);
    expect(dangerPaths).toEqual([]);
  });

  it("【invariant】 出力 ShadowComparison の top-level keys は明示的に 4 つだけ", () => {
    const op5 = runOrchestrator("");
    const legacy = emptyLegacy();
    const cmp = compareShadowVsLegacy(legacy, op5);
    expect(Object.keys(cmp).sort()).toEqual([
      "journeyEnd",
      "journeyOrigin",
      "targetDate",
      "travelEdges",
    ]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. 【CEO invariant】 sentinel raw value 漏洩検査
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 目的 (CEO 2026-05-06 追加確認):
//   raw label が、 既知 key (= label / rawLabel) ではなく、 将来うっかり別 key
//   (= name / value / text / selected 等) で漏れる事故を防ぐ。
//
//   sentinel 値は通常の日本語に存在しない unique 文字列。 comparator output に
//   sentinel が **絶対に出ない**ことを証明することで、 raw 漏洩経路が構造的に
//   閉じていることを担保する。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SENTINEL_LEGACY_ORIGIN = "RAW_LABEL_SENTINEL_LEGACY_ORIGIN_AAAAA";
const SENTINEL_LEGACY_END = "RAW_LABEL_SENTINEL_LEGACY_END_BBBBB";
const SENTINEL_TARGETDATE = "RAW_TARGETDATE_SENTINEL_99999";
const SENTINEL_OP5_HOME = "RAW_LABEL_SENTINEL_OP5_HOME_CCCCC";
const SENTINEL_OP5_CLARIFY = "RAW_LABEL_SENTINEL_OP5_CLARIFY_DDDDD";

describe("compareShadowVsLegacy — 【CEO invariant】 sentinel raw value 漏洩検査", () => {
  it("【invariant】 sentinel legacy origin label が comparator output に含まれない", () => {
    const op5 = runOrchestrator("自宅から始める");
    const legacy: LegacyShadowSnapshot = {
      ...emptyLegacy(),
      targetDate: "2026-05-06",
      journeyOriginKind: "known_label_only",
      journeyOriginSource: "user_declared",
      journeyOriginLabel: SENTINEL_LEGACY_ORIGIN,
    };
    const cmp = compareShadowVsLegacy(legacy, op5);
    expect(JSON.stringify(cmp)).not.toContain(SENTINEL_LEGACY_ORIGIN);
  });

  it("【invariant】 sentinel legacy end label が comparator output に含まれない", () => {
    const op5 = runOrchestrator("ホテルで泊まる");
    const legacy: LegacyShadowSnapshot = {
      ...emptyLegacy(),
      targetDate: "2026-05-06",
      journeyEndKind: "known_label_only",
      journeyEndSource: "user_explicit_endpoint",
      journeyEndLabel: SENTINEL_LEGACY_END,
    };
    const cmp = compareShadowVsLegacy(legacy, op5);
    expect(JSON.stringify(cmp)).not.toContain(SENTINEL_LEGACY_END);
  });

  it("【invariant】 sentinel legacy targetDate が comparator output に含まれない", () => {
    const op5 = runOrchestrator("");
    const legacy: LegacyShadowSnapshot = {
      ...emptyLegacy(),
      targetDate: SENTINEL_TARGETDATE,
    };
    const cmp = compareShadowVsLegacy(legacy, op5);
    expect(JSON.stringify(cmp)).not.toContain(SENTINEL_TARGETDATE);
  });

  it("【invariant】 sentinel op5 origin label (= homeAnchor 経由) が出力に含まれない", () => {
    const op5 = runShadowOrchestrator({
      utterance: "",
      actualToday: "2026-05-06",
      homeAnchor: {
        lat: 35.6812,
        lng: 139.7671,
        label: SENTINEL_OP5_HOME,
        source: "registered_home",
      },
    });
    const legacy = emptyLegacy();
    const cmp = compareShadowVsLegacy(legacy, op5);
    expect(JSON.stringify(cmp)).not.toContain(SENTINEL_OP5_HOME);
  });

  it("【invariant】 sentinel op5 origin label (= UI clarify 経由) が出力に含まれない", () => {
    const op5 = runShadowOrchestrator({
      utterance: "",
      actualToday: "2026-05-06",
      clarifyAnswer: SENTINEL_OP5_CLARIFY,
      clarifySlot: "origin",
      isOriginClarifyActive: true,
    });
    const legacy = emptyLegacy();
    const cmp = compareShadowVsLegacy(legacy, op5);
    expect(JSON.stringify(cmp)).not.toContain(SENTINEL_OP5_CLARIFY);
  });

  it("【invariant】 全 sentinel が同 input に混在しても一つも漏れない (= 系統的検証)", () => {
    const op5 = runShadowOrchestrator({
      utterance: "",
      actualToday: "2026-05-06",
      homeAnchor: {
        lat: 35,
        lng: 139,
        label: SENTINEL_OP5_HOME,
        source: "registered_home",
      },
      clarifyAnswer: SENTINEL_OP5_CLARIFY,
      clarifySlot: "origin",
      isOriginClarifyActive: true,
    });
    const legacy: LegacyShadowSnapshot = {
      targetDate: SENTINEL_TARGETDATE,
      journeyOriginKind: "known_label_only",
      journeyOriginSource: "user_declared",
      journeyOriginLabel: SENTINEL_LEGACY_ORIGIN,
      journeyEndKind: "known_label_only",
      journeyEndSource: "user_explicit_endpoint",
      journeyEndLabel: SENTINEL_LEGACY_END,
      segmentsCount: 1,
    };
    const cmp = compareShadowVsLegacy(legacy, op5);
    const json = JSON.stringify(cmp);
    expect(json).not.toContain(SENTINEL_LEGACY_ORIGIN);
    expect(json).not.toContain(SENTINEL_LEGACY_END);
    expect(json).not.toContain(SENTINEL_TARGETDATE);
    expect(json).not.toContain(SENTINEL_OP5_HOME);
    expect(json).not.toContain(SENTINEL_OP5_CLARIFY);
    // 全 sentinel が共通 prefix を持つ → prefix grep でも 0 件
    expect(json).not.toContain("RAW_LABEL_SENTINEL");
    expect(json).not.toContain("RAW_TARGETDATE_SENTINEL");
  });

  it("【invariant】 sentinel mismatch (= label 違い) でも raw label が出力に出ない", () => {
    // op5 origin = homeAnchor 経由 SENTINEL_OP5_HOME
    //   - locationAnchorFactory が toOriginState で wrap → kind: "known_exact" + source: "registered_home"
    // legacy origin = SENTINEL_LEGACY_ORIGIN
    //   - kind / source を op5 と一致させて、 label のみ違う状態を作る
    // → mismatchCategory = "different_label"
    const op5 = runShadowOrchestrator({
      utterance: "",
      actualToday: "2026-05-06",
      homeAnchor: {
        lat: 35,
        lng: 139,
        label: SENTINEL_OP5_HOME,
        source: "registered_home",
      },
    });
    const legacy: LegacyShadowSnapshot = {
      ...emptyLegacy(),
      targetDate: "2026-05-06",
      journeyOriginKind: "known_exact",
      journeyOriginSource: "registered_home",
      journeyOriginLabel: SENTINEL_LEGACY_ORIGIN,
    };
    const cmp = compareShadowVsLegacy(legacy, op5);
    expect(cmp.journeyOrigin.mismatchCategory).toBe("different_label");
    // raw label は出力に含まれない
    const json = JSON.stringify(cmp);
    expect(json).not.toContain(SENTINEL_OP5_HOME);
    expect(json).not.toContain(SENTINEL_LEGACY_ORIGIN);
    // ただし enum value "different_label" は出力に存在 (= raw でない)
    expect(json).toContain("different_label");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 10. pure
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("compareShadowVsLegacy — pure", () => {
  it("input legacy / op5 を mutate しない", () => {
    const op5 = runOrchestrator("自宅から始める");
    const legacy: LegacyShadowSnapshot = {
      ...emptyLegacy(),
      targetDate: "2026-05-06",
      journeyOriginKind: "known_label_only",
      journeyOriginSource: "user_declared",
      journeyOriginLabel: "自宅",
    };
    const op5Snap = JSON.stringify(op5);
    const legacySnap = JSON.stringify(legacy);
    compareShadowVsLegacy(legacy, op5);
    expect(JSON.stringify(op5)).toBe(op5Snap);
    expect(JSON.stringify(legacy)).toBe(legacySnap);
  });

  it("同じ input で同じ output (= deterministic)", () => {
    const op5 = runOrchestrator("自宅から始める");
    const legacy: LegacyShadowSnapshot = {
      ...emptyLegacy(),
      targetDate: "2026-05-06",
      journeyOriginKind: "known_label_only",
      journeyOriginSource: "user_declared",
      journeyOriginLabel: "自宅",
    };
    const a = compareShadowVsLegacy(legacy, op5);
    const b = compareShadowVsLegacy(legacy, op5);
    expect(a).toEqual(b);
  });
});
