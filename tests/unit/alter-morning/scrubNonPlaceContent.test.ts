/**
 * Bug 7 (CEO方針 2026-04-18): place/topic/人名 スロット分離
 *
 * CEO実機検証 2026-04-18:
 *   入力: 「仙洞田さんと名字の由来について話す」
 *   誤抽出: place="仙洞田さんの名字の由来"
 *   正抽出: place=null, companions=["仙洞田さん"]
 *
 * normalizeLLMOutput の post-filter (scrubNonPlaceContent) が以下を保証:
 *   (1) 人名+敬称+話題マーカーの混入を検出 → place=null、companions に人名を追加
 *   (2) 話題マーカー単独（「〜について」「〜の由来」等）を検出 → place=null
 *   (3) 動作動詞で終わる文（「〜話す」「〜相談」）を検出 → place=null
 *   (4) 場所として妥当な文字列は素通し（誤検出防止）
 */

import { describe, test, expect, beforeAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

let normalizeLLMOutput: typeof import("@/lib/alter-morning/llmPlanExtractor").normalizeLLMOutput;

beforeAll(async () => {
  const { preloadVocabulary } = await import("@/lib/alter-morning/intentParser");
  await preloadVocabulary();

  const ext = await import("@/lib/alter-morning/llmPlanExtractor");
  normalizeLLMOutput = ext.normalizeLLMOutput;
});

describe("Bug 7: scrubNonPlaceContent — place/topic/人名 スロット分離", () => {
  test("「仙洞田さんの名字の由来」→ place=null、companions に仙洞田さんを追加", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        {
          order: 1,
          activity: "話す",
          place: "仙洞田さんの名字の由来",
          companions: [],
        },
      ],
    });
    const seg = state.segments[0];
    expect(seg.place).toBeUndefined();
    expect(seg.companions).toContain("仙洞田さん");
  });

  test("「田中さんと打ち合わせ」→ place=null、companions に田中さんを追加", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        {
          order: 1,
          activity: "打ち合わせ",
          place: "田中さんと打ち合わせ",
          companions: [],
        },
      ],
    });
    const seg = state.segments[0];
    expect(seg.place).toBeUndefined();
    expect(seg.companions).toContain("田中さん");
  });

  test("「名字の由来について」→ place=null（話題マーカー単独）", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        {
          order: 1,
          activity: "話す",
          place: "名字の由来について",
          companions: [],
        },
      ],
    });
    expect(state.segments[0].place).toBeUndefined();
  });

  test("「予算の話」→ place=null（話題マーカー）", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        {
          order: 1,
          activity: "議論",
          place: "予算の話",
          companions: [],
        },
      ],
    });
    expect(state.segments[0].place).toBeUndefined();
  });

  test("「プロジェクトの件で相談」→ place=null（動作動詞で終わる）", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        {
          order: 1,
          activity: "相談",
          place: "プロジェクトの件で相談",
          companions: [],
        },
      ],
    });
    expect(state.segments[0].place).toBeUndefined();
  });

  test("既存 companions に同じ人名がある場合は重複追加しない", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        {
          order: 1,
          activity: "話す",
          place: "仙洞田さんの件",
          companions: ["仙洞田さん"],
        },
      ],
    });
    const companions = state.segments[0].companions;
    const count = companions.filter(c => c === "仙洞田さん").length;
    expect(count).toBe(1);
    expect(state.segments[0].place).toBeUndefined();
  });

  test("正当な place は素通し: 「スタバ」", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "仕事", place: "スタバ" },
      ],
    });
    expect(state.segments[0].place).toBe("スタバ");
  });

  test("正当な place は素通し: 「マック」", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "仕事", place: "マック" },
      ],
    });
    expect(state.segments[0].place).toBe("マック");
  });

  test("正当な place は素通し: 「図書館」（動作動詞を含まない一般名詞）", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "勉強", place: "図書館" },
      ],
    });
    expect(state.segments[0].place).toBe("図書館");
  });

  test("正当な place は素通し: 「サドヤ」（固有名詞）", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "ランチ", place: "サドヤ" },
      ],
    });
    expect(state.segments[0].place).toBe("サドヤ");
  });

  test("正当な place は素通し: 「渋谷駅」（抽象名詞誤爆防止 — 「駅」で終わる実在場所）", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "待ち合わせ", place: "渋谷駅" },
      ],
    });
    expect(state.segments[0].place).toBe("渋谷駅");
  });

  test("「佐藤さんと渋谷駅」— 人名+敬称 だが 話題マーカー/動作動詞なし → place は残る", () => {
    // 人名が place に紛れているが、後半が明確な場所なので削らない
    // （実機では LLM がこれを place に入れるべきではないが、誤検出防止のため一応素通し）
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        {
          order: 1,
          activity: "待ち合わせ",
          place: "佐藤さんと渋谷駅",
          companions: [],
        },
      ],
    });
    // 「佐藤さんと渋谷駅」は action_verb / topic_marker を含まないため素通し
    // TODO(将来): 「人名+と+具体場所」を companions に分離する二段目 filter
    expect(state.segments[0].place).toBe("佐藤さんと渋谷駅");
  });
});
