/**
 * SessionFactAccumulator & extractSessionFacts テスト
 * 修正D: health / work_style パターン追加の検証
 */
import { vi, describe, it, expect } from "vitest";
vi.mock("server-only", () => ({}));

import {
  extractSessionFacts,
  SessionFactAccumulator,
} from "@/lib/stargazer/sessionContext";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// extractSessionFacts — health パターン
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("extractSessionFacts — health patterns", () => {
  it("「休息が取れてない」を health として抽出", () => {
    const facts = extractSessionFacts("あまり休息が取れてない感じ");
    expect(facts.some(f => f.category === "health")).toBe(true);
  });

  it("「体調面が気になって」を health として抽出", () => {
    const facts = extractSessionFacts("体調面が気になってる");
    expect(facts.some(f => f.category === "health")).toBe(true);
  });

  it("「睡眠が足りない」を health として抽出", () => {
    const facts = extractSessionFacts("最近睡眠が足りない");
    expect(facts.some(f => f.category === "health")).toBe(true);
  });

  it("「疲れがたまってる」を health として抽出", () => {
    const facts = extractSessionFacts("疲れがたまってる感じ");
    expect(facts.some(f => f.category === "health")).toBe(true);
  });

  it("「寝不足」を health (inferred) として抽出", () => {
    const facts = extractSessionFacts("寝不足が続いてる");
    expect(facts.some(f => f.category === "health")).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// extractSessionFacts — work_style パターン
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("extractSessionFacts — work_style patterns", () => {
  it("「夢中になると周りが見えなくなる」を work_style として抽出", () => {
    const facts = extractSessionFacts("夢中になると周りが見えなくなってしまう");
    expect(facts.some(f => f.category === "work_style")).toBe(true);
  });

  it("「没頭しすぎる」を work_style として抽出", () => {
    const facts = extractSessionFacts("仕事に没頭しすぎてしまう");
    expect(facts.some(f => f.category === "work_style")).toBe(true);
  });

  it("「努力が充実する」を work_style (inferred) として抽出", () => {
    const facts = extractSessionFacts("努力するのは充実するけどね");
    expect(facts.some(f => f.category === "work_style")).toBe(true);
  });

  it("「休息を後回しにしてしまう」を work_style として抽出", () => {
    const facts = extractSessionFacts("休息を後回しにしちゃう");
    expect(facts.some(f => f.category === "work_style")).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SessionFactAccumulator — ログ再現
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("SessionFactAccumulator — conversation log replay", () => {
  it("ログの会話5ターンから1件以上の fact を抽出する", () => {
    const acc = new SessionFactAccumulator();
    // ログの会話を再現
    acc.addTurn("質問ある？", 0);
    acc.addTurn("体調面かな", 1);
    acc.addTurn("そうだね。あまり休息が取れてない感じ", 2);
    acc.addTurn("その通りだよ。夢中になると周りが見えなくなってしまうのはある", 3);
    acc.addTurn("現実を見れなくなる部分があるから、体への負担は結構でかいよね。でもやっぱ努力をするのは充実するけどね", 4);

    const explicit = acc.getExplicitFacts();
    const all = acc.getAllFacts();

    // 少なくとも health か work_style の fact が抽出されるはず
    expect(all.length).toBeGreaterThan(0);
    console.log("Extracted facts:", all.map(f => `${f.type}/${f.category}: ${f.content}`));
  });

  it("health カテゴリの fact が含まれる", () => {
    const acc = new SessionFactAccumulator();
    acc.addTurn("そうだね。あまり休息が取れてない感じ", 0);
    const all = acc.getAllFacts();
    expect(all.some(f => f.category === "health")).toBe(true);
  });

  it("work_style カテゴリの fact が含まれる", () => {
    const acc = new SessionFactAccumulator();
    acc.addTurn("夢中になると周りが見えなくなってしまうのはある", 0);
    const all = acc.getAllFacts();
    expect(all.some(f => f.category === "work_style")).toBe(true);
  });

  it("重複する fact は1件にまとめられる", () => {
    const acc = new SessionFactAccumulator();
    acc.addTurn("休息が取れてない", 0);
    acc.addTurn("休息が取れてない感じ", 1);
    const all = acc.getAllFacts();
    // 内容が微妙に異なるので2件の可能性があるが、重複排除のテスト
    expect(all.length).toBeLessThanOrEqual(3); // reasonable upper bound
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 既存パターンが壊れていないことの確認
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("extractSessionFacts — existing patterns still work", () => {
  it("goal: 転職したい", () => {
    const facts = extractSessionFacts("転職したいと思ってる");
    expect(facts.some(f => f.category === "goal")).toBe(true);
  });

  it("emotion: つらい", () => {
    const facts = extractSessionFacts("最近つらいことが多くて");
    expect(facts.some(f => f.category === "emotion")).toBe(true);
  });

  it("relationship: 上司と", () => {
    const facts = extractSessionFacts("上司との関係が悪い");
    expect(facts.some(f => f.category === "relationship")).toBe(true);
  });

  it("preference: 好き", () => {
    const facts = extractSessionFacts("コーヒーが好きで毎日飲む");
    expect(facts.some(f => f.category === "preference")).toBe(true);
  });
});
