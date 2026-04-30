/**
 * Utterance Decomposer — W2-CEO-Emergency A (2026-04-19)
 *
 * CEO 実機 0 点フィードバックの直接ケース:
 *   「カフェはマックにする予定。ランチはサドヤだから、会食もその近くにしてください。」
 *   → 3 clause に分解される
 *   → 相対アンカー「その近く」が検出される
 *   → 生文が place newValue として拒否される
 */

import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  decomposeUtterance,
  detectRelativeAnchor,
  isPlaceNewValueAcceptable,
} from "@/lib/alter-morning/utteranceDecomposer";

describe("A-1 decomposeUtterance — 句点分解", () => {
  test("CEO 実機ケース: 3 clause に分解", () => {
    const r = decomposeUtterance(
      "カフェはマックにする予定。ランチはサドヤだから、会食もその近くにしてください。",
    );
    expect(r).toEqual([
      "カフェはマックにする予定",
      "ランチはサドヤだから、会食もその近くにしてください",
    ]);
    // 注: 因果「だから、」は 1 clause として保持（ロジックで切らない）。
    //     「会食もその近く」部分は A-2 の相対アンカー post-processor が拾う。
  });

  test("単一文は 1 clause として返す", () => {
    const r = decomposeUtterance("サドヤでランチ");
    expect(r).toEqual(["サドヤでランチ"]);
  });

  test("改行で分割", () => {
    const r = decomposeUtterance("朝はマック\n昼はサドヤ\n夜はカフェ");
    expect(r).toEqual(["朝はマック", "昼はサドヤ", "夜はカフェ"]);
  });

  test("接続前置き「、それから」で分割", () => {
    const r = decomposeUtterance("朝はマック、それからサドヤでランチ");
    expect(r).toEqual(["朝はマック", "それからサドヤでランチ"]);
  });

  test("「あとで」は名詞/副詞直接のみ許容（誤爆防止）", () => {
    // 「あとで電話」は 1 clause（連結助詞として見なさない）
    const r = decomposeUtterance("あとで電話する");
    expect(r).toEqual(["あとで電話する"]);
  });

  test("空文字・空白のみは空配列", () => {
    expect(decomposeUtterance("")).toEqual([]);
    expect(decomposeUtterance("   ")).toEqual([]);
  });

  test("疑問形は分割しない（1 clause として保持）", () => {
    const r = decomposeUtterance("サドヤ近くでおすすめのカフェない？");
    expect(r).toEqual(["サドヤ近くでおすすめのカフェない？"]);
  });
});

describe("A-2 detectRelativeAnchor — 相対指示語検出", () => {
  test("「その近く」を検出", () => {
    expect(detectRelativeAnchor("会食もその近くにしてください")).toBe("その近く");
  });

  test("「そこから」を検出", () => {
    expect(detectRelativeAnchor("そこから歩ける場所で")).toBe("そこから");
  });

  test("「さっきの」を検出", () => {
    expect(detectRelativeAnchor("さっきの店でランチ")).toMatch(/さっき/);
  });

  test("相対語なしは null", () => {
    expect(detectRelativeAnchor("サドヤでランチ")).toBeNull();
  });
});

describe("A-3 isPlaceNewValueAcceptable — place 生文遮断", () => {
  test("CEO 事故ケース: raw sentence を拒否", () => {
    expect(
      isPlaceNewValueAcceptable(
        "ランチはサドヤだから、会食もその近くにしてください",
      ),
    ).toBe(false);
  });

  test("正当な店名は受理", () => {
    expect(isPlaceNewValueAcceptable("サドヤ")).toBe(true);
    expect(isPlaceNewValueAcceptable("スタバ渋谷店")).toBe(true);
    expect(isPlaceNewValueAcceptable("アトレ恵比寿")).toBe(true);
    expect(isPlaceNewValueAcceptable("叙々苑")).toBe(true);
  });

  test("句読点を含む値を拒否", () => {
    expect(isPlaceNewValueAcceptable("サドヤ、またはマック")).toBe(false);
    expect(isPlaceNewValueAcceptable("スタバ。")).toBe(false);
  });

  test("助詞連続（だから/ので/けど）を拒否", () => {
    expect(isPlaceNewValueAcceptable("サドヤだから")).toBe(false);
    expect(isPlaceNewValueAcceptable("マックなので")).toBe(false);
  });

  test("動詞語尾（にする/して/予定）を拒否", () => {
    expect(isPlaceNewValueAcceptable("マックにする")).toBe(false);
    expect(isPlaceNewValueAcceptable("スタバにして")).toBe(false);
    expect(isPlaceNewValueAcceptable("サドヤする予定")).toBe(false);
  });

  test("15 文字超を拒否", () => {
    expect(isPlaceNewValueAcceptable("あ".repeat(16))).toBe(false);
    expect(isPlaceNewValueAcceptable("あ".repeat(14))).toBe(true);
  });

  test("非文字列は pass-through（true）", () => {
    expect(isPlaceNewValueAcceptable({ nearAnchorLabel: "甲府" })).toBe(true);
    expect(isPlaceNewValueAcceptable(null)).toBe(true);
  });

  test("空文字は拒否", () => {
    expect(isPlaceNewValueAcceptable("")).toBe(false);
    expect(isPlaceNewValueAcceptable("   ")).toBe(false);
  });
});
