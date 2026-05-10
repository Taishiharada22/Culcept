/**
 * OP-5.2 redaction.test.ts — redactShadowResult の test
 *
 * 検証カテゴリ:
 *   1. level "none" → null
 *   2. level "summary" → 最小 fields のみ
 *   3. level "verbose" → summary + verbose-only fields
 *   4. priority bucket 化
 *   5. duration bucket 化
 *   6. counts / selected boolean 正確
 *   7. selectedSources / selectedRuleIds 正確
 *   8. reject reason counts 正確
 *   9. travelEdges 集約 (= count + sources + buckets、 raw payload なし)
 *   10. 【CEO invariant】 redacted output に danger key が **再帰的に**存在しない
 *   11. 【CEO invariant】 redacted output に raw value (= 「自宅」「ホテル」 等) が含まれない
 *   12. 【CEO invariant】 summary / verbose の出力差を厳密固定 (= verbose 専用 field が summary に出ない)
 *   13. 【CEO invariant】 verbose でも raw 一切なし
 *   14. pure (= input mutate / deterministic / idempotent)
 */

import { describe, it, expect } from "vitest";
import {
  redactShadowResult,
  type RedactedShadowObservation,
  type RedactedSummaryObservation,
  type RedactedVerboseObservation,
} from "@/lib/alter-morning/op5/redaction";
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

/**
 * CEO 修正点 2: 危険 key list (= **key 名**として禁止、 enum value としては許可)。
 *
 * 例:
 *   - { label: "自宅" } は禁止 (key 名 "label" + raw value)
 *   - { mismatchCategory: "different_label" } は許可 (= enum value 内の "label" 部分文字列は OK)
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

/**
 * 再帰的に object を探索して、 danger key が path 上に存在するかを検出する。
 * 配列の index も path に含む。 値の中身は見ない (= key 名のみ)。
 *
 * 戻り値: 発見された danger key path の配列 (= 空なら安全)
 */
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

/**
 * CEO 修正点 2: raw value (= 「自宅」「ホテル」「東京駅」 等の生活導線文字列) が
 * 出力に含まれるかを検出する。 JSON.stringify で部分一致確認。
 */
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
// 1. level "none" → null
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("redactShadowResult — level 'none'", () => {
  it("level 'none' → null (= emit しない signal)", () => {
    const r = runOrchestrator("自宅から始める");
    expect(redactShadowResult(r, { level: "none" })).toBeNull();
  });

  it("level 'none' は input 内容によらず常に null", () => {
    const r1 = runOrchestrator("");
    const r2 = runOrchestrator("自宅から始めて、東京駅から渋谷へ、夜はホテルで泊まる");
    expect(redactShadowResult(r1, { level: "none" })).toBeNull();
    expect(redactShadowResult(r2, { level: "none" })).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. level "summary"
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("redactShadowResult — level 'summary'", () => {
  it("空 utterance + actualToday → summary fields", () => {
    const r = runOrchestrator("");
    const red = redactShadowResult(r, { level: "summary" });
    expect(red).not.toBeNull();
    if (!red) throw new Error();
    expect(red.level).toBe("summary");
    if (red.level !== "summary") throw new Error();
    expect(red.counts.targetDate).toBe(0);
    expect(red.counts.journeyOrigin).toBe(0);
    expect(red.counts.journeyEnd).toBe(0);
    expect(red.counts.travelEdges).toBe(0);
    // system_default は dispatcher 生成、 selected = true
    expect(red.selected.targetDate).toBe(true);
    expect(red.selected.journeyOrigin).toBe(false);
    expect(red.selected.journeyEnd).toBe(false);
    expect(red.selected.travelEdges).toBe(false);
    expect(red.factoriesInvokedCount).toBe(9);
    expect(red.durationBucket).toMatch(/^(<10ms|10-50ms|50-100ms|100ms\+)$/);
  });

  it("「自宅から始める」 → summary で journeyOrigin selected", () => {
    const r = runOrchestrator("自宅から始める");
    const red = redactShadowResult(r, { level: "summary" });
    if (!red || red.level !== "summary") throw new Error();
    expect(red.counts.journeyOrigin).toBeGreaterThan(0);
    expect(red.selected.journeyOrigin).toBe(true);
  });

  it("travel edge utterance → summary で travelEdges selected", () => {
    const r = runOrchestrator("東京駅から渋谷へ");
    const red = redactShadowResult(r, { level: "summary" });
    if (!red || red.level !== "summary") throw new Error();
    expect(red.counts.travelEdges).toBeGreaterThan(0);
    expect(red.selected.travelEdges).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. level "verbose"
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("redactShadowResult — level 'verbose'", () => {
  it("verbose は summary + 追加 fields を含む", () => {
    const r = runOrchestrator("自宅から始める");
    const red = redactShadowResult(r, { level: "verbose" });
    if (!red || red.level !== "verbose") throw new Error();
    // summary fields
    expect(red.counts).toBeDefined();
    expect(red.selected).toBeDefined();
    expect(red.factoriesInvokedCount).toBe(9);
    expect(red.durationBucket).toBeDefined();
    // verbose-only fields
    expect(red.selectedSources).toBeDefined();
    expect(red.selectedPriorityBuckets).toBeDefined();
    expect(red.selectedConfidences).toBeDefined();
    expect(red.selectedRuleIds).toBeDefined();
    expect(red.rejectReasonCounts).toBeDefined();
    expect(red.travelEdges).toBeDefined();
  });

  it("「自宅から始める」 → verbose で selectedSources / ruleId 確認", () => {
    const r = runOrchestrator("自宅から始める");
    const red = redactShadowResult(r, { level: "verbose" });
    if (!red || red.level !== "verbose") throw new Error();
    // explicitDayOriginFactory が source = "regex_deterministic"、 priority = 950
    expect(red.selectedSources.journeyOrigin).toBe("regex_deterministic");
    expect(red.selectedPriorityBuckets.journeyOrigin).toBe("high"); // 950 → high
    expect(red.selectedConfidences.journeyOrigin).toBe("high");
    expect(red.selectedRuleIds.journeyOrigin).toBe(
      "explicitDayOrigin.kara_hajime",
    );
  });

  it("「ホテルで泊まる」 → verbose で journeyEnd selected", () => {
    const r = runOrchestrator("ホテルで泊まる");
    const red = redactShadowResult(r, { level: "verbose" });
    if (!red || red.level !== "verbose") throw new Error();
    expect(red.selectedSources.journeyEnd).toBe("regex_deterministic");
    expect(red.selectedRuleIds.journeyEnd).toBe("explicitDayEnd.tomaru");
  });

  it("travel edge utterance → travelEdges 集約", () => {
    const r = runOrchestrator("東京駅から渋谷へ");
    const red = redactShadowResult(r, { level: "verbose" });
    if (!red || red.level !== "verbose") throw new Error();
    expect(red.travelEdges.count).toBe(1);
    expect(red.travelEdges.sources).toEqual(["regex_deterministic"]);
    expect(red.travelEdges.priorityBuckets).toEqual(["medium"]); // 600 → medium
  });

  it("rejectReasonCounts は 6 種 RejectReason 全部の key を持つ", () => {
    const r = runOrchestrator("");
    const red = redactShadowResult(r, { level: "verbose" });
    if (!red || red.level !== "verbose") throw new Error();
    expect(Object.keys(red.rejectReasonCounts).sort()).toEqual([
      "invalid_target_date",
      "lower_confidence",
      "lower_priority",
      "source_tie_break_loser",
      "stable_order_loser",
      "unhandled_slot_for_op4",
    ]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. priority bucket
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("redactShadowResult — priority bucket", () => {
  it("priority 950 (= explicitDayOrigin) → 'high'", () => {
    const r = runOrchestrator("自宅から始める");
    const red = redactShadowResult(r, { level: "verbose" });
    if (!red || red.level !== "verbose") throw new Error();
    expect(red.selectedPriorityBuckets.journeyOrigin).toBe("high");
  });

  it("priority 600 (= travelEdge) → 'medium'", () => {
    const r = runOrchestrator("東京駅から渋谷へ");
    const red = redactShadowResult(r, { level: "verbose" });
    if (!red || red.level !== "verbose") throw new Error();
    expect(red.travelEdges.priorityBuckets).toContain("medium");
  });

  it("priority 100 (= system_default) → 'low'", () => {
    const r = runOrchestrator(""); // 全 source unknown → system_default
    const red = redactShadowResult(r, { level: "verbose" });
    if (!red || red.level !== "verbose") throw new Error();
    // system_default の priority = 100 → "low"
    expect(red.selectedPriorityBuckets.targetDate).toBe("low");
  });

  it("priority 数値そのものは出力に含まれない", () => {
    const r = runOrchestrator("自宅から始める");
    const red = redactShadowResult(r, { level: "verbose" });
    const json = JSON.stringify(red);
    // 950 / 600 / 100 等が json に literal で出ないこと
    expect(json).not.toContain("950");
    expect(json).not.toContain("700");
    expect(json).not.toContain("600");
    expect(json).not.toContain("400");
    // factoriesInvokedCount = 9 は許可
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. duration bucket
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("redactShadowResult — duration bucket", () => {
  it("durationBucket は 4 種のいずれか", () => {
    const r = runOrchestrator("自宅から始める");
    const red = redactShadowResult(r, { level: "summary" });
    if (!red) throw new Error();
    expect(["<10ms", "10-50ms", "50-100ms", "100ms+"]).toContain(
      red.durationBucket,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. 【CEO invariant】 danger key 再帰検査
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("redactShadowResult — 【CEO invariant】 danger key 再帰検査", () => {
  it("【invariant】 summary 出力に danger key が再帰的に存在しない", () => {
    const r = runOrchestrator("自宅から始めて、東京駅から渋谷へ、夜はホテルで泊まる");
    const red = redactShadowResult(r, { level: "summary" });
    expect(findDangerKeys(red)).toEqual([]);
  });

  it("【invariant】 verbose 出力に danger key が再帰的に存在しない", () => {
    const r = runOrchestrator("自宅から始めて、東京駅から渋谷へ、夜はホテルで泊まる");
    const red = redactShadowResult(r, { level: "verbose" });
    expect(findDangerKeys(red)).toEqual([]);
  });

  it("【invariant】 多様な input でも danger key が出ない (= 系統的検証)", () => {
    const inputs = [
      "",
      "自宅から始める",
      "東京駅から渋谷へ",
      "最後は自宅に帰る",
      "ホテルで泊まる",
      "自宅から始めて、東京駅から渋谷へ、夜はホテルで泊まる",
      "明日は朝から仕事して、最後は自宅に帰る",
    ];
    for (const utterance of inputs) {
      const r = runOrchestrator(utterance);
      for (const level of ["summary", "verbose"] as const) {
        const red = redactShadowResult(r, { level });
        const dangerPaths = findDangerKeys(red);
        expect(
          dangerPaths,
          `utterance=${utterance}, level=${level}, paths=${dangerPaths.join(",")}`,
        ).toEqual([]);
      }
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. 【CEO invariant】 raw value (= 「自宅」「ホテル」 等) が出力に含まれない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("redactShadowResult — 【CEO invariant】 raw value 検査", () => {
  it("【invariant】 「自宅から始める」 の summary 出力に「自宅」 等が含まれない", () => {
    const r = runOrchestrator("自宅から始める");
    const red = redactShadowResult(r, { level: "summary" });
    expect(containsAnyRawValue(red)).toBeNull();
  });

  it("【invariant】 「自宅から始める」 の verbose 出力にも「自宅」 等が含まれない", () => {
    const r = runOrchestrator("自宅から始める");
    const red = redactShadowResult(r, { level: "verbose" });
    expect(containsAnyRawValue(red)).toBeNull();
  });

  it("【invariant】 travel edge utterance でも生活導線 raw が漏れない", () => {
    const r = runOrchestrator("東京駅から渋谷へ");
    const red = redactShadowResult(r, { level: "verbose" });
    expect(containsAnyRawValue(red)).toBeNull();
  });

  it("【invariant】 複合発話で raw が漏れない (= 生活導線 5 個入り)", () => {
    const r = runOrchestrator(
      "自宅から始めて、東京駅から渋谷へ、夜はホテルで泊まる",
    );
    for (const level of ["summary", "verbose"] as const) {
      const red = redactShadowResult(r, { level });
      const raw = containsAnyRawValue(red);
      expect(raw, `level=${level}, found raw=${raw}`).toBeNull();
    }
  });

  it("【invariant】 多様な生活導線 raw が漏れない (= 系統的検証)", () => {
    const inputs = [
      "自宅から始める",
      "ホテルから東京駅へ",
      "会社で打ち合わせ",
      "実家に帰る",
      "うちから渋谷へ",
      "カフェで仕事",
      "最後はホテルで泊まる",
    ];
    for (const utterance of inputs) {
      const r = runOrchestrator(utterance);
      for (const level of ["summary", "verbose"] as const) {
        const red = redactShadowResult(r, { level });
        const raw = containsAnyRawValue(red);
        expect(
          raw,
          `utterance=${utterance}, level=${level}, found=${raw}`,
        ).toBeNull();
      }
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. 【CEO invariant】 summary / verbose 出力差を厳密固定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("redactShadowResult — 【CEO invariant】 summary / verbose 差", () => {
  it("【invariant】 summary に verbose 専用 field が存在しない", () => {
    const r = runOrchestrator("自宅から始める");
    const red = redactShadowResult(r, { level: "summary" });
    if (!red) throw new Error();
    const r2 = red as unknown as Record<string, unknown>;
    expect(r2.selectedSources).toBeUndefined();
    expect(r2.selectedPriorityBuckets).toBeUndefined();
    expect(r2.selectedConfidences).toBeUndefined();
    expect(r2.selectedRuleIds).toBeUndefined();
    expect(r2.rejectReasonCounts).toBeUndefined();
    expect(r2.travelEdges).toBeUndefined();
  });

  it("【invariant】 summary の top-level keys は明示的に 5 つだけ", () => {
    const r = runOrchestrator("自宅から始める");
    const red = redactShadowResult(r, { level: "summary" });
    if (!red) throw new Error();
    expect(Object.keys(red).sort()).toEqual([
      "counts",
      "durationBucket",
      "factoriesInvokedCount",
      "level",
      "selected",
    ]);
  });

  it("【invariant】 verbose の top-level keys は 11 つ (= summary + verbose 専用 6)", () => {
    const r = runOrchestrator("自宅から始める");
    const red = redactShadowResult(r, { level: "verbose" });
    if (!red) throw new Error();
    expect(Object.keys(red).sort()).toEqual([
      "counts",
      "durationBucket",
      "factoriesInvokedCount",
      "level",
      "rejectReasonCounts",
      "selected",
      "selectedConfidences",
      "selectedPriorityBuckets",
      "selectedRuleIds",
      "selectedSources",
      "travelEdges",
    ]);
  });

  it("【invariant】 verbose でも raw 一切なし (= summary と同じ raw-free)", () => {
    const r = runOrchestrator("自宅から始めて、東京駅から渋谷へ、夜はホテルで泊まる");
    const verbose = redactShadowResult(r, { level: "verbose" });
    expect(findDangerKeys(verbose)).toEqual([]);
    expect(containsAnyRawValue(verbose)).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. 【CEO invariant】 sentinel raw value 漏洩検査
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 目的 (CEO 2026-05-06 追加確認):
//   raw label / raw utterance が、 既知の key (= label / rawLabel) ではなく、
//   将来うっかり別 key (= name / value / text / selected 等) で漏れる事故を防ぐ。
//
//   sentinel 値は通常の日本語に存在しない unique 文字列。 redaction output / json
//   に sentinel が **絶対に出ない**ことを証明することで、 raw 漏洩経路が
//   構造的に閉じていることを担保する。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SENTINEL_UTTERANCE = "RAW_UTTERANCE_SENTINEL_67890";
const SENTINEL_LABEL_HOME = "RAW_LABEL_SENTINEL_HOME_12345";
const SENTINEL_LABEL_PRIOR_ORIGIN = "RAW_LABEL_SENTINEL_PRIOR_ORIGIN_AAAAA";
const SENTINEL_LABEL_PRIOR_END = "RAW_LABEL_SENTINEL_PRIOR_END_BBBBB";
const SENTINEL_LABEL_PREVIOUS_DAY = "RAW_LABEL_SENTINEL_PREVDAY_CCCCC";
const SENTINEL_LABEL_CLARIFY = "RAW_LABEL_SENTINEL_CLARIFY_DDDDD";
const SENTINEL_LLM_TARGETDATE = "RAW_LLM_TARGETDATE_SENTINEL_EEEEE";

describe("redactShadowResult — 【CEO invariant】 sentinel raw value 漏洩検査", () => {
  it("【invariant】 sentinel utterance が summary / verbose 出力に含まれない", () => {
    const r = runShadowOrchestrator({
      utterance: SENTINEL_UTTERANCE,
      actualToday: "2026-05-06",
    });
    for (const level of ["summary", "verbose"] as const) {
      const red = redactShadowResult(r, { level });
      expect(JSON.stringify(red)).not.toContain(SENTINEL_UTTERANCE);
    }
  });

  it("【invariant】 sentinel label (homeAnchor 経由) が summary / verbose 出力に含まれない", () => {
    const r = runShadowOrchestrator({
      utterance: "東京駅から渋谷へ",
      actualToday: "2026-05-06",
      homeAnchor: {
        lat: 35.6812,
        lng: 139.7671,
        label: SENTINEL_LABEL_HOME,
        source: "registered_home",
      },
    });
    for (const level of ["summary", "verbose"] as const) {
      const red = redactShadowResult(r, { level });
      expect(JSON.stringify(red)).not.toContain(SENTINEL_LABEL_HOME);
    }
  });

  it("【invariant】 sentinel label (priorPlan origin / end) が出力に含まれない", () => {
    const r = runShadowOrchestrator({
      utterance: "",
      actualToday: "2026-05-06",
      samePlanDate: true,
      priorPlan: {
        date: "2026-05-06",
        items: [],
        dayConditions: {} as never,
        createdAt: "2026-05-06T00:00:00.000Z",
        confirmed: false,
        status: "provisional",
        journeyOrigin: {
          kind: "known_exact",
          label: SENTINEL_LABEL_PRIOR_ORIGIN,
          lat: 35,
          lng: 139,
          source: "user_declared",
        },
        journeyEnd: {
          kind: "known_exact",
          label: SENTINEL_LABEL_PRIOR_END,
          lat: 35.1,
          lng: 139.1,
          source: "user_explicit_endpoint",
        },
      },
    });
    for (const level of ["summary", "verbose"] as const) {
      const red = redactShadowResult(r, { level });
      const json = JSON.stringify(red);
      expect(json).not.toContain(SENTINEL_LABEL_PRIOR_ORIGIN);
      expect(json).not.toContain(SENTINEL_LABEL_PRIOR_END);
    }
  });

  it("【invariant】 sentinel label (previousDayPlan 経由) が出力に含まれない", () => {
    const r = runShadowOrchestrator({
      utterance: "",
      actualToday: "2026-05-06",
      previousDayPlan: {
        date: "2026-05-05",
        items: [],
        dayConditions: {} as never,
        createdAt: "2026-05-05T00:00:00.000Z",
        confirmed: false,
        status: "provisional",
        journeyEnd: {
          kind: "known_exact",
          label: SENTINEL_LABEL_PREVIOUS_DAY,
          lat: 35.2,
          lng: 139.2,
          source: "user_explicit_endpoint",
        },
      },
    });
    for (const level of ["summary", "verbose"] as const) {
      const red = redactShadowResult(r, { level });
      expect(JSON.stringify(red)).not.toContain(SENTINEL_LABEL_PREVIOUS_DAY);
    }
  });

  it("【invariant】 sentinel label (UI clarify answer 経由) が出力に含まれない", () => {
    const r = runShadowOrchestrator({
      utterance: "",
      actualToday: "2026-05-06",
      clarifyAnswer: SENTINEL_LABEL_CLARIFY,
      clarifySlot: "origin",
      isOriginClarifyActive: true,
    });
    for (const level of ["summary", "verbose"] as const) {
      const red = redactShadowResult(r, { level });
      expect(JSON.stringify(red)).not.toContain(SENTINEL_LABEL_CLARIFY);
    }
  });

  it("【invariant】 sentinel LLM targetDate raw が出力に含まれない", () => {
    const r = runShadowOrchestrator({
      utterance: "",
      actualToday: "2026-05-06",
      llmTargetDate: SENTINEL_LLM_TARGETDATE,
      llmTargetDateProvenance: {
        source_type: "utterance",
        source_span: ["dummy"],
        provenance_confidence: "high",
        from_utterance: true,
      },
    });
    for (const level of ["summary", "verbose"] as const) {
      const red = redactShadowResult(r, { level });
      expect(JSON.stringify(red)).not.toContain(SENTINEL_LLM_TARGETDATE);
    }
  });

  it("【invariant】 全 sentinel が同 input で混在しても、 一つも漏れない (= 系統的検証)", () => {
    const r = runShadowOrchestrator({
      utterance: SENTINEL_UTTERANCE,
      actualToday: "2026-05-06",
      llmTargetDate: SENTINEL_LLM_TARGETDATE,
      llmTargetDateProvenance: {
        source_type: "utterance",
        source_span: ["dummy"],
        provenance_confidence: "high",
        from_utterance: true,
      },
      homeAnchor: {
        lat: 35,
        lng: 139,
        label: SENTINEL_LABEL_HOME,
        source: "registered_home",
      },
      samePlanDate: true,
      priorPlan: {
        date: "2026-05-06",
        items: [],
        dayConditions: {} as never,
        createdAt: "2026-05-06T00:00:00.000Z",
        confirmed: false,
        status: "provisional",
        journeyOrigin: {
          kind: "known_exact",
          label: SENTINEL_LABEL_PRIOR_ORIGIN,
          lat: 35,
          lng: 139,
          source: "user_declared",
        },
        journeyEnd: {
          kind: "known_exact",
          label: SENTINEL_LABEL_PRIOR_END,
          lat: 35.1,
          lng: 139.1,
          source: "user_explicit_endpoint",
        },
      },
      previousDayPlan: {
        date: "2026-05-05",
        items: [],
        dayConditions: {} as never,
        createdAt: "2026-05-05T00:00:00.000Z",
        confirmed: false,
        status: "provisional",
        journeyEnd: {
          kind: "known_exact",
          label: SENTINEL_LABEL_PREVIOUS_DAY,
          lat: 35.2,
          lng: 139.2,
          source: "user_explicit_endpoint",
        },
      },
      clarifyAnswer: SENTINEL_LABEL_CLARIFY,
      clarifySlot: "origin",
      isOriginClarifyActive: true,
    });
    for (const level of ["summary", "verbose"] as const) {
      const red = redactShadowResult(r, { level });
      const json = JSON.stringify(red);
      expect(json).not.toContain(SENTINEL_UTTERANCE);
      expect(json).not.toContain(SENTINEL_LLM_TARGETDATE);
      expect(json).not.toContain(SENTINEL_LABEL_HOME);
      expect(json).not.toContain(SENTINEL_LABEL_PRIOR_ORIGIN);
      expect(json).not.toContain(SENTINEL_LABEL_PRIOR_END);
      expect(json).not.toContain(SENTINEL_LABEL_PREVIOUS_DAY);
      expect(json).not.toContain(SENTINEL_LABEL_CLARIFY);
      // 全 sentinel が共通 prefix を持つ → prefix grep でも 0 件
      expect(json).not.toContain("RAW_UTTERANCE_SENTINEL");
      expect(json).not.toContain("RAW_LABEL_SENTINEL");
      expect(json).not.toContain("RAW_LLM_TARGETDATE_SENTINEL");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 10. pure (= input mutate / deterministic / idempotent)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("redactShadowResult — pure", () => {
  it("input ShadowOrchestratorResult を mutate しない", () => {
    const r = runOrchestrator("自宅から始める");
    const snapshot = JSON.stringify(r);
    redactShadowResult(r, { level: "verbose" });
    expect(JSON.stringify(r)).toBe(snapshot);
  });

  it("同じ input + level で同じ output (= deterministic、 ただし duration は同 bucket になる前提)", () => {
    const r = runOrchestrator("自宅から始める");
    const a = redactShadowResult(r, { level: "summary" });
    const b = redactShadowResult(r, { level: "summary" });
    expect(a).toEqual(b);
  });

  it("level 'none' は何度呼んでも null", () => {
    const r = runOrchestrator("自宅から始める");
    expect(redactShadowResult(r, { level: "none" })).toBeNull();
    expect(redactShadowResult(r, { level: "none" })).toBeNull();
  });
});
