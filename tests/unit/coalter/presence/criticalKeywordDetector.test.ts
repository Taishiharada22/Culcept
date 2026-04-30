/**
 * Stage 4 B-2.3 — criticalKeywordDetector test
 *
 * CEO 要件 (2026-04-29):
 *   #2 critical signal が urgentDecision を作る (detect → trigger 生成)
 *   #3 non-critical 通常発話で urgentDecision なし (negative case)
 *
 * test strategy:
 *   - 純関数なので関数 invoke 方式で完全 cover
 *   - 過剰発火禁止の確認: 曖昧な不満・軽い違和感では検出しない
 *   - 除外 keyword (「ばか」「クソ」等) が誤って hit しないことを確認
 */

import { describe, it, expect } from "vitest";

import {
  detectCriticalKeyword,
  getCriticalPatternCount,
} from "@/lib/coalter/presence/criticalKeywordDetector";

describe("B-2.2 detectCriticalKeyword — 自傷系 (safety_violation)", () => {
  it("「死にたい」を含む text を検出 → trigger='safety_violation'", () => {
    const r = detectCriticalKeyword("もう死にたい気分");
    expect(r).not.toBeNull();
    expect(r?.trigger).toBe("safety_violation");
  });

  it("「消えたい」を含む text を検出", () => {
    const r = detectCriticalKeyword("消えたいって思ってる");
    expect(r?.trigger).toBe("safety_violation");
  });

  it("「きえたい」(ひらがな) を含む text を検出", () => {
    const r = detectCriticalKeyword("ほんとにきえたい");
    expect(r?.trigger).toBe("safety_violation");
  });
});

describe("B-2.2 detectCriticalKeyword — 攻撃性 (rupture_detected)", () => {
  it("「死ね」を含む text を検出 → trigger='rupture_detected'", () => {
    const r = detectCriticalKeyword("もう死ねよ");
    expect(r?.trigger).toBe("rupture_detected");
  });

  it("「殺す」を含む text を検出", () => {
    const r = detectCriticalKeyword("殺すぞ");
    expect(r?.trigger).toBe("rupture_detected");
  });

  it("「消えろ」を含む text を検出", () => {
    const r = detectCriticalKeyword("消えろよマジで");
    expect(r?.trigger).toBe("rupture_detected");
  });
});

describe("B-2.2 detectCriticalKeyword — 限界 sign (rupture_detected)", () => {
  it("「もう限界」を含む text を検出", () => {
    const r = detectCriticalKeyword("もう限界かも");
    expect(r?.trigger).toBe("rupture_detected");
  });

  it("「もう無理」を含む text を検出", () => {
    const r = detectCriticalKeyword("これ以上はもう無理");
    expect(r?.trigger).toBe("rupture_detected");
  });

  it("「もうやだ」を含む text を検出", () => {
    const r = detectCriticalKeyword("もうやだ全部");
    expect(r?.trigger).toBe("rupture_detected");
  });
});

describe("B-2.2 detectCriticalKeyword — non-critical (過剰発火禁止)", () => {
  it("空 string で null", () => {
    expect(detectCriticalKeyword("")).toBeNull();
  });

  it("null / undefined で null", () => {
    expect(detectCriticalKeyword(null)).toBeNull();
    expect(detectCriticalKeyword(undefined)).toBeNull();
  });

  it("通常の挨拶 / 感想は null", () => {
    expect(detectCriticalKeyword("おはよう")).toBeNull();
    expect(detectCriticalKeyword("ありがとう")).toBeNull();
    expect(detectCriticalKeyword("今日疲れた")).toBeNull();
    expect(detectCriticalKeyword("ちょっと忙しい")).toBeNull();
  });

  it("曖昧な不満は null (CEO 確定: 軽い違和感では urgent にしない)", () => {
    expect(detectCriticalKeyword("ちょっとイラッとした")).toBeNull();
    expect(detectCriticalKeyword("微妙な気分")).toBeNull();
    expect(detectCriticalKeyword("なんかモヤモヤする")).toBeNull();
    expect(detectCriticalKeyword("不満がある")).toBeNull();
  });

  it("除外 keyword: 「ばか」 (自虐表現で頻出するため除外)", () => {
    expect(detectCriticalKeyword("ばかだなあ自分")).toBeNull();
    expect(detectCriticalKeyword("ばかなことを言った")).toBeNull();
  });

  it("除外 keyword: 「クソ」 (慣用表現で頻出するため除外)", () => {
    expect(detectCriticalKeyword("クソゲーだった")).toBeNull();
    expect(detectCriticalKeyword("クソ寒い")).toBeNull();
    expect(detectCriticalKeyword("クソ忙しい")).toBeNull();
  });

  it("除外 keyword: 「あほ」 (自虐表現)", () => {
    expect(detectCriticalKeyword("あほな話")).toBeNull();
  });

  it("「ふざけるな」 (文脈依存のため除外)", () => {
    expect(detectCriticalKeyword("ふざけるなよ")).toBeNull();
  });
});

describe("B-2.2 detectCriticalKeyword — 構造 invariant", () => {
  it("純関数: 同入力で同出力", () => {
    const a = detectCriticalKeyword("もう限界");
    const b = detectCriticalKeyword("もう限界");
    expect(a).toEqual(b);
  });

  it("入力 text を変更しない (副作用ゼロ)", () => {
    const text = "もう死にたい気分";
    const original = text;
    detectCriticalKeyword(text);
    expect(text).toBe(original);
  });

  it("検出 pattern 数は最小 set (3 グループ、CEO 確認なしで増やさない)", () => {
    // safety / rupture-hostility / rupture-limit の 3 pattern
    expect(getCriticalPatternCount()).toBe(3);
  });

  it("trigger 名は urgentTrigger.inferCategory と整合 (rupture / safety を含む)", () => {
    expect(detectCriticalKeyword("死にたい")?.trigger).toContain("safety");
    expect(detectCriticalKeyword("死ね")?.trigger).toContain("rupture");
    expect(detectCriticalKeyword("もう限界")?.trigger).toContain("rupture");
  });
});
