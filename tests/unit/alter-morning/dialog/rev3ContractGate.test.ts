/**
 * rev3 Contract Gate — W3-PR-8 rev 3 commit 20 (preview acceptance gate)
 *
 * 目的:
 *   commit 19 で DialogState → derive → user-facing message/clarifyQuestion が
 *   実会話に反映されたが、phase authority は legacy のまま。そのため
 *   rev3 合格判定には「preview 相当の contract 層」で 4 観点を縛る必要がある。
 *
 *   本ファイルは rev3 合格 gate として、以下 4 観点を contract level で固定する。
 *   これを通らないものは rev3 合格にならない（= PR-9 に進めない）。
 *
 * CEO 4 観点（2026-04-22 commit 19 承認時）:
 *   §1 same broad question が 2 回以上続かず、narrower / slot switch / recovery に進むか
 *   §2 generic place 初回入力で plan_presented に上がらないか
 *   §3 search_handoff_blocking が user-facing に漏れないか
 *   §4 provider failure で 500 や items=0 clarifying が出ないか
 *
 * 観点別テスト層:
 *   §1: shadowPipeline + promote integration（commit 19 の user-facing 昇格）
 *   §2: decidePhase / hasBlockingUnresolvedSlots / adaptPipelineToLegacy
 *       （phase authority contract — DialogState の責任範囲外、legacy 正本）
 *   §3: end-to-end multi-turn + 禁忌 token scan
 *   §4: buildFailedPipelineResult + adaptPipelineToLegacy（items=0 禁則）
 *
 * 重要設計原則:
 *   CEO 観察 2 の核心 = "responsePromotion は phase=clarifying の時しか効かない"。
 *   legacy 側 phase authority が premature に plan_presented を出すと、commit 19
 *   では救えない。§2 は DialogState 経路ではなく legacy 側の unconditional contract。
 */

import { describe, expect, it, test } from "vitest";
import { advanceDialogState } from "@/lib/alter-morning/dialog/shadowPipeline";
import { promoteDialogStateToUserFacing } from "@/lib/alter-morning/dialog/responsePromotion";
import { dialogReducer } from "@/lib/alter-morning/dialog/reducer";
import {
  createInitialDialogState,
  type DialogState,
} from "@/lib/alter-morning/dialog/types";
import {
  adaptPipelineToLegacy,
  buildFailedPipelineResult,
  type LegacyAdapterInput,
} from "@/lib/alter-morning/legacyAdapter";
import {
  blockingForEvent,
  hasBlockingUnresolvedSlots,
} from "@/lib/alter-morning/planning/blockingSlots";
import {
  utteranceProvenance,
  type Event,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { MorningPipelineResult } from "@/lib/alter-morning/morningPipeline";
import type {
  MorningPlan,
  MorningProtocolResponse,
  MorningPhase,
} from "@/lib/alter-morning/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// テストヘルパ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const NOW_ISO = "2026-04-22T09:00:00.000Z";

function mkEvent(overrides: Partial<Event> = {}): Event {
  return {
    event_id: "e1",
    turn_mode: "create",
    change_scope: null,
    target_ref: null,
    target_ref_confidence: null,
    certainty: "asserted",
    when: {
      startTime: "09:00",
      timeHint: null,
      provenance: utteranceProvenance(["9時"], "high"),
    },
    where: {
      place_ref: "サドヤ",
      placeType: "exact_proper_noun",
      provenance: utteranceProvenance(["サドヤ"], "high"),
    },
    what: {
      activity: "コーヒー",
      activityCanonical: "コーヒー",
      provenance: utteranceProvenance(["コーヒー"], "high"),
    },
    who: [],
    transport: null,
    missing_semantic_critical: [],
    missing_solver_blockers: [],
    ...overrides,
  };
}

function mkLegacyResponse(
  phase: MorningPhase,
  message: string,
): MorningProtocolResponse {
  return {
    phase,
    message,
    clarifyQuestion: phase === "clarifying" ? message : undefined,
  };
}

/**
 * 合成 ok 結果: events 配列から最小 MorningPipelineResult を組む。
 * narration は空で付与（legacyAdapter の buildPlanPresentedMessage は deterministic に落ちる）。
 */
function mkOkResult(events: Event[]): MorningPipelineResult {
  return {
    status: "ok",
    comprehension: {
      events,
      targetDate: "2026-04-22",
      startPoint: null,
      departureTime: null,
      goOut: true,
    },
    timeline: null,
    grounded: [],
    gapResolution: null,
    annotations: { body: [], weather: [], party: [] },
    narration: null,
    hints: {
      explicit_times: [],
      explicit_start_points: [],
      slot_opt_outs: [],
    },
  };
}

function mkAdapterInput(
  overrides: Partial<LegacyAdapterInput> = {},
): LegacyAdapterInput {
  return {
    sessionId: "ms_gate",
    utterance: "テスト",
    today: "2026-04-22",
    ...overrides,
  };
}

/**
 * commit 19 の route flag-ON loop を in-memory で 1 ターン再現。
 * shadow persist + user-facing promote を通した response を返す。
 */
function runFlagOnTurn(args: {
  prevState: DialogState;
  message: string;
  targetEventId: string;
  targetSlot: "where" | "when" | "what";
  events: Event[];
  turnIndex: number;
  legacyResponse: MorningProtocolResponse;
}): {
  nextState: DialogState;
  response: MorningProtocolResponse;
  promoted: boolean;
} {
  const advanced = advanceDialogState({
    prevState: args.prevState,
    message: args.message,
    targetEventId: args.targetEventId,
    targetSlot: args.targetSlot,
    events: args.events,
    turnIndex: args.turnIndex,
    nowIso: NOW_ISO,
  });
  const promoted = promoteDialogStateToUserFacing({
    response: args.legacyResponse,
    derived: advanced.derived,
  });
  return {
    nextState: advanced.nextState,
    response: promoted,
    promoted: promoted !== args.legacyResponse,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. same broad question が 2 回以上続かない（CEO 観点 1）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 契約: 同じ focus 状態で 2 ターン連続に「文字通り同一の question」が
//       user-facing に出ない。narrower-step advance / flat variation /
//       provider recovery のいずれかで文面が変わる必要がある。

describe("§1 same broad question 非連続（narrower / flat variation / recovery）", () => {
  const events = [mkEvent({ event_id: "event_1" })];
  const legacyBroadQ = "朝のカフェはどのあたり？";

  it("T1→T2 narrower step: anchor_alone が narrowStep を 0→1 に advance し、文面が変わる", () => {
    let state = createInitialDialogState();

    // T1: 何も回答なし or flat → broad に相当（legacy のまま）
    //   本テストでは legacy broad Q を「前ターンの提示済み question」に見立て、
    //   T1 自体は user の broad 回答を取り込むだけのシミュレーションに留める。
    //   = state が初期 → 甲府で narrowStep 0→1
    const t1 = runFlagOnTurn({
      prevState: state,
      message: "甲府",
      targetEventId: "event_1",
      targetSlot: "where",
      events,
      turnIndex: 1,
      legacyResponse: mkLegacyResponse("clarifying", legacyBroadQ),
    });
    state = t1.nextState;

    // 昇格された user-facing が broad と文面で違う（narrower step に advance した）
    expect(t1.response.message).not.toBe(legacyBroadQ);
    // narrower-step の特徴 token を含む（anchor を使う質問になっている）
    expect(t1.response.message).toContain("甲府");
  });

  it("T2→T3 flat variation: 同粒度の flat が続いても文面が変わる（no broad-repeat）", () => {
    let state = createInitialDialogState();
    // T1: 甲府 で narrowStep 0→1
    let t = runFlagOnTurn({
      prevState: state,
      message: "甲府",
      targetEventId: "event_1",
      targetSlot: "where",
      events,
      turnIndex: 1,
      legacyResponse: mkLegacyResponse("clarifying", legacyBroadQ),
    });
    state = t.nextState;
    const t1Message = t.response.message;

    // T2: flat（「うーん」= other）→ narrowStep 1 維持、trailing flat=1
    t = runFlagOnTurn({
      prevState: state,
      message: "うーん",
      targetEventId: "event_1",
      targetSlot: "where",
      events,
      turnIndex: 2,
      legacyResponse: mkLegacyResponse("clarifying", legacyBroadQ),
    });
    state = t.nextState;

    // 契約: T1 と T2 で同一 question を出さない（flat variation 発動）
    expect(t.response.message).not.toBe(t1Message);
    // variation の token を assert（flat≥1 → スタバ等の具体候補 hint）
    expect(t.response.message).toContain("スタバ");
  });

  it("provider recovery: provider_recovering 中は retry 固定質問に変わる", () => {
    let state = createInitialDialogState();
    // T1: 甲府 → narrowing
    let t = runFlagOnTurn({
      prevState: state,
      message: "甲府",
      targetEventId: "event_1",
      targetSlot: "where",
      events,
      turnIndex: 1,
      legacyResponse: mkLegacyResponse("clarifying", legacyBroadQ),
    });
    state = t.nextState;
    const beforeFailure = t.response.message;

    // T2: PROVIDER_FAILED（shadow 側の reducer で直接発行）
    state = dialogReducer(state, {
      type: "PROVIDER_FAILED",
      turnIndex: 2,
      reason: "timeout",
    });

    // T3: 次 turn の発話 → derive=provider_retry → user-facing に固定文
    t = runFlagOnTurn({
      prevState: state,
      message: "もっかい？",
      targetEventId: "event_1",
      targetSlot: "where",
      events,
      turnIndex: 3,
      legacyResponse: mkLegacyResponse("clarifying", legacyBroadQ),
    });

    // 契約: broad とも T1 とも違う retry 固定文字列
    expect(t.response.message).not.toBe(legacyBroadQ);
    expect(t.response.message).not.toBe(beforeFailure);
    expect(t.response.message).toContain("もう一度");
  });

  it("連続 3 ターンで同一 message を 2 回以上繰り返さない（batch assertion）", () => {
    let state = createInitialDialogState();
    const messages: string[] = [];
    const inputs = ["甲府", "うーん", "スタバ"];
    inputs.forEach((msg, idx) => {
      const t = runFlagOnTurn({
        prevState: state,
        message: msg,
        targetEventId: "event_1",
        targetSlot: "where",
        events,
        turnIndex: idx + 1,
        legacyResponse: mkLegacyResponse("clarifying", legacyBroadQ),
      });
      state = t.nextState;
      messages.push(t.response.message);
    });

    // 契約: どの 2 連続も同一ではない
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i]).not.toBe(messages[i - 1]);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. generic place 初回入力で plan_presented に上がらない（CEO 観点 2）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 契約: phase authority (hasBlockingUnresolvedSlots) は
//       generic where (missing / vague の 3 sub-kind) を全て blocking と判定する。
//       decidePhase / adaptPipelineToLegacy はこれを response.phase に反映する。
//
// ★ ここは DialogState の責任範囲外（commit 19 の promote では救えない領域）。
//    legacy 正本で premature plan_presented を機械的に封じる。

describe("§2 generic place 初回 → not plan_presented (phase authority)", () => {
  describe("blockingForEvent 直接検証（vague 3 sub-kind + missing）", () => {
    const cases: Array<{
      label: string;
      where: Event["where"];
    }> = [
      {
        label: "missing: place_ref null",
        where: {
          place_ref: null,
          placeType: null,
          provenance: utteranceProvenance([], "low"),
        },
      },
      {
        label: "missing: place_ref 空文字",
        where: {
          place_ref: "",
          placeType: null,
          provenance: utteranceProvenance([], "low"),
        },
      },
      {
        label: "vague: anchor_alone（甲府 / placeType=null）",
        where: {
          place_ref: "甲府",
          placeType: null,
          provenance: utteranceProvenance(["甲府"], "high"),
        },
      },
      {
        label: "vague: category_alone（カフェ / placeType=null）",
        where: {
          place_ref: "カフェ",
          placeType: null,
          provenance: utteranceProvenance(["カフェ"], "high"),
        },
      },
      {
        label: "vague: chain_alone（スタバ / placeType=chain_brand）",
        where: {
          place_ref: "スタバ",
          placeType: "chain_brand",
          provenance: utteranceProvenance(["スタバ"], "high"),
        },
      },
      {
        label: "vague: undecided（決めてない / placeType=null）",
        where: {
          place_ref: "決めてない",
          placeType: null,
          provenance: utteranceProvenance(["決めてない"], "low"),
        },
      },
      {
        label: "vague: anchor+area_suffix（甲府周辺 / placeType=null）",
        where: {
          place_ref: "甲府周辺",
          placeType: null,
          provenance: utteranceProvenance(["甲府周辺"], "medium"),
        },
      },
    ];

    test.each(cases)("$label → blocking=true", ({ where }) => {
      const ev = mkEvent({ where });
      expect(blockingForEvent(ev)).toBe(true);
    });
  });

  describe("decidePhase 経路: 全 generic where は phase=clarifying を返す", () => {
    const vagueEvents: Array<{ label: string; event: Event }> = [
      {
        label: "category_alone",
        event: mkEvent({
          where: {
            place_ref: "カフェ",
            placeType: null,
            provenance: utteranceProvenance(["カフェ"], "high"),
          },
        }),
      },
      {
        label: "anchor_alone",
        event: mkEvent({
          where: {
            place_ref: "甲府",
            placeType: null,
            provenance: utteranceProvenance(["甲府"], "high"),
          },
        }),
      },
      {
        label: "chain_alone",
        event: mkEvent({
          where: {
            place_ref: "スタバ",
            placeType: "chain_brand",
            provenance: utteranceProvenance(["スタバ"], "high"),
          },
        }),
      },
      {
        label: "missing",
        event: mkEvent({
          where: {
            place_ref: null,
            placeType: null,
            provenance: utteranceProvenance([], "low"),
          },
        }),
      },
    ];

    test.each(vagueEvents)(
      "status=ok + $label 1 event → response.phase='clarifying' (not plan_presented)",
      ({ event }) => {
        const result = mkOkResult([event]);
        const { response, session } = adaptPipelineToLegacy(
          result,
          mkAdapterInput(),
        );
        // CEO 観点 2 の核心: premature plan_presented が出ない
        expect(response.phase).toBe("clarifying");
        expect(response.phase).not.toBe("plan_presented");
        expect(session.phase).toBe("clarifying");
      },
    );
  });

  it("混在 plan（1 fixed + 1 vague）→ aggregate blocking → phase=clarifying", () => {
    // 複数 event の aggregation も検証。一件でも blocking が残れば clarifying。
    const fixedEv = mkEvent({
      event_id: "e_fixed",
      where: {
        place_ref: "サドヤ",
        placeType: "exact_proper_noun",
        provenance: utteranceProvenance(["サドヤ"], "high"),
      },
    });
    const vagueEv = mkEvent({
      event_id: "e_vague",
      where: {
        place_ref: "カフェ",
        placeType: null,
        provenance: utteranceProvenance(["カフェ"], "high"),
      },
    });
    expect(
      hasBlockingUnresolvedSlots([fixedEv, vagueEv]),
    ).toBe(true);

    const { response } = adaptPipelineToLegacy(
      mkOkResult([fixedEv, vagueEv]),
      mkAdapterInput(),
    );
    expect(response.phase).toBe("clarifying");
  });

  it("控制群: 全 slot fixed → phase=plan_presented（contract の上界検証）", () => {
    // 「clarifying に過剰に倒す」ことも契約違反。
    // 全 slot が fixed なら plan_presented に進めるのが正しい。
    const allFixed = mkEvent(); // defaults = 全 fixed
    expect(blockingForEvent(allFixed)).toBe(false);
    const { response } = adaptPipelineToLegacy(
      mkOkResult([allFixed]),
      mkAdapterInput(),
    );
    expect(response.phase).toBe("plan_presented");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. search_handoff_blocking が user-facing に漏れない（CEO 観点 3）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 契約: 全 end-to-end path の user-facing 出力に、PR-9 領域の「検索/候補提示」
//       を示唆する token が現れない。promote が null を弾くだけでなく、
//       reducer が state を search_handoff_blocking に落としたあとの任意ターンで
//       も legacy 側の broad Q 以外は出ないことを scan で確認する。

describe("§3 search_handoff_blocking 非露出（user-facing 禁忌 token）", () => {
  // PR-9 Places search に接続すると出そうな「能動的検索オファー」語彙。
  //   commit 20 時点では user-facing に一切出しては いけない。
  //
  // 設計メモ:
  //   narrower 質問（「カフェとか候補ある？」等）は search_handoff_leak では
  //   「ない」ため、"候補"単独のような false positive prone な短 token は
  //   入れない。あくまで「検索する／お店を探す」という能動オファー相当の
  //   phrase を禁忌 set に固定する。
  const LEAK_TOKENS = [
    "探そう",
    "探しに",
    "探してみ",
    "検索",
    "近くの",
    "handoff",
    "places api",
  ];

  function assertNoLeak(message: string): void {
    for (const tok of LEAK_TOKENS) {
      expect(message.toLowerCase()).not.toContain(tok.toLowerCase());
    }
  }

  it("T1 anchor → T2 chain（multi-turn lift）→ search_handoff_blocking 到達後も legacy を維持", () => {
    const events = [mkEvent({ event_id: "event_1" })];
    const legacyBroadQ = "朝のカフェはどのあたり？";
    let state = createInitialDialogState();

    // T1: 甲府（anchor_alone）→ narrowStep=1、narrowing
    const t1 = runFlagOnTurn({
      prevState: state,
      message: "甲府",
      targetEventId: "event_1",
      targetSlot: "where",
      events,
      turnIndex: 1,
      legacyResponse: mkLegacyResponse("clarifying", legacyBroadQ),
    });
    state = t1.nextState;
    assertNoLeak(t1.response.message);

    // T2: スタバ（chain_alone）→ narrowStep=2, readyForHandoff=true
    const t2 = runFlagOnTurn({
      prevState: state,
      message: "スタバ",
      targetEventId: "event_1",
      targetSlot: "where",
      events,
      turnIndex: 2,
      legacyResponse: mkLegacyResponse("clarifying", legacyBroadQ),
    });
    expect(t2.nextState.conversationStatus).toBe("search_handoff_blocking");
    expect(t2.nextState.searchQueryDraft.readyForHandoff).toBe(true);
    // user-facing は legacy のまま（promote 非昇格）
    expect(t2.promoted).toBe(false);
    assertNoLeak(t2.response.message);
  });

  it("chain_with_anchor 単発（「甲府のスタバ」）→ 1 ターンで search_handoff_blocking → 漏れない", () => {
    const events = [mkEvent({ event_id: "event_1" })];
    const legacyBroadQ = "朝のカフェはどのあたり？";
    const t = runFlagOnTurn({
      prevState: createInitialDialogState(),
      message: "甲府のスタバ",
      targetEventId: "event_1",
      targetSlot: "where",
      events,
      turnIndex: 1,
      legacyResponse: mkLegacyResponse("clarifying", legacyBroadQ),
    });
    expect(t.nextState.conversationStatus).toBe("search_handoff_blocking");
    expect(t.promoted).toBe(false);
    assertNoLeak(t.response.message);
  });

  it("search_handoff_blocking 到達後に次ターン flat で破られない", () => {
    const events = [mkEvent({ event_id: "event_1" })];
    const legacyBroadQ = "朝のカフェはどのあたり？";
    let state = createInitialDialogState();

    // T1-T2: 甲府のスタバ で一気に blocking
    state = runFlagOnTurn({
      prevState: state,
      message: "甲府のスタバ",
      targetEventId: "event_1",
      targetSlot: "where",
      events,
      turnIndex: 1,
      legacyResponse: mkLegacyResponse("clarifying", legacyBroadQ),
    }).nextState;

    // T3: 次ターン flat 入力でも漏れない
    const t3 = runFlagOnTurn({
      prevState: state,
      message: "うーん",
      targetEventId: "event_1",
      targetSlot: "where",
      events,
      turnIndex: 2,
      legacyResponse: mkLegacyResponse("clarifying", legacyBroadQ),
    });
    assertNoLeak(t3.response.message);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. provider failure で 500 / items=0 clarifying が出ない（CEO 観点 4）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 契約:
//   (a) prior state 不在 + failure → legacyAdapter が dev では throw（安全弁）、
//       prod では safe degrade（plan=undefined, message 非空）
//   (b) prior state 継承 + failure → throw しない、items>0 維持、phase=clarifying
//   (c) commit 20 時点では DialogState は PROVIDER_FAILED action を発行できるが
//       route 側はまだ未配線。shadow 視点では flag ON でも legacy 経路が変わらない。

describe("§4 provider failure 耐性（500 / items=0 clarifying 禁止）", () => {
  function mkPriorPlan(): MorningPlan {
    return {
      date: "2026-04-22",
      items: [
        {
          id: "e_prior",
          kind: "fixed",
          text: "09:00 サドヤ コーヒー",
          what: "コーヒー",
          startTime: "09:00",
          durationMin: 45,
          durationSource: "inferred",
          fixedStart: true,
          orderHint: 0,
          sourceTurnIndex: 0,
          completed: false,
        },
      ],
      dayConditions: {},
      createdAt: "2026-04-22T08:00:00.000Z",
      confirmed: false,
      status: "needs_answer",
    };
  }

  it("(a) prior 不在 + failure → dev では throw（items=0 clarifying 禁則の安全弁）", () => {
    // NODE_ENV=test（!production）では items=0 clarifying で throw する。
    // これは 500 を route の try/catch で検知できるように、ロジック層で
    // 機械的に掴まえる契約。silent な broken UI を禁止する。
    expect(() => {
      adaptPipelineToLegacy(buildFailedPipelineResult(), mkAdapterInput());
    }).toThrow(/contract violation: phase=clarifying with empty items/);
  });

  it("(b) priorPersistedEvents 継承 + failure → throw せず items>0 を維持", () => {
    const priorEv = mkEvent({ event_id: "e_prior_1" });
    const { response, session } = adaptPipelineToLegacy(
      buildFailedPipelineResult(),
      mkAdapterInput({ priorPersistedEvents: [priorEv] }),
    );
    // 500 を引かない
    expect(response.phase).toBe("clarifying");
    // items が消えない
    expect(response.plan).toBeDefined();
    expect(response.plan!.items.length).toBeGreaterThan(0);
    expect(response.plan!.status).toBe("provisional");
    // session にも events が保持される
    expect(session.persistedEvents?.length).toBe(1);
  });

  it("(c) priorPlan のみ継承 + failure → throw せず items>0 を維持", () => {
    const priorPlan = mkPriorPlan();
    const { response } = adaptPipelineToLegacy(
      buildFailedPipelineResult(),
      mkAdapterInput({ priorPlan }),
    );
    expect(response.phase).toBe("clarifying");
    expect(response.plan).toBeDefined();
    expect(response.plan!.items.length).toBeGreaterThan(0);
    // failure 時 confirmed は strip される（provisional / needs_answer に引き下げ）
    expect(response.plan!.status).not.toBe("confirmed");
  });

  it("(d) message は必ず非空（失敗時も UI 空文字を出さない）", () => {
    // prior 継承あり失敗
    const { response: r1 } = adaptPipelineToLegacy(
      buildFailedPipelineResult(),
      mkAdapterInput({ priorPersistedEvents: [mkEvent({ event_id: "e" })] }),
    );
    expect(r1.message.length).toBeGreaterThan(0);

    // ok 経路
    const { response: r2 } = adaptPipelineToLegacy(
      mkOkResult([mkEvent({ event_id: "e" })]),
      mkAdapterInput(),
    );
    expect(r2.message.length).toBeGreaterThan(0);
  });

  it("(e) shadow 経路: provider_recovering 中でも reducer / derive は throw しない", () => {
    const events = [mkEvent({ event_id: "e1" })];
    let state = createInitialDialogState();
    // T1: 甲府
    state = advanceDialogState({
      prevState: state,
      message: "甲府",
      targetEventId: "e1",
      targetSlot: "where",
      events,
      turnIndex: 1,
      nowIso: NOW_ISO,
    }).nextState;

    // PROVIDER_FAILED で provider_recovering に移行
    state = dialogReducer(state, {
      type: "PROVIDER_FAILED",
      turnIndex: 2,
      reason: "timeout",
    });

    // 次ターンで shadow を回しても throw しない
    expect(() => {
      runFlagOnTurn({
        prevState: state,
        message: "再送？",
        targetEventId: "e1",
        targetSlot: "where",
        events,
        turnIndex: 3,
        legacyResponse: mkLegacyResponse("clarifying", "legacy"),
      });
    }).not.toThrow();
  });
});
