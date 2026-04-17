/**
 * CoAlter Proposal Generator × 5W1H Slots — Phase 1.5.4
 *
 * 検証:
 * - 5W1H 対象テーマ（movie/food/travel）では、LLM の自由 title を捨てて
 *   slots から合成した title が使われる
 * - 5W1H 対象外テーマ（general/schedule 等）では従来挙動（LLM の title を採用）
 * - slots が空 or core 欠落の候補は LLM title フォールバック
 * - candidate.theme / coreSlot / slots が正しくセットされる
 * - missingConstraints.slot も拾われる
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type {
  CoAlterPersonProfile,
  ConversationTheme,
} from "@/lib/coalter/types";
import { __internal } from "@/lib/coalter/proposalGenerator";

const { validateAndNormalize } = __internal;

// ── fixture ──

const makeProfile = (id: string, name: string): CoAlterPersonProfile => ({
  userId: id,
  displayName: name,
  communicationStyle: {
    directVsDiplomatic: null,
    conflictStyle: null,
    attachmentStyle: null,
    reassuranceNeed: null,
    emotionalVariability: null,
  },
  decisionStyle: {
    noveltyPreference: null,
    decisionSpeed: null,
    riskTolerance: null,
  },
  interests: [],
  values: [],
  archetypeCode: null,
  coreFear: null,
  coreDesire: null,
});

const profileA = makeProfile("a", "たいし");
const profileB = makeProfile("b", "あやか");

/** 最小限の LLM 生出力を組み立てるヘルパ */
function buildRawOutput(overrides: {
  candidates: Array<Record<string, unknown>>;
  missingConstraints?: Array<Record<string, unknown>>;
}): Record<string, unknown> {
  return {
    summary: "二人で何か決めようとしている",
    priorities: { userA: "Aの重視", userB: "Bの重視", common: null },
    candidates: overrides.candidates,
    reasoning: "こう選んだ",
    closing: "あとは二人で決めてね",
    pairFitScore: 2,
    missingConstraints: overrides.missingConstraints ?? [],
  };
}

// ─────────────────────────────────────────────

describe("validateAndNormalize × 5W1H（movie）", () => {
  const theme: ConversationTheme = "movie";

  it("slots.what + slots.where が埋まれば title を合成で上書き", () => {
    const raw = buildRawOutput({
      candidates: [
        {
          rank: 1,
          title: "勝手に自由生成した映画館名", // ← この title は捨てられるはず
          oneLiner: "サスペンス好きな2人に",
          slots: {
            what: { label: "ラストマイル", status: "proposed" },
            where: { label: "渋谷ストリーム", status: "confirmed" },
          },
        },
      ],
    });
    const card = validateAndNormalize(raw, profileA, profileB, theme);
    expect(card.candidates[0].title).toBe("ラストマイル × 渋谷ストリーム");
    expect(card.candidates[0].coreSlot).toBe("what");
    expect(card.candidates[0].theme).toBe("movie");
    expect(card.candidates[0].slots?.what?.label).toBe("ラストマイル");
    expect(card.candidates[0].slots?.where?.status).toBe("confirmed");
  });

  it("where が欠けても when があれば aux 優先順でフォールバック", () => {
    const raw = buildRawOutput({
      candidates: [
        {
          rank: 1,
          title: "どこかの映画タイトル",
          oneLiner: "x",
          slots: {
            what: { label: "ラストマイル", status: "proposed" },
            when: { label: "19:00〜", status: "tentative" },
          },
        },
      ],
    });
    const card = validateAndNormalize(raw, profileA, profileB, theme);
    expect(card.candidates[0].title).toBe("ラストマイル × 19:00〜");
  });

  it("core=what が無ければ合成失敗 → LLM 元 title を使用", () => {
    const raw = buildRawOutput({
      candidates: [
        {
          rank: 1,
          title: "渋谷ストリーム", // ← 合成できないので、これがそのまま使われる
          oneLiner: "x",
          slots: {
            where: { label: "渋谷ストリーム", status: "confirmed" },
          },
        },
      ],
    });
    const card = validateAndNormalize(raw, profileA, profileB, theme);
    expect(card.candidates[0].title).toBe("渋谷ストリーム");
    // coreSlot / theme は slots が埋まっているがテーマの core が無いので... 実装では
    // hasSlots && themeRule があれば付与されるので、core=what が無くても theme/coreSlot はつく
    // ただし title は合成できていないので元を使う。分離して確認
    expect(card.candidates[0].slots?.where?.label).toBe("渋谷ストリーム");
  });

  it("slots が空の候補は従来挙動（LLM title 使用）", () => {
    const raw = buildRawOutput({
      candidates: [
        { rank: 1, title: "候補X", oneLiner: "x" },
      ],
    });
    const card = validateAndNormalize(raw, profileA, profileB, theme);
    expect(card.candidates[0].title).toBe("候補X");
    expect(card.candidates[0].slots).toBeUndefined();
    expect(card.candidates[0].coreSlot).toBeUndefined();
    expect(card.candidates[0].theme).toBeUndefined();
  });

  it("card.theme が常にセットされる", () => {
    const raw = buildRawOutput({ candidates: [{ rank: 1, title: "X", oneLiner: "x" }] });
    const card = validateAndNormalize(raw, profileA, profileB, theme);
    expect(card.theme).toBe("movie");
  });
});

describe("validateAndNormalize × 5W1H（food）", () => {
  const theme: ConversationTheme = "food";

  it("where + what で合成（店 × 料理）", () => {
    const raw = buildRawOutput({
      candidates: [
        {
          rank: 1,
          title: "どこか違うやつ",
          oneLiner: "x",
          slots: {
            where: { label: "銀座バル", status: "confirmed" },
            what: { label: "イタリアン", status: "proposed" },
          },
        },
      ],
    });
    const card = validateAndNormalize(raw, profileA, profileB, theme);
    expect(card.candidates[0].title).toBe("銀座バル × イタリアン");
    expect(card.candidates[0].coreSlot).toBe("where");
  });

  it("food で core=where が無ければ合成失敗", () => {
    const raw = buildRawOutput({
      candidates: [
        {
          rank: 1,
          title: "和食",
          oneLiner: "x",
          slots: { what: { label: "和食", status: "proposed" } }, // where が無い
        },
      ],
    });
    const card = validateAndNormalize(raw, profileA, profileB, theme);
    expect(card.candidates[0].title).toBe("和食"); // LLM title フォールバック
  });
});

describe("validateAndNormalize × 5W1H（travel）", () => {
  const theme: ConversationTheme = "travel";

  it("where + when で合成（目的地 × 時期）", () => {
    const raw = buildRawOutput({
      candidates: [
        {
          rank: 1,
          title: "旅行案1",
          oneLiner: "x",
          slots: {
            where: { label: "箱根", status: "proposed" },
            when: { label: "今週末", status: "confirmed" },
          },
        },
      ],
    });
    const card = validateAndNormalize(raw, profileA, profileB, theme);
    expect(card.candidates[0].title).toBe("箱根 × 今週末");
    expect(card.candidates[0].coreSlot).toBe("where");
    expect(card.candidates[0].theme).toBe("travel");
  });
});

describe("validateAndNormalize × 対象外テーマ", () => {
  it("general テーマでは slots を無視して LLM title をそのまま使う", () => {
    const raw = buildRawOutput({
      candidates: [
        {
          rank: 1,
          title: "LLMが決めた候補",
          oneLiner: "x",
          slots: {
            what: { label: "X", status: "proposed" },
            where: { label: "Y", status: "proposed" },
          },
        },
      ],
    });
    const card = validateAndNormalize(raw, profileA, profileB, "general");
    // 合成ルール無効 → LLM title
    expect(card.candidates[0].title).toBe("LLMが決めた候補");
    // slots 自体は保持される（将来の使い回し用）
    expect(card.candidates[0].slots?.what?.label).toBe("X");
    // theme / coreSlot は 5W1H 対象外なので付与されない
    expect(card.candidates[0].coreSlot).toBeUndefined();
    expect(card.candidates[0].theme).toBeUndefined();
    // card 全体の theme は常にセット
    expect(card.theme).toBe("general");
  });

  it("schedule は対象外（LLM title 維持）", () => {
    const raw = buildRawOutput({
      candidates: [{ rank: 1, title: "調整案", oneLiner: "x" }],
    });
    const card = validateAndNormalize(raw, profileA, profileB, "schedule");
    expect(card.candidates[0].title).toBe("調整案");
  });
});

describe("missingConstraints.slot の取り込み", () => {
  it("slot フィールドが妥当な SlotKey なら保持", () => {
    const raw = buildRawOutput({
      candidates: [{ rank: 1, title: "X", oneLiner: "x" }],
      missingConstraints: [
        { key: "genre", question: "何系のジャンル？", priority: 1, slot: "what" },
        { key: "area", question: "どのあたり？", priority: 2, slot: "where" },
      ],
    });
    const card = validateAndNormalize(raw, profileA, profileB, "movie");
    expect(card.missingConstraints?.[0].slot).toBe("what");
    expect(card.missingConstraints?.[1].slot).toBe("where");
  });

  it("slot が無効値なら省略", () => {
    const raw = buildRawOutput({
      candidates: [{ rank: 1, title: "X", oneLiner: "x" }],
      missingConstraints: [
        { key: "x", question: "q", priority: 1, slot: "weird" },
      ],
    });
    const card = validateAndNormalize(raw, profileA, profileB, "movie");
    expect(card.missingConstraints?.[0].slot).toBeUndefined();
  });
});

describe("slots の status 正規化", () => {
  it("status が無ければ proposed にフォールバック", () => {
    const raw = buildRawOutput({
      candidates: [
        {
          rank: 1,
          title: "X",
          oneLiner: "x",
          slots: {
            what: { label: "ラストマイル" }, // status 欠け
            where: { label: "渋谷" },
          },
        },
      ],
    });
    const card = validateAndNormalize(raw, profileA, profileB, "movie");
    expect(card.candidates[0].slots?.what?.status).toBe("proposed");
    expect(card.candidates[0].title).toBe("ラストマイル × 渋谷");
  });

  it("status が 'confirmed' なら尊重", () => {
    const raw = buildRawOutput({
      candidates: [
        {
          rank: 1,
          title: "X",
          oneLiner: "x",
          slots: {
            what: { label: "ラストマイル", status: "confirmed" },
            where: { label: "渋谷ストリーム", status: "confirmed" },
          },
        },
      ],
    });
    const card = validateAndNormalize(raw, profileA, profileB, "movie");
    expect(card.candidates[0].slots?.what?.status).toBe("confirmed");
    expect(card.candidates[0].slots?.where?.status).toBe("confirmed");
  });
});
