/**
 * stage1Narration unit test.
 *
 * 目的:
 *   - outcome="failed" のときは必ず null（CEO lock: failed を意味あるコピーに見せない）
 *   - 5 つの TodayMode それぞれに決定論的な 1 行を返す
 *   - implicitIntent は 40 字以下のときだけ suffix として混ざる
 *   - prependStage1Prefix は null のとき summary を改変しない
 */

import { describe, it, expect } from "vitest";
import {
  buildStage1Prefix,
  prependStage1Prefix,
  splitStage1Prefix,
} from "@/lib/coalter/stage1Narration";
import type {
  Stage1Snapshot,
  Stage1SnapshotFailed,
  Stage1SnapshotOk,
} from "@/lib/coalter/types";
import type { TodayMode } from "@/lib/coalter/understanding/types";

function mkOk(mode: TodayMode, implicitIntent = ""): Stage1SnapshotOk {
  return {
    outcome: "degraded",
    understanding_confidence: 0.3,
    todayReading: {
      mode,
      energyBudget: "mid",
      timeBudget: "limited",
      implicitIntent,
      latentNeeds: [],
      confidence: 0.3,
    },
    lensVersion: "1.0.0",
    computedAt: "2026-04-20T12:00:00.000Z",
    collectorMeta: { queryCount: 4, sources: [] },
  };
}

function mkFailed(): Stage1SnapshotFailed {
  return {
    outcome: "failed",
    understanding_confidence: 0.1,
    lensVersion: "1.0.0",
    computedAt: "2026-04-20T12:00:00.000Z",
    collectorMeta: { queryCount: 4, sources: [] },
  };
}

describe("buildStage1Prefix", () => {
  it("stage1 未定義なら null", () => {
    expect(buildStage1Prefix(undefined)).toBeNull();
  });

  it("outcome=failed なら必ず null", () => {
    expect(buildStage1Prefix(mkFailed())).toBeNull();
  });

  it("5 つの TodayMode それぞれに決定論的な 1 行", () => {
    const modes: TodayMode[] = ["recover", "celebrate", "connect", "challenge", "maintain"];
    const results = modes.map((m) => buildStage1Prefix(mkOk(m)));
    // すべて非 null で、個別に異なる文字列
    expect(results.every((r) => typeof r === "string" && r.length > 0)).toBe(true);
    expect(new Set(results).size).toBe(modes.length);
  });

  it("implicitIntent が空文字のときは mode line のみ", () => {
    const line = buildStage1Prefix(mkOk("maintain", ""));
    expect(line).toBe("今日は平常運転の流れ。");
  });

  it("implicitIntent が短ければ em-dash で繋ぐ", () => {
    const line = buildStage1Prefix(mkOk("celebrate", "久々にちょっと贅沢したい"));
    expect(line).toBe("今日は気分を少し膨らませたい流れ。 — 久々にちょっと贅沢したい");
  });

  it("implicitIntent が 40 字を超えたら付けず、mode line のみ（事実改変しない方針）", () => {
    // 41 字
    const longIntent = "あ".repeat(41);
    const line = buildStage1Prefix(mkOk("challenge", longIntent));
    expect(line).toBe("今日は少し踏み込みたい流れ。");
  });

  it("implicitIntent は trim される（前後スペース混入時も 40 字判定が正しく動く）", () => {
    const line = buildStage1Prefix(mkOk("recover", "  ちょっと休みたい  "));
    expect(line).toBe("今日はペース抑えめの流れ。 — ちょっと休みたい");
  });
});

describe("prependStage1Prefix", () => {
  const base = "週末で見る映画を選びたい流れ。2人の好みと公開情報を突き合わせて3本に絞った。";

  it("stage1 が failed のときは summary をそのまま返す", () => {
    expect(prependStage1Prefix(base, mkFailed())).toBe(base);
  });

  it("stage1 が未定義でも summary をそのまま返す", () => {
    expect(prependStage1Prefix(base, undefined)).toBe(base);
  });

  it("stage1 が ok のときは先頭に 1 行 + 改行 + 元 summary", () => {
    const out = prependStage1Prefix(base, mkOk("connect", "ちゃんと向き合いたい"));
    expect(out).toBe(`今日は近づく時間を優先したい流れ。 — ちゃんと向き合いたい\n${base}`);
  });
});

describe("failed を意味あるコピーに見せない契約", () => {
  it("failed Snapshot を直接渡しても常に null（CEO lock #1）", () => {
    // 複数回呼んでも null
    for (let i = 0; i < 10; i++) {
      expect(buildStage1Prefix(mkFailed())).toBeNull();
    }
  });

  it("failed は prependStage1Prefix が summary に『今日』を注入しない", () => {
    const summary = "候補を絞り込むためにもう少し情報が欲しい。";
    const out = prependStage1Prefix(summary, mkFailed());
    expect(out).toBe(summary);
    expect(out.includes("今日")).toBe(false);
  });
});

describe("splitStage1Prefix", () => {
  const base = "週末で見る映画を選びたい流れ。2人の好みと公開情報を突き合わせて3本に絞った。";

  it("`\\n` を含まない summary は prefix=null, body=入力そのもの", () => {
    const out = splitStage1Prefix(base);
    expect(out.prefix).toBeNull();
    expect(out.body).toBe(base);
  });

  it("prependStage1Prefix で作った文字列は逆向きに完全分解できる", () => {
    const stage1OK = mkOk("connect", "ちゃんと向き合いたい");
    const joined = prependStage1Prefix(base, stage1OK);
    const split = splitStage1Prefix(joined);
    expect(split.prefix).toBe(buildStage1Prefix(stage1OK));
    expect(split.body).toBe(base);
  });

  it("最初の `\\n` のみで分割（body 内の `\\n` は保持）", () => {
    const weird = "prefix-line\nbody line 1\nbody line 2";
    const out = splitStage1Prefix(weird);
    expect(out.prefix).toBe("prefix-line");
    expect(out.body).toBe("body line 1\nbody line 2");
  });

  it("先頭が `\\n` なら prefix は空文字、body は残り", () => {
    const out = splitStage1Prefix("\ntail");
    expect(out.prefix).toBe("");
    expect(out.body).toBe("tail");
  });

  it("末尾が `\\n` なら prefix に全体、body は空文字", () => {
    const out = splitStage1Prefix("head\n");
    expect(out.prefix).toBe("head");
    expect(out.body).toBe("");
  });
});

describe("clamp 問題が再発しないことの契約（C2b）", () => {
  // CoAlterCard.tsx 側の clamp(body, 100) を想定し、prefix は必ず残る想定。
  it("prefix + long body のとき、prefix 部分は分割後に保持される", () => {
    const longBody = "a".repeat(200);
    const stage1OK = mkOk("celebrate", "今日は少し贅沢したい気分");
    const joined = prependStage1Prefix(longBody, stage1OK);
    const split = splitStage1Prefix(joined);
    // prefix は契約 max ≈60 字、clamp(100) に引っかからない長さ
    expect(split.prefix).toBe(buildStage1Prefix(stage1OK));
    expect(split.prefix!.length).toBeLessThanOrEqual(100);
    // body は 200 字なので renderer 側で clamp(100) が掛かる想定（ここでは split だけ検証）
    expect(split.body.length).toBe(200);
  });
});

describe("Stage1Snapshot discriminated union 型適合", () => {
  it("buildStage1Prefix は Stage1Snapshot union を受ける", () => {
    const ok: Stage1Snapshot = mkOk("maintain");
    const failed: Stage1Snapshot = mkFailed();
    expect(typeof buildStage1Prefix(ok)).toBe("string");
    expect(buildStage1Prefix(failed)).toBeNull();
  });
});
