/**
 * CoAlter Phase 1.5.3 ⑤ — 2人にとってのコンテキスト narrative
 *
 * - 禁止表現 sanitize
 * - summarizeProfile が欠損値に強い
 * - buildNarrativePrompt が item + 2人の像を両方含む
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai", () => ({ runAI: vi.fn() }));

import { __internal } from "@/lib/coalter/pairContextNarrative";
import type { CoAlterPersonProfile } from "@/lib/coalter/types";

const { sanitize, buildNarrativePrompt, summarizeProfile } = __internal;

function makeProfile(overrides: Partial<CoAlterPersonProfile> = {}): CoAlterPersonProfile {
  return {
    userId: "u1",
    displayName: "Taro",
    communicationStyle: {
      directVsDiplomatic: 0.6,
      conflictStyle: null,
      attachmentStyle: null,
      reassuranceNeed: null,
      emotionalVariability: null,
    },
    decisionStyle: {
      noveltyPreference: 0.3,
      decisionSpeed: 0.7,
      riskTolerance: 0.5,
    },
    interests: ["映画", "コーヒー"],
    values: ["静けさ"],
    archetypeCode: "observer",
    coreFear: null,
    coreDesire: "自分と向き合う時間",
    ...overrides,
  };
}

describe("sanitize", () => {
  it("断定・命令を削る", () => {
    expect(sanitize("これに決めるべきです")).not.toContain("すべきです");
    expect(sanitize("行かなければならない")).not.toContain("しなければ");
    expect(sanitize("最適な選択はこれ")).not.toContain("最適な選択は");
  });
  it("「正しい〜は」「本当は〜思って」を削る", () => {
    expect(sanitize("正しい選択はこれ")).not.toContain("正しい選択は");
    expect(sanitize("本当はそう思っている")).not.toContain("本当は");
  });
  it("％表記を削る", () => {
    expect(sanitize("80%の確率で満足")).not.toMatch(/\d{2,3}%/);
  });
  it("通常文は保持される", () => {
    const s = "2人の落ち着きの時間にフィットする";
    expect(sanitize(s)).toBe(s);
  });
});

describe("summarizeProfile", () => {
  it("軸ラベル・興味・価値観・アーキタイプが出る", () => {
    const p = makeProfile();
    const s = summarizeProfile(p);
    expect(s).toContain("name: Taro");
    expect(s).toContain("映画");
    expect(s).toContain("静けさ");
    expect(s).toContain("archetype: observer");
    expect(s).toContain("core_desire:");
  });

  it("null 軸は traits から省かれる", () => {
    const p = makeProfile({
      decisionStyle: {
        noveltyPreference: null,
        decisionSpeed: null,
        riskTolerance: null,
      },
      communicationStyle: {
        directVsDiplomatic: null,
        conflictStyle: null,
        attachmentStyle: null,
        reassuranceNeed: null,
        emotionalVariability: null,
      },
    });
    const s = summarizeProfile(p);
    expect(s).not.toContain("traits:");
  });

  it("興味・価値観なしでも壊れない", () => {
    const p = makeProfile({ interests: [], values: [] });
    const s = summarizeProfile(p);
    expect(s).not.toContain("interests:");
    expect(s).not.toContain("values:");
  });

  it("興味は 6 件まで、価値観は 4 件までで切り詰める", () => {
    const p = makeProfile({
      interests: ["a", "b", "c", "d", "e", "f", "g"],
      values: ["v1", "v2", "v3", "v4", "v5"],
    });
    const s = summarizeProfile(p);
    expect(s).toContain("a・b・c・d・e・f");
    expect(s).not.toContain("g");
    expect(s).toContain("v1・v2・v3・v4");
    expect(s).not.toContain("v5");
  });

  it("中庸（0.4〜0.6）は中庸ラベル", () => {
    const p = makeProfile({
      decisionStyle: { noveltyPreference: 0.5, decisionSpeed: null, riskTolerance: null },
      communicationStyle: {
        directVsDiplomatic: null,
        conflictStyle: null,
        attachmentStyle: null,
        reassuranceNeed: null,
        emotionalVariability: null,
      },
    });
    const s = summarizeProfile(p);
    expect(s).toContain("新規性:中庸");
  });
});

describe("buildNarrativePrompt", () => {
  const baseItem = {
    title: "静かな珈琲店 S",
    description: "昭和レトロな喫茶店",
    practicalInfo: "神保町駅5分",
    category: "food",
    targetDate: "2026-05-04",
  };

  it("item と 2人の像が全部入る", () => {
    const pa = makeProfile({ displayName: "Taro" });
    const pb = makeProfile({ displayName: "Hana", interests: ["読書"] });
    const prompt = buildNarrativePrompt(baseItem, pa, pb);
    expect(prompt).toContain(baseItem.title);
    expect(prompt).toContain(baseItem.practicalInfo);
    expect(prompt).toContain(baseItem.category);
    expect(prompt).toContain("Taro");
    expect(prompt).toContain("Hana");
    expect(prompt).toContain("読書");
  });

  it("practicalInfo が null でも (なし) で入る", () => {
    const pa = makeProfile();
    const pb = makeProfile();
    const prompt = buildNarrativePrompt(
      { ...baseItem, practicalInfo: null },
      pa,
      pb,
    );
    expect(prompt).toContain("(なし)");
  });

  it("A・B 両方の像ラベルが含まれる", () => {
    const prompt = buildNarrativePrompt(baseItem, makeProfile(), makeProfile());
    expect(prompt).toContain("A:");
    expect(prompt).toContain("B:");
  });

  it("一般論禁止・2人具体紐付けの指示を含む", () => {
    const prompt = buildNarrativePrompt(baseItem, makeProfile(), makeProfile());
    expect(prompt).toContain("一般論");
    expect(prompt).toContain("興味");
  });
});
