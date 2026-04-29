/**
 * dispatchEventMerge unit tests — PR #41b-1a (CEO 2026-04-29)
 *
 * 検証観点:
 *   1. applyModifyPatch — when / where / what / transport の override
 *   2. mergeIntoPriorCreate — null-fill semantics 維持
 *   3. dispatchEventMerge:
 *      - empty 入力 short-circuit
 *      - modify resolved → applyModifyPatch (CEO Case 1, Case 2)
 *      - modify unresolved → fallback で kept_as_new
 *      - create + 同一性 → mergeIntoPriorCreate
 *      - create + 同一性なし → kept_as_new (CEO Case 3 の予兆)
 *      - position fallback は length match + create のみ (CEO directive D)
 *      - length mismatch でも各 event 独立処理 (旧 discard 廃止)
 */

import { describe, it, expect } from "vitest";
import {
  applyModifyPatch,
  mergeIntoPriorCreate,
  dispatchEventMerge,
} from "@/lib/alter-morning/planning/eventMergeDispatch";
import {
  type Event,
  utteranceProvenance,
  inferredProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";

function mkEvent(overrides: Partial<Event> = {}): Event {
  const base: Event = {
    event_id: "e1",
    turn_mode: "create",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: {
      startTime: null,
      timeHint: null,
      provenance: inferredProvenance(),
    },
    where: {
      place_ref: null,
      placeType: null,
      coordinates: null,
      provenance: inferredProvenance(),
    },
    what: {
      activity: "",
      activityCanonical: "",
      provenance: inferredProvenance(),
    },
    who: [],
    transport: null,
    certainty: "asserted",
    missing_semantic_critical: [],
    missing_solver_blockers: [],
  };
  return { ...base, ...overrides } as Event;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// applyModifyPatch
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyModifyPatch — modify event の intentional update", () => {
  it("[CEO Case 1] when.startTime 9:00 → 10:00 で override", () => {
    const prior = mkEvent({
      event_id: "e1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "サドヤ",
        placeType: "exact_proper_noun",
        coordinates: { lat: 35.66, lng: 138.57 },
        provenance: utteranceProvenance(["サドヤ"], "high"),
      },
    });
    const cur = mkEvent({
      event_id: "evt_modify",
      turn_mode: "modify",
      target_ref: "9時の予定",
      change_scope: "patch",
      when: {
        startTime: "10:00",
        timeHint: null,
        provenance: utteranceProvenance(["10時"], "high"),
      },
    });
    const result = applyModifyPatch(prior, cur);
    expect(result.event_id).toBe("e1"); // prior id 維持
    expect(result.turn_mode).toBe("create"); // prior turn_mode 維持
    expect(result.when.startTime).toBe("10:00"); // override
    expect(result.where.place_ref).toBe("サドヤ"); // 維持
    // target_ref / target_ref_confidence / change_scope は解決後 clear
    expect(result.target_ref).toBeNull();
    expect(result.target_ref_confidence).toBeNull();
    expect(result.change_scope).toBeNull();
  });

  it("[CEO Case 2] transport 電車 → 車 で override", () => {
    const prior = mkEvent({
      event_id: "e1",
      transport: "電車",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
    });
    const cur = mkEvent({
      event_id: "evt_modify",
      turn_mode: "modify",
      target_ref: "今日の予定",
      transport: "車",
    });
    const result = applyModifyPatch(prior, cur);
    expect(result.transport).toBe("車"); // override
    expect(result.when.startTime).toBe("09:00"); // 維持 (cur.when.startTime null)
  });

  it("cur の null フィールドは prior 維持", () => {
    const prior = mkEvent({
      event_id: "e1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "サドヤ",
        placeType: "exact_proper_noun",
        coordinates: null,
        provenance: utteranceProvenance(["サドヤ"], "high"),
      },
      what: {
        activity: "コーヒー",
        activityCanonical: "コーヒー",
        provenance: utteranceProvenance(["コーヒー"], "high"),
      },
      transport: "電車",
    });
    const cur = mkEvent({
      event_id: "evt_modify",
      turn_mode: "modify",
      target_ref: "9時",
      // when / where / what / transport いずれも null/empty
    });
    const result = applyModifyPatch(prior, cur);
    expect(result.when.startTime).toBe("09:00");
    expect(result.where.place_ref).toBe("サドヤ");
    expect(result.what.activity).toBe("コーヒー");
    expect(result.transport).toBe("電車");
  });

  it("[PR-46 text leak fix] where は modify では override しない (常に prior 維持)", () => {
    // CEO 2026-04-29: modify event の cur.where は touch しない。
    //   理由: LLM の command 文字列や stale 値が混入するリスクあり。
    //   場所変更は将来 PR で別 pattern (e.g.,「サドヤから新宿に変更」専用) で扱う。
    const prior = mkEvent({
      event_id: "e1",
      where: {
        place_ref: "サドヤ",
        placeType: "exact_proper_noun",
        coordinates: null,
        provenance: utteranceProvenance(["サドヤ"], "high"),
      },
    });
    const cur = mkEvent({
      event_id: "evt_modify",
      turn_mode: "modify",
      target_ref: "9時",
      where: {
        place_ref: "新宿",
        placeType: null,
        coordinates: null,
        provenance: utteranceProvenance(["新宿"], "high"),
      },
    });
    const result = applyModifyPatch(prior, cur);
    expect(result.where.place_ref).toBe("サドヤ"); // ★ prior 維持 (text leak 防止)
  });

  it("[PR-46 text leak fix] what は modify では override しない (常に prior 維持)", () => {
    // CEO 2026-04-29 真因 fix: LLM が cur.what.activity に「9時を10時に変更」 等の
    //   command 文字列を入れると、prior.what が上書きされて plan_item.text に leak。
    //   modify では what を touch しない契約に変更。
    const prior = mkEvent({
      event_id: "e1",
      what: {
        activity: "コーヒー",
        activityCanonical: "コーヒー",
        provenance: utteranceProvenance(["コーヒー"], "high"),
      },
    });
    const cur = mkEvent({
      event_id: "evt_modify",
      turn_mode: "modify",
      target_ref: "9時",
      what: {
        activity: "9時を10時に変更", // ← LLM が command 文字列を入れた想定
        activityCanonical: "9時を10時に変更",
        provenance: utteranceProvenance(["9時を10時に変更"], "high"),
      },
    });
    const result = applyModifyPatch(prior, cur);
    expect(result.what.activity).toBe("コーヒー"); // ★ prior 維持
  });

  it("missing_semantic_critical / missing_solver_blockers は prior 維持", () => {
    const prior = mkEvent({
      event_id: "e1",
      missing_semantic_critical: ["what"],
      missing_solver_blockers: [],
    });
    const cur = mkEvent({
      event_id: "evt_modify",
      turn_mode: "modify",
      target_ref: "9時",
      missing_semantic_critical: [], // cur は partial だが
      missing_solver_blockers: ["transport"],
    });
    const result = applyModifyPatch(prior, cur);
    expect(result.missing_semantic_critical).toEqual(["what"]);
    expect(result.missing_solver_blockers).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// mergeIntoPriorCreate (regression: 既存 mergeIntoPrior と同じ semantics)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("mergeIntoPriorCreate — null-fill (existing semantics)", () => {
  it("cur の null は prior 維持、non-null は採用", () => {
    const prior = mkEvent({
      event_id: "e1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "サドヤ",
        placeType: "exact_proper_noun",
        coordinates: { lat: 35.66, lng: 138.57 },
        provenance: utteranceProvenance(["サドヤ"], "high"),
      },
    });
    const cur = mkEvent({
      event_id: "e1",
      turn_mode: "create",
      transport: "電車",
    });
    const result = mergeIntoPriorCreate(prior, cur);
    expect(result.when.startTime).toBe("09:00");
    expect(result.where.place_ref).toBe("サドヤ");
    expect(result.transport).toBe("電車");
  });

  it("priorWhereLocked → where 完全保持", () => {
    const prior = mkEvent({
      event_id: "e1",
      where: {
        place_ref: "サドヤ",
        placeType: "exact_proper_noun",
        coordinates: null,
        provenance: utteranceProvenance(["サドヤ"], "high"),
      },
    });
    const cur = mkEvent({
      event_id: "e1",
      turn_mode: "create",
      where: {
        place_ref: "新宿",
        placeType: null,
        coordinates: null,
        provenance: utteranceProvenance(["新宿"], "high"),
      },
    });
    const result = mergeIntoPriorCreate(prior, cur);
    // create では lock を尊重し prior 完全保持
    expect(result.where.place_ref).toBe("サドヤ");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// dispatchEventMerge — full integration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dispatchEventMerge — turn_mode 別 dispatch", () => {
  it("[empty] currentEvents 空 → priorPersistedEvents 全返却", () => {
    const prior = [mkEvent({ event_id: "e1" })];
    const result = dispatchEventMerge({
      currentEvents: [],
      priorPersistedEvents: prior,
    });
    expect(result.effectiveEvents).toBe(prior);
    expect(result.dispatch).toEqual([]);
  });

  it("[empty] priorPersistedEvents 空 → currentEvents 全 kept_as_new", () => {
    const cur = [mkEvent({ event_id: "c1" }), mkEvent({ event_id: "c2" })];
    const result = dispatchEventMerge({
      currentEvents: cur,
      priorPersistedEvents: [],
    });
    expect(result.effectiveEvents).toBe(cur);
    expect(result.dispatch).toHaveLength(2);
    expect(result.dispatch[0].action).toBe("kept_as_new");
    expect(result.dispatch[1].action).toBe("kept_as_new");
  });

  it("[CEO Case 1 真因 fix] modify resolved → applyModifyPatch で when=10:00 に更新", () => {
    const prior = mkEvent({
      event_id: "e1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "サドヤ",
        placeType: "exact_proper_noun",
        coordinates: null,
        provenance: utteranceProvenance(["サドヤ"], "high"),
      },
      what: {
        activity: "コーヒー",
        activityCanonical: "コーヒー",
        provenance: utteranceProvenance(["コーヒー"], "high"),
      },
    });
    const modifyCur = mkEvent({
      event_id: "evt_modify",
      turn_mode: "modify",
      target_ref: "9時の予定",
      target_ref_confidence: "high",
      change_scope: "patch",
      when: {
        startTime: "10:00",
        timeHint: null,
        provenance: utteranceProvenance(["10時"], "high"),
      },
    });
    const result = dispatchEventMerge({
      currentEvents: [modifyCur],
      priorPersistedEvents: [prior],
    });
    expect(result.effectiveEvents).toHaveLength(1);
    expect(result.effectiveEvents[0].event_id).toBe("e1"); // prior id 維持
    expect(result.effectiveEvents[0].when.startTime).toBe("10:00"); // ★ updated
    expect(result.effectiveEvents[0].where.place_ref).toBe("サドヤ"); // 維持
    expect(result.dispatch).toHaveLength(1);
    expect(result.dispatch[0].action).toBe("modify_applied");
    expect(result.dispatch[0].target_event_id).toBe("e1");
    expect(result.dispatch[0].confidence).toBe("high");
    expect(result.dispatch[0].strategy).toBe("time_bucket");
  });

  it("[CEO Case 2 真因 fix] modify resolved + transport → 車 に更新", () => {
    const prior = mkEvent({
      event_id: "e1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "サドヤ",
        placeType: "exact_proper_noun",
        coordinates: null,
        provenance: utteranceProvenance(["サドヤ"], "high"),
      },
      what: {
        activity: "コーヒー",
        activityCanonical: "コーヒー",
        provenance: utteranceProvenance(["コーヒー"], "high"),
      },
      transport: "電車",
    });
    const modifyCur = mkEvent({
      event_id: "evt_modify",
      turn_mode: "modify",
      target_ref: "9時の予定",
      transport: "車",
    });
    const result = dispatchEventMerge({
      currentEvents: [modifyCur],
      priorPersistedEvents: [prior],
    });
    expect(result.effectiveEvents).toHaveLength(1);
    expect(result.effectiveEvents[0].transport).toBe("車"); // ★ updated
    expect(result.effectiveEvents[0].when.startTime).toBe("09:00"); // 維持
    expect(result.dispatch[0].action).toBe("modify_applied");
  });

  it("[single event fallback] target_ref 解決失敗 + prior 1 件 → 単一 event に apply (CEO Case 2)", () => {
    // CEO 2026-04-29 Case 2「移動手段を車に変更」 シナリオ:
    //   target_ref="今日の予定" のような非 specific 文字列でも、
    //   prior が 1 件なら自動的にその event に apply (medium confidence)
    const prior = mkEvent({
      event_id: "e1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "サドヤ",
        placeType: "exact_proper_noun",
        coordinates: null,
        provenance: utteranceProvenance(["サドヤ"], "high"),
      },
      transport: "電車",
    });
    const modifyCur = mkEvent({
      event_id: "evt_modify",
      turn_mode: "modify",
      target_ref: "今日の予定", // resolveTargetRef では解決しない文字列
      transport: "車",
    });
    const result = dispatchEventMerge({
      currentEvents: [modifyCur],
      priorPersistedEvents: [prior],
    });
    expect(result.effectiveEvents).toHaveLength(1);
    expect(result.effectiveEvents[0].transport).toBe("車"); // ★ apply された
    expect(result.dispatch[0].action).toBe("modify_applied");
    expect(result.dispatch[0].strategy).toBe("single_event_fallback");
    expect(result.dispatch[0].confidence).toBe("medium");
  });

  it("[fallback] modify unresolved (target_ref 解決失敗 + prior 複数) → kept_as_new (data loss 防止)", () => {
    const prior1 = mkEvent({
      event_id: "e1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
    });
    const prior2 = mkEvent({
      event_id: "e2",
      when: {
        startTime: "12:00",
        timeHint: null,
        provenance: utteranceProvenance(["12時"], "high"),
      },
    });
    const unresolvedModify = mkEvent({
      event_id: "evt_modify",
      turn_mode: "modify",
      target_ref: "存在しない予定", // 複数 prior + 解決失敗 → ambiguous
    });
    const result = dispatchEventMerge({
      currentEvents: [unresolvedModify],
      priorPersistedEvents: [prior1, prior2],
    });
    // 複数 prior で曖昧 → fallback (single event fallback は length===1 のみ)
    expect(result.effectiveEvents).toHaveLength(3); // prior1 + prior2 + unresolved
    expect(result.dispatch[0].action).toBe("modify_unresolved_fallback_create");
  });

  it("[create + 同一性] event_id 一致 → mergeIntoPriorCreate", () => {
    const prior = mkEvent({
      event_id: "e1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
    });
    const cur = mkEvent({
      event_id: "e1", // 一致
      turn_mode: "create",
      transport: "電車",
    });
    const result = dispatchEventMerge({
      currentEvents: [cur],
      priorPersistedEvents: [prior],
    });
    expect(result.effectiveEvents).toHaveLength(1);
    expect(result.effectiveEvents[0].when.startTime).toBe("09:00"); // prior 維持
    expect(result.effectiveEvents[0].transport).toBe("電車"); // cur 採用
    expect(result.dispatch[0].action).toBe("merged_into_prior");
  });

  it("[CEO Case 3 予兆] create + 同一性なし → kept_as_new (append 候補)", () => {
    const prior = mkEvent({
      event_id: "e1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "スタバ",
        placeType: "chain_brand",
        coordinates: null,
        provenance: utteranceProvenance(["スタバ"], "high"),
      },
    });
    const newEvent = mkEvent({
      event_id: "e2", // 違う id
      turn_mode: "create",
      when: {
        startTime: "12:00", // 違う時間
        timeHint: null,
        provenance: utteranceProvenance(["12時"], "high"),
      },
      where: {
        place_ref: "新宿", // 違う場所
        placeType: null,
        coordinates: null,
        provenance: utteranceProvenance(["新宿"], "high"),
      },
      what: {
        activity: "ミーティング",
        activityCanonical: "ミーティング",
        provenance: utteranceProvenance(["ミーティング"], "high"),
      },
    });
    // length mismatch (prior=1, cur=1) ← length match だが時間/場所が違う
    const result = dispatchEventMerge({
      currentEvents: [newEvent],
      priorPersistedEvents: [prior],
    });
    // length match で position fallback が fire してしまう (現状)
    // → CEO Case 3 では cur=2 prior=1 で length mismatch なので fallback fire しない
    //   (本テストは length match を意図的に作ったので merged_into_prior になる)
    expect(result.dispatch[0].action).toBe("merged_into_prior");
  });

  it("[length mismatch + create + append] cur=2 prior=1 → 各 event 独立処理 (旧 discard 廃止)", () => {
    // CEO Case 3 シナリオ: 既存 09:00 スタバ + 新規 12:00 新宿ミーティング
    const prior = mkEvent({
      event_id: "e1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "スタバ",
        placeType: "chain_brand",
        coordinates: null,
        provenance: utteranceProvenance(["スタバ"], "high"),
      },
    });
    const cur1 = mkEvent({
      event_id: "e1", // 既存と一致
      turn_mode: "create",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
    });
    const cur2 = mkEvent({
      event_id: "e2", // 新規
      turn_mode: "create",
      when: {
        startTime: "12:00",
        timeHint: null,
        provenance: utteranceProvenance(["12時"], "high"),
      },
      where: {
        place_ref: "新宿",
        placeType: null,
        coordinates: null,
        provenance: utteranceProvenance(["新宿"], "high"),
      },
      what: {
        activity: "ミーティング",
        activityCanonical: "ミーティング",
        provenance: utteranceProvenance(["ミーティング"], "high"),
      },
    });
    const result = dispatchEventMerge({
      currentEvents: [cur1, cur2],
      priorPersistedEvents: [prior],
    });
    // 旧 logic: length mismatch で全 cur discard → prior 1 件のみ
    // 新 logic: cur1 は merged_into_prior、cur2 は kept_as_new → 計 2 件
    expect(result.effectiveEvents).toHaveLength(2);
    expect(result.effectiveEvents[0].event_id).toBe("e1"); // prior (merged)
    expect(result.effectiveEvents[1].event_id).toBe("e2"); // 新規 (PR #41b-1b で event_id 新規発行)
    expect(result.dispatch).toHaveLength(2);
    expect(result.dispatch[0].action).toBe("merged_into_prior");
    expect(result.dispatch[1].action).toBe("kept_as_new");
  });

  it("[append turn_mode] turn_mode='append' → kept_as_new", () => {
    const prior = mkEvent({ event_id: "e1" });
    const appendCur = mkEvent({
      event_id: "evt_append",
      turn_mode: "append",
      when: {
        startTime: "12:00",
        timeHint: null,
        provenance: utteranceProvenance(["12時"], "high"),
      },
    });
    const result = dispatchEventMerge({
      currentEvents: [appendCur],
      priorPersistedEvents: [prior],
    });
    expect(result.effectiveEvents).toHaveLength(2);
    expect(result.dispatch[0].cur_turn_mode).toBe("append");
    expect(result.dispatch[0].action).toBe("kept_as_new");
  });

  it("[position fallback 制限] turn_mode='create' + length match のみ fallback", () => {
    // length match で event_id / time+place 不一致 → position fallback fire
    const prior = mkEvent({
      event_id: "e1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
    });
    const cur = mkEvent({
      event_id: "e2", // 違う id
      turn_mode: "create",
      when: {
        startTime: "10:00",
        timeHint: null,
        provenance: utteranceProvenance(["10時"], "high"),
      },
    });
    const result = dispatchEventMerge({
      currentEvents: [cur],
      priorPersistedEvents: [prior],
    });
    // position fallback で merged_into_prior
    expect(result.dispatch[0].action).toBe("merged_into_prior");
    // event_id は prior (e1) を維持、startTime は cur (10:00) 採用
    expect(result.effectiveEvents[0].event_id).toBe("e1");
    expect(result.effectiveEvents[0].when.startTime).toBe("10:00");
  });

  it("[CEO Case 3 + collision] append cur が prior と event_id 衝突 → fresh id にrename (data loss 防止)", () => {
    // CEO 2026-04-29 PR #41b-1b: LLM が prior と同じ event_id を再利用してしまった場合、
    //   そのまま push すると effectiveEvents に duplicate id が入って data 上書きリスク
    const prior = mkEvent({
      event_id: "event_1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "スタバ",
        placeType: "exact_proper_noun",
        coordinates: null,
        provenance: utteranceProvenance(["スタバ"], "high"),
      },
      what: {
        activity: "コーヒー",
        activityCanonical: "コーヒー",
        provenance: utteranceProvenance(["コーヒー"], "high"),
      },
    });
    const appendCur = mkEvent({
      event_id: "event_1", // ★ prior と衝突
      turn_mode: "append",
      when: {
        startTime: "12:00",
        timeHint: null,
        provenance: utteranceProvenance(["12時"], "high"),
      },
      where: {
        place_ref: "新宿",
        placeType: null,
        coordinates: null,
        provenance: utteranceProvenance(["新宿"], "high"),
      },
      what: {
        activity: "ミーティング",
        activityCanonical: "ミーティング",
        provenance: utteranceProvenance(["ミーティング"], "high"),
      },
    });
    const result = dispatchEventMerge({
      currentEvents: [appendCur],
      priorPersistedEvents: [prior],
    });
    expect(result.effectiveEvents).toHaveLength(2);
    const ids = result.effectiveEvents.map((e) => e.event_id);
    expect(new Set(ids).size).toBe(2); // ★ 重複なし
    expect(result.effectiveEvents[0].event_id).toBe("event_1");
    expect(result.effectiveEvents[0].where.place_ref).toBe("スタバ"); // prior 上書きされない
    expect(result.effectiveEvents[1].event_id).toBe("event_2"); // ★ rename
    expect(result.effectiveEvents[1].where.place_ref).toBe("新宿");
  });

  it("[position fallback 制限] length mismatch + create → fallback fire しない (kept_as_new)", () => {
    const prior1 = mkEvent({ event_id: "e1" });
    const prior2 = mkEvent({ event_id: "e2" });
    const cur = mkEvent({
      event_id: "e3",
      turn_mode: "create",
      when: {
        startTime: "10:00",
        timeHint: null,
        provenance: utteranceProvenance(["10時"], "high"),
      },
    });
    const result = dispatchEventMerge({
      currentEvents: [cur],
      priorPersistedEvents: [prior1, prior2],
    });
    // length mismatch (1 vs 2) → position fallback fire しない
    expect(result.effectiveEvents).toHaveLength(3); // prior1 + prior2 + cur
    expect(result.dispatch[0].action).toBe("kept_as_new");
  });
});
