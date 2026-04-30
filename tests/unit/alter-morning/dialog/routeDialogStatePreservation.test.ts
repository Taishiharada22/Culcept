/**
 * Route dialogState Preservation — W3-PR-8 rev 3 commit 21
 *
 * 位置づけ:
 *   commit 17 で追加された shadow pipeline gate（route.ts 内の
 *   `ALTER_MORNING_FLAGS.dialogStateV2(userId) && morningSession?.dialogState != null`）が、
 *   commit 17/18/19 全てで **preview で一度も発火していなかった**。
 *
 *   原因は shadow block の手前で `morningSession = adapted.session` により
 *   ensureSessionV1 が付与した `dialogState` field が消えていたこと。
 *   adaptPipelineToLegacy は dialogState を知らない pure function なので、
 *   その出力 session には dialogState field が含まれない。
 *
 *   commit 21 で route.ts は次のパターンに統一された:
 *       morningSession = { ...adapted.session, dialogState: morningSession.dialogState };
 *
 *   本テストはこの「adapter の session shape は dialogState を **含まない**」
 *   という契約を unit level で固定し、将来 adapter 側で prop 追加等があっても
 *   regression が検知できるようにする。
 *
 * 禁止事項（commit 21 scope 外）:
 *   - adapter に dialogState field を追加する（責務分離の原則）
 *   - session.dialogState を pendingClarify 経由で二重化する
 *
 * 設計書:
 *   - docs/alter-morning-pr8-rev3-implementation-detail.md §6 (ensureSessionV1)
 *   - docs/alter-morning-strict-confirmation-design.md §3.7 (DialogState 主状態)
 */

import { describe, test, expect } from "vitest";

import {
  adaptPipelineToLegacy,
  type LegacyAdapterInput,
} from "@/lib/alter-morning/legacyAdapter";
import {
  createInitialDialogState,
  type DialogState,
} from "@/lib/alter-morning/dialog/types";
import type { MorningPipelineResult } from "@/lib/alter-morning/morningPipeline";
import type { Event } from "@/lib/alter-morning/comprehension/eventSchema";

function mkEvent(): Event {
  return {
    event_id: "event_1",
    turn_mode: "create",
    change_scope: null,
    target_ref: null,
    target_ref_confidence: null,
    certainty: "asserted",
    when: {
      startTime: "09:00",
      timeHint: null,
      provenance: { source: "utterance", spans: ["9時"], confidence: "high" },
    },
    where: {
      place_ref: "サドヤ",
      placeType: "exact_proper_noun",
      provenance: { source: "utterance", spans: ["サドヤ"], confidence: "high" },
    },
    what: {
      activity: "コーヒー",
      activityCanonical: "コーヒー",
      provenance: { source: "utterance", spans: ["コーヒー"], confidence: "high" },
    },
    who: [],
    transport: null,
    missing_semantic_critical: [],
    missing_solver_blockers: [],
  } as unknown as Event;
}

function mkOkResult(): MorningPipelineResult {
  return {
    status: "ok",
    comprehension: { events: [mkEvent()] },
    gapResolution: {
      primary_clarify: null,
      unresolved_slots: [],
      sticky_count: 0,
    },
    narration: { text: "9時にサドヤでコーヒーだね。" },
  } as unknown as MorningPipelineResult;
}

function mkInput(): LegacyAdapterInput {
  return {
    sessionId: "ms_test_dialogstate",
    utterance: "9時にサドヤでコーヒー",
    userPrefecture: "東京都",
    userCity: "渋谷区",
    userHomeLabel: "自宅",
    userHomeLat: 35.0,
    userHomeLng: 139.0,
    today: "2026-04-22",
  };
}

describe("commit 21 — adapter 跨ぎ dialogState 消失 regression contract", () => {
  test("adaptPipelineToLegacy.session は dialogState field を含まない（責務分離）", () => {
    // adapter は DialogState を知らない pure function。
    // session rebuild 時に dialogState を勝手に生成したり persist したりしない
    // ことを、出力 shape で固定する。
    const { session } = adaptPipelineToLegacy(mkOkResult(), mkInput());
    expect(session).not.toHaveProperty("dialogState");
  });

  test("route.ts の preservation パターン `{...adapted.session, dialogState: prior}` で narrowStep が維持される", () => {
    // シミュレーション: ensureSessionV1 で init した priorState に narrowStep=2 を
    // 乗せておき、adapter が返す session を route の preservation パターンで
    // マージすると、narrowStep=2 が保たれる。
    const priorState: DialogState = {
      ...createInitialDialogState(),
      focus: {
        event_id: "event_1",
        slot: "where",
        narrowStep: 2, // T2 narrower まで進んでいる想定
      },
    };

    const { session: adapted } = adaptPipelineToLegacy(mkOkResult(), mkInput());

    // route.ts commit 21 の正規パターン
    const merged = { ...adapted, dialogState: priorState };

    expect(merged.dialogState).not.toBeUndefined();
    expect(merged.dialogState.focus?.narrowStep).toBe(2);
    expect(merged.dialogState.focus?.event_id).toBe("event_1");
    // adapter 側の他の field（plan/pendingClarify 等）は当然 adapter 由来
    expect(merged.sessionId).toBe("ms_test_dialogstate");
  });

  test("誤パターン（preservation なし）だと dialogState が消える = この fix が必要である証明", () => {
    // 以前の route.ts: `morningSession = adapted.session;` だけ。
    // adapted.session は dialogState を持たないため dialogState が undefined になる。
    // これが preview で shadow block が走らなかった直接原因。
    const priorState: DialogState = {
      ...createInitialDialogState(),
      focus: { event_id: "event_1", slot: "where", narrowStep: 2 },
    };

    const { session: adapted } = adaptPipelineToLegacy(mkOkResult(), mkInput());

    // 【誤】preservation なしで代入（commit 20 以前の route.ts）
    const wrongMerged = adapted;

    // dialogState 消失 → shadow block gate `dialogState != null` が false
    expect((wrongMerged as { dialogState?: unknown }).dialogState).toBeUndefined();
    // prior は wipe され narrowStep=2 が失われる
    void priorState; // 比較対象だが merged には入らない
  });
});
