/**
 * Response Promotion — 単体テスト (W3-PR-8 rev 3 commit 19)
 *
 * CEO 完了条件（2026-04-22 commit 19）:
 *   1. flag ON 時だけ DialogState → derive を実質問生成に使う     → §1 昇格時
 *   2. same broad question 繰り返しを解消する導線は derive 側      → §1 derive が
 *                                                                   出した question を
 *                                                                   そのまま反映
 *   3. search_handoff_blocking は internal only のまま            → §2 derived=null 時
 *                                                                   legacy 維持
 *   4. plan_presented には上げない                                → §3 phase guard
 *   5. phase authority 変更禁止                                   → §4 phase/plan/
 *                                                                   personalizeHints
 *                                                                   が維持される
 *
 * 禁止事項の確認:
 *   - Places API / PR-9 候補提示 UI → 本 helper は関与しない（input に依存しない）
 *   - session.pendingClarify への書き戻し → 本 helper は response のみ扱う
 *
 * 本 helper は pure:
 *   - 入力 response / derived を mutate しない（§5 で検証）
 *   - 戻り値は新 response か同一参照
 */

import { describe, expect, it } from "vitest";
import {
  promoteDialogStateToUserFacing,
} from "@/lib/alter-morning/dialog/responsePromotion";
import type {
  MorningProtocolResponse,
  MorningPhase,
  PendingClarify,
} from "@/lib/alter-morning/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// テストヘルパ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkResponse(
  partial: Partial<MorningProtocolResponse> & { phase: MorningPhase },
): MorningProtocolResponse {
  return {
    phase: partial.phase,
    message: partial.message ?? "legacy-message",
    plan: partial.plan,
    clarifyQuestion: partial.clarifyQuestion,
    personalizeHints: partial.personalizeHints,
  };
}

function mkDerived(
  partial: Partial<PendingClarify> & { question: string },
): PendingClarify {
  return {
    event_id: partial.event_id ?? "event_1",
    slot: partial.slot ?? "where",
    kind: partial.kind ?? "where_narrow",
    scope: partial.scope ?? {
      timeLabel: "朝",
      activityLabel: "カフェ",
      eventOrdinal: 1,
    },
    question: partial.question,
    askedAt: partial.askedAt ?? "2026-04-22T09:00:00.000Z",
    semanticMissCount: partial.semanticMissCount,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. 昇格ケース（clarifying + derive 非 null + question 非空）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1 昇格: phase=clarifying + derived.question 非空", () => {
  it("message と clarifyQuestion を derived.question で上書きする", () => {
    const response = mkResponse({
      phase: "clarifying",
      message: "legacy-question",
      clarifyQuestion: "legacy-question",
    });
    const derived = mkDerived({
      kind: "where_narrow",
      question: "甲府のどのあたり？カフェとか候補ある？",
    });

    const result = promoteDialogStateToUserFacing({ response, derived });

    expect(result.message).toBe("甲府のどのあたり？カフェとか候補ある？");
    expect(result.clarifyQuestion).toBe("甲府のどのあたり？カフェとか候補ある？");
  });

  it("narrower step: where_center → where_narrow で question 内容が変わる", () => {
    // 「同じ broad question が繰り返される」問題は derive 側で narrowStep
    // advance により別テンプレに切り替わることで解消される。
    // 本 helper はその切り替わった question を user-facing に反映するのみ。
    const response = mkResponse({
      phase: "clarifying",
      message: "朝のカフェはどのあたり？", // legacy の初回質問
    });
    const derived = mkDerived({
      kind: "where_narrow", // narrowStep 1 advance 後の derive
      question: "甲府のどのあたり？カフェとか候補ある？",
    });

    const result = promoteDialogStateToUserFacing({ response, derived });

    expect(result.message).toBe("甲府のどのあたり？カフェとか候補ある？");
    // user-facing は narrower step の question に進んでおり、broad の繰り返しが解消
    expect(result.message).not.toBe(response.message);
  });

  it("provider_retry: provider_recovering → 固定質問が user-facing に出る", () => {
    const response = mkResponse({
      phase: "clarifying",
      message: "legacy-retry-message",
    });
    const derived = mkDerived({
      kind: "provider_retry",
      question: "ちょっと時間かかってる、もう一度送って？",
    });

    const result = promoteDialogStateToUserFacing({ response, derived });

    expect(result.message).toBe("ちょっと時間かかってる、もう一度送って？");
    expect(result.clarifyQuestion).toBe(
      "ちょっと時間かかってる、もう一度送って？",
    );
  });

  it("when_start: when slot の derive も user-facing に昇格する", () => {
    const response = mkResponse({
      phase: "clarifying",
      message: "legacy-when",
    });
    const derived = mkDerived({
      slot: "when",
      kind: "when_start",
      question: "カフェは何時ごろから？",
    });

    const result = promoteDialogStateToUserFacing({ response, derived });

    expect(result.message).toBe("カフェは何時ごろから？");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. 非昇格: derived=null（search_handoff_blocking / slot_switching / stable）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§2 非昇格: derived=null", () => {
  it("derived=null → response を同一参照で返す（legacy message 維持）", () => {
    // CEO 条件 #3: search_handoff_blocking は user-facing に出さない。
    //   derivePendingClarify が where + search_handoff_blocking → null を返す。
    //   本 helper は null を受けたら response を同一参照で返し、legacy message
    //   （例: 「近くのお店で探そうか？」ではなく legacy の曖昧な fallback）を維持する。
    const response = mkResponse({
      phase: "clarifying",
      message: "legacy-question",
      clarifyQuestion: "legacy-question",
    });

    const result = promoteDialogStateToUserFacing({ response, derived: null });

    // 同一参照（昇格が発生していない）
    expect(result).toBe(response);
    expect(result.message).toBe("legacy-question");
    expect(result.clarifyQuestion).toBe("legacy-question");
  });

  it("slot_switching（where）派生 null → legacy message 維持", () => {
    // conversationStatus=slot_switching + slot=where → derive は null
    // → 本 helper は legacy gapResolver の next-slot question を維持する
    const response = mkResponse({
      phase: "clarifying",
      message: "時間は何時ごろから？", // legacy が既に次 slot の question を出している
    });

    const result = promoteDialogStateToUserFacing({ response, derived: null });

    expect(result).toBe(response);
    expect(result.message).toBe("時間は何時ごろから？");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. 非昇格: phase !== "clarifying"（plan_presented 等）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3 非昇格: phase guard（plan_presented に上げない）", () => {
  it("phase=plan_presented → derive があっても response 同一参照", () => {
    // CEO 条件 #4: plan_presented には上げない。
    //   legacy が plan_presented と決めた回は、本 helper は derive の question を
    //   捨てて response をそのまま返す。
    const response = mkResponse({
      phase: "plan_presented",
      message: "予定がまとまりました。",
    });
    const derived = mkDerived({
      kind: "where_narrow",
      question: "甲府のどのあたり？",
    });

    const result = promoteDialogStateToUserFacing({ response, derived });

    expect(result).toBe(response);
    expect(result.message).toBe("予定がまとまりました。");
  });

  const nonClarifyingPhases: MorningPhase[] = [
    "greeting",
    "collecting",
    "plan_confirmed",
    "outfit_offered",
    "outfit_clarifying",
    "outfit_presented",
    "completed",
    "skipped",
  ];

  it.each(nonClarifyingPhases)(
    "phase=%s → response 同一参照（非昇格）",
    (phase) => {
      const response = mkResponse({ phase, message: "legacy" });
      const derived = mkDerived({ question: "dialog-state-question" });

      const result = promoteDialogStateToUserFacing({ response, derived });

      expect(result).toBe(response);
      expect(result.message).toBe("legacy");
    },
  );
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. phase authority / plan / personalizeHints 保護
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4 phase / plan / personalizeHints を変更しない（CEO 条件 #5）", () => {
  it("昇格時も phase / plan / personalizeHints は入力と同一", () => {
    const plan = {
      date: "2026-04-22",
      items: [],
      dayConditions: {},
      createdAt: "2026-04-22T09:00:00.000Z",
      confirmed: false,
      status: "needs_answer" as const,
    };
    const hints = ["hint-a", "hint-b"];
    const response = mkResponse({
      phase: "clarifying",
      message: "legacy",
      plan,
      personalizeHints: hints,
    });
    const derived = mkDerived({ question: "new-question" });

    const result = promoteDialogStateToUserFacing({ response, derived });

    expect(result.phase).toBe("clarifying");
    expect(result.plan).toBe(plan); // 同一参照（shallow copy しか入らない）
    expect(result.personalizeHints).toBe(hints);
    expect(result.message).toBe("new-question");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. pure 性（入力 mutate 禁止）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§5 pure: 入力を mutate しない", () => {
  it("昇格時も response / derived を mutate しない", () => {
    const response = mkResponse({
      phase: "clarifying",
      message: "legacy",
      clarifyQuestion: "legacy",
    });
    const derived = mkDerived({ question: "new-question" });
    const rSnap = JSON.stringify(response);
    const dSnap = JSON.stringify(derived);

    promoteDialogStateToUserFacing({ response, derived });

    expect(JSON.stringify(response)).toBe(rSnap);
    expect(JSON.stringify(derived)).toBe(dSnap);
  });

  it("非昇格時も response / derived を mutate しない", () => {
    const response = mkResponse({
      phase: "plan_presented",
      message: "plan-ready",
    });
    const derived = mkDerived({ question: "new-question" });
    const rSnap = JSON.stringify(response);
    const dSnap = JSON.stringify(derived);

    promoteDialogStateToUserFacing({ response, derived });

    expect(JSON.stringify(response)).toBe(rSnap);
    expect(JSON.stringify(derived)).toBe(dSnap);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. 防御条項: derived.question が空 / 空白のみ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§6 防御: question 空は非昇格（legacy 維持）", () => {
  it("derived.question が空文字 → response 同一参照", () => {
    const response = mkResponse({
      phase: "clarifying",
      message: "legacy",
    });
    const derived = mkDerived({ question: "" });

    const result = promoteDialogStateToUserFacing({ response, derived });

    expect(result).toBe(response);
    expect(result.message).toBe("legacy");
  });

  it("derived.question が空白のみ → response 同一参照", () => {
    const response = mkResponse({
      phase: "clarifying",
      message: "legacy",
    });
    const derived = mkDerived({ question: "   \n  " });

    const result = promoteDialogStateToUserFacing({ response, derived });

    expect(result).toBe(response);
    expect(result.message).toBe("legacy");
  });

  it("derived.question が trim 後は非空 → 昇格（trim 済み）", () => {
    const response = mkResponse({
      phase: "clarifying",
      message: "legacy",
    });
    const derived = mkDerived({ question: "  新しい質問？  " });

    const result = promoteDialogStateToUserFacing({ response, derived });

    expect(result.message).toBe("新しい質問？");
    expect(result.clarifyQuestion).toBe("新しい質問？");
  });
});
