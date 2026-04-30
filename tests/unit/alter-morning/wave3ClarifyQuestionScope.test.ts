/**
 * ClarifyQuestionBuilder scope 強化 — W3-PR-7 Commit 3
 *
 * 設計書: docs/alter-morning-comprehension-first-wave3-pr7-design.md §5
 *
 * カバレッジ:
 *   - scope.timeLabel + activityLabel → 「朝の仕事はどのあたり？」
 *   - timeLabel only → 「朝の予定は…？」
 *   - activityLabel only → 「ランチは…？」
 *   - 同種 event 複数（sameLabelCount>=2）→ 「1つ目の仕事は…」
 *   - scope 無し + hint → 旧挙動「「hint」は…？」
 *   - scope 無し + hint 無し → generic
 *   - 語尾が直球 `?` で終わる（「かな？」「ですか？」等を含まない）
 *   - gapResolver 経由: events から scope が自動計算される
 */
import { describe, test, expect } from "vitest";

import {
  buildClarifyQuestion,
  attachClarifyQuestion,
} from "@/lib/alter-morning/planning/clarifyQuestionBuilder";
import type { ClarifyScope } from "@/lib/alter-morning/planning/gapResolver";
import {
  resolveGaps,
  buildScopeFromEvents,
} from "@/lib/alter-morning/planning/gapResolver";
import {
  inferredProvenance,
  utteranceProvenance,
  type Event,
} from "@/lib/alter-morning/comprehension/eventSchema";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkScope(overrides: Partial<ClarifyScope> = {}): ClarifyScope {
  return {
    timeLabel: null,
    activityLabel: null,
    eventOrdinal: 1,
    sameLabelCount: 1,
    ...overrides,
  };
}

function mkEvent(overrides: Partial<Event> = {}): Event {
  return {
    event_id: "e1",
    turn_mode: "create",
    change_scope: null,
    target_ref: null,
    target_ref_confidence: null,
    certainty: "asserted",
    when: { startTime: null, timeHint: null, provenance: inferredProvenance() },
    where: {
      place_ref: null,
      placeType: null,
      provenance: inferredProvenance(),
    },
    what: {
      activity: "",
      activityCanonical: "",
      provenance: inferredProvenance(),
    },
    who: [],
    transport: null,
    missing_semantic_critical: [],
    missing_solver_blockers: [],
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prefix パターン
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildClarifyQuestion — scope prefix", () => {
  test("timeLabel + activityLabel → 「朝の仕事は…？」", () => {
    const scope = mkScope({ timeLabel: "朝", activityLabel: "仕事" });
    const q = buildClarifyQuestion({ kind: "where_center", scope });
    expect(q).toBe("朝の仕事はどのあたり？");
  });

  test("timeLabel のみ → 「朝の予定は…？」", () => {
    const scope = mkScope({ timeLabel: "朝" });
    const q = buildClarifyQuestion({ kind: "specific_time", scope });
    expect(q).toBe("朝の予定は何時頃？");
  });

  test("activityLabel のみ → 「ランチは…？」", () => {
    const scope = mkScope({ activityLabel: "ランチ" });
    const q = buildClarifyQuestion({ kind: "where_center", scope });
    expect(q).toBe("ランチはどのあたり？");
  });

  test("HH:mm timeLabel もそのまま prefix に入る", () => {
    const scope = mkScope({ timeLabel: "19:00", activityLabel: "ディナー" });
    const q = buildClarifyQuestion({ kind: "where_center", scope });
    expect(q).toBe("19:00のディナーはどのあたり？");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// eventOrdinal（同種 event 複数）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildClarifyQuestion — ordinal prefix on duplicate events", () => {
  test("sameLabelCount>=2 の 1 件目 → 「1つ目の仕事…」", () => {
    const scope = mkScope({
      timeLabel: "朝",
      activityLabel: "仕事",
      eventOrdinal: 1,
      sameLabelCount: 2,
    });
    const q = buildClarifyQuestion({ kind: "specific_time", scope });
    expect(q).toBe("1つ目の朝の仕事は何時頃？");
  });

  test("sameLabelCount>=2 の 2 件目 → 「2つ目の…」", () => {
    const scope = mkScope({
      timeLabel: "朝",
      activityLabel: "仕事",
      eventOrdinal: 2,
      sameLabelCount: 2,
    });
    const q = buildClarifyQuestion({ kind: "where_center", scope });
    expect(q).toBe("2つ目の朝の仕事はどのあたり？");
  });

  test("sameLabelCount===1 の時は ordinal 付けない", () => {
    const scope = mkScope({
      timeLabel: "朝",
      activityLabel: "仕事",
      eventOrdinal: 1,
      sameLabelCount: 1,
    });
    const q = buildClarifyQuestion({ kind: "where_center", scope });
    expect(q).toBe("朝の仕事はどのあたり？");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// hint フォールバック
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildClarifyQuestion — hint fallback (no scope)", () => {
  test("scope 無し + hint → 「「hint」は…？」", () => {
    const q = buildClarifyQuestion({ kind: "specific_time", hint: "ランチ" });
    expect(q).toBe("「ランチ」は何時頃？");
  });

  test("scope も hint も無し → generic", () => {
    const q = buildClarifyQuestion({ kind: "specific_time" });
    expect(q).toBe("何時頃？");
  });

  test("scope が activityLabel を持てば、hint より scope を優先", () => {
    const q = buildClarifyQuestion({
      kind: "specific_time",
      hint: "無視されるべき",
      scope: mkScope({ activityLabel: "ランチ" }),
    });
    expect(q).toBe("ランチは何時頃？");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 語尾は直球 ?（緩衝語禁止）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildClarifyQuestion — sentence-end is bare ?", () => {
  const kinds = [
    "coarse_time_bucket",
    "specific_time",
    "activity",
    "tentative_chain",
    "target_ref_low",
    "where_center",
    "where_pick_from_candidates",
    "transport",
    "endpoint",
  ] as const;

  test.each(kinds)("kind=%s: question は「？」で終わり、緩衝語を含まない", (kind) => {
    const scope = mkScope({ timeLabel: "朝", activityLabel: "仕事" });
    const q = buildClarifyQuestion({ kind, scope });
    expect(q.endsWith("？")).toBe(true);
    // 緩衝語（「かな？」「ですか？」「でしょうか？」「ますか？」「したいですか？」）を含まない
    expect(q).not.toMatch(/かな？/);
    expect(q).not.toMatch(/ですか？/);
    expect(q).not.toMatch(/でしょうか？/);
    expect(q).not.toMatch(/ますか？/);
    expect(q).not.toMatch(/したいですか？/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// attachClarifyQuestion
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("attachClarifyQuestion — scope aware", () => {
  test("req.scope を含めて question が生成される", () => {
    const req = {
      event_id: "e1",
      kind: "where_center" as const,
      target_slot: "where" as const,
      hint: "仕事",
      scope: mkScope({ timeLabel: "朝", activityLabel: "仕事" }),
      question: "",
    };
    const resolved = attachClarifyQuestion(req);
    expect(resolved.question).toBe("朝の仕事はどのあたり？");
    expect(resolved).not.toBe(req);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildScopeFromEvents（純関数の直接テスト）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildScopeFromEvents", () => {
  test("timeHint=morning → timeLabel='朝'", () => {
    const ev = mkEvent({
      when: { startTime: null, timeHint: "morning", provenance: utteranceProvenance(["朝"]) },
      what: { activity: "仕事", activityCanonical: "仕事", provenance: utteranceProvenance(["仕事"]) },
    });
    const scope = buildScopeFromEvents([ev], "e1");
    expect(scope).not.toBeNull();
    expect(scope!.timeLabel).toBe("朝");
    expect(scope!.activityLabel).toBe("仕事");
    expect(scope!.eventOrdinal).toBe(1);
    expect(scope!.sameLabelCount).toBe(1);
  });

  test("startTime='09:00' → timeLabel='09:00'", () => {
    const ev = mkEvent({
      when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance(["9時"]) },
      what: { activity: "会議", activityCanonical: "会議", provenance: utteranceProvenance(["会議"]) },
    });
    const scope = buildScopeFromEvents([ev], "e1");
    expect(scope!.timeLabel).toBe("09:00");
  });

  test("同 timeLabel+activityLabel の event が 2 つ → sameLabelCount=2", () => {
    const ev1 = mkEvent({
      event_id: "e1",
      when: { startTime: null, timeHint: "morning", provenance: utteranceProvenance(["朝"]) },
      what: { activity: "仕事", activityCanonical: "仕事", provenance: utteranceProvenance(["仕事"]) },
    });
    const ev2 = mkEvent({
      event_id: "e2",
      when: { startTime: null, timeHint: "morning", provenance: utteranceProvenance(["朝"]) },
      what: { activity: "仕事", activityCanonical: "仕事", provenance: utteranceProvenance(["仕事"]) },
    });
    const scope1 = buildScopeFromEvents([ev1, ev2], "e1");
    const scope2 = buildScopeFromEvents([ev1, ev2], "e2");
    expect(scope1!.sameLabelCount).toBe(2);
    expect(scope1!.eventOrdinal).toBe(1);
    expect(scope2!.sameLabelCount).toBe(2);
    expect(scope2!.eventOrdinal).toBe(2);
  });

  test("event_id が無ければ null", () => {
    const ev = mkEvent({ event_id: "e1" });
    expect(buildScopeFromEvents([ev], "nope")).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// resolveGaps 経由: ClarifyRequest に scope が付き、question が scope 反映
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolveGaps emits scope-aware primary_clarify", () => {
  test("When missing + 朝仕事 → 「朝の仕事は何時頃？」相当", () => {
    const ev = mkEvent({
      when: { startTime: null, timeHint: "morning", provenance: utteranceProvenance(["朝"]) },
      where: {
        place_ref: "オフィス",
        placeType: "exact_proper_noun",
        provenance: utteranceProvenance(["オフィス"]),
      },
      what: { activity: "仕事", activityCanonical: "仕事", provenance: utteranceProvenance(["仕事"]) },
      missing_semantic_critical: ["when"],
    });
    const res = resolveGaps([ev]);
    expect(res.primary_clarify).not.toBeNull();
    expect(res.primary_clarify!.scope).toBeDefined();
    expect(res.primary_clarify!.scope!.timeLabel).toBe("朝");
    expect(res.primary_clarify!.scope!.activityLabel).toBe("仕事");
    expect(res.primary_clarify!.question).toContain("朝の仕事");
    expect(res.primary_clarify!.question.endsWith("？")).toBe(true);
  });
});
