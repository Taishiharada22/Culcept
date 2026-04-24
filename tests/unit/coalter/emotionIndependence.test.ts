/**
 * CoAlter Bug-1 Phase 2 — 失敗独立 5 条文 動的検証
 *
 * 正本: docs/coalter-bug1-emotion-retrieval-design.md §2.3
 * Plan: docs/coalter-implementation-plan-mainstream.md §2.2 Phase 2 テスト仕様
 *   ① DB/fetch/localStorage touch ゼロ
 *   ② 決定的（同一 text で 2 回呼び同一結果）
 *   ③ 100ms 超過時タイムアウト挙動
 *   ④ 不正入力で例外を投げず []
 *   ⑤ 返り値が caller 以外に信号を発しない
 *
 * 構成:
 *   positive: extractEmotionTags が 5 条文を守ることを確認
 *   negative: guard 関数自体が違反を正しく検出すること（guard の健全性）を確認
 */

import { describe, it, expect } from "vitest";
import { extractEmotionTags } from "@/lib/coalter/emotion/extract";
import {
  assertNoSideEffect,
  assertPureDetection,
  assertBoundedRuntime,
  assertFailOpen,
  assertNoDownstreamSignal,
} from "@/lib/coalter/emotion/independence";

describe("失敗独立 — extractEmotionTags が 5 条文を守る", () => {
  it("§2.3-1: DB/fetch touch ゼロ", () => {
    expect(() =>
      assertNoSideEffect(() => extractEmotionTags("気分が乗らない")),
    ).not.toThrow();
  });

  it("§2.3-2: 決定的（同一 text で 2 回同一結果）", () => {
    expect(() =>
      assertPureDetection(extractEmotionTags, "気分 迷う すれ違い"),
    ).not.toThrow();
  });

  it("§2.3-3: 100ms 以内で完了", () => {
    expect(() =>
      assertBoundedRuntime(
        () => extractEmotionTags("気持ち 迷う 関係 喧嘩"),
        100,
      ),
    ).not.toThrow();
  });

  it("§2.3-4: 不正入力 null で [] を返す", () => {
    expect(() =>
      assertFailOpen(() => extractEmotionTags(null)),
    ).not.toThrow();
  });

  it("§2.3-4: 不正入力 undefined で [] を返す", () => {
    expect(() =>
      assertFailOpen(() => extractEmotionTags(undefined)),
    ).not.toThrow();
  });

  it("§2.3-4: 空文字で [] を返す", () => {
    expect(() => assertFailOpen(() => extractEmotionTags(""))).not.toThrow();
  });

  it("§2.3-4: number で [] を返す", () => {
    expect(() => assertFailOpen(() => extractEmotionTags(42))).not.toThrow();
  });

  it("§2.3-5: 返り値が Promise/Observable/EventEmitter ではない", () => {
    const tags = extractEmotionTags("気分");
    expect(() => assertNoDownstreamSignal(tags)).not.toThrow();
  });
});

describe("失敗独立 — guard 関数の健全性（negative tests）", () => {
  it("assertBoundedRuntime は maxMs 超過時に throw", () => {
    expect(() =>
      assertBoundedRuntime(() => {
        const start = performance.now();
        while (performance.now() - start < 20) {
          // busy wait
        }
        return 42;
      }, 5),
    ).toThrow(/assertBoundedRuntime/);
  });

  it("assertFailOpen は fn が throw した時に throw", () => {
    expect(() =>
      assertFailOpen(() => {
        throw new Error("boom");
      }),
    ).toThrow(/assertFailOpen/);
  });

  it("assertFailOpen は fn が非空配列を返した時に throw", () => {
    expect(() => assertFailOpen(() => [1])).toThrow(/assertFailOpen/);
  });

  it("assertFailOpen は fn が非配列を返した時に throw", () => {
    expect(() => assertFailOpen(() => ({}))).toThrow(/assertFailOpen/);
  });

  it("assertNoDownstreamSignal は Promise-like で throw", () => {
    expect(() =>
      assertNoDownstreamSignal({ then: () => undefined }),
    ).toThrow(/Promise-like/);
  });

  it("assertNoDownstreamSignal は Observable-like で throw", () => {
    expect(() =>
      assertNoDownstreamSignal({ subscribe: () => undefined }),
    ).toThrow(/Observable-like/);
  });

  it("assertNoDownstreamSignal は EventEmitter-like で throw", () => {
    expect(() =>
      assertNoDownstreamSignal({ on: () => undefined }),
    ).toThrow(/EventEmitter-like/);
  });

  it("assertPureDetection は非決定的 fn で throw", () => {
    let counter = 0;
    expect(() =>
      assertPureDetection(() => [++counter], "any"),
    ).toThrow(/non-deterministic/);
  });

  it("assertNoSideEffect は fetch が呼ばれると throw", () => {
    expect(() =>
      assertNoSideEffect(() => {
        (globalThis as unknown as { fetch: () => void }).fetch();
      }),
    ).toThrow(/fetch/);
  });
});
