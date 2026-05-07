/**
 * Stage 4 L4-i Phase 2 Stage 2.2 — Optimistic-Echo dedupe (Fix C) 純関数 test
 *
 * 完了条件 (CEO 確定 8 ケース、2026-05-07):
 *   1. optimistic message → publish 1 回 (cache に追加される)
 *   2. 1 秒後 server echo (same sender/body/kind) → skip
 *   3. 8.5 秒後 server same body → publish (window 外、別 message 扱い)
 *   4. 20 秒後 同文の新規 optimistic → publish (連投、cache pruned)
 *   5. 別 sender → publish (sender 違いは別 key)
 *   6. 別 body → publish
 *   7. 別 kind (critical vs implicit) → publish
 *   8. optimistic 2 件を短時間に送った場合、2 件目を雑に skip しない (連投誤殺なし)
 *
 * + 構造 invariant:
 *   - normalizeBody は trim + collapse-whitespace + NFC のみ (lowercase なし)
 *   - WINDOW_MS = 8000
 *   - OPTIMISTIC_ID_PREFIX = "optimistic-"
 */

import { describe, it, expect } from "vitest";

import {
  ECHO_DEDUPE_WINDOW_MS,
  OPTIMISTIC_ID_PREFIX,
  type EchoCacheEntry,
  buildEchoCandidate,
  isServerEchoOfRecentOptimistic,
  normalizeBody,
  pruneEchoCache,
} from "@/lib/coalter/presence/signalEchoDedupe";

describe("L4-i Stage 2.2 Fix C — normalizeBody (CEO 確定: trim + collapse-whitespace + NFC のみ)", () => {
  it("trim で前後空白除去", () => {
    expect(normalizeBody("  もう限界  ")).toBe("もう限界");
  });

  it("collapse-whitespace で連続空白を 1 個 space に", () => {
    expect(normalizeBody("もう  限界")).toBe("もう 限界");
    expect(normalizeBody("もう\t\t限界")).toBe("もう 限界");
    expect(normalizeBody("もう\n\n限界")).toBe("もう 限界");
  });

  it("NFC: 結合文字 (例: 'が' = 'か' + dakuten) を正規化", () => {
    const decomposed = "か" + String.fromCharCode(0x3099); // か + 結合濁点
    const composed = "が"; // 単一 codepoint
    expect(normalizeBody(decomposed)).toBe(normalizeBody(composed));
  });

  it("lowercase は適用しない (CEO 確定、日本語意味温存)", () => {
    // 英字混在で大文字小文字が温存されることを確認
    expect(normalizeBody("HELP me")).toBe("HELP me");
    expect(normalizeBody("もう限界 NOW")).toBe("もう限界 NOW");
  });
});

describe("L4-i Stage 2.2 Fix C — buildEchoCandidate (id prefix で isOptimistic 判定)", () => {
  it("id prefix 'optimistic-' なら isOptimistic=true", () => {
    const c = buildEchoCandidate({
      id: "optimistic-1234567890",
      senderId: "user-A",
      body: "もう限界",
      kind: "critical",
      detectedAt: 1_000,
    });
    expect(c.isOptimistic).toBe(true);
    expect(c.bodyKey).toBe("もう限界");
    expect(c.senderId).toBe("user-A");
  });

  it("id prefix 'optimistic-' でないなら isOptimistic=false (server UUID 想定)", () => {
    const c = buildEchoCandidate({
      id: "550e8400-e29b-41d4-a716-446655440000",
      senderId: "user-A",
      body: "もう限界",
      kind: "critical",
      detectedAt: 2_000,
    });
    expect(c.isOptimistic).toBe(false);
  });

  it("OPTIMISTIC_ID_PREFIX 定数と一致", () => {
    expect(OPTIMISTIC_ID_PREFIX).toBe("optimistic-");
  });

  it("ECHO_DEDUPE_WINDOW_MS 定数 = 8000 (CEO 確定 8 秒)", () => {
    expect(ECHO_DEDUPE_WINDOW_MS).toBe(8_000);
  });
});

describe("L4-i Stage 2.2 Fix C — pruneEchoCache (純関数、window 外を除去)", () => {
  it("window 内の entry は維持", () => {
    const cache: EchoCacheEntry[] = [
      buildEchoCandidate({
        id: "a",
        senderId: "s",
        body: "x",
        kind: "critical",
        detectedAt: 1_000,
      }),
    ];
    expect(pruneEchoCache(cache, 5_000)).toHaveLength(1);
  });

  it("window 外の entry は除去 (8.001 秒経過)", () => {
    const cache: EchoCacheEntry[] = [
      buildEchoCandidate({
        id: "a",
        senderId: "s",
        body: "x",
        kind: "critical",
        detectedAt: 0,
      }),
    ];
    expect(pruneEchoCache(cache, 8_001)).toHaveLength(0);
  });

  it("ちょうど window 境界 (8000ms) は維持 (<= で判定)", () => {
    const cache: EchoCacheEntry[] = [
      buildEchoCandidate({
        id: "a",
        senderId: "s",
        body: "x",
        kind: "critical",
        detectedAt: 0,
      }),
    ];
    expect(pruneEchoCache(cache, 8_000)).toHaveLength(1);
  });

  it("元配列を mutate しない (純関数性)", () => {
    const cache: EchoCacheEntry[] = [
      buildEchoCandidate({
        id: "a",
        senderId: "s",
        body: "x",
        kind: "critical",
        detectedAt: 0,
      }),
    ];
    const result = pruneEchoCache(cache, 9_000);
    expect(cache).toHaveLength(1); // 元は不変
    expect(result).toHaveLength(0); // 結果は新配列
  });
});

describe("L4-i Stage 2.2 Fix C — CEO 確定 8 ケース (asymmetric optimistic-echo dedupe)", () => {
  /**
   * Case 1: optimistic message → publish 1 回 (cache に追加される)
   *
   * 起点ケース。cache 空 → optimistic candidate 投入 → echo 判定 false → publish OK。
   */
  it("Case 1: optimistic message は echo 判定で常に false (= publish される)", () => {
    const cache: EchoCacheEntry[] = [];
    const candidate = buildEchoCandidate({
      id: "optimistic-1000",
      senderId: "user-A",
      body: "もう限界",
      kind: "critical",
      detectedAt: 1_000,
    });
    expect(isServerEchoOfRecentOptimistic(candidate, cache, 1_000)).toBe(false);
  });

  /**
   * Case 2: 1 秒後 server echo (same sender/body/kind) → skip
   *
   * Fix C の本丸。optimistic を cache に保持した状態で server UUID candidate が来た時、
   * (sender, body, kind) 一致 + 8s 以内なら echo 認定 → skip (true 返し)。
   */
  it("Case 2: 1 秒後 server echo (same sender+body+kind) → echo 認定 (skip)", () => {
    const optimistic = buildEchoCandidate({
      id: "optimistic-1000",
      senderId: "user-A",
      body: "もう限界",
      kind: "critical",
      detectedAt: 1_000,
    });
    const cache = [optimistic];
    const serverEcho = buildEchoCandidate({
      id: "550e8400-e29b-41d4-a716-446655440000",
      senderId: "user-A",
      body: "もう限界",
      kind: "critical",
      detectedAt: 2_000,
    });
    expect(isServerEchoOfRecentOptimistic(serverEcho, cache, 2_000)).toBe(true);
  });

  /**
   * Case 3: 8.5 秒後 server same body → publish (window 外、別 message 扱い)
   *
   * cache 内に optimistic は残っているが、now との差が window を超えていれば echo ではない。
   * 実運用では caller 側で pruneEchoCache が走り cache から消えるが、
   * 本関数も独立に window check しているため double-safety。
   */
  it("Case 3: 8.5 秒後 server same body → echo 認定なし (publish される)", () => {
    const optimistic = buildEchoCandidate({
      id: "optimistic-1000",
      senderId: "user-A",
      body: "もう限界",
      kind: "critical",
      detectedAt: 1_000,
    });
    const cache = [optimistic];
    const serverLate = buildEchoCandidate({
      id: "550e8400-e29b-41d4-a716-446655440001",
      senderId: "user-A",
      body: "もう限界",
      kind: "critical",
      detectedAt: 9_500, // 8.5s 経過
    });
    expect(isServerEchoOfRecentOptimistic(serverLate, cache, 9_500)).toBe(false);
    // pruneEchoCache でも除去される
    expect(pruneEchoCache(cache, 9_500)).toHaveLength(0);
  });

  /**
   * Case 4: 20 秒後 同文の新規 optimistic → publish (連投、cache pruned)
   *
   * 連投ケース。20 秒経過後の新 optimistic message は別 message として扱う必要がある。
   * cache が pruned されている前提で、optimistic 自身は echo 判定 false (Case 1 と同じ)。
   */
  it("Case 4: 20 秒後 同文の新規 optimistic → publish (連投誤殺なし)", () => {
    const oldOptimistic = buildEchoCandidate({
      id: "optimistic-1000",
      senderId: "user-A",
      body: "もう限界",
      kind: "critical",
      detectedAt: 1_000,
    });
    const cacheRaw = [oldOptimistic];
    // 21s 経過 → prune
    const cachePruned = pruneEchoCache(cacheRaw, 22_000);
    expect(cachePruned).toHaveLength(0);
    const newOptimistic = buildEchoCandidate({
      id: "optimistic-22000",
      senderId: "user-A",
      body: "もう限界",
      kind: "critical",
      detectedAt: 22_000,
    });
    expect(
      isServerEchoOfRecentOptimistic(newOptimistic, cachePruned, 22_000),
    ).toBe(false);
  });

  /**
   * Case 5: 別 sender → publish (sender 違いは別 key)
   *
   * 同じ body・kind でも sender が違えば別 message として publish。
   * 例: 同 thread に user-A の "もう限界" optimistic が残っている状態で user-B の "もう限界" が来た場合。
   */
  it("Case 5: 別 sender → echo 認定なし (publish される)", () => {
    const optimisticA = buildEchoCandidate({
      id: "optimistic-1000",
      senderId: "user-A",
      body: "もう限界",
      kind: "critical",
      detectedAt: 1_000,
    });
    const cache = [optimisticA];
    const serverB = buildEchoCandidate({
      id: "550e8400-e29b-41d4-a716-446655440002",
      senderId: "user-B",
      body: "もう限界",
      kind: "critical",
      detectedAt: 2_000,
    });
    expect(isServerEchoOfRecentOptimistic(serverB, cache, 2_000)).toBe(false);
  });

  /**
   * Case 6: 別 body → publish (body 違いは別 message)
   */
  it("Case 6: 別 body → echo 認定なし", () => {
    const optimistic = buildEchoCandidate({
      id: "optimistic-1000",
      senderId: "user-A",
      body: "もう限界",
      kind: "critical",
      detectedAt: 1_000,
    });
    const cache = [optimistic];
    const serverDiff = buildEchoCandidate({
      id: "550e8400-e29b-41d4-a716-446655440003",
      senderId: "user-A",
      body: "つらい",
      kind: "critical",
      detectedAt: 2_000,
    });
    expect(isServerEchoOfRecentOptimistic(serverDiff, cache, 2_000)).toBe(false);
  });

  /**
   * Case 7: 別 kind → publish (critical vs implicit は独立)
   *
   * cache 内に critical optimistic が残っていても、implicit candidate は別 kind として独立 publish。
   * (実装上は implicit は echo dedupe 対象外だが、関数自体の純粋性として kind 一致を要求する)
   */
  it("Case 7: 別 kind → echo 認定なし (critical vs implicit は独立)", () => {
    const optimisticCritical = buildEchoCandidate({
      id: "optimistic-1000",
      senderId: "user-A",
      body: "もう限界",
      kind: "critical",
      detectedAt: 1_000,
    });
    const cache = [optimisticCritical];
    const serverImplicit = buildEchoCandidate({
      id: "550e8400-e29b-41d4-a716-446655440004",
      senderId: "user-A",
      body: "もう限界",
      kind: "implicit",
      detectedAt: 2_000,
    });
    expect(
      isServerEchoOfRecentOptimistic(serverImplicit, cache, 2_000),
    ).toBe(false);
  });

  /**
   * Case 8: optimistic 2 件を短時間に送った場合、2 件目を雑に skip しない (連投誤殺なし)
   *
   * 最重要ケース。CEO 補正の核心: 「同文連投を殺さない」。
   * optimistic 1 件目が cache にある状態で、optimistic 2 件目 (同 body) が来ても
   * 2 件目は echo 認定されない (isOptimistic=true は早期 false 返却)。
   */
  it("Case 8: optimistic 2 件を短時間に連投 → 2 件目も publish (asymmetric の核)", () => {
    const optimistic1 = buildEchoCandidate({
      id: "optimistic-1000",
      senderId: "user-A",
      body: "もう限界",
      kind: "critical",
      detectedAt: 1_000,
    });
    const cache = [optimistic1];
    const optimistic2 = buildEchoCandidate({
      id: "optimistic-3000",
      senderId: "user-A",
      body: "もう限界",
      kind: "critical",
      detectedAt: 3_000, // 2 秒後 (window 内)
    });
    // optimistic 2 は isOptimistic=true → 早期 false (CEO 厳守: 連投誤殺なし)
    expect(
      isServerEchoOfRecentOptimistic(optimistic2, cache, 3_000),
    ).toBe(false);
  });
});

describe("L4-i Stage 2.2 Fix C — 追加 invariant (CEO 補正条件)", () => {
  /**
   * server 同士の dedupe は しない (CEO 補正)
   *
   * cache に server entry のみ (例: realtime + polling で server echo が 2 回入った後)、
   * 新 server candidate が来た時、cache 内の prev.isOptimistic === true 条件で
   * 一致しない → false 返却 → publish。
   */
  it("Invariant: server-only cache → 新 server candidate は echo 認定なし (server 同士 dedupe しない)", () => {
    const serverPrev = buildEchoCandidate({
      id: "550e8400-e29b-41d4-a716-446655440010",
      senderId: "user-A",
      body: "もう限界",
      kind: "critical",
      detectedAt: 1_000,
    });
    const cache = [serverPrev];
    const serverNext = buildEchoCandidate({
      id: "550e8400-e29b-41d4-a716-446655440011",
      senderId: "user-A",
      body: "もう限界",
      kind: "critical",
      detectedAt: 2_000,
    });
    expect(
      isServerEchoOfRecentOptimistic(serverNext, cache, 2_000),
    ).toBe(false);
  });

  /**
   * window 境界正確性: 8000ms ちょうどなら echo 認定、8001ms なら publish
   */
  it("Invariant: window 8000ms ちょうど境界で echo 認定", () => {
    const optimistic = buildEchoCandidate({
      id: "optimistic-0",
      senderId: "user-A",
      body: "もう限界",
      kind: "critical",
      detectedAt: 0,
    });
    const cache = [optimistic];
    const serverAt8000 = buildEchoCandidate({
      id: "uuid-8000",
      senderId: "user-A",
      body: "もう限界",
      kind: "critical",
      detectedAt: 8_000,
    });
    expect(isServerEchoOfRecentOptimistic(serverAt8000, cache, 8_000)).toBe(true);
    const serverAt8001 = buildEchoCandidate({
      id: "uuid-8001",
      senderId: "user-A",
      body: "もう限界",
      kind: "critical",
      detectedAt: 8_001,
    });
    expect(isServerEchoOfRecentOptimistic(serverAt8001, cache, 8_001)).toBe(false);
  });

  /**
   * 構造 invariant: signalEchoDedupe.ts は副作用ゼロ (純関数のみ export)
   */
  it("Invariant: lib file が純関数のみ export (副作用ゼロ)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../lib/coalter/presence/signalEchoDedupe.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    // export されているのは const と function (class / let module-level state なし)
    expect(content).toMatch(/export\s+const\s+OPTIMISTIC_ID_PREFIX/);
    expect(content).toMatch(/export\s+const\s+ECHO_DEDUPE_WINDOW_MS/);
    expect(content).toMatch(/export\s+function\s+normalizeBody/);
    expect(content).toMatch(/export\s+function\s+pruneEchoCache/);
    expect(content).toMatch(/export\s+function\s+isServerEchoOfRecentOptimistic/);
    expect(content).toMatch(/export\s+function\s+buildEchoCandidate/);
    // 副作用 source なし (let module-state, class, side-effect import なし)
    expect(content).not.toMatch(/^let\s+\w+/m);
    expect(content).not.toMatch(/^class\s/m);
  });
});
