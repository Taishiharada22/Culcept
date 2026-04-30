/**
 * answerBinder — W3-PR-7 Commit 2
 *
 * 設計書: docs/alter-morning-comprehension-first-wave3-pr7-design.md §4.2
 *
 * カバレッジ:
 *   - slot 別 bind: when(specific_time/coarse_time_bucket) / where / what / transport
 *   - semantic_miss: 解釈不能な answer
 *   - system_miss: event_id が存在しない
 *   - 空 answer → semantic_miss
 *   - missing_semantic_critical の再計算
 *   - bound に元 events を壊さない（immutability）
 */
import { describe, test, expect } from "vitest";

import {
  inferredProvenance,
  utteranceProvenance,
  type Event,
} from "@/lib/alter-morning/comprehension/eventSchema";
import { bindAnswerToSlot } from "@/lib/alter-morning/comprehension/answerBinder";
import type { PendingClarify, PendingSlot } from "@/lib/alter-morning/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkEvent(overrides: Partial<Event> = {}): Event {
  return {
    event_id: "e1",
    turn_mode: "create",
    change_scope: null,
    target_ref: null,
    target_ref_confidence: null,
    certainty: "asserted",
    when: {
      startTime: null,
      timeHint: null,
      provenance: inferredProvenance(),
    },
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

function mkPending(overrides: Partial<PendingClarify> & { slot: PendingSlot; kind: string }): PendingClarify {
  return {
    event_id: "e1",
    scope: { timeLabel: null, activityLabel: null, eventOrdinal: 1 },
    question: "テスト質問",
    askedAt: new Date().toISOString(),
    semanticMissCount: 0,
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// when slot
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("bindAnswerToSlot — when (specific_time)", () => {
  const ev = mkEvent({
    what: { activity: "仕事", activityCanonical: "仕事", provenance: utteranceProvenance(["仕事"]) },
  });
  const pending = mkPending({ slot: "when", kind: "specific_time" });

  test("9:00 も HH:mm として拾う（TIME_COLON_RE）", () => {
    const res = bindAnswerToSlot([ev], pending, "9:00");
    expect(res.bound).toBe(true);
    if (res.bound) expect(res.events[0].when.startTime).toBe("09:00");
  });

  test("09:00 は startTime に書き込まれる", () => {
    const res = bindAnswerToSlot([ev], pending, "09:00で");
    expect(res.bound).toBe(true);
    if (res.bound) {
      expect(res.boundSlot).toBe("when");
      expect(res.events[0].when.startTime).toBe("09:00");
      expect(res.events[0].when.timeHint).toBeNull();
    }
  });

  test("時刻が取れなくても粗い時間帯語（朝）を timeHint に fallback", () => {
    const res = bindAnswerToSlot([ev], pending, "朝かな");
    expect(res.bound).toBe(true);
    if (res.bound) {
      expect(res.events[0].when.timeHint).toBe("morning");
      expect(res.events[0].when.startTime).toBeNull();
    }
  });

  test("解釈不能なら semantic_miss", () => {
    const res = bindAnswerToSlot([ev], pending, "おなかすいた");
    expect(res.bound).toBe(false);
    if (!res.bound) expect(res.reason).toBe("semantic_miss");
  });
});

describe("bindAnswerToSlot — when (coarse_time_bucket)", () => {
  const ev = mkEvent();
  const pending = mkPending({ slot: "when", kind: "coarse_time_bucket" });

  test("朝/昼/夜 を timeHint に書き込む", () => {
    const res = bindAnswerToSlot([ev], pending, "夕方");
    expect(res.bound).toBe(true);
    if (res.bound) expect(res.events[0].when.timeHint).toBe("evening");
  });

  test("coarse bucket でも明示 HH:mm が来れば startTime に書き込む", () => {
    const res = bindAnswerToSlot([ev], pending, "10:30");
    expect(res.bound).toBe(true);
    if (res.bound) expect(res.events[0].when.startTime).toBe("10:30");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// where slot
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("bindAnswerToSlot — where", () => {
  const ev = mkEvent();
  const pending = mkPending({ slot: "where", kind: "where_center" });

  test("場所文字列を place_ref に書き込み、placeType は null", () => {
    const res = bindAnswerToSlot([ev], pending, "渋谷のカフェで");
    expect(res.bound).toBe(true);
    if (res.bound) {
      expect(res.events[0].where.place_ref).toBe("渋谷のカフェ");
      expect(res.events[0].where.placeType).toBeNull();
    }
  });

  test("語尾助詞を除去する", () => {
    const res = bindAnswerToSlot([ev], pending, "図書館かな");
    expect(res.bound).toBe(true);
    if (res.bound) expect(res.events[0].where.place_ref).toBe("図書館");
  });

  test("空白のみは semantic_miss", () => {
    const res = bindAnswerToSlot([ev], pending, "   ");
    expect(res.bound).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// what slot
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("bindAnswerToSlot — what", () => {
  const ev = mkEvent();
  const pending = mkPending({ slot: "what", kind: "activity" });

  test("活動名を activity / activityCanonical に書き込む", () => {
    const res = bindAnswerToSlot([ev], pending, "ランチ");
    expect(res.bound).toBe(true);
    if (res.bound) {
      expect(res.events[0].what.activity).toBe("ランチ");
      expect(res.events[0].what.activityCanonical).toBe("ランチ");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// transport slot
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("bindAnswerToSlot — transport", () => {
  const ev = mkEvent();
  const pending = mkPending({ slot: "transport", kind: "transport" });

  test("「電車」 → transport=電車", () => {
    const res = bindAnswerToSlot([ev], pending, "電車で");
    expect(res.bound).toBe(true);
    if (res.bound) expect(res.events[0].transport).toBe("電車");
  });

  test("「徒歩」 → transport=徒歩", () => {
    const res = bindAnswerToSlot([ev], pending, "歩きで");
    expect(res.bound).toBe(true);
    if (res.bound) expect(res.events[0].transport).toBe("徒歩");
  });

  test("解釈できなければ semantic_miss", () => {
    const res = bindAnswerToSlot([ev], pending, "ぶっとんだ");
    expect(res.bound).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// system_miss / 空 answer / immutability / re-compute
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("bindAnswerToSlot — failure modes", () => {
  test("event_id が存在しない → system_miss", () => {
    const ev = mkEvent();
    const pending = mkPending({ slot: "where", kind: "where_center", event_id: "nope" });
    const res = bindAnswerToSlot([ev], pending, "図書館");
    expect(res.bound).toBe(false);
    if (!res.bound) expect(res.reason).toBe("system_miss");
  });

  test("空 answer → semantic_miss", () => {
    const ev = mkEvent();
    const pending = mkPending({ slot: "where", kind: "where_center" });
    const res = bindAnswerToSlot([ev], pending, "");
    expect(res.bound).toBe(false);
    if (!res.bound) expect(res.reason).toBe("semantic_miss");
  });
});

describe("bindAnswerToSlot — immutability & re-compute", () => {
  test("元 events を書き換えない（shallow clone）", () => {
    const ev = mkEvent();
    const pending = mkPending({ slot: "where", kind: "where_center" });
    const events = [ev];
    const res = bindAnswerToSlot(events, pending, "図書館");
    expect(res.bound).toBe(true);
    // 元 events の参照は変化しないが、新配列であるべき
    expect(events[0].where.place_ref).toBeNull();
    if (res.bound) {
      expect(res.events).not.toBe(events);
      expect(res.events[0]).not.toBe(events[0]);
    }
  });

  test("bind 後 missing_semantic_critical が再計算される", () => {
    // where/what/when 全欠損で missing=['when','where','what'] のつもり
    const ev = mkEvent({
      missing_semantic_critical: ["when", "where", "what"],
    });
    const pending = mkPending({ slot: "where", kind: "where_center" });
    const res = bindAnswerToSlot([ev], pending, "図書館");
    expect(res.bound).toBe(true);
    if (res.bound) {
      // where 書き込み成功 → missing から where が消える
      expect(res.events[0].missing_semantic_critical).not.toContain("where");
      expect(res.events[0].missing_semantic_critical).toContain("when");
      expect(res.events[0].missing_semantic_critical).toContain("what");
    }
  });
});
