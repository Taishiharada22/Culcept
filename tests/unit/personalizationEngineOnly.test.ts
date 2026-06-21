import { describe, it, expect } from "vitest";
import {
  ENGINE_ONLY_BRAND,
  markEngineOnly,
  isEngineOnly,
  assertNoEngineOnlyLeak,
  EngineOnlyLeakError,
} from "@/lib/shared/personalization/engineOnly";

describe("markEngineOnly / isEngineOnly", () => {
  it("ブランドを付与し、同一参照を返す", () => {
    const obj = { a: 1 };
    const branded = markEngineOnly(obj);
    expect(branded).toBe(obj);
    expect(isEngineOnly(branded)).toBe(true);
  });

  it("ブランドは non-enumerable: Object.keys / JSON に現れない", () => {
    const branded = markEngineOnly({ secret: "x", nested: { y: 1 } });
    expect(Object.keys(branded)).toEqual(["secret", "nested"]);
    expect(JSON.stringify(branded)).toBe('{"secret":"x","nested":{"y":1}}');
    // symbol キーは getOwnPropertySymbols でのみ見える
    expect(Object.getOwnPropertySymbols(branded)).toContain(ENGINE_ONLY_BRAND);
  });

  it("plain object / null / primitive は isEngineOnly=false", () => {
    expect(isEngineOnly({ a: 1 })).toBe(false);
    expect(isEngineOnly(null)).toBe(false);
    expect(isEngineOnly("str")).toBe(false);
    expect(isEngineOnly(42)).toBe(false);
  });
});

describe("assertNoEngineOnlyLeak", () => {
  it("plain なグラフは通過（throw しない）", () => {
    expect(() =>
      assertNoEngineOnlyLeak({ a: 1, b: [{ c: "ok" }], d: null }),
    ).not.toThrow();
  });

  it("root がブランド付きなら throw（path=$）", () => {
    const branded = markEngineOnly({ a: 1 });
    expect(() => assertNoEngineOnlyLeak(branded)).toThrow(EngineOnlyLeakError);
    try {
      assertNoEngineOnlyLeak(branded);
    } catch (e) {
      expect((e as EngineOnlyLeakError).path).toBe("$");
    }
  });

  it("深くネストしたブランドも検出（配列・オブジェクト経由）", () => {
    const deep = {
      level1: { items: [{ ok: true }, { payload: markEngineOnly({ leak: 1 }) }] },
    };
    expect(() => assertNoEngineOnlyLeak(deep)).toThrow(EngineOnlyLeakError);
    try {
      assertNoEngineOnlyLeak(deep);
    } catch (e) {
      expect((e as EngineOnlyLeakError).path).toBe("$.level1.items[1].payload");
    }
  });

  it("循環参照でも無限ループせず通過", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    expect(() => assertNoEngineOnlyLeak(a)).not.toThrow();
  });

  it("循環参照の中にブランドがあっても検出", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    a.bad = markEngineOnly({ leak: 1 });
    expect(() => assertNoEngineOnlyLeak(a)).toThrow(EngineOnlyLeakError);
  });
});

describe("canary: private 値が per-viewer payload に漏れない", () => {
  // エンジン専用ペア snapshot 風オブジェクト（partner の private 軸にカナリア値）
  const CANARY = "CANARY_PRIVATE_axis_value_zzz";
  function engineSnapshot() {
    return markEngineOnly({
      pairStateId: "p1",
      selfUserId: "uA",
      partnerUserId: "uB",
      asOf: "2026-06-12T09:00:00Z",
      self: { axes: {}, hdm: null },
      partner: {
        // private: 相手の生スコア（カナリアを仕込む）
        axes: { cautious_vs_bold: { score: 0.97, confidence: 0.9, observedAt: CANARY } },
        hdm: { currentPhase: 3, trustLevelRaw: 0.8 },
      },
    });
  }

  it("エンジンオブジェクトを直接 client へ返そうとするとガードが弾く", () => {
    expect(() => assertNoEngineOnlyLeak(engineSnapshot())).toThrow(EngineOnlyLeakError);
  });

  it("shared-only な per-viewer 射影（ブランド剥がし・plain）はカナリアを含まず通過する", () => {
    const engine = engineSnapshot();
    // 出口の per-viewer 射影の最小デモ: shared フィールドだけを新規 plain object に複製
    const perViewerPayload = {
      pairStateId: engine.pairStateId,
      asOf: engine.asOf,
      // private（self/partner の生 axes/hdm）は **複製しない**
    };
    expect(() => assertNoEngineOnlyLeak(perViewerPayload)).not.toThrow();
    expect(JSON.stringify(perViewerPayload)).not.toContain(CANARY);
    expect(isEngineOnly(perViewerPayload)).toBe(false);
  });

  it("【危険例の固定】素朴な JSON.stringify は symbol ブランドを落とすので、serialize 前にガードする契約", () => {
    // ブランドは JSON に出ないため、stringify 後の文字列だけ見るとカナリアが裸で残る。
    // → これは「serialize 前にガードを通す」必要性を回帰として固定するテスト。
    const engine = engineSnapshot();
    const naive = JSON.stringify(engine);
    expect(naive).toContain(CANARY); // ブランドが消えて private が裸で残る（危険）
    // 正しい運用ではこの stringify の前に assertNoEngineOnlyLeak(engine) で throw する
    expect(() => assertNoEngineOnlyLeak(engine)).toThrow(EngineOnlyLeakError);
  });
});
