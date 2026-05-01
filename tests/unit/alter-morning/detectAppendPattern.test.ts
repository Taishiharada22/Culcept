/**
 * detectAppendPattern — PR A Commit 4 (CEO/GPT 2026-05-02)
 *
 * 不変条件 (全 AND、CEO/GPT 厳密化):
 *   1. priorEvents.length >= 1
 *   2. priorPendingClarify === null (defensive)
 *   3. detectTimeChange null (時刻変更ではない)
 *   4. detectTransportOnly null (transport-only ではない)
 *   5. 修正キーワード排除 (変更/にして/ずらす/→)
 *   6. extractExplicitTimes が単一 (時刻 1 件のみ)
 *   7. resolveActivity hit (活動語あり)
 *   8. extractExplicitPlace hit (場所候補)
 */

import { describe, it, expect } from "vitest";
import { detectAppendPattern } from "@/lib/alter-morning/comprehension/deterministicOperationSynth";
import {
  type Event,
  utteranceProvenance,
  toolProvenance,
  inferredProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { PendingClarify } from "@/lib/alter-morning/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkPriorEvent(): Event {
  return {
    event_id: "event_1",
    turn_mode: "append",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: {
      startTime: "09:00",
      timeHint: null,
      provenance: utteranceProvenance(["9時"], "high"),
    },
    where: {
      place_ref: "スターバックス渋谷ストリーム店",
      placeType: "exact_proper_noun",
      coordinates: { lat: 35.658, lng: 139.701 },
      provenance: toolProvenance("high"),
    },
    what: {
      activity: "ミーティング",
      activityCanonical: "ミーティング",
      provenance: utteranceProvenance(["ミーティング"], "high"),
    },
    who: [],
    transport: "電車",
    certainty: "asserted",
    missing_semantic_critical: [],
    missing_solver_blockers: [],
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Positive (4) — append op を生成すべき
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("detectAppendPattern — Positive (event 化)", () => {
  it("T1: 「12時に新宿でランチ」 → append op", () => {
    const op = detectAppendPattern("12時に新宿でランチ", [mkPriorEvent()], null);
    expect(op).not.toBeNull();
    expect(op!.type).toBe("append");
    expect(op!.eventDraft.when.startTime).toBe("12:00");
    expect(op!.eventDraft.where.place_ref).toBe("新宿");
    expect(op!.eventDraft.where.placeType).toBe("generic_place");
    expect(op!.eventDraft.what.activity).toBe("ランチ");
  });

  it("T2: 「午後3時に渋谷で打ち合わせ」 → append op (15:00)", () => {
    const op = detectAppendPattern(
      "午後3時に渋谷で打ち合わせ",
      [mkPriorEvent()],
      null,
    );
    expect(op).not.toBeNull();
    expect(op!.eventDraft.when.startTime).toBe("15:00");
    expect(op!.eventDraft.where.place_ref).toBe("渋谷");
    expect(op!.eventDraft.what.activity).toBe("打ち合わせ");
  });

  it("T3: 「18時から新宿で飲み会」 → append op", () => {
    const op = detectAppendPattern(
      "18時から新宿で飲み会",
      [mkPriorEvent()],
      null,
    );
    expect(op).not.toBeNull();
    expect(op!.eventDraft.when.startTime).toBe("18:00");
    expect(op!.eventDraft.where.place_ref).toBe("新宿");
    expect(op!.eventDraft.what.activity).toBe("飲み会");
  });

  it("T4 [PR A Commit 8 更新]: 「明日12時に新宿でランチ」 → null (date prefix 抑制、LLM 委任)", () => {
    // CEO/GPT 2026-05-02 PR A Commit 8 安全側設計:
    //   targetDate 解決が必要な発話は deterministic では拾わず LLM 経路に委ねる。
    //   safety-side tradeoff: 5W1H 完全形でも LLM 揺らぎが残るが、
    //   targetDate 誤動作 (今日扱いで保存) よりは LLM 委任が安全。
    const op = detectAppendPattern(
      "明日12時に新宿でランチ",
      [mkPriorEvent()],
      null,
    );
    expect(op).toBeNull();
  });

  it("T4b [PR A Commit 7 positive]: 「12時に新宿駅でランチ」 → append op (place_ref=新宿駅)", () => {
    const op = detectAppendPattern(
      "12時に新宿駅でランチ",
      [mkPriorEvent()],
      null,
    );
    expect(op).not.toBeNull();
    expect(op!.eventDraft.when.startTime).toBe("12:00");
    expect(op!.eventDraft.where.place_ref).toBe("新宿駅");
    expect(op!.eventDraft.what.activity).toBe("ランチ");
  });

  it("T4c [PR A Commit 7 positive]: 「12時に新宿三丁目でランチ」 → append op (place_ref=新宿三丁目)", () => {
    const op = detectAppendPattern(
      "12時に新宿三丁目でランチ",
      [mkPriorEvent()],
      null,
    );
    expect(op).not.toBeNull();
    expect(op!.eventDraft.when.startTime).toBe("12:00");
    expect(op!.eventDraft.where.place_ref).toBe("新宿三丁目");
    expect(op!.eventDraft.what.activity).toBe("ランチ");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Negative (11) — append detector が拾わない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("detectAppendPattern — Negative (拾わない)", () => {
  it("T5: 「電車」 → null (transport-only は別経路)", () => {
    expect(detectAppendPattern("電車", [mkPriorEvent()], null)).toBeNull();
  });

  it("T6: 「ミーティング」 → null (時刻場所無し)", () => {
    expect(detectAppendPattern("ミーティング", [mkPriorEvent()], null)).toBeNull();
  });

  it("T7: 「新宿」 → null (時刻活動無し)", () => {
    expect(detectAppendPattern("新宿", [mkPriorEvent()], null)).toBeNull();
  });

  it("T8: 「ランチどうしよう」 → null (時刻場所無し)", () => {
    expect(
      detectAppendPattern("ランチどうしよう", [mkPriorEvent()], null),
    ).toBeNull();
  });

  it("T9: 「9時を10時に変更」 → null (time-change は別経路)", () => {
    expect(
      detectAppendPattern("9時を10時に変更", [mkPriorEvent()], null),
    ).toBeNull();
  });

  it("T10: 「12時に変更」 → null (場所活動無し + 「変更」 修正系)", () => {
    expect(detectAppendPattern("12時に変更", [mkPriorEvent()], null)).toBeNull();
  });

  it("T11: 「12時からで」 → null (場所活動無し)", () => {
    expect(detectAppendPattern("12時からで", [mkPriorEvent()], null)).toBeNull();
  });

  it("T14: 「新宿でいいかな」 → null (時刻無し + いいかな 判断系)", () => {
    expect(
      detectAppendPattern("新宿でいいかな", [mkPriorEvent()], null),
    ).toBeNull();
  });

  it("T15: 「12時にして」 → null (場所活動無し + にして 修正系)", () => {
    expect(detectAppendPattern("12時にして", [mkPriorEvent()], null)).toBeNull();
  });

  it("T16: 「午後3時に変更」 → null (場所活動無し + 変更 修正系)", () => {
    expect(
      detectAppendPattern("午後3時に変更", [mkPriorEvent()], null),
    ).toBeNull();
  });

  it("T17: 「ランチで」 → null (時刻場所無し)", () => {
    expect(detectAppendPattern("ランチで", [mkPriorEvent()], null)).toBeNull();
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PR A Commit 7+8: 情報損失防止 negative cases (CEO/GPT 2026-05-02)
  //   who / duration / transport / date prefix が混じる発話は LLM 経路に委ねる。
  //   deterministic_append は 5W1H 完全形 (no extras) のみ拾う safety-side 設計。
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("T_neg1 [PR A Commit 7 who]: 「12時に新宿で高橋とランチ」 → null (人名連結 「と」 → LLM 委任)", () => {
    // mid section に「と」 が含まれる → extractExplicitPlace negative pattern hit
    expect(
      detectAppendPattern("12時に新宿で高橋とランチ", [mkPriorEvent()], null),
    ).toBeNull();
  });

  it("T_neg2 [PR A Commit 7 duration]: 「12時に新宿で30分だけランチ」 → null (明示 duration → LLM 委任)", () => {
    // mid section に「分」 が含まれる → extractExplicitPlace negative pattern hit
    expect(
      detectAppendPattern("12時に新宿で30分だけランチ", [mkPriorEvent()], null),
    ).toBeNull();
  });

  it("T_neg3 [PR A Commit 7 transport]: 「12時に電車で新宿に行ってランチ」 → null (transport keyword → LLM 委任)", () => {
    // mid section に「電車」 が含まれる → extractExplicitPlace negative pattern hit
    expect(
      detectAppendPattern(
        "12時に電車で新宿に行ってランチ",
        [mkPriorEvent()],
        null,
      ),
    ).toBeNull();
  });

  it("T_neg4 [PR A Commit 8 date prefix]: 「明日12時に新宿でランチ」 → null (date prefix → LLM 委任)", () => {
    // utterance 先頭が 「明日」 → date prefix 抑制 (Commit 8 NEW)
    expect(
      detectAppendPattern("明日12時に新宿でランチ", [mkPriorEvent()], null),
    ).toBeNull();
  });

  it("T_neg5 [PR A Commit 8 date prefix]: 「明後日18時に渋谷で飲み会」 → null (date prefix → LLM 委任)", () => {
    expect(
      detectAppendPattern(
        "明後日18時に渋谷で飲み会",
        [mkPriorEvent()],
        null,
      ),
    ).toBeNull();
  });

  it("T_neg6 [PR A Commit 8 date prefix]: 「今日12時に新宿でランチ」 → null (date prefix → LLM 委任)", () => {
    expect(
      detectAppendPattern("今日12時に新宿でランチ", [mkPriorEvent()], null),
    ).toBeNull();
  });

  it("T_neg7 [PR A Commit 7 duration]: 「12時に新宿で2時間ランチ」 → null (時間 duration → LLM 委任)", () => {
    // 2時 が second time として extractExplicitTimes に検出される or
    // extractExplicitPlace の 「時間」 negative pattern hit、いずれかで null
    expect(
      detectAppendPattern("12時に新宿で2時間ランチ", [mkPriorEvent()], null),
    ).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Regression (2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("detectAppendPattern — Regression", () => {
  it("T12: priorEvents=[] → null (1 件目は LLM 経路)", () => {
    expect(detectAppendPattern("12時に新宿でランチ", [], null)).toBeNull();
  });

  it("T13: 既存 detectTransportOnly / detectTimeChange と排他: 「電車」 で append 拾わない", () => {
    expect(detectAppendPattern("電車", [mkPriorEvent()], null)).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Defensive (3 件)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("detectAppendPattern — Defensive", () => {
  it("T18: priorPendingClarify={slot:'transport'} → null (defensive)", () => {
    const pending: PendingClarify = {
      event_id: "event_1",
      slot: "transport",
      kind: "transport",
      scope: { timeLabel: "09:00", activityLabel: null, eventOrdinal: 1 },
      question: "移動手段は何にする？",
      askedAt: new Date().toISOString(),
    };
    const op = detectAppendPattern(
      "12時に新宿でランチ",
      [mkPriorEvent()],
      pending,
    );
    expect(op).toBeNull();
  });

  it("T18b: priorPendingClarify={slot:'where'} → null (defensive)", () => {
    const pending: PendingClarify = {
      event_id: "event_1",
      slot: "where",
      kind: "where_center",
      scope: { timeLabel: "09:00", activityLabel: null, eventOrdinal: 1 },
      question: "どのあたり？",
      askedAt: new Date().toISOString(),
    };
    const op = detectAppendPattern(
      "12時に新宿でランチ",
      [mkPriorEvent()],
      pending,
    );
    expect(op).toBeNull();
  });

  it("T20: 複数時刻 「12時に新宿でランチ、15時に渋谷で打ち合わせ」 → null (LLM 委任)", () => {
    expect(
      detectAppendPattern(
        "12時に新宿でランチ、15時に渋谷で打ち合わせ",
        [mkPriorEvent()],
        null,
      ),
    ).toBeNull();
  });
});
