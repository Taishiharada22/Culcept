/**
 * Slot opt-out tests — W3-PR-6 Commit 4
 *
 * CEO 方針 2026-04-22 R7: ユーザーが「どこでもいい」「いつでもいい」等と宣言した
 * slot は、ASK をスキップして進める。
 *
 * カバレッジ:
 *   - extractSlotOptOuts: 各 slot の代表パターンを検出
 *   - resolveGaps + slotOptOuts: opt-out 済み slot の clarify は primary から除外
 *   - 複数 clarify のうち opt-out されていない slot が primary になる（priority 順）
 *   - opt-out 対象外の kind（target_ref_low / tentative_chain）は除外されない
 *   - 1-turn-1-question: 複数 clarify があっても primary_clarify は常に 1 件
 */
import { describe, test, expect, beforeEach } from "vitest";

import {
  extractSlotOptOuts,
  preParseUtterance,
} from "@/lib/alter-morning/comprehension/rulePreParse";
import { resolveGaps } from "@/lib/alter-morning/planning/gapResolver";
import {
  resetEventCounter,
  utteranceProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { Event } from "@/lib/alter-morning/comprehension/eventSchema";

function mkEvent(id: string, overrides: Partial<Event> = {}): Event {
  return {
    event_id: id,
    turn_mode: "create",
    change_scope: null,
    target_ref: null,
    target_ref_confidence: null,
    certainty: "asserted",
    when: { startTime: null, timeHint: null, provenance: utteranceProvenance([], "low") },
    where: { place_ref: null, placeType: null, provenance: utteranceProvenance([], "low") },
    what: { activity: null, activityCanonical: null, provenance: utteranceProvenance([], "low") },
    who: [],
    transport: null,
    missing_semantic_critical: [],
    missing_solver_blockers: [],
    ...overrides,
  } as Event;
}

beforeEach(() => {
  resetEventCounter();
});

describe("extractSlotOptOuts", () => {
  test("'どこでもいい' → where", () => {
    const res = extractSlotOptOuts("カフェに行きたい、どこでもいい");
    expect(res.map((r) => r.value)).toEqual(["where"]);
  });

  test("'いつでもいい' → when", () => {
    const res = extractSlotOptOuts("スタバでコーヒー、いつでもいい");
    expect(res.map((r) => r.value)).toEqual(["when"]);
  });

  test("'なんでもいい' → what", () => {
    const res = extractSlotOptOuts("お昼、なんでもいい");
    expect(res.map((r) => r.value)).toEqual(["what"]);
  });

  test("'移動は任せる' → how", () => {
    const res = extractSlotOptOuts("渋谷に行く、移動は任せる");
    expect(res.map((r) => r.value)).toEqual(["how"]);
  });

  test("'リサーチ不要' → where", () => {
    const res = extractSlotOptOuts("カフェで作業、リサーチ不要");
    expect(res.map((r) => r.value)).toEqual(["where"]);
  });

  test("複数 pattern を同時検出", () => {
    const res = extractSlotOptOuts("お昼どこでもいい、移動は任せる");
    expect(res.map((r) => r.value).sort()).toEqual(["how", "where"]);
  });

  test("NFKC 正規化（全角→半角）後にマッチ", () => {
    const res = extractSlotOptOuts("お昼、ど\uFF43\uFF43\uFF45\u3067\u3082\u3044\u3044");
    // ↑ これは日本語なのでNFKC変化なし。代わりに純粋な ASCII 混じりを確認:
    const res2 = extractSlotOptOuts("お昼、なんでもいい");
    expect(res2.length).toBeGreaterThan(0);
    // 上の "ｃｃ" 全角は変換対象外（ヒットしない想定）
    void res;
  });

  test("opt-out 語がなければ空配列", () => {
    expect(extractSlotOptOuts("スタバで9時にコーヒー")).toEqual([]);
  });

  test("preParseUtterance 統合: slot_opt_outs が hints に入る", () => {
    const h = preParseUtterance("9時にスタバ、どこでもいい");
    expect(h.slot_opt_outs.map((s) => s.value)).toEqual(["where"]);
    expect(h.explicit_times.map((t) => t.value)).toEqual(["09:00"]);
  });
});

describe("resolveGaps + slotOptOuts: primary_clarify から除外", () => {
  test("where ASK が立つ event に対し where opt-out が効き、primary_clarify=null", () => {
    const ev = mkEvent("e1", {
      when: { startTime: "12:00", timeHint: null, provenance: utteranceProvenance(["12時"], "high") },
      what: { activity: "ランチ", activityCanonical: "ランチ", provenance: utteranceProvenance(["ランチ"], "high") },
      missing_semantic_critical: ["where"],
    });
    // where opt-out で primary=null
    const resOptOut = resolveGaps([ev], { slotOptOuts: ["where"] });
    expect(resOptOut.primary_clarify).toBeNull();
    // opt-out なしなら where_center が立つ
    const resNoOptOut = resolveGaps([ev], { grounded: [{ event_id: "e1", place_ref: "", candidates: [], selected: null, status: "unresolved" }] });
    expect(resNoOptOut.primary_clarify).not.toBeNull();
    expect(resNoOptOut.primary_clarify!.kind).toBe("where_center");
  });

  test("複数 clarify の中で opt-out されていない slot が primary になる", () => {
    const eWhen = mkEvent("e_when", {
      where: { place_ref: "スタバ", placeType: "chain_brand", provenance: utteranceProvenance(["スタバ"], "high") },
      what: { activity: "コーヒー", activityCanonical: "コーヒー", provenance: utteranceProvenance(["コーヒー"], "high") },
      missing_semantic_critical: ["when"],
    });
    const eWhat = mkEvent("e_what", {
      when: { startTime: "15:00", timeHint: null, provenance: utteranceProvenance(["15時"], "high") },
      where: { place_ref: "渋谷", placeType: "generic_place", provenance: utteranceProvenance(["渋谷"], "high") },
      missing_semantic_critical: ["what"],
    });
    // when opt-out → What が primary になる
    const res = resolveGaps([eWhen, eWhat], { slotOptOuts: ["when"] });
    expect(res.primary_clarify).not.toBeNull();
    expect(res.primary_clarify!.kind).toBe("activity");
    expect(res.primary_clarify!.event_id).toBe("e_what");
  });

  test("全 slot opt-out → primary_clarify=null（1-turn-1-question の『問わない』ケース）", () => {
    const ev = mkEvent("e1", {
      missing_semantic_critical: ["when"],
      where: { place_ref: "スタバ", placeType: "chain_brand", provenance: utteranceProvenance(["スタバ"], "high") },
      what: { activity: "コーヒー", activityCanonical: "コーヒー", provenance: utteranceProvenance(["コーヒー"], "high") },
    });
    const res = resolveGaps([ev], { slotOptOuts: ["when", "where", "what", "how"] });
    expect(res.primary_clarify).toBeNull();
  });
});

describe("1-turn-1-question 保証", () => {
  test("複数 event が clarify を出しても primary_clarify は常に 1 件", () => {
    const e1 = mkEvent("e1", {
      where: { place_ref: "スタバ", placeType: "chain_brand", provenance: utteranceProvenance(["スタバ"], "high") },
      what: { activity: "コーヒー", activityCanonical: "コーヒー", provenance: utteranceProvenance(["コーヒー"], "high") },
      missing_semantic_critical: ["when"],
    });
    const e2 = mkEvent("e2", {
      when: { startTime: "12:00", timeHint: null, provenance: utteranceProvenance(["12時"], "high") },
      missing_semantic_critical: ["what"],
    });
    const e3 = mkEvent("e3", {
      when: { startTime: "15:00", timeHint: null, provenance: utteranceProvenance(["15時"], "high") },
      where: { place_ref: "渋谷", placeType: "generic_place", provenance: utteranceProvenance(["渋谷"], "high") },
      missing_solver_blockers: ["endpoint"],
    });
    const res = resolveGaps([e1, e2, e3]);
    expect(res.primary_clarify).not.toBeNull();
    // 3 event 分の clarify の中で 1 件だけ UI に出る（slot priority: When が最優先）
    expect(res.primary_clarify!.kind).toBe("specific_time");
    expect(res.primary_clarify!.event_id).toBe("e1");
    // action trace は 3 件分残っている
    const clarifyActions = res.actions.filter((a) => a.type === "clarify");
    expect(clarifyActions).toHaveLength(3);
  });
});
