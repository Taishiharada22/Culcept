/**
 * Where Slot Classifier tests — W3-PR-6 Commit 2
 *
 * 三層 (FIXED / PROVISIONAL / ASK) の決定ロジックと cross-event anchor を検証する。
 *
 * カバレッジ:
 *   - FIXED: known_base / exact_proper_noun / resolved_single / respected_unresolved
 *   - PROVISIONAL: ambiguous_top_pick (<=5) / cross_event_anchor (adjacent, within_window)
 *   - ASK: missing_no_anchor / ambiguous_too_many
 *   - gapResolver 統合: semantic==["where"] で ASK kind が立つ / FIXED/PROVISIONAL で
 *     defer_to_place_grounder に落ちる
 *   - 優先度: Where ASK は When ASK の後、What ASK の前
 */
import { describe, test, expect, beforeEach } from "vitest";

import {
  classifyWhereSlot,
  findCrossEventAnchor,
  WHERE_MAX_CANDIDATES_FOR_RECOMMENDATION,
  WHERE_CROSS_EVENT_TIME_WINDOW_MIN,
} from "@/lib/alter-morning/planning/whereClassifier";
import { resolveGaps } from "@/lib/alter-morning/planning/gapResolver";
import {
  resetEventCounter,
  utteranceProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { Event } from "@/lib/alter-morning/comprehension/eventSchema";
import type {
  GroundedPlace,
  PlaceCandidate,
} from "@/lib/alter-morning/planning/placeGrounder";

function mkEvent(id: string, overrides: Partial<Event> = {}): Event {
  return {
    event_id: id,
    turn_mode: "create",
    change_scope: null,
    target_ref: null,
    target_ref_confidence: null,
    certainty: "asserted",
    when: {
      startTime: null,
      timeHint: null,
      provenance: utteranceProvenance([], "low"),
    },
    where: {
      place_ref: null,
      placeType: null,
      provenance: utteranceProvenance([], "low"),
    },
    what: {
      activity: null,
      activityCanonical: null,
      provenance: utteranceProvenance([], "low"),
    },
    who: [],
    transport: null,
    missing_semantic_critical: [],
    missing_solver_blockers: [],
    ...overrides,
  } as Event;
}

function mkCandidate(name: string): PlaceCandidate {
  return {
    resolvedName: name,
    placeType: "chain_brand",
    confidence: "medium",
    source: "placeTable",
  };
}

function mkGrounded(
  eventId: string,
  status: GroundedPlace["status"],
  candidates: PlaceCandidate[] = [],
  place_ref = "X",
): GroundedPlace {
  return {
    event_id: eventId,
    place_ref,
    candidates,
    selected: candidates[0] ?? null,
    status,
  };
}

beforeEach(() => {
  resetEventCounter();
});

describe("classifyWhereSlot — FIXED", () => {
  test("known_base placeType → FIXED/known_base", () => {
    const ev = mkEvent("e1", {
      where: {
        place_ref: "自宅",
        placeType: "known_base",
        provenance: utteranceProvenance(["自宅"], "high"),
      },
    });
    const grounded = [
      mkGrounded("e1", "resolved", [{ ...mkCandidate("自宅"), placeType: "known_base", source: "user_baseline" }], "自宅"),
    ];
    const res = classifyWhereSlot(ev, { events: [ev], index: 0, grounded });
    expect(res.kind).toBe("fixed");
    if (res.kind === "fixed") expect(res.reason).toBe("known_base");
  });

  test("exact_proper_noun + resolved → FIXED/exact_proper_noun（R1）", () => {
    const ev = mkEvent("e1", {
      where: {
        place_ref: "ブルーボトルコーヒー青山店",
        placeType: "exact_proper_noun",
        provenance: utteranceProvenance(["ブルーボトルコーヒー青山店"], "high"),
      },
    });
    const grounded = [mkGrounded("e1", "resolved", [mkCandidate("ブルーボトルコーヒー青山店")])];
    const res = classifyWhereSlot(ev, { events: [ev], index: 0, grounded });
    expect(res.kind).toBe("fixed");
    if (res.kind === "fixed") expect(res.reason).toBe("exact_proper_noun");
  });

  test("chain_brand + resolved 単一候補 → ASK（W3-PR-8: vague は無条件 ASK）", () => {
    // W3-PR-8 dialog-control: vague 3 sub-kind はすべて ASK（blocking）。
    // PR-9 の anchor/chain 検索が入るまで provisional 昇格は禁止（CEO 2026-04-22）。
    const ev = mkEvent("e1", {
      where: {
        place_ref: "スタバ",
        placeType: "chain_brand",
        provenance: utteranceProvenance(["スタバ"], "high"),
      },
    });
    const grounded = [mkGrounded("e1", "resolved", [mkCandidate("スターバックス")])];
    const res = classifyWhereSlot(ev, { events: [ev], index: 0, grounded });
    expect(res.kind).toBe("ask");
  });

  test("exact_proper_noun（辞書 miss）でも placeType で FIXED（respected_unresolved ではなく exact_proper_noun）", () => {
    const ev = mkEvent("e1", {
      where: {
        place_ref: "ナゾのカフェ",
        placeType: "exact_proper_noun",
        provenance: utteranceProvenance(["ナゾのカフェ"], "high"),
      },
    });
    const grounded = [mkGrounded("e1", "unresolved", [])];
    const res = classifyWhereSlot(ev, { events: [ev], index: 0, grounded });
    expect(res.kind).toBe("fixed");
    if (res.kind === "fixed") expect(res.reason).toBe("exact_proper_noun");
  });
});

describe("classifyWhereSlot — PROVISIONAL (missing 系のみ、vague は ASK 化)", () => {
  test(`ambiguous 候補 ${WHERE_MAX_CANDIDATES_FOR_RECOMMENDATION} 件以下 → ASK（W3-PR-8: vague 無条件 ASK）`, () => {
    // PR-7 では PROVISIONAL/ambiguous_top_pick だったが、PR-8 で廃止。
    // anchor 検索が動く PR-9 で復活予定。
    const ev = mkEvent("e1", {
      where: {
        place_ref: "カフェ",
        placeType: "generic_place",
        provenance: utteranceProvenance(["カフェ"], "medium"),
      },
    });
    const cands = Array.from({ length: WHERE_MAX_CANDIDATES_FOR_RECOMMENDATION }, (_, i) =>
      mkCandidate(`候補${i}`),
    );
    const grounded = [mkGrounded("e1", "ambiguous", cands)];
    const res = classifyWhereSlot(ev, { events: [ev], index: 0, grounded });
    expect(res.kind).toBe("ask");
  });

  test("place_ref==null + adjacent resolved event あり → PROVISIONAL/cross_event_anchor", () => {
    const e1 = mkEvent("e1", {
      when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance(["9時"], "high") },
      where: {
        place_ref: "スタバ",
        placeType: "chain_brand",
        provenance: utteranceProvenance(["スタバ"], "high"),
      },
    });
    const e2 = mkEvent("e2", {
      when: { startTime: "10:00", timeHint: null, provenance: utteranceProvenance(["10時"], "high") },
      // place_ref null
    });
    const grounded: GroundedPlace[] = [
      mkGrounded("e1", "resolved", [mkCandidate("スターバックス")], "スタバ"),
      mkGrounded("e2", "unresolved", []),
    ];
    const res = classifyWhereSlot(e2, { events: [e1, e2], index: 1, grounded });
    expect(res.kind).toBe("provisional");
    if (res.kind === "provisional") {
      expect(res.reason).toBe("cross_event_anchor");
      expect(res.anchorEventId).toBe("e1");
    }
  });
});

describe("classifyWhereSlot — ASK", () => {
  test("place_ref==null かつ anchor なし → ASK/missing_no_anchor", () => {
    const ev = mkEvent("e1", {
      when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance(["9時"], "high") },
    });
    const grounded = [mkGrounded("e1", "unresolved", [])];
    const res = classifyWhereSlot(ev, { events: [ev], index: 0, grounded });
    expect(res.kind).toBe("ask");
    if (res.kind === "ask") expect(res.reason).toBe("missing_no_anchor");
  });

  test(`ambiguous 候補 ${WHERE_MAX_CANDIDATES_FOR_RECOMMENDATION + 1} 件 → ASK/ambiguous_too_many`, () => {
    const ev = mkEvent("e1", {
      where: {
        place_ref: "カフェ",
        placeType: "generic_place",
        provenance: utteranceProvenance(["カフェ"], "medium"),
      },
    });
    const cands = Array.from(
      { length: WHERE_MAX_CANDIDATES_FOR_RECOMMENDATION + 1 },
      (_, i) => mkCandidate(`候補${i}`),
    );
    const grounded = [mkGrounded("e1", "ambiguous", cands)];
    const res = classifyWhereSlot(ev, { events: [ev], index: 0, grounded });
    expect(res.kind).toBe("ask");
    if (res.kind === "ask") expect(res.reason).toBe("ambiguous_too_many");
  });
});

describe("findCrossEventAnchor — 優先順位", () => {
  test("adjacent が時間窓外でも優先採用される（R4）", () => {
    const e1 = mkEvent("e1", {
      when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance(["9時"], "high") },
    });
    const e2 = mkEvent("e2", {
      when: {
        // adjacent だが時間窓外（90分超）
        startTime: `${String(9 + Math.ceil((WHERE_CROSS_EVENT_TIME_WINDOW_MIN + 30) / 60)).padStart(2, "0")}:00`,
        timeHint: null,
        provenance: utteranceProvenance([], "high"),
      },
    });
    const grounded: GroundedPlace[] = [
      mkGrounded("e1", "resolved", [mkCandidate("スタバ")]),
      mkGrounded("e2", "unresolved", []),
    ];
    const anchor = findCrossEventAnchor({ events: [e1, e2], index: 1, grounded });
    expect(anchor).not.toBeNull();
    expect(anchor!.reason).toBe("adjacent");
    expect(anchor!.anchor.event_id).toBe("e1");
  });

  test("adjacent が全て unresolved かつ時間窓外なら anchor は null", () => {
    // 3 event: index=1 (e2) から見て adjacent e1/e3 は unresolved、
    // e1 resolved 化を模しても e2 と 180 分離れて窓外 → null
    const e1 = mkEvent("e1", {
      when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance([], "high") },
      where: { place_ref: "スタバ", placeType: "chain_brand", provenance: utteranceProvenance(["スタバ"], "high") },
    });
    const e2 = mkEvent("e2", {
      when: { startTime: "13:00", timeHint: null, provenance: utteranceProvenance([], "high") },
      where: { place_ref: null, placeType: null, provenance: utteranceProvenance([], "low") },
    });
    const e3 = mkEvent("e3", {
      when: { startTime: "14:00", timeHint: null, provenance: utteranceProvenance([], "high") },
      where: { place_ref: null, placeType: null, provenance: utteranceProvenance([], "low") },
    });
    // index=2 (e3): adjacent=e2(unresolved)、e1 は非 adjacent で差 300 分 → 窓外
    const grounded: GroundedPlace[] = [
      mkGrounded("e1", "resolved", [mkCandidate("スタバ")], "スタバ"),
      mkGrounded("e2", "unresolved", []),
      mkGrounded("e3", "unresolved", []),
    ];
    const anchor = findCrossEventAnchor({ events: [e1, e2, e3], index: 2, grounded });
    expect(anchor).toBeNull();
  });

  test("時間窓内の非 adjacent resolved event が採用される", () => {
    const e1 = mkEvent("e1", {
      when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance([], "high") },
      where: { place_ref: "スタバ", placeType: "chain_brand", provenance: utteranceProvenance(["スタバ"], "high") },
    });
    const e2 = mkEvent("e2", {
      when: { startTime: "10:00", timeHint: null, provenance: utteranceProvenance([], "high") },
      where: { place_ref: null, placeType: null, provenance: utteranceProvenance([], "low") },
    });
    const e3 = mkEvent("e3", {
      when: { startTime: "10:30", timeHint: null, provenance: utteranceProvenance([], "high") },
      where: { place_ref: null, placeType: null, provenance: utteranceProvenance([], "low") },
    });
    // index=2 (e3): adjacent e2 は unresolved、e1 (index 0) は非 adjacent で差 90 分、窓内
    const grounded: GroundedPlace[] = [
      mkGrounded("e1", "resolved", [mkCandidate("スタバ")], "スタバ"),
      mkGrounded("e2", "unresolved", []),
      mkGrounded("e3", "unresolved", []),
    ];
    const anchor = findCrossEventAnchor({ events: [e1, e2, e3], index: 2, grounded });
    expect(anchor).not.toBeNull();
    expect(anchor!.reason).toBe("within_window");
    expect(anchor!.anchor.event_id).toBe("e1");
  });
});

describe("gapResolver — Where 三層 integration", () => {
  test("semantic==['where'] + ASK/missing_no_anchor → where_center clarify が立つ", () => {
    const ev = mkEvent("e1", {
      when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance(["9時"], "high") },
      what: { activity: "コーヒー", activityCanonical: "コーヒー", provenance: utteranceProvenance(["コーヒー"], "high") },
      missing_semantic_critical: ["where"],
    });
    const grounded = [mkGrounded("e1", "unresolved", [], "")];
    const res = resolveGaps([ev], { grounded });
    expect(res.primary_clarify).not.toBeNull();
    expect(res.primary_clarify!.kind).toBe("where_center");
    expect(res.primary_clarify!.event_id).toBe("e1");
  });

  test("semantic==['where'] + FIXED → defer_to_place_grounder（ASK しない）", () => {
    const ev = mkEvent("e1", {
      when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance(["9時"], "high") },
      where: {
        place_ref: "ブルーボトル青山店",
        placeType: "exact_proper_noun",
        provenance: utteranceProvenance(["ブルーボトル青山店"], "high"),
      },
      what: { activity: "コーヒー", activityCanonical: "コーヒー", provenance: utteranceProvenance(["コーヒー"], "high") },
      missing_semantic_critical: ["where"], // 意図的に where を残して Where 三層に突入させる
    });
    const grounded = [mkGrounded("e1", "resolved", [mkCandidate("ブルーボトル青山店")])];
    const res = resolveGaps([ev], { grounded });
    expect(res.primary_clarify).toBeNull();
  });

  test("W3-PR-8: semantic==['where'] + cross-event anchor あっても e1 の vague が ASK を立てる", () => {
    // PR-7 では cross-event anchor があれば defer_to_place_grounder に落ちたが、
    // PR-8 では e1 の where=vague (chain_brand) 自体が ASK を立てるため、
    // primary_clarify は null にならない（e1 の where_center / ambiguous_too_many 等が立つ）。
    // anchor 検索が PR-9 で入ったら provisional 復活。
    const e1 = mkEvent("e1", {
      when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance(["9時"], "high") },
      where: { place_ref: "スタバ", placeType: "chain_brand", provenance: utteranceProvenance(["スタバ"], "high") },
      what: { activity: "コーヒー", activityCanonical: "コーヒー", provenance: utteranceProvenance(["コーヒー"], "high") },
    });
    const e2 = mkEvent("e2", {
      when: { startTime: "10:00", timeHint: null, provenance: utteranceProvenance(["10時"], "high") },
      what: { activity: "ランチ", activityCanonical: "ランチ", provenance: utteranceProvenance(["ランチ"], "high") },
      missing_semantic_critical: ["where"],
    });
    const grounded: GroundedPlace[] = [
      mkGrounded("e1", "resolved", [mkCandidate("スターバックス")], "スタバ"),
      mkGrounded("e2", "unresolved", []),
    ];
    const res = resolveGaps([e1, e2], { grounded });
    // e1 (vague) の ASK が優先される（When が fixed、Where が vague で ASK）。
    expect(res.primary_clarify).not.toBeNull();
  });

  test("Where ASK vs When ASK が並立: When が優先（slot priority）", () => {
    const eWhen = mkEvent("e_when", {
      where: { place_ref: "スタバ", placeType: "chain_brand", provenance: utteranceProvenance(["スタバ"], "high") },
      what: { activity: "コーヒー", activityCanonical: "コーヒー", provenance: utteranceProvenance(["コーヒー"], "high") },
      missing_semantic_critical: ["when"],
    });
    const eWhere = mkEvent("e_where", {
      when: { startTime: "12:00", timeHint: null, provenance: utteranceProvenance(["12時"], "high") },
      what: { activity: "ランチ", activityCanonical: "ランチ", provenance: utteranceProvenance(["ランチ"], "high") },
      missing_semantic_critical: ["where"],
    });
    const grounded = [
      mkGrounded("e_when", "resolved", [mkCandidate("スターバックス")], "スタバ"),
      mkGrounded("e_where", "unresolved", [], ""),
    ];
    const res = resolveGaps([eWhen, eWhere], { grounded });
    expect(res.primary_clarify).not.toBeNull();
    expect(res.primary_clarify!.kind).toBe("specific_time");
    expect(res.primary_clarify!.event_id).toBe("e_when");
  });

  test("Where ASK vs What ASK が並立: Where が優先（slot priority）", () => {
    // W3-PR-7: sharpness 駆動のため、eWhat は where 埋め where が ASK に
    // ならないようにしておく（これで eWhat は activity ASK に落ちる）
    const eWhat = mkEvent("e_what", {
      when: { startTime: "12:00", timeHint: null, provenance: utteranceProvenance(["12時"], "high") },
      where: { place_ref: "東京駅", placeType: "exact_proper_noun", provenance: utteranceProvenance(["東京駅"], "high") },
      missing_semantic_critical: ["what"],
    });
    const eWhere = mkEvent("e_where", {
      when: { startTime: "15:00", timeHint: null, provenance: utteranceProvenance(["15時"], "high") },
      what: { activity: "読書", activityCanonical: "読書", provenance: utteranceProvenance(["読書"], "high") },
      missing_semantic_critical: ["where"],
    });
    const grounded = [
      mkGrounded("e_what", "unresolved", [], ""),
      mkGrounded("e_where", "unresolved", [], ""),
    ];
    const res = resolveGaps([eWhat, eWhere], { grounded });
    expect(res.primary_clarify).not.toBeNull();
    expect(res.primary_clarify!.kind).toBe("where_center");
    expect(res.primary_clarify!.event_id).toBe("e_where");
  });
});
