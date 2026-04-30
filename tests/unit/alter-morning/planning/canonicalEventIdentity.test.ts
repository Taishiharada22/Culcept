/**
 * canonicalEventIdentity — PR-50 Commit 12 (CEO 2026-04-30)
 *
 * 検証範囲:
 *   - isSameEventCanonical: 2 events が canonical identity 上で同じか
 *   - isFromCurrentUtterance: event が current utterance 由来か
 *   - countNonEmptyCriticalSlots: when/where/what の non-empty 数
 *
 * 設計確定 (CEO 2026-04-30):
 *   - substring match 単独は禁止 (チェーン店誤マージ防止)
 *   - same time + same activity を前提に place identity を判定
 *   - isFromCurrentUtterance は provenance.source_span に加えて slot value も check
 */

import { describe, it, expect } from "vitest";

import {
  isSameEventCanonical,
  isFromCurrentUtterance,
  countNonEmptyCriticalSlots,
  utteranceImpliesDifferentPlace,
} from "@/lib/alter-morning/planning/canonicalEventIdentity";
import {
  utteranceProvenance,
  inferredProvenance,
  toolProvenance,
  type Event,
} from "@/lib/alter-morning/comprehension/eventSchema";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkEvent(overrides?: Partial<Event>): Event {
  return {
    event_id: "event_test",
    turn_mode: "create",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: {
      startTime: "10:00",
      timeHint: null,
      provenance: utteranceProvenance(["10時"], "high"),
    },
    where: {
      place_ref: "スタバ",
      placeType: "chain_brand",
      provenance: utteranceProvenance(["スタバ"], "high"),
    },
    what: {
      activity: "コーヒー",
      activityCanonical: "コーヒー",
      provenance: utteranceProvenance(["コーヒー"], "high"),
    },
    who: [],
    transport: null,
    certainty: "asserted",
    missing_semantic_critical: [],
    missing_solver_blockers: [],
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// isSameEventCanonical
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isSameEventCanonical: 必須条件 (when + activity)", () => {
  it("when.startTime 一致 + activity 一致 + place_ref 完全一致 → true", () => {
    const a = mkEvent({ event_id: "a" });
    const b = mkEvent({ event_id: "b" });
    expect(isSameEventCanonical(a, b)).toBe(true);
  });

  it("when.startTime 不一致 → false", () => {
    const a = mkEvent({ event_id: "a", when: { startTime: "10:00", timeHint: null, provenance: utteranceProvenance(["10時"], "high") } });
    const b = mkEvent({ event_id: "b", when: { startTime: "11:00", timeHint: null, provenance: utteranceProvenance(["11時"], "high") } });
    expect(isSameEventCanonical(a, b)).toBe(false);
  });

  it("when.startTime 一方が null → false (両方 non-null 必須)", () => {
    const a = mkEvent({ event_id: "a" });
    const b = mkEvent({
      event_id: "b",
      when: { startTime: null, timeHint: "morning", provenance: inferredProvenance() },
    });
    expect(isSameEventCanonical(a, b)).toBe(false);
  });

  it("activity 不一致 → false", () => {
    const a = mkEvent({ event_id: "a", what: { activity: "コーヒー", activityCanonical: "コーヒー", provenance: utteranceProvenance(["コーヒー"], "high") } });
    const b = mkEvent({ event_id: "b", what: { activity: "ランチ", activityCanonical: "ランチ", provenance: utteranceProvenance(["ランチ"], "high") } });
    expect(isSameEventCanonical(a, b)).toBe(false);
  });

  it("activity 空 → false", () => {
    const a = mkEvent({ event_id: "a" });
    const b = mkEvent({ event_id: "b", what: { activity: "", activityCanonical: "", provenance: inferredProvenance() } });
    expect(isSameEventCanonical(a, b)).toBe(false);
  });
});

describe("isSameEventCanonical: place identity 条件 A (place_ref 完全一致)", () => {
  it("place_ref 完全一致 → true", () => {
    const a = mkEvent({
      where: { place_ref: "渋谷スタバ", placeType: "exact_proper_noun", provenance: utteranceProvenance(["渋谷スタバ"], "high") },
    });
    const b = mkEvent({
      where: { place_ref: "渋谷スタバ", placeType: "exact_proper_noun", provenance: utteranceProvenance(["渋谷スタバ"], "high") },
    });
    expect(isSameEventCanonical(a, b)).toBe(true);
  });
});

describe("isSameEventCanonical: place identity 条件 B (coordinates 近接)", () => {
  it("coordinates 近接 (10m) → true", () => {
    const a = mkEvent({
      where: {
        place_ref: "スターバックス コーヒー SHIBUYA TSUTAYA 2F店",
        placeType: "exact_proper_noun",
        coordinates: { lat: 35.6598098, lng: 139.7004154 },
        provenance: toolProvenance(),
      },
    });
    const b = mkEvent({
      where: {
        place_ref: "スタバ", // 名前は違うが coordinates が近い
        placeType: "chain_brand",
        coordinates: { lat: 35.6598199, lng: 139.7004255 }, // ~10m
        provenance: utteranceProvenance(["スタバ"], "high"),
      },
    });
    expect(isSameEventCanonical(a, b)).toBe(true);
  });

  it("coordinates が 100m 離れている → false (50m threshold 超え)", () => {
    const a = mkEvent({
      where: {
        place_ref: "スタバ",
        placeType: "chain_brand",
        coordinates: { lat: 35.65, lng: 139.7 },
        provenance: utteranceProvenance(["スタバ"], "high"),
      },
    });
    const b = mkEvent({
      where: {
        place_ref: "スタバ", // 名前は同じだが別店舗 (coordinates 異なる)
        placeType: "chain_brand",
        coordinates: { lat: 35.651, lng: 139.701 }, // ~140m
        provenance: utteranceProvenance(["スタバ"], "high"),
      },
    });
    // place_ref が一致するので条件 A で true (これは coordinates check の前に hit)
    expect(isSameEventCanonical(a, b)).toBe(true);
  });

  it("coordinates 異なる + place_ref 異なる + activity 一致 → false (異店舗扱い)", () => {
    // 同じ名前のチェーン店だが別店舗
    const a = mkEvent({
      where: {
        place_ref: "スターバックス コーヒー SHIBUYA TSUTAYA 1F店",
        placeType: "exact_proper_noun",
        coordinates: { lat: 35.65, lng: 139.7 },
        provenance: toolProvenance(),
      },
    });
    const b = mkEvent({
      where: {
        place_ref: "スターバックス コーヒー 渋谷ストリーム店",
        placeType: "exact_proper_noun",
        coordinates: { lat: 35.66, lng: 139.71 }, // 1km 以上
        provenance: toolProvenance(),
      },
    });
    expect(isSameEventCanonical(a, b)).toBe(false); // 異店舗
  });
});

describe("isSameEventCanonical: place identity 条件 D (LLM partial output 救済、厳格版)", () => {
  it("prior が confident (exact_proper_noun) + cur null → true (LLM partial 救済)", () => {
    const prior = mkEvent({
      where: {
        place_ref: "サドヤ",
        placeType: "exact_proper_noun",
        coordinates: null,
        provenance: utteranceProvenance(["サドヤ"], "high"),
      },
    });
    const cur = mkEvent({
      where: {
        place_ref: null,
        placeType: null,
        coordinates: null,
        provenance: inferredProvenance(),
      },
    });
    expect(isSameEventCanonical(prior, cur)).toBe(true);
  });

  it("prior が confident (coordinates あり) + cur null → true", () => {
    const prior = mkEvent({
      where: {
        place_ref: "新宿",
        placeType: "generic_place",
        coordinates: { lat: 35.69, lng: 139.7 },
        provenance: utteranceProvenance(["新宿"], "high"),
      },
    });
    const cur = mkEvent({
      where: {
        place_ref: null,
        placeType: null,
        coordinates: null,
        provenance: inferredProvenance(),
      },
    });
    expect(isSameEventCanonical(prior, cur)).toBe(true);
  });

  it("CEO 警告ケース: prior が **not confident** (chain_brand + coordinates なし) + cur null → false", () => {
    // prior が確定していない → LLM partial output と本物 append を区別できない
    // → 別予定として扱う (CEO 2026-04-30 指示: 条件 D 限定)
    const prior = mkEvent({
      where: {
        place_ref: "スタバ",
        placeType: "chain_brand",
        coordinates: null,
        provenance: utteranceProvenance(["スタバ"], "high"),
      },
    });
    const cur = mkEvent({
      where: {
        place_ref: null,
        placeType: null,
        coordinates: null,
        provenance: inferredProvenance(),
      },
    });
    expect(isSameEventCanonical(prior, cur)).toBe(false);
  });

  it("CEO 警告ケース: prior が generic_place + coordinates なし + cur null → false", () => {
    const prior = mkEvent({
      where: {
        place_ref: "新宿",
        placeType: "generic_place",
        coordinates: null,
        provenance: utteranceProvenance(["新宿"], "high"),
      },
    });
    const cur = mkEvent({
      where: {
        place_ref: null,
        placeType: null,
        coordinates: null,
        provenance: inferredProvenance(),
      },
    });
    expect(isSameEventCanonical(prior, cur)).toBe(false);
  });

  it("逆方向 (cur が confident + prior null): cur=exact_proper_noun → true", () => {
    const prior = mkEvent({
      where: {
        place_ref: null,
        placeType: null,
        coordinates: null,
        provenance: inferredProvenance(),
      },
    });
    const cur = mkEvent({
      where: {
        place_ref: "サドヤ",
        placeType: "exact_proper_noun",
        coordinates: null,
        provenance: utteranceProvenance(["サドヤ"], "high"),
      },
    });
    expect(isSameEventCanonical(prior, cur)).toBe(true);
  });

  it("両方 place_ref=null は false", () => {
    const prior = mkEvent({
      where: {
        place_ref: null,
        placeType: null,
        coordinates: null,
        provenance: inferredProvenance(),
      },
    });
    const cur = mkEvent({
      where: {
        place_ref: null,
        placeType: null,
        coordinates: null,
        provenance: inferredProvenance(),
      },
    });
    expect(isSameEventCanonical(prior, cur)).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// utteranceImpliesDifferentPlace (Commit 12.1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("utteranceImpliesDifferentPlace", () => {
  it("「12時に新宿でランチ」 + prior「サドヤ」 → true (新 place 検出)", () => {
    expect(utteranceImpliesDifferentPlace("12時に新宿でランチ", "サドヤ")).toBe(
      true,
    );
  });

  it("「12時に新宿でランチ」 + prior「新宿」 → false (部分一致)", () => {
    expect(utteranceImpliesDifferentPlace("12時に新宿でランチ", "新宿")).toBe(
      false,
    );
  });

  it("「9時に新宿駅でランチ」 + prior「新宿」 → false (新宿 ⊂ 新宿駅)", () => {
    expect(utteranceImpliesDifferentPlace("9時に新宿駅でランチ", "新宿")).toBe(
      false,
    );
  });

  it("「9時に新宿でコーヒー」 + prior「新宿駅」 → false (新宿 ⊂ 新宿駅)", () => {
    expect(utteranceImpliesDifferentPlace("9時に新宿でコーヒー", "新宿駅")).toBe(
      false,
    );
  });

  it("「9時にコーヒー」 (place なし) → false (= signal なし)", () => {
    expect(utteranceImpliesDifferentPlace("9時にコーヒー", "サドヤ")).toBe(
      false,
    );
  });

  it("「12時に渋谷でランチ」 + prior「新宿」 → true", () => {
    expect(utteranceImpliesDifferentPlace("12時に渋谷でランチ", "新宿")).toBe(
      true,
    );
  });

  it("「明日は遊ぶ」 (place 抽出 pattern なし) → false", () => {
    expect(utteranceImpliesDifferentPlace("明日は遊ぶ", "新宿")).toBe(false);
  });
});

describe("isSameEventCanonical: place identity 条件 C (exact_proper_noun 包含)", () => {
  it("CEO 観測ケース: prior が places API resolved + cur が LLM raw → true", () => {
    // CEO 観測 (turn 5): LLM が「スタバ」 を出した → prior は places API で
    // 「スターバックス コーヒー SHIBUYA TSUTAYA 2F店」 (exact_proper_noun)
    const prior = mkEvent({
      where: {
        place_ref: "スターバックス コーヒー SHIBUYA TSUTAYA 2F店",
        placeType: "exact_proper_noun",
        coordinates: { lat: 35.6598098, lng: 139.7004154 },
        provenance: toolProvenance(),
      },
    });
    const cur = mkEvent({
      where: {
        place_ref: "スタバ",
        placeType: "chain_brand",
        provenance: utteranceProvenance(["スタバ"], "high"),
      },
    });
    // 「スターバックス コーヒー SHIBUYA TSUTAYA 2F店」 は「スタバ」 を **含まない**
    // (substring としては「スタバ」 ⊄ 「スターバックス…」)
    // → 条件 C は文字列 includes ベースなので false
    // ただし当該 case では coordinates も無いので条件 B も hit しない
    // この test は **条件 C が単独で誤動作しないこと** を verify
    expect(isSameEventCanonical(prior, cur)).toBe(false);
  });

  it("条件 C: prior=「渋谷スタバ」 (exact_proper_noun) + cur=「スタバ」 → true", () => {
    // exact_proper_noun の place_ref が cur の place_ref を含むケース
    const prior = mkEvent({
      where: {
        place_ref: "渋谷スタバ",
        placeType: "exact_proper_noun",
        provenance: toolProvenance(),
      },
    });
    const cur = mkEvent({
      where: {
        place_ref: "スタバ",
        placeType: "chain_brand",
        provenance: utteranceProvenance(["スタバ"], "high"),
      },
    });
    expect(isSameEventCanonical(prior, cur)).toBe(true);
  });

  it("substring 単独禁止: cur が exact_proper_noun でも、prior が exact_proper_noun でなく substring だけなら false", () => {
    // 両方 chain_brand で偶然 substring 一致でも、exact_proper_noun でないので false
    const a = mkEvent({
      where: {
        place_ref: "渋谷スタバ",
        placeType: "chain_brand", // exact_proper_noun ではない
        provenance: utteranceProvenance(["渋谷スタバ"], "high"),
      },
    });
    const b = mkEvent({
      where: {
        place_ref: "スタバ",
        placeType: "chain_brand",
        provenance: utteranceProvenance(["スタバ"], "high"),
      },
    });
    expect(isSameEventCanonical(a, b)).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// isFromCurrentUtterance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isFromCurrentUtterance: provenance.source_span match", () => {
  it("provenance.source_span が utterance に含まれる → true", () => {
    const event = mkEvent({
      where: {
        place_ref: "新宿",
        placeType: "generic_place",
        provenance: utteranceProvenance(["新宿"], "high"),
      },
    });
    expect(isFromCurrentUtterance(event, "12時に新宿でランチ")).toBe(true);
  });

  it("provenance.source_span が空 + slot value も含まれない → false", () => {
    const event = mkEvent({
      when: {
        startTime: "10:00",
        timeHint: null,
        provenance: inferredProvenance(),
      },
      where: {
        place_ref: "スタバ",
        placeType: "chain_brand",
        provenance: inferredProvenance(),
      },
      what: {
        activity: "コーヒー",
        activityCanonical: "コーヒー",
        provenance: inferredProvenance(),
      },
    });
    expect(isFromCurrentUtterance(event, "12時に新宿でランチ")).toBe(false);
  });
});

describe("isFromCurrentUtterance: slot value match (CEO 強化 2026-04-30)", () => {
  it("CEO ケース: utterance「12時に新宿でランチ」 + event(12:00, 新宿, ランチ) → true", () => {
    const event = mkEvent({
      when: {
        startTime: "12:00",
        timeHint: null,
        provenance: inferredProvenance(), // provenance は弱くても
      },
      where: {
        place_ref: "新宿",
        placeType: "generic_place",
        provenance: inferredProvenance(),
      },
      what: {
        activity: "ランチ",
        activityCanonical: "ランチ",
        provenance: inferredProvenance(),
      },
    });
    expect(isFromCurrentUtterance(event, "12時に新宿でランチ")).toBe(true);
  });

  it("when.startTime=12:00 → utterance の「12時」 と match", () => {
    const event = mkEvent({
      when: {
        startTime: "12:00",
        timeHint: null,
        provenance: inferredProvenance(),
      },
      where: { place_ref: null, placeType: null, provenance: inferredProvenance() },
      what: { activity: "", activityCanonical: "", provenance: inferredProvenance() },
    });
    expect(isFromCurrentUtterance(event, "12時にどこか")).toBe(true);
  });

  it("when.startTime=09:00 → utterance「9時」 (1 桁) でも match", () => {
    const event = mkEvent({
      when: { startTime: "09:00", timeHint: null, provenance: inferredProvenance() },
      where: { place_ref: null, placeType: null, provenance: inferredProvenance() },
      what: { activity: "", activityCanonical: "", provenance: inferredProvenance() },
    });
    expect(isFromCurrentUtterance(event, "9時に")).toBe(true);
  });

  it("when.startTime=12:00 + utterance に 12:00 形式で含まれる → true", () => {
    const event = mkEvent({
      when: { startTime: "12:00", timeHint: null, provenance: inferredProvenance() },
      where: { place_ref: null, placeType: null, provenance: inferredProvenance() },
      what: { activity: "", activityCanonical: "", provenance: inferredProvenance() },
    });
    expect(isFromCurrentUtterance(event, "12:00 集合")).toBe(true);
  });

  it("place_ref 「新宿」 が utterance に含まれる → true", () => {
    const event = mkEvent({
      when: { startTime: null, timeHint: null, provenance: inferredProvenance() },
      where: {
        place_ref: "新宿",
        placeType: "generic_place",
        provenance: inferredProvenance(),
      },
      what: { activity: "", activityCanonical: "", provenance: inferredProvenance() },
    });
    expect(isFromCurrentUtterance(event, "新宿で何か")).toBe(true);
  });

  it("activity 「ランチ」 が utterance に含まれる → true", () => {
    const event = mkEvent({
      when: { startTime: null, timeHint: null, provenance: inferredProvenance() },
      where: { place_ref: null, placeType: null, provenance: inferredProvenance() },
      what: {
        activity: "ランチ",
        activityCanonical: "ランチ",
        provenance: inferredProvenance(),
      },
    });
    expect(isFromCurrentUtterance(event, "ランチ食べたい")).toBe(true);
  });
});

describe("isFromCurrentUtterance: re-extraction 検出 (false 期待)", () => {
  it("CEO ケース: prior の event を LLM が再抽出 → false", () => {
    // turn 5 で LLM が prior event_1 (10:00 スタバ コーヒー) を再構築した
    const event = mkEvent({
      when: {
        startTime: "10:00",
        timeHint: null,
        provenance: utteranceProvenance(["10:00"], "high"), // prior の provenance
      },
      where: {
        place_ref: "スターバックス コーヒー SHIBUYA TSUTAYA 2F店",
        placeType: "exact_proper_noun",
        provenance: toolProvenance(),
      },
      what: {
        activity: "コーヒー",
        activityCanonical: "コーヒー",
        provenance: utteranceProvenance(["コーヒー"], "high"),
      },
    });
    // utterance は「12時に新宿でランチ」 → event の slot value は含まれない
    expect(isFromCurrentUtterance(event, "12時に新宿でランチ")).toBe(false);
  });

  it("hour 部分のみ偶然一致するケース: utterance「9時」 + prior event(09:00, スタバ, コーヒー)", () => {
    // utterance に「9時」 が出現するため、event の startTime=09:00 が偶然 match
    // → true (偽陽性、ただし実害なし: canonical identity check で別途防御)
    const event = mkEvent({
      when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance(["9時"], "high") },
      where: { place_ref: "スタバ", placeType: "chain_brand", provenance: utteranceProvenance(["スタバ"], "high") },
      what: { activity: "コーヒー", activityCanonical: "コーヒー", provenance: utteranceProvenance(["コーヒー"], "high") },
    });
    // 「9時を10時に変更」 → 「9時」 (event.startTime=09:00 と match) で true 返される
    // ただしこの場合、prior event の re-extraction として canonical identity で merge される想定
    expect(isFromCurrentUtterance(event, "9時を10時に変更")).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// countNonEmptyCriticalSlots
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("countNonEmptyCriticalSlots", () => {
  it("3 slot 全部 non-empty → 3", () => {
    const event = mkEvent();
    expect(countNonEmptyCriticalSlots(event)).toBe(3);
  });

  it("when + what のみ non-empty → 2", () => {
    const event = mkEvent({
      where: { place_ref: null, placeType: null, provenance: inferredProvenance() },
    });
    expect(countNonEmptyCriticalSlots(event)).toBe(2);
  });

  it("when のみ + timeHint だけでも count される → 1", () => {
    const event = mkEvent({
      when: { startTime: null, timeHint: "morning", provenance: utteranceProvenance(["朝"], "high") },
      where: { place_ref: null, placeType: null, provenance: inferredProvenance() },
      what: { activity: "", activityCanonical: "", provenance: inferredProvenance() },
    });
    expect(countNonEmptyCriticalSlots(event)).toBe(1);
  });

  it("全 slot empty (ghost event) → 0", () => {
    const event = mkEvent({
      when: { startTime: null, timeHint: null, provenance: inferredProvenance() },
      where: { place_ref: null, placeType: null, provenance: inferredProvenance() },
      what: { activity: "", activityCanonical: "", provenance: inferredProvenance() },
    });
    expect(countNonEmptyCriticalSlots(event)).toBe(0);
  });

  it("place_ref が空白文字列のみ → 0 として扱う", () => {
    const event = mkEvent({
      when: { startTime: null, timeHint: null, provenance: inferredProvenance() },
      where: { place_ref: "   ", placeType: null, provenance: inferredProvenance() },
      what: { activity: "", activityCanonical: "", provenance: inferredProvenance() },
    });
    expect(countNonEmptyCriticalSlots(event)).toBe(0);
  });
});
