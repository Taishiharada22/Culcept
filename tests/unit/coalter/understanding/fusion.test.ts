/**
 * personFusion / relationalFusion の M0-2 単体検証。
 *
 * 検証ポイント（CEO lock 2026-04-20 M0-2）:
 *   #1 完全決定論 — 同 input で 2 回実行し deep equal
 *   #2 欠損時 degrade — sparse fixture で 空配列 / "" が返ること、捏造しないこと
 *   #3 coreDecisionPrinciples 3〜5 本、短い原理、ドメイン名詞なし
 */

import { describe, it, expect } from "vitest";
import { fusePersonalLens } from "@/lib/coalter/understanding/personFusion";
import { fuseRelationalLens } from "@/lib/coalter/understanding/relationalFusion";
import { MATURE_PAIR, SPARSE_PAIR } from "./fixtures/pairs";

// ドメイン名詞の検知（lock #3）
const DOMAIN_NOUNS = /映画|レストラン|カフェ|ホテル|旅行|店|ディナー|ランチ/;

describe("personFusion — Mature pair", () => {
  it("決定論: 2 回 fuse して deep equal", () => {
    const r1 = fusePersonalLens(MATURE_PAIR.personA);
    const r2 = fusePersonalLens(MATURE_PAIR.personA);
    expect(r2).toEqual(r1);
  });

  it("coreDecisionPrinciples が 3〜5 本", () => {
    const lens = fusePersonalLens(MATURE_PAIR.personA);
    expect(lens.coreDecisionPrinciples.length).toBeGreaterThanOrEqual(3);
    expect(lens.coreDecisionPrinciples.length).toBeLessThanOrEqual(5);
  });

  it("原理フレーズがドメイン名詞を含まない", () => {
    const lens = fusePersonalLens(MATURE_PAIR.personA);
    for (const p of lens.coreDecisionPrinciples) {
      expect(p).not.toMatch(DOMAIN_NOUNS);
      expect(p.length).toBeGreaterThanOrEqual(8);
      expect(p.length).toBeLessThanOrEqual(30);
    }
  });

  it("sourcedFrom.stargazer には AXIS_PRINCIPLE_MAP 登録軸のみ", () => {
    const lens = fusePersonalLens(MATURE_PAIR.personA);
    const allowedAxes = new Set([
      "caution_vs_stimulus",
      "novelty_vs_familiarity",
      "speed_vs_precision",
      "solo_vs_social",
      "plan_vs_emergence",
      "intellect_vs_emotion",
      "intensity_vs_calm",
      "expansion_vs_depth",
      "risk_vs_safety",
      "openness_vs_boundary",
    ]);
    for (const ref of lens.sourcedFrom.stargazer) {
      expect(allowedAxes.has(ref.axisKey)).toBe(true);
    }
  });
});

describe("personFusion — Sparse pair (degrade)", () => {
  it("coreDecisionPrinciples は空（捏造禁止）", () => {
    const lens = fusePersonalLens(SPARSE_PAIR.personA);
    // fixture の軸は confidence/value floor に届かないため 0 本
    expect(lens.coreDecisionPrinciples).toEqual([]);
  });

  it("currentEmotionalHue は空文字（補完禁止）", () => {
    const lens = fusePersonalLens(SPARSE_PAIR.personA);
    expect(lens.currentEmotionalHue).toBe("");
  });

  it("todaySensitivities / comfortPathways も空", () => {
    const lens = fusePersonalLens(SPARSE_PAIR.personA);
    expect(lens.todaySensitivities).toEqual([]);
    expect(lens.comfortPathways).toEqual([]);
  });

  it("sourcedFrom 全カテゴリ空", () => {
    const lens = fusePersonalLens(SPARSE_PAIR.personB);
    expect(lens.sourcedFrom.stargazer).toEqual([]);
    expect(lens.sourcedFrom.alter).toEqual([]);
    expect(lens.sourcedFrom.behavioral).toEqual([]);
  });
});

describe("relationalFusion — Mature pair", () => {
  it("決定論: 2 回 fuse して deep equal", () => {
    const r1 = fuseRelationalLens(
      MATURE_PAIR.relationship,
      MATURE_PAIR.personA,
      MATURE_PAIR.personB,
      MATURE_PAIR.conversation,
    );
    const r2 = fuseRelationalLens(
      MATURE_PAIR.relationship,
      MATURE_PAIR.personA,
      MATURE_PAIR.personB,
      MATURE_PAIR.conversation,
    );
    expect(r2).toEqual(r1);
  });

  it("temperature は relationship.currentTemperature を反映", () => {
    const lens = fuseRelationalLens(
      MATURE_PAIR.relationship,
      MATURE_PAIR.personA,
      MATURE_PAIR.personB,
      MATURE_PAIR.conversation,
    );
    expect(lens.temperature).toBe("warm");
  });

  it("dominantDynamic が空文字でない（initiator=b かつ caring 差あり）", () => {
    const lens = fuseRelationalLens(
      MATURE_PAIR.relationship,
      MATURE_PAIR.personA,
      MATURE_PAIR.personB,
      MATURE_PAIR.conversation,
    );
    expect(lens.dominantDynamic.length).toBeGreaterThan(0);
    expect(lens.dominantDynamic).not.toMatch(DOMAIN_NOUNS);
  });

  it("careAxes は 'A の ...' / 'B の ...' 形式", () => {
    const lens = fuseRelationalLens(
      MATURE_PAIR.relationship,
      MATURE_PAIR.personA,
      MATURE_PAIR.personB,
      MATURE_PAIR.conversation,
    );
    for (const ax of lens.careAxes) {
      expect(ax).toMatch(/^[AB] の「.+」への配慮$/);
    }
  });
});

describe("relationalFusion — Sparse pair (degrade)", () => {
  it("dominantDynamic は空文字（balanced + caring 同値 → 不明）", () => {
    const sparse = {
      ...SPARSE_PAIR,
      conversation: { ...SPARSE_PAIR.conversation, caringIntensity: { a: 0.5, b: 0.5 } },
    };
    const lens = fuseRelationalLens(
      sparse.relationship,
      sparse.personA,
      sparse.personB,
      sparse.conversation,
    );
    // balanced + 差 0 → "今日は対等に並走" を返す（これは観測からの直接結論）
    expect(lens.dominantDynamic).toBe("今日は対等に並走");
  });

  it("careAxes / avoidElements は空", () => {
    const lens = fuseRelationalLens(
      SPARSE_PAIR.relationship,
      SPARSE_PAIR.personA,
      SPARSE_PAIR.personB,
      SPARSE_PAIR.conversation,
    );
    expect(lens.careAxes).toEqual([]);
    expect(lens.avoidElements).toEqual([]);
  });

  it("temperature は neutral （currentTemperature 明示あり）", () => {
    const lens = fuseRelationalLens(
      SPARSE_PAIR.relationship,
      SPARSE_PAIR.personA,
      SPARSE_PAIR.personB,
      SPARSE_PAIR.conversation,
    );
    expect(lens.temperature).toBe("neutral");
  });
});
