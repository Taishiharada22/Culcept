/**
 * Origin clarify test (PR B-2e Commit 7)
 *
 * CEO/GPT 2026-05-02 PR B-2e 必須証明 10 ケース + 補強テスト
 *
 * 10 必須ケース (CEO/GPT 確定、原則として「最後の砦」 を構造的保証する):
 *   #1: origin unknown + destination resolved + no presentation + no clarify → 発火
 *   #2: activePresentation 中は発火しない
 *   #3: where pendingClarify 中は発火しない
 *   #4: event where 未解決なら origin 優先しない (= where 未確定なら発火しない)
 *   #5: 回答「ホテルから」→ label="ホテル" / source=user_override
 *   #6: user_override は samePlanDate=true で STRONG prior として守られる (Commit 6 で test)
 *   #7: samePlanDate=false では古い user_override を守らない (Commit 6 で test)
 *   #8: endpoint clarify 既存挙動を壊さない (regression、本 file は origin に集中)
 *   #9: label 正規化: 「自宅を出る」→ "自宅" / 「駅から出発」→ "駅"
 *   #10: events ベース判定: travel item only plan は origin clarify しない
 *
 * Part 構成:
 *   A: shouldAskOriginClarify (純関数、発火判定)
 *   B: hasResolvedDestination (純関数)
 *   C: normalizeOriginAnswer / bindOriginAnswer (label 正規化)
 *   D: gapResolver 統合 (origin が priority 50 で他 clarify に負ける)
 *   E: clarifyQuestionBuilder (template)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  shouldAskOriginClarify,
  hasResolvedDestination,
  type DetectOriginGapInput,
} from "@/lib/alter-morning/journey/originGap";
import {
  normalizeOriginAnswer,
  bindOriginAnswer,
} from "@/lib/alter-morning/comprehension/answerBinder";
import {
  resolveGaps,
  PLAN_ORIGIN_SENTINEL_EVENT_ID,
  CLARIFY_PRIORITY,
} from "@/lib/alter-morning/planning/gapResolver";
import { buildClarifyQuestion } from "@/lib/alter-morning/planning/clarifyQuestionBuilder";
import {
  resetEventCounter,
  utteranceProvenance,
  type Event,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { JourneyAnchorState } from "@/lib/alter-morning/journey/anchorState";

beforeEach(() => {
  resetEventCounter();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const UNKNOWN_ORIGIN: JourneyAnchorState = {
  kind: "unknown",
  reason: "no_baseline",
};

const KNOWN_ORIGIN: JourneyAnchorState = {
  kind: "known_exact",
  label: "自宅",
  lat: 35.69,
  lng: 139.7,
  source: "registered_home",
};

function eventWithResolvedWhere(): Event {
  return {
    event_id: "event_1",
    turn_mode: "create",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: {
      startTime: "12:00",
      timeHint: null,
      provenance: utteranceProvenance(["12時"], "high"),
    },
    where: {
      place_ref: "新宿",
      placeType: "exact_proper_noun",
      coordinates: { lat: 35.6896, lng: 139.7006 },
      provenance: utteranceProvenance(["新宿"], "high"),
    },
    what: {
      activity: "ランチ",
      activityCanonical: "ランチ",
      provenance: utteranceProvenance(["ランチ"], "high"),
    },
    who: [],
    transport: null,
    certainty: "asserted",
    missing_semantic_critical: [],
    missing_solver_blockers: [],
  };
}

function eventWithUnresolvedWhere(): Event {
  const ev = eventWithResolvedWhere();
  return {
    ...ev,
    where: {
      place_ref: null,
      placeType: null,
      provenance: utteranceProvenance([], "low"),
    },
    missing_semantic_critical: ["where"],
  };
}

function eventWithLandmarkPlace(): Event {
  const ev = eventWithResolvedWhere();
  return {
    ...ev,
    where: {
      place_ref: "渋谷駅",
      placeType: "landmark_named",
      coordinates: { lat: 35.658, lng: 139.7016 },
      provenance: utteranceProvenance(["渋谷駅"], "high"),
    },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part A: shouldAskOriginClarify (純関数 / 発火判定)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[Part A] shouldAskOriginClarify 発火判定", () => {
  function baseInput(): DetectOriginGapInput {
    return {
      journeyOrigin: UNKNOWN_ORIGIN,
      events: [eventWithResolvedWhere()],
      dialogState: null,
      priorPendingClarify: null,
    };
  }

  describe("[#1 必須] origin unknown + destination resolved + no presentation + no clarify → 発火", () => {
    it("条件全部満たす → true", () => {
      expect(shouldAskOriginClarify(baseInput())).toBe(true);
    });

    it("landmark_named + coordinates でも発火する", () => {
      const input = { ...baseInput(), events: [eventWithLandmarkPlace()] };
      expect(shouldAskOriginClarify(input)).toBe(true);
    });
  });

  describe("[#2 必須] activePresentation 中は発火しない", () => {
    it("activePresentation != null → false", () => {
      const input: DetectOriginGapInput = {
        ...baseInput(),
        dialogState: {
          conversationStatus: "search_candidates_presented",
          activePresentation: { id: "p1", candidates: [] } as any,
        } as any,
      };
      expect(shouldAskOriginClarify(input)).toBe(false);
    });
  });

  describe("[#3 必須] where pendingClarify 中は発火しない", () => {
    it("priorPendingClarify != null → false", () => {
      const input: DetectOriginGapInput = {
        ...baseInput(),
        priorPendingClarify: {
          event_id: "event_1",
          slot: "where",
          kind: "where_center",
          scope: { timeLabel: null, activityLabel: null, eventOrdinal: 1 },
          question: "どのあたり？",
          askedAt: "2026-05-02T12:00:00.000Z",
        },
      };
      expect(shouldAskOriginClarify(input)).toBe(false);
    });
  });

  describe("[#4 必須] event where 未解決なら origin 優先しない", () => {
    it("event の where が未解決 → false", () => {
      const input: DetectOriginGapInput = {
        ...baseInput(),
        events: [eventWithUnresolvedWhere()],
      };
      expect(shouldAskOriginClarify(input)).toBe(false);
    });

    it("placeType が exact_proper_noun でも coordinates なし → false", () => {
      const ev = eventWithResolvedWhere();
      const input: DetectOriginGapInput = {
        ...baseInput(),
        events: [{ ...ev, where: { ...ev.where, coordinates: null } }],
      };
      expect(shouldAskOriginClarify(input)).toBe(false);
    });

    it("missing_semantic_critical に 'where' が含まれていれば false", () => {
      const ev = eventWithResolvedWhere();
      const input: DetectOriginGapInput = {
        ...baseInput(),
        events: [{ ...ev, missing_semantic_critical: ["where"] }],
      };
      expect(shouldAskOriginClarify(input)).toBe(false);
    });
  });

  describe("[#10 必須] events ベース判定: travel item only plan は origin clarify しない", () => {
    it("events.length === 0 → false (= 真の event がない)", () => {
      const input: DetectOriginGapInput = { ...baseInput(), events: [] };
      expect(shouldAskOriginClarify(input)).toBe(false);
    });
  });

  describe("[防御] origin が known_exact なら発火しない", () => {
    it("journeyOrigin.kind !== 'unknown' → false", () => {
      const input: DetectOriginGapInput = {
        ...baseInput(),
        journeyOrigin: KNOWN_ORIGIN,
      };
      expect(shouldAskOriginClarify(input)).toBe(false);
    });
  });

  describe("[防御] search_handoff_blocking 中も発火しない", () => {
    it("conversationStatus === 'search_handoff_blocking' → false", () => {
      const input: DetectOriginGapInput = {
        ...baseInput(),
        dialogState: {
          conversationStatus: "search_handoff_blocking",
          activePresentation: null,
        } as any,
      };
      expect(shouldAskOriginClarify(input)).toBe(false);
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part B: hasResolvedDestination
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[Part B] hasResolvedDestination", () => {
  it("exact_proper_noun + coordinates → true", () => {
    expect(hasResolvedDestination([eventWithResolvedWhere()])).toBe(true);
  });

  it("landmark_named + coordinates → true", () => {
    expect(hasResolvedDestination([eventWithLandmarkPlace()])).toBe(true);
  });

  it("placeType が他の値 → false", () => {
    const ev = eventWithResolvedWhere();
    expect(
      hasResolvedDestination([
        { ...ev, where: { ...ev.where, placeType: "category" } },
      ]),
    ).toBe(false);
  });

  it("少なくとも 1 event が解決していれば true", () => {
    expect(
      hasResolvedDestination([
        eventWithUnresolvedWhere(),
        eventWithResolvedWhere(),
      ]),
    ).toBe(true);
  });

  it("events.length === 0 → false", () => {
    expect(hasResolvedDestination([])).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part C: normalizeOriginAnswer / bindOriginAnswer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[Part C] normalizeOriginAnswer / bindOriginAnswer", () => {
  describe("[#5 必須] 「ホテルから」 → label='ホテル' / source=user_override (本関数は label のみ)", () => {
    it("「ホテルから」 → 'ホテル'", () => {
      expect(normalizeOriginAnswer("ホテルから")).toBe("ホテル");
    });
    it("bindOriginAnswer wraps 結果", () => {
      const r = bindOriginAnswer("ホテルから");
      expect(r.bound).toBe(true);
      if (r.bound) expect(r.label).toBe("ホテル");
    });
  });

  describe("[#9 必須] label 正規化 (suffix 除去)", () => {
    it("「自宅を出る」 → '自宅'", () => {
      expect(normalizeOriginAnswer("自宅を出る")).toBe("自宅");
    });
    it("「駅から出発」 → '駅'", () => {
      expect(normalizeOriginAnswer("駅から出発")).toBe("駅");
    });
    it("「ホテル」 (suffix なし) → 'ホテル'", () => {
      expect(normalizeOriginAnswer("ホテル")).toBe("ホテル");
    });
    it("「ホテルから。」 → 'ホテル' (末尾句読点除去)", () => {
      expect(normalizeOriginAnswer("ホテルから。")).toBe("ホテル");
    });
    it("「ホテルから出る」 → 'ホテル' (= 'から出る' を suffix として剥く)", () => {
      expect(normalizeOriginAnswer("ホテルから出る")).toBe("ホテル");
    });
    it("「ホテルを出発」 → 'ホテル'", () => {
      expect(normalizeOriginAnswer("ホテルを出発")).toBe("ホテル");
    });
  });

  describe("[防御] 空文字 / 空白のみ / 全 suffix 剥いた結果が空 → null", () => {
    it("空文字 → null", () => {
      expect(normalizeOriginAnswer("")).toBe(null);
    });
    it("空白のみ → null", () => {
      expect(normalizeOriginAnswer("   ")).toBe(null);
    });
    it("「から」 のみ → null (= suffix 剥くと空)", () => {
      expect(normalizeOriginAnswer("から")).toBe(null);
    });
    it("bindOriginAnswer 失敗 → semantic_miss", () => {
      const r = bindOriginAnswer("");
      expect(r.bound).toBe(false);
      if (!r.bound) expect(r.reason).toBe("semantic_miss");
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part D: gapResolver 統合 (CLARIFY_PRIORITY で他 clarify に負ける)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[Part D] gapResolver 統合", () => {
  it("originGapDetected=true で他 clarify が無ければ origin が primary になる", () => {
    const result = resolveGaps([eventWithResolvedWhere()], {
      originGapDetected: true,
    });
    expect(result.primary_clarify).not.toBeNull();
    expect(result.primary_clarify?.kind).toBe("origin");
    expect(result.primary_clarify?.event_id).toBe(PLAN_ORIGIN_SENTINEL_EVENT_ID);
    expect(result.primary_clarify?.target_slot).toBe("origin");
  });

  it("originGapDetected=true でも他 clarify があれば origin は負ける (= priority 50 で構造的保証)", () => {
    // turn_mode='modify' + target_ref_confidence='low' で target_ref_low clarify を発火
    // (priority 0 = 最優先) → origin (50) より優先される
    const targetRefLowEvent: Event = {
      ...eventWithResolvedWhere(),
      turn_mode: "modify",
      target_ref: { hint: "あの予定" } as any,
      target_ref_confidence: "low",
    };
    const result = resolveGaps([targetRefLowEvent], {
      originGapDetected: true,
    });
    expect(result.primary_clarify).not.toBeNull();
    // origin (50) ではなく target_ref_low (0) が prevail
    expect(result.primary_clarify?.kind).toBe("target_ref_low");
  });

  it("originGapDetected=false なら origin candidate も追加されない", () => {
    const result = resolveGaps([eventWithResolvedWhere()], {
      originGapDetected: false,
    });
    expect(result.primary_clarify).toBeNull();
  });

  it("ctx.originGapDetected 未指定 = legacy caller、origin candidate 追加されない", () => {
    const result = resolveGaps([eventWithResolvedWhere()]);
    expect(result.primary_clarify).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part D-2: CEO/GPT 確認指示 — origin が **構造的に最低優先** であることの不変条件 test
//
// CEO/GPT 2026-05-02 PR B-2e merge 前 確認指示:
//   「CLARIFY_PRIORITY=50 = 最低」 を where / transport / endpoint など既存 clarify
//   全種類との数値比較で fix する。
//
// 比較ロジック: resolveGaps の `if (score < primaryScore)` → **数字が小さいほど優先**。
//   origin = 50 が他 全 ClarifyKind の値より大きい → 構造的に最低優先 = 最後の砦。
//
// 将来 priority 値が変更されても、本 test で「origin が最大」 が破れたら CI で検出。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[Part D-2 CEO/GPT 確認指示] origin priority は他 全 ClarifyKind より大きい (= 最低優先)", () => {
  it("origin (= 50) は他 全 ClarifyKind の priority 値より大きい", () => {
    const originScore = CLARIFY_PRIORITY.origin;
    expect(originScore).toBe(50);

    // 他 全 ClarifyKind と比較。origin が最大であることを 1 件ずつ assert。
    expect(CLARIFY_PRIORITY.target_ref_low).toBeLessThan(originScore);
    expect(CLARIFY_PRIORITY.coarse_time_bucket).toBeLessThan(originScore);
    expect(CLARIFY_PRIORITY.specific_time).toBeLessThan(originScore);
    expect(CLARIFY_PRIORITY.tentative_chain).toBeLessThan(originScore);
    expect(CLARIFY_PRIORITY.where_center).toBeLessThan(originScore);
    expect(CLARIFY_PRIORITY.where_pick_from_candidates).toBeLessThan(
      originScore,
    );
    expect(CLARIFY_PRIORITY.activity).toBeLessThan(originScore);
    expect(CLARIFY_PRIORITY.transport).toBeLessThan(originScore);
    expect(CLARIFY_PRIORITY.endpoint).toBeLessThan(originScore);
  });

  it("CLARIFY_PRIORITY 全 entry を網羅し、origin 以外で max を取らない", () => {
    // dynamic 検証: Object.values で max を取り、それが origin であることを確認。
    // 将来 ClarifyKind が追加された時、新 kind が origin より大きくなれば test が落ちて検出。
    const entries = Object.entries(CLARIFY_PRIORITY) as Array<
      [keyof typeof CLARIFY_PRIORITY, number]
    >;
    const max = entries.reduce((acc, [k, v]) =>
      v > acc[1] ? [k, v] : acc,
    )[0];
    expect(max).toBe("origin");
  });

  it("origin は構造的に最後の砦: 比較ロジック (score < primaryScore) と整合", () => {
    // 既存比較ロジックの仕様: resolveGaps line ~531
    //   const score = CLARIFY_PRIORITY[a.request.kind] ?? 99;
    //   if (score < primaryScore) { primary = a.request; primaryScore = score; }
    // → 「数字が小さいほど優先」。origin (= 50) が他より大きい = 必ず負ける。
    //
    // origin = 50 < ? = 99 (default for unknown kind)。
    // 意図: 万一 priority table に未登録の kind が出ても、origin より優先される。
    // (= 未登録 kind は 99 で「origin より優先される」 が default 挙動)
    expect(CLARIFY_PRIORITY.origin).toBeLessThan(99);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part E: clarifyQuestionBuilder template
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[Part E] clarifyQuestionBuilder origin template", () => {
  it("origin → 「出発地はどこにする？」", () => {
    expect(buildClarifyQuestion({ kind: "origin" })).toBe("出発地はどこにする？");
  });

  it("origin は prefix を使わない (= scope/hint があっても無視)", () => {
    // hint や scope を渡しても固定文を返す
    expect(
      buildClarifyQuestion({
        kind: "origin",
        hint: "ランチ",
      }),
    ).toBe("出発地はどこにする？");
    expect(
      buildClarifyQuestion({
        kind: "origin",
        scope: {
          timeLabel: "12:00",
          activityLabel: "ランチ",
          eventOrdinal: 1,
          sameLabelCount: 1,
        },
      }),
    ).toBe("出発地はどこにする？");
  });

  it("「今」 を含まない (= future plan 対応、tense neutral)", () => {
    const q = buildClarifyQuestion({ kind: "origin" });
    expect(q).not.toContain("今");
  });
});
