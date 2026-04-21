/**
 * Comprehension-First v1.3+ Wave 3 Contract Tests (W3-PR-1)
 *
 * 設計書: docs/alter-morning-comprehension-first-wave3-design.md
 *
 * カバレッジ:
 *   - L2.1 Clarify Question Builder（rule-based 日本語質問文生成）
 *   - resolveGaps 出力に question が付いていること
 *   - L2.3 placeTable 拡張（hotel / station / library / coworking カテゴリ底上げ）
 *   - placeTable 拡張による既存エントリの曖昧化が起きていないこと
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

import {
  type Event,
  resetEventCounter,
  baselineProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";

import {
  resolveGaps,
  resolveEventGap,
} from "@/lib/alter-morning/planning/gapResolver";

import {
  buildClarifyQuestion,
  attachClarifyQuestion,
} from "@/lib/alter-morning/planning/clarifyQuestionBuilder";

import {
  PLACE_TABLE,
  resolvePlace,
  resolvePlaceFromText,
} from "@/lib/alter-morning/placeTable";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  resetEventCounter();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkEvent(overrides: Partial<Event>): Event {
  const base: Event = {
    event_id: "event_x",
    turn_mode: "create",
    change_scope: null,
    target_ref: null,
    target_ref_confidence: null,
    certainty: "asserted",
    when: { startTime: null, timeHint: null, provenance: baselineProvenance() },
    where: { place_ref: null, placeType: null, provenance: baselineProvenance() },
    what: { activity: "", activityCanonical: "", provenance: baselineProvenance() },
    who: [],
    transport: null,
    missing_semantic_critical: [],
    missing_solver_blockers: [],
  };
  return { ...base, ...overrides };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Clarify Question Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("L2.1 buildClarifyQuestion", () => {
  test("coarse_time_bucket: hint 無しで generic 文", () => {
    const q = buildClarifyQuestion({ kind: "coarse_time_bucket" });
    expect(q).toContain("朝・昼・夜");
    expect(q).toMatch(/どれ/);
  });

  test("coarse_time_bucket: hint あり で hint 埋め込み", () => {
    const q = buildClarifyQuestion({ kind: "coarse_time_bucket", hint: "カフェ" });
    expect(q).toContain("カフェ");
    expect(q).toContain("朝・昼・夜");
  });

  test("specific_time: '何時頃' 系の質問", () => {
    const q = buildClarifyQuestion({ kind: "specific_time" });
    expect(q).toContain("何時");
  });

  test("activity: '何をする予定' 系", () => {
    const q = buildClarifyQuestion({ kind: "activity", hint: "渋谷" });
    expect(q).toContain("渋谷");
    expect(q).toContain("予定");
  });

  test("tentative_chain: 複数 tentative の基準確認", () => {
    const q = buildClarifyQuestion({ kind: "tentative_chain", hint: "ランチ" });
    expect(q).toContain("ランチ");
    expect(q).toContain("何時");
  });

  test("target_ref_low: どの予定を指すかを問う", () => {
    const q = buildClarifyQuestion({ kind: "target_ref_low", hint: "予定" });
    expect(q).toContain("予定");
    expect(q).toMatch(/どの/);
  });

  test("transport: 移動手段を問う", () => {
    const q = buildClarifyQuestion({ kind: "transport", hint: "渋谷" });
    expect(q).toContain("渋谷");
    expect(q).toMatch(/徒歩|電車|車/);
  });

  test("endpoint: 終了時刻を問う", () => {
    const q = buildClarifyQuestion({ kind: "endpoint", hint: "会議" });
    expect(q).toContain("会議");
    expect(q).toContain("何時まで");
  });

  test("hint が空文字列 / 空白のみの時は hint 無し扱い", () => {
    const q1 = buildClarifyQuestion({ kind: "specific_time", hint: "" });
    const q2 = buildClarifyQuestion({ kind: "specific_time", hint: "   " });
    const qNone = buildClarifyQuestion({ kind: "specific_time" });
    expect(q1).toBe(qNone);
    expect(q2).toBe(qNone);
  });

  test("attachClarifyQuestion: 非破壊で question を追加", () => {
    const req = {
      event_id: "event_1",
      kind: "specific_time" as const,
      target_slot: "when" as const,
      hint: "カフェ",
      question: "",
    };
    const resolved = attachClarifyQuestion(req);
    expect(resolved.question).toContain("カフェ");
    expect(resolved.event_id).toBe("event_1");
    // 元は書き換えていない（shallow copy）
    expect(resolved).not.toBe(req);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// resolveGaps 出力に question が付くこと
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("L2.1 resolveGaps with clarify question", () => {
  test("specific_time clarify に question が付与される", () => {
    const ev = mkEvent({
      event_id: "event_1",
      missing_semantic_critical: ["when"],
    });
    const res = resolveGaps([ev]);
    const action = res.actions[0];
    expect(action.type).toBe("clarify");
    if (action.type === "clarify") {
      expect(action.request.question).toBeTruthy();
      expect(action.request.question).toContain("何時");
    }
  });

  test("coarse_time_bucket clarify に activity hint が埋め込まれる", () => {
    const ev = mkEvent({
      event_id: "event_1",
      missing_semantic_critical: ["when", "where"],
      what: {
        activity: "ランチ",
        activityCanonical: "ランチ",
        provenance: baselineProvenance(),
      },
    });
    const action = resolveEventGap(ev, { events: [ev], index: 0 });
    expect(action.type).toBe("clarify");
    if (action.type === "clarify") {
      expect(action.request.kind).toBe("coarse_time_bucket");
      expect(action.request.question).toContain("ランチ");
    }
  });

  test("target_ref_low clarify: hint=target_ref が question に出る", () => {
    const ev = mkEvent({
      event_id: "event_2",
      turn_mode: "modify",
      target_ref: "明日の予定",
      target_ref_confidence: "low",
    });
    const action = resolveEventGap(ev, { events: [ev], index: 0 });
    expect(action.type).toBe("clarify");
    if (action.type === "clarify") {
      expect(action.request.question).toContain("明日の予定");
    }
  });

  test("primary_clarify も question を持つ", () => {
    const ev = mkEvent({
      event_id: "event_1",
      missing_semantic_critical: ["when"],
    });
    const res = resolveGaps([ev]);
    expect(res.primary_clarify?.question).toBeTruthy();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// placeTable 拡張（category 均等化）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Wave 3 placeTable category 拡張", () => {
  function countByCategory(category: string): number {
    return PLACE_TABLE.filter((e) => e.category === category).length;
  }

  test("hotel カテゴリが 10 件以上", () => {
    expect(countByCategory("hotel")).toBeGreaterThanOrEqual(10);
  });

  test("station カテゴリが 10 件以上", () => {
    expect(countByCategory("station")).toBeGreaterThanOrEqual(10);
  });

  test("library カテゴリが 8 件以上", () => {
    expect(countByCategory("library")).toBeGreaterThanOrEqual(8);
  });

  test("coworking カテゴリが 6 件以上", () => {
    expect(countByCategory("coworking")).toBeGreaterThanOrEqual(6);
  });
});

describe("Wave 3 新規エントリの resolvePlace 挙動", () => {
  test("東京駅が station として解決される", () => {
    const p = resolvePlace("東京駅で待ち合わせ");
    expect(p?.canonicalLabel).toBe("東京駅");
    expect(p?.category).toBe("station");
  });

  test("新宿駅・渋谷駅がそれぞれ独立に解決される", () => {
    expect(resolvePlace("新宿駅から")?.id).toBe("shinjuku_station");
    expect(resolvePlace("渋谷駅で")?.id).toBe("shibuya_station");
  });

  test("ドーミーインが hotel として解決される", () => {
    const p = resolvePlace("ドーミーインに泊まる");
    expect(p?.category).toBe("hotel");
    expect(p?.id).toBe("dormy_inn");
  });

  test("アパホテルが alias 'アパ' でも解決できる", () => {
    const p = resolvePlace("アパに宿泊");
    expect(p?.canonicalLabel).toBe("アパホテル");
  });

  test("国立国会図書館 / 国会図書館 / NDL いずれも解決", () => {
    expect(resolvePlace("国立国会図書館へ行く")?.id).toBe("ndl");
    expect(resolvePlace("国会図書館で調べる")?.id).toBe("ndl");
    expect(resolvePlace("NDLで作業")?.id).toBe("ndl");
  });

  test("リージャスが coworking として解決される", () => {
    expect(resolvePlace("リージャスで打ち合わせ")?.id).toBe("regus");
    expect(resolvePlace("Regusで作業")?.id).toBe("regus");
  });

  test("matchedAlias を正しく返す（resolvePlaceFromText）", () => {
    const r = resolvePlaceFromText("東京駅で朝食");
    expect(r?.matchedAlias).toBe("東京駅");
  });
});

describe("Wave 3 既存エントリの非回帰", () => {
  test("スタバ は依然として starbucks に解決される", () => {
    expect(resolvePlace("スタバで作業")?.id).toBe("starbucks");
  });

  test("バー は依然として bar に解決される（substring 曖昧化が発生していない）", () => {
    expect(resolvePlace("バーで一杯")?.id).toBe("bar");
  });

  test("駅 単独は汎用 station に解決される（個別駅 alias との誤マッチなし）", () => {
    expect(resolvePlace("駅で待ち合わせ")?.id).toBe("station");
  });

  test("ホテル 単独は汎用 hotel に解決される", () => {
    expect(resolvePlace("ホテルで休む")?.id).toBe("hotel");
  });

  test("図書館 単独は汎用 library に解決される", () => {
    expect(resolvePlace("図書館で勉強")?.id).toBe("library");
  });

  test("コワーキング 単独は汎用 coworking に解決される", () => {
    expect(resolvePlace("コワーキングで仕事")?.id).toBe("coworking");
  });
});
