import { describe, it, expect } from "vitest";
import {
  normalizeSlot,
  normalizeSlotSet,
  toSharedProjection,
  projectForViewer,
} from "@/lib/shared/travel/slot-normalizer";
import type { ExtractedSlot, ExtractionSurface } from "@/lib/shared/travel/slot-types";
import { SURFACE_INITIAL_STATUS } from "@/lib/shared/travel/slot-types";
import { markEngineOnly } from "@/lib/shared/personalization/engineOnly";
import type { BudgetBand } from "@/lib/shared/travel/core-types";

// ════════════════════════════════════════════════════════════════════════════
// 決定論 fake extractor（test harness・LLM/IO なし・固定 fixture → slots）
//   chat は固定辞書で「LLM が抽出するであろう結果」を再現（NLP なし）。
//   構造化 surface は actionId/payload の決定論マッピング。
// ════════════════════════════════════════════════════════════════════════════

const ev = (surface: ExtractionSurface, refId: string, speaker?: string) =>
  speaker ? { surface, refId, speakerParticipantId: speaker } : { surface, refId };

/** chat 自由文 → proposed slot（固定辞書・unknown は null） */
function fakeExtractChat(speaker: string, text: string): ExtractedSlot | null {
  const init = SURFACE_INITIAL_STATUS.chat_message; // "proposed"
  const refId = `msg:${speaker}:${text.length}`;
  if (text.includes("20時") || text.includes("帰りたい")) {
    return { key: "time_window", value: { returnByMin: 1200 }, status: init, fillState: "filled", confidence: 0.7, owner: { kind: "participant", participantId: speaker }, visibility: "shared", evidence: [ev("chat_message", refId, speaker)] };
  }
  if (text.includes("会話") || text.includes("ゆっくり")) {
    return { key: "soft_preference", value: { descriptorKey: "scene", descriptorValue: "conversational" }, status: init, fillState: "filled", confidence: 0.6, owner: { kind: "participant", participantId: speaker }, visibility: "shared", evidence: [ev("chat_message", refId, speaker)] };
  }
  return null;
}

/** quick_action / adjustment_card → confirmed structured slot */
function fakeExtractAction(actionId: string): ExtractedSlot | null {
  const init = SURFACE_INITIAL_STATUS.quick_action; // "confirmed"
  if (actionId === "budget_down") {
    return { key: "budget_band", value: { lo: 0, hi: 27000, confidence: 1, currency: "JPY" }, status: init, fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("quick_action", `act:${actionId}`)] };
  }
  if (actionId === "closer") {
    return { key: "mobility_tolerance", value: { maxWalkKm: 2 }, status: SURFACE_INITIAL_STATUS.adjustment_card, fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("adjustment_card", `card:${actionId}`)] };
  }
  return null;
}

/** session_context: 既定は normalized。userSelected（/plan 日付ピッカー）なら confirmed（★②） */
function fakeExtractContextDate(date: string, userSelected: boolean): ExtractedSlot {
  return { key: "date_or_range", value: { kind: "single_day", date }, status: userSelected ? "confirmed" : SURFACE_INITIAL_STATUS.session_context, fillState: "filled", confidence: userSelected ? 1 : 0.9, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("session_context", `sess:window:${date}`)] };
}

/** form_input → confirmed range（★②） */
function fakeExtractFormRange(startDate: string, endDate: string): ExtractedSlot {
  return { key: "date_or_range", value: { kind: "range", startDate, endDate, nights: 1 }, status: SURFACE_INITIAL_STATUS.form_input, fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("form_input", "form:date")] };
}

/** profile_prior → normalized banded budget（生 axis score でない） */
function fakeExtractPriorBudget(participantId: string): ExtractedSlot {
  return { key: "budget_band", value: { lo: 20000, hi: 30000, confidence: 0.7, currency: "JPY" }, status: SURFACE_INITIAL_STATUS.profile_prior, fillState: "filled", confidence: 0.7, owner: { kind: "participant", participantId }, visibility: "private", evidence: [ev("profile_prior", "m2:planParams.budgetPosture")] };
}

// ════════════════════════════════════════════════════════════════════════════
// 1. chat free-text は proposed のみ
// ════════════════════════════════════════════════════════════════════════════
describe("1. chat free-text は proposed", () => {
  it("fake chat extractor は proposed status を出す", () => {
    const s = fakeExtractChat("P1", "20時には帰りたい");
    expect(s?.status).toBe("proposed");
  });
  it("normalizer は proposed を normalized へ前進（confirmed には上げない）", () => {
    const s = fakeExtractChat("P1", "20時には帰りたい")!;
    const res = normalizeSlot(s);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.slot.status).toBe("normalized");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. form / session_context は confirmed date/window を出せる（★②）
// ════════════════════════════════════════════════════════════════════════════
describe("2. form / session_context の confirmed date", () => {
  it("session_context userSelected=true → confirmed・normalize 通過", () => {
    const s = fakeExtractContextDate("2026-07-01", true);
    expect(s.status).toBe("confirmed");
    const res = normalizeSlot(s);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.slot.status).toBe("confirmed");
  });
  it("session_context 既定（userSelected=false）は normalized baseline", () => {
    expect(fakeExtractContextDate("2026-07-01", false).status).toBe("normalized");
  });
  it("form_input range は confirmed・nights 整合で通過", () => {
    const res = normalizeSlot(fakeExtractFormRange("2026-07-01", "2026-07-02"));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.slot.status).toBe("confirmed");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. quick_action / adjustment_card は confirmed structured slot
// ════════════════════════════════════════════════════════════════════════════
describe("3. 構造化 surface は confirmed", () => {
  it("budget_down / closer は confirmed・normalize 通過", () => {
    for (const a of ["budget_down", "closer"]) {
      const s = fakeExtractAction(a)!;
      expect(s.status).toBe("confirmed");
      expect(normalizeSlot(s).ok).toBe(true);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. relation_context は既定 private・explicit shared のみ shared（★③）
// ════════════════════════════════════════════════════════════════════════════
describe("4. relation_context default private / explicit shared", () => {
  const relSlot = (): ExtractedSlot => ({
    key: "soft_preference",
    value: { descriptorKey: "prefer", descriptorValue: "calm" },
    status: "normalized",
    fillState: "filled",
    confidence: 0.6,
    owner: { kind: "participant", participantId: "P1" },
    visibility: "shared", // 宣言は shared だが…
    evidence: [ev("relation_context", "rel:summary:1")],
  });

  it("option なし → shared 宣言でも private に clamp", () => {
    const res = normalizeSlot(relSlot());
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.slot.visibility).toBe("private");
  });
  it("refId が explicit shared 集合にあれば shared を維持", () => {
    const res = normalizeSlot(relSlot(), { relationSharedRefIds: new Set(["rel:summary:1"]) });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.slot.visibility).toBe("shared");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. profile_prior は banded 値のみ / 6. raw axis score 形は reject
// ════════════════════════════════════════════════════════════════════════════
describe("5/6. profile_prior banded only・raw axis score reject", () => {
  it("banded budget は通過し value は band キーのみ", () => {
    const res = normalizeSlot(fakeExtractPriorBudget("P1"));
    expect(res.ok).toBe(true);
    if (res.ok) expect(Object.keys(res.slot.value).sort()).toEqual(["confidence", "currency", "hi", "lo"]);
  });
  it("axis-score 形（lo/hi なし）の budget は fail-closed で reject", () => {
    const tainted = { key: "budget_band", value: { score: 0.8, confidence: 0.9, observedAt: "2026-06-10T00:00:00Z" }, status: "normalized", fillState: "filled", confidence: 0.9, owner: { kind: "participant", participantId: "P1" }, visibility: "private", evidence: [ev("profile_prior", "m2:raw")] };
    const res = normalizeSlot(tainted);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("invalid_budget");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7. EngineOnly canary は output 前に reject
// ════════════════════════════════════════════════════════════════════════════
describe("7. EngineOnly canary reject", () => {
  it("branded budget value は branded_or_nonplain_value で reject（de-brand されない）", () => {
    const engineBudget = markEngineOnly<BudgetBand>({ lo: 0, hi: 99999, confidence: 1, currency: "JPY" });
    const slot = { key: "budget_band", value: engineBudget, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("quick_action", "act:x")] };
    const res = normalizeSlot(slot);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("branded_or_nonplain_value");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 8. private は solver 入力にあるが shared-view 射影に出ない
// ════════════════════════════════════════════════════════════════════════════
describe("8. private は shared-view に出ない", () => {
  it("normalizeSlotSet.slots は private を含むが toSharedProjection は除外", () => {
    const set = {
      participantIds: ["P1", "P2"],
      slots: [
        fakeExtractAction("budget_down")!, // shared
        { key: "red_line", value: { descriptorKey: "avoid", descriptorValue: "crowd" }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "participant", participantId: "P1" }, visibility: "private", evidence: [ev("chat_message", "m9", "P1")] },
      ],
      missingSlotQuestions: [],
    };
    const out = normalizeSlotSet(set);
    expect(out.slots).toHaveLength(2); // solver 入力には private も入る
    const shared = toSharedProjection(out.slots);
    expect(shared).toHaveLength(1);
    expect(shared.every((s) => s.visibility === "shared")).toBe(true);
    // viewer 射影: P1 は自分の private を見られる / P2 は見られない
    expect(projectForViewer(out.slots, "P1")).toHaveLength(2);
    expect(projectForViewer(out.slots, "P2")).toHaveLength(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 9. evidence は ref id のみ（本文を持ち込んでも strip）
// ════════════════════════════════════════════════════════════════════════════
describe("9. evidence は ref のみ（本文 strip）", () => {
  it("rawText/provider/sourceKind を混入させても出力から除去される", () => {
    const slot = {
      key: "pace",
      value: "slow",
      status: "confirmed",
      fillState: "filled",
      confidence: 1,
      owner: { kind: "shared" },
      visibility: "shared",
      evidence: [{ surface: "chat_message", refId: "m1", speakerParticipantId: "P1", rawText: "本文ここに秘密", providerMode: "talk_thread", sourceKind: "talk_pair_member" }],
    };
    const res = normalizeSlot(slot);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const e = res.slot.evidence[0];
      expect(Object.keys(e).sort()).toEqual(["refId", "speakerParticipantId", "surface"]);
      expect(JSON.stringify(res.slot)).not.toContain("本文ここに秘密");
      expect(JSON.stringify(res.slot)).not.toContain("talk_thread");
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 10/11. participantId は使うが source kind / adapter provider は出力に出ない
// ════════════════════════════════════════════════════════════════════════════
describe("10/11. source kind・provider mode は出力に出ない", () => {
  it("正規化出力に participant source kind / provider mode の語が現れない", () => {
    const set = {
      participantIds: ["P1", "P2"],
      slots: [fakeExtractAction("budget_down")!, fakeExtractChat("P1", "20時には帰りたい")!, fakeExtractPriorBudget("P2")],
      missingSlotQuestions: [],
    };
    const out = normalizeSlotSet(set);
    const json = JSON.stringify(out);
    for (const forbidden of ["talk_pair_member", "culcept_relation", "plan_session", "self\"", "fixture", "talk_thread", "providerMode", "sourceKind"]) {
      expect(json).not.toContain(forbidden);
    }
    // participantId は使われている
    expect(json).toContain("P1");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 12. 不正な date/window/minute/budget は fail-closed
// ════════════════════════════════════════════════════════════════════════════
describe("12. 不正値は fail-closed", () => {
  const baseSlot = (key: string, value: unknown) => ({ key, value, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("form_input", "f:1")] });
  it("実在しない日 / nights 不一致 / 範囲外 minute / 負 budget order", () => {
    expect(normalizeSlot(baseSlot("date_or_range", { kind: "single_day", date: "2026-02-30" })).ok).toBe(false);
    expect(normalizeSlot(baseSlot("date_or_range", { kind: "range", startDate: "2026-07-01", endDate: "2026-07-03", nights: 1 })).ok).toBe(false);
    expect(normalizeSlot(baseSlot("time_window", { returnByMin: 1440 })).ok).toBe(false);
    expect(normalizeSlot(baseSlot("time_window", { departAfterMin: -1 })).ok).toBe(false);
    // budget lo>hi は normalize で swap されるため OK（reject ではなく正規化）
    const swapped = normalizeSlot(baseSlot("budget_band", { lo: 30000, hi: 20000, confidence: 0.5, currency: "JPY" }));
    expect(swapped.ok).toBe(true);
    if (swapped.ok && swapped.slot.key === "budget_band") expect(swapped.slot.value).toMatchObject({ lo: 20000, hi: 30000 });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 13. 未知 descriptor key は fail-closed
// ════════════════════════════════════════════════════════════════════════════
describe("13. 未知 descriptor key は fail-closed", () => {
  it("DESCRIPTOR_KEYS にない key は unknown_descriptor_key で reject", () => {
    const slot = { key: "soft_preference", value: { descriptorKey: "telepathy", descriptorValue: "x" }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "participant", participantId: "P1" }, visibility: "private", evidence: [ev("chat_message", "m1", "P1")] };
    const res = normalizeSlot(slot);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("unknown_descriptor_key");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// normalizer は決定論 / 冪等
// ════════════════════════════════════════════════════════════════════════════
describe("決定論・冪等", () => {
  it("同一入力 → 深い等価（決定論）", () => {
    const s = fakeExtractAction("budget_down")!;
    expect(normalizeSlot(s)).toEqual(normalizeSlot(s));
  });
  it("normalize(normalize(x)) == normalize(x)（冪等・proposed→normalized も安定）", () => {
    const proposed = fakeExtractChat("P1", "20時には帰りたい")!;
    const first = normalizeSlot(proposed);
    expect(first.ok).toBe(true);
    if (first.ok) {
      const second = normalizeSlot(first.slot);
      expect(second.ok).toBe(true);
      if (second.ok) {
        expect(second.slot).toEqual(first.slot); // normalized のまま安定
        const third = normalizeSlot(second.slot);
        if (third.ok) expect(third.slot).toEqual(first.slot);
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// incoherent visibility (private + shared owner) は reject
// ════════════════════════════════════════════════════════════════════════════
describe("整合性: private + shared owner は reject", () => {
  it("private なのに owner=shared は incoherent_visibility", () => {
    const slot = { key: "pace", value: "slow", status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "private", evidence: [ev("form_input", "f:1")] };
    const res = normalizeSlot(slot);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("incoherent_visibility");
  });
});
