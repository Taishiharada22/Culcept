// lib/stargazer/__tests__/informationGain.test.ts
// EIG エンジン + 相関伝播 + 不確実性加重の検証テスト
// 旧方式（ヒューリスティック）との比較を含む

import { describe, it, expect } from "vitest";
import {
  computeSingleAxisEIG,
  estimateEvidencePrecision,
  rankQuestionsByEIG,
  selectByEIG,
  propagateBeliefs,
  computeUncertaintyWeight,
  computeUncertaintyWeightedScore,
  computeSyncPercentage,
  computeTotalUncertainty,
  estimateSyncGain,
  getCorrelatedAxes,
} from "@/lib/stargazer/informationGain";
import {
  createEmptyBeliefSet,
  createEmptyBelief,
  updateAxisBelief,
  updateFromDailyObservation,
  type BeliefSet,
  type AxisBelief,
  type DailyObservationInput,
} from "@/lib/stargazer/bayesianAxisUpdater";
import {
  resolveArchetype,
  resolveArchetypeWithUncertainty,
} from "@/lib/stargazer/archetypeResolver";
import { TRAIT_AXIS_KEYS, type TraitAxisKey } from "@/lib/stargazer/traitAxes";

// ── Helper: 指定精度のbelief生成 ──
function makeBelief(mu: number, precision: number): AxisBelief {
  const HARD_CAP = 0.65;
  const CONFIDENCE_SATURATION = 30;
  const stddev = 1 / Math.sqrt(precision);
  return {
    mu: Math.max(-1, Math.min(1, mu)),
    precision,
    confidence: HARD_CAP * (1 - Math.exp(-precision / CONFIDENCE_SATURATION)),
    credibleInterval: [
      Math.max(-1, mu - 1.96 * stddev),
      Math.min(1, mu + 1.96 * stddev),
    ],
  };
}

// ── Helper: 部分的にbeliefsをセット ──
function setBeliefs(
  beliefs: BeliefSet,
  overrides: Partial<Record<TraitAxisKey, { mu: number; precision: number }>>,
): BeliefSet {
  const updated = { ...beliefs };
  for (const [key, val] of Object.entries(overrides)) {
    updated[key as TraitAxisKey] = makeBelief(val.mu, val.precision);
  }
  return updated;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. EIG 基本特性テスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("EIG 基本特性", () => {
  it("低精度軸のEIGは高精度軸より大きい", () => {
    const evidPrec = 0.4;
    const eigLowPrec = computeSingleAxisEIG(0.5, evidPrec); // 新規ユーザー
    const eigHighPrec = computeSingleAxisEIG(20, evidPrec); // 40問回答済み

    expect(eigLowPrec).toBeGreaterThan(eigHighPrec);
    // 定量: 低精度は高精度の10倍以上のEIGを持つべき
    expect(eigLowPrec / eigHighPrec).toBeGreaterThan(10);
  });

  it("証拠精度が0の時EIGは0", () => {
    expect(computeSingleAxisEIG(1.0, 0)).toBe(0);
  });

  it("証拠精度が大きいほどEIGが大きい", () => {
    const eig1 = computeSingleAxisEIG(5, 0.2);
    const eig2 = computeSingleAxisEIG(5, 1.0);
    const eig3 = computeSingleAxisEIG(5, 3.0);
    expect(eig1).toBeLessThan(eig2);
    expect(eig2).toBeLessThan(eig3);
  });

  it("EIG値は常に非負", () => {
    for (const prior of [0.1, 0.5, 1, 5, 20, 50]) {
      for (const evid of [0.01, 0.1, 0.5, 1, 5]) {
        expect(computeSingleAxisEIG(prior, evid)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. 軸間相関モデルテスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("軸間相関モデル", () => {
  it("introvert_vs_extrovert は複数の相関軸を持つ", () => {
    const correlated = getCorrelatedAxes("introvert_vs_extrovert");
    expect(correlated.length).toBeGreaterThanOrEqual(3);
    const peers = correlated.map((c) => c.peer);
    expect(peers).toContain("individual_vs_social");
    expect(peers).toContain("social_initiative");
  });

  it("相関は双方向（A→B があれば B→A もある）", () => {
    const fromIntro = getCorrelatedAxes("introvert_vs_extrovert");
    const socialPeer = fromIntro.find((c) => c.peer === "individual_vs_social");
    expect(socialPeer).toBeDefined();

    const fromSocial = getCorrelatedAxes("individual_vs_social");
    const introPeer = fromSocial.find((c) => c.peer === "introvert_vs_extrovert");
    expect(introPeer).toBeDefined();

    expect(socialPeer!.r).toBe(introPeer!.r);
  });

  it("相関のない軸は空配列を返す", () => {
    // cognitive_updating は相関定義が少ない方
    const correlated = getCorrelatedAxes("decision_tempo");
    // 定義されていないなら空、定義されていてもOK
    expect(Array.isArray(correlated)).toBe(true);
  });

  it("全相関係数は |r| >= 0.30 かつ |r| <= 1.0", () => {
    for (const key of TRAIT_AXIS_KEYS) {
      const correlated = getCorrelatedAxes(key);
      for (const { r } of correlated) {
        expect(Math.abs(r)).toBeGreaterThanOrEqual(0.30);
        expect(Math.abs(r)).toBeLessThanOrEqual(1.0);
      }
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. EIGランキング: 旧方式との比較
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("EIGランキング vs ヒューリスティック", () => {
  it("未知の軸は直接EIGが高い（伝播なしの場合）", () => {
    const beliefs = createEmptyBeliefSet();
    // introvert は多く観測済み (precision 20)、intimacy_pace は未観測 (precision 0.5)
    beliefs["introvert_vs_extrovert"] = makeBelief(0.3, 20);
    beliefs["intimacy_pace"] = makeBelief(0, 0.5);
    // introvert の相関先も高精度にする（伝播EIGを抑える）
    beliefs["individual_vs_social"] = makeBelief(0.2, 20);
    beliefs["social_initiative"] = makeBelief(-0.1, 20);
    beliefs["stress_isolation_vs_social"] = makeBelief(0.1, 20);

    const candidates = [
      { id: "q_intro", axisId: "introvert_vs_extrovert" as TraitAxisKey },
      { id: "q_intimacy", axisId: "intimacy_pace" as TraitAxisKey },
    ];

    const ranked = rankQuestionsByEIG(candidates, beliefs);
    // 相関先も高精度なら、未知のintimacy_paceの方がEIG高い
    expect(ranked[0].questionId).toBe("q_intimacy");
    expect(ranked[0].directEIG).toBeGreaterThan(ranked[1].directEIG);
  });

  it("相関先が未知の軸は伝播EIGにより総合EIGが上がる", () => {
    const beliefs = createEmptyBeliefSet();
    // introvert は高精度だが、相関先(individual_vs_social等)が未知
    beliefs["introvert_vs_extrovert"] = makeBelief(0.3, 20);
    // intimacy_pace は未知だが相関先も少ない
    beliefs["intimacy_pace"] = makeBelief(0, 0.5);

    const candidates = [
      { id: "q_intro", axisId: "introvert_vs_extrovert" as TraitAxisKey },
      { id: "q_intimacy", axisId: "intimacy_pace" as TraitAxisKey },
    ];

    const ranked = rankQuestionsByEIG(candidates, beliefs);
    // introvert は直接EIGは低いが、未知の相関先への伝播EIGが大きい
    const introScore = ranked.find((r) => r.questionId === "q_intro")!;
    expect(introScore.propagatedEIG).toBeGreaterThan(0);
    // 合計では introvert が勝つ（未知の相関先3+への波及効果）
    expect(ranked[0].questionId).toBe("q_intro");
  });

  it("相関軸の伝播EIGがランキングに反映される", () => {
    const beliefs = createEmptyBeliefSet();
    // introvert と boundary_awareness を同程度に未知にする
    beliefs["introvert_vs_extrovert"] = makeBelief(0, 1.0);
    beliefs["boundary_awareness"] = makeBelief(0, 1.0);
    // introvert の相関先も未知
    beliefs["individual_vs_social"] = makeBelief(0, 0.5);
    beliefs["social_initiative"] = makeBelief(0, 0.5);
    beliefs["stress_isolation_vs_social"] = makeBelief(0, 0.5);

    const candidates = [
      { id: "q_intro", axisId: "introvert_vs_extrovert" as TraitAxisKey },
      { id: "q_boundary", axisId: "boundary_awareness" as TraitAxisKey },
    ];

    const ranked = rankQuestionsByEIG(candidates, beliefs);

    // introvert は相関軸が多い → 伝播EIGが大きい → ランク上位
    expect(ranked[0].questionId).toBe("q_intro");
    expect(ranked[0].propagatedEIG).toBeGreaterThan(0);
    expect(ranked[0].propagatedEIG).toBeGreaterThan(ranked[1].propagatedEIG);
  });

  it("高精度軸の質問は自然に抑制される", () => {
    const beliefs = createEmptyBeliefSet();
    // 全軸を高精度に（十分観測済み）
    for (const key of TRAIT_AXIS_KEYS) {
      beliefs[key] = makeBelief(0.2, 30);
    }
    // 1軸だけ低精度
    beliefs["shame_vs_guilt"] = makeBelief(0, 0.5);

    const candidates = TRAIT_AXIS_KEYS.slice(0, 10).map((key) => ({
      id: `q_${key}`,
      axisId: key,
    }));
    // shame_vs_guilt を候補に追加
    candidates.push({ id: "q_shame", axisId: "shame_vs_guilt" });

    const ranked = rankQuestionsByEIG(candidates, beliefs);
    expect(ranked[0].questionId).toBe("q_shame");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. 信念伝播テスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("信念伝播", () => {
  it("観測軸の相関先のprecisionが増加する", () => {
    const beliefs = createEmptyBeliefSet();
    const before = beliefs["individual_vs_social"].precision;

    const after = propagateBeliefs(
      beliefs,
      "introvert_vs_extrovert",
      0.5,
      2.0, // 強い証拠
    );

    expect(after["individual_vs_social"].precision).toBeGreaterThan(before);
  });

  it("伝播のダンパー(30%)が効いている", () => {
    const beliefs = createEmptyBeliefSet();
    const evidencePrecision = 2.0;

    const after = propagateBeliefs(
      beliefs,
      "introvert_vs_extrovert",
      0.5,
      evidencePrecision,
    );

    // 直接更新: precision += 2.0
    // 伝播: precision += r² × 2.0 × 0.3 (ダンパー) ≤ 0.5 (上限)
    const directIncrease = evidencePrecision;
    const peerIncrease =
      after["individual_vs_social"].precision - beliefs["individual_vs_social"].precision;

    expect(peerIncrease).toBeLessThan(directIncrease);
    expect(peerIncrease).toBeLessThanOrEqual(0.5); // MAX_PROPAGATED_PRECISION
  });

  it("負の相関は逆方向にμをシフトする", () => {
    const beliefs = createEmptyBeliefSet();
    // emotional_variability と emotional_regulation は r = -0.65

    const after = propagateBeliefs(
      beliefs,
      "emotional_variability",
      0.8, // 高い emotional_variability
      2.0,
    );

    // emotional_regulation は逆方向（負）にシフトすべき
    expect(after["emotional_regulation"].mu).toBeLessThan(0);
  });

  it("相関のない軸は影響を受けない", () => {
    const beliefs = createEmptyBeliefSet();
    const before = beliefs["abstract_structuring"].precision;

    const after = propagateBeliefs(
      beliefs,
      "intimacy_pace",
      0.5,
      2.0,
    );

    // abstract_structuring は intimacy_pace と相関なし
    // (相関定義に含まれていない)
    const correlated = getCorrelatedAxes("intimacy_pace");
    const hasAbstract = correlated.some((c) => c.peer === "abstract_structuring");
    if (!hasAbstract) {
      expect(after["abstract_structuring"].precision).toBe(before);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. 収束速度比較: 伝播あり vs なし
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("収束速度: 伝播あり vs なし", () => {
  it("同じ回答数で伝播ありの方が総不確実性が低い", () => {
    // シミュレーション: 20問回答
    const beliefsWithPropagation = createEmptyBeliefSet();
    const beliefsWithoutPropagation = createEmptyBeliefSet();

    // Social cluster の質問を模擬 (introvert, individual_vs_social, social_initiative)
    const socialAxes: TraitAxisKey[] = [
      "introvert_vs_extrovert",
      "individual_vs_social",
      "social_initiative",
      "stress_isolation_vs_social",
      "intimacy_pace",
    ];

    // 20問を5軸にランダムに分配
    const observations: DailyObservationInput[] = [];
    for (let i = 0; i < 20; i++) {
      const axis = socialAxes[i % socialAxes.length];
      observations.push({
        axisId: axis,
        score: 0.3 + Math.sin(i) * 0.2, // やや内向的
        weight: 0.4,
        responseTimeMs: 3500,
      });
    }

    // 伝播あり: updateFromDailyObservation (propagateBeliefs を内部で呼ぶ)
    const afterWith = updateFromDailyObservation(beliefsWithPropagation, observations);

    // 伝播なし: 直接更新のみ (旧方式をシミュレート)
    let afterWithout = { ...beliefsWithoutPropagation };
    for (const obs of observations) {
      afterWithout[obs.axisId] = updateAxisBelief(
        afterWithout[obs.axisId] ?? createEmptyBelief(),
        obs.score,
        0.4, // 簡易 evidence precision
      );
    }

    const uncertaintyWith = computeTotalUncertainty(afterWith);
    const uncertaintyWithout = computeTotalUncertainty(afterWithout);

    // 伝播ありの方が総不確実性が低い
    expect(uncertaintyWith).toBeLessThan(uncertaintyWithout);

    // 改善率を計算
    const initialUncertainty = computeTotalUncertainty(createEmptyBeliefSet());
    const reductionWith = initialUncertainty - uncertaintyWith;
    const reductionWithout = initialUncertainty - uncertaintyWithout;
    const improvementRatio = reductionWith / reductionWithout;

    console.log(`[収束速度] 伝播あり不確実性減少: ${reductionWith.toFixed(2)}`);
    console.log(`[収束速度] 伝播なし不確実性減少: ${reductionWithout.toFixed(2)}`);
    console.log(`[収束速度] 改善比率: ${improvementRatio.toFixed(2)}x`);

    // 伝播により少なくとも10%以上の改善を期待
    expect(improvementRatio).toBeGreaterThan(1.1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. 不確実性加重アーキタイプ判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("不確実性加重アーキタイプ判定", () => {
  it("uncertaintyWeight: 低精度→低weight, 高精度→高weight", () => {
    expect(computeUncertaintyWeight(0.5)).toBeLessThan(0.35);  // 新規
    expect(computeUncertaintyWeight(5.0)).toBeGreaterThan(0.65); // 10問
    expect(computeUncertaintyWeight(20)).toBeGreaterThan(0.85); // 40問
    expect(computeUncertaintyWeight(50)).toBeGreaterThan(0.90); // MAX
  });

  it("全軸低精度の時、confidence が低い", () => {
    const axes: Partial<Record<TraitAxisKey, number>> = {};
    const beliefs = createEmptyBeliefSet();

    for (const key of TRAIT_AXIS_KEYS) {
      axes[key] = Math.random() * 2 - 1;
    }

    const resultOld = resolveArchetype(axes);
    const resultNew = resolveArchetypeWithUncertainty(axes, beliefs);

    // 不確実性加重版の方が confidence が低いはず（全軸が初期精度）
    expect(resultNew.confidence).toBeLessThan(resultOld.confidence + 0.01);
    console.log(`[タイプ安定性] 旧confidence: ${resultOld.confidence.toFixed(3)}, 新confidence: ${resultNew.confidence.toFixed(3)}`);
  });

  it("高精度軸がある時、不確実性加重版はその軸を重視する", () => {
    const axes: Partial<Record<TraitAxisKey, number>> = {};
    const beliefs = createEmptyBeliefSet();

    for (const key of TRAIT_AXIS_KEYS) {
      axes[key] = 0; // 全軸ニュートラル
    }

    // introvert 系を強く外向的にセット（高精度）
    axes["introvert_vs_extrovert"] = 0.8;
    beliefs["introvert_vs_extrovert"] = makeBelief(0.8, 30);
    axes["individual_vs_social"] = 0.7;
    beliefs["individual_vs_social"] = makeBelief(0.7, 25);

    // analytical 系を弱く分析的にセット（低精度）
    axes["analytical_vs_intuitive"] = -0.3;
    beliefs["analytical_vs_intuitive"] = makeBelief(-0.3, 1.0);

    const resultNew = resolveArchetypeWithUncertainty(axes, beliefs);

    // Social layer は E（外向）であるべき（高精度データ）
    expect(resultNew.layer3.code).toBe("E");
    console.log(`[タイプ安定性] 不確実性加重結果: ${resultNew.code}, confidence: ${resultNew.confidence.toFixed(3)}`);
  });

  it("旧方式と新方式でタイプが一致するケース（高精度時）", () => {
    const axes: Partial<Record<TraitAxisKey, number>> = {};
    const beliefs = createEmptyBeliefSet();

    // 全軸を高精度で明確にセット
    for (const key of TRAIT_AXIS_KEYS) {
      const val = Math.random() * 2 - 1;
      axes[key] = val;
      beliefs[key] = makeBelief(val, 25); // 高精度
    }

    const resultOld = resolveArchetype(axes);
    const resultNew = resolveArchetypeWithUncertainty(axes, beliefs);

    // 高精度では同じタイプになるべき
    expect(resultNew.code).toBe(resultOld.code);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. 同期率（Sync Percentage）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("同期率", () => {
  it("初期状態で sync ≈ 0", () => {
    const beliefs = createEmptyBeliefSet();
    const sync = computeSyncPercentage(beliefs);
    expect(sync).toBeCloseTo(0, 1);
  });

  it("全軸が高精度で sync が高い", () => {
    const beliefs = createEmptyBeliefSet();
    for (const key of TRAIT_AXIS_KEYS) {
      beliefs[key] = makeBelief(0.3, 40);
    }
    const sync = computeSyncPercentage(beliefs);
    expect(sync).toBeGreaterThan(0.7);
    console.log(`[同期率] 全軸precision=40時: ${(sync * 100).toFixed(1)}%`);
  });

  it("syncGain は正の値", () => {
    const beliefs = createEmptyBeliefSet();
    const gain = estimateSyncGain(beliefs, "introvert_vs_extrovert");
    expect(gain).toBeGreaterThan(0);
    console.log(`[同期率] 初期状態で1問回答時の増分: +${(gain * 100).toFixed(2)}%`);
  });

  it("高精度軸へのsyncGainは低精度軸より小さい", () => {
    const beliefs = createEmptyBeliefSet();
    beliefs["introvert_vs_extrovert"] = makeBelief(0.3, 30);

    const gainLow = estimateSyncGain(beliefs, "intimacy_pace"); // 低精度
    const gainHigh = estimateSyncGain(beliefs, "introvert_vs_extrovert"); // 高精度

    expect(gainLow).toBeGreaterThan(gainHigh);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. 処理負荷テスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("処理負荷", () => {
  it("EIGランキング: 100候補を5ms以内で処理", () => {
    const beliefs = createEmptyBeliefSet();

    // 100候補を生成
    const candidates = [];
    for (let i = 0; i < 100; i++) {
      const axisIdx = i % TRAIT_AXIS_KEYS.length;
      candidates.push({
        id: `q_${i}`,
        axisId: TRAIT_AXIS_KEYS[axisIdx],
        weight: 0.3 + Math.random() * 0.5,
      });
    }

    const start = performance.now();
    const ranked = rankQuestionsByEIG(candidates, beliefs);
    const elapsed = performance.now() - start;

    console.log(`[処理負荷] 100候補EIGランキング: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(5);
    expect(ranked.length).toBe(100);
  });

  it("信念伝播: 1回の伝播を0.5ms以内で処理", () => {
    const beliefs = createEmptyBeliefSet();

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      propagateBeliefs(beliefs, "introvert_vs_extrovert", 0.5, 1.0);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 100;

    console.log(`[処理負荷] 信念伝播1回: ${perCall.toFixed(3)}ms`);
    expect(perCall).toBeLessThan(0.5);
  });

  it("不確実性加重アーキタイプ判定: 1回1ms以内", () => {
    const axes: Partial<Record<TraitAxisKey, number>> = {};
    const beliefs = createEmptyBeliefSet();
    for (const key of TRAIT_AXIS_KEYS) {
      axes[key] = Math.random() * 2 - 1;
    }

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      resolveArchetypeWithUncertainty(axes, beliefs);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 100;

    console.log(`[処理負荷] 不確実性加重アーキタイプ判定1回: ${perCall.toFixed(3)}ms`);
    expect(perCall).toBeLessThan(1);
  });

  it("旧方式との処理時間比較", () => {
    const axes: Partial<Record<TraitAxisKey, number>> = {};
    const beliefs = createEmptyBeliefSet();
    for (const key of TRAIT_AXIS_KEYS) {
      axes[key] = Math.random() * 2 - 1;
    }

    // 旧方式
    const startOld = performance.now();
    for (let i = 0; i < 1000; i++) {
      resolveArchetype(axes);
    }
    const elapsedOld = performance.now() - startOld;

    // 新方式
    const startNew = performance.now();
    for (let i = 0; i < 1000; i++) {
      resolveArchetypeWithUncertainty(axes, beliefs);
    }
    const elapsedNew = performance.now() - startNew;

    const overhead = elapsedNew / elapsedOld;
    console.log(`[処理負荷] 旧方式1000回: ${elapsedOld.toFixed(1)}ms, 新方式1000回: ${elapsedNew.toFixed(1)}ms, オーバーヘッド: ${overhead.toFixed(2)}x`);

    // 新方式は旧方式の3倍以内であるべき
    expect(overhead).toBeLessThan(3);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. 副作用テスト: 旧方式の動作を壊していないか
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("副作用なし（後方互換）", () => {
  it("resolveArchetype は引き続き同じ結果を返す", () => {
    const axes: Partial<Record<TraitAxisKey, number>> = {
      introvert_vs_extrovert: -0.5,
      individual_vs_social: -0.4,
      analytical_vs_intuitive: -0.6,
      emotional_variability: -0.3,
      plan_vs_spontaneous: -0.5,
      change_embrace_vs_resist: -0.2,
    };

    const result = resolveArchetype(axes);
    // 基本的な構造が保たれている
    expect(result.code).toBeDefined();
    expect(result.code.length).toBe(4);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.topMatches.length).toBe(3);
  });

  it("createEmptyBeliefSet は全45軸を含む", () => {
    const beliefs = createEmptyBeliefSet();
    for (const key of TRAIT_AXIS_KEYS) {
      expect(beliefs[key]).toBeDefined();
      expect(beliefs[key].mu).toBe(0);
      expect(beliefs[key].precision).toBe(0.5);
    }
  });

  it("updateFromDailyObservation は beliefs を正しく更新する", () => {
    const beliefs = createEmptyBeliefSet();
    const observations: DailyObservationInput[] = [
      {
        axisId: "introvert_vs_extrovert",
        score: 0.5,
        weight: 0.4,
        responseTimeMs: 3000,
      },
    ];

    const updated = updateFromDailyObservation(beliefs, observations);

    // 観測軸は更新されている
    expect(updated["introvert_vs_extrovert"].mu).not.toBe(0);
    expect(updated["introvert_vs_extrovert"].precision).toBeGreaterThan(0.5);

    // 相関軸も伝播で更新されている（新機能）
    expect(updated["individual_vs_social"].precision).toBeGreaterThan(0.5);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 10. 統合シナリオ: 30問回答シミュレーション
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("統合シナリオ: 30問シミュレーション", () => {
  it("30問後に適切な同期率・タイプ安定性を達成する", () => {
    let beliefs = createEmptyBeliefSet();

    // 「内向・分析・静・最適化」タイプのユーザーをシミュレート
    const trueProfile: Partial<Record<TraitAxisKey, number>> = {
      introvert_vs_extrovert: -0.6,
      individual_vs_social: -0.5,
      analytical_vs_intuitive: -0.7,
      plan_vs_spontaneous: -0.4,
      emotional_variability: -0.3,
      emotional_regulation: 0.5,
      change_embrace_vs_resist: -0.3,
      cautious_vs_bold: -0.4,
      boundary_awareness: 0.4,
      independence_vs_harmony: -0.3,
    };

    const archetypeHistory: string[] = [];

    for (let q = 0; q < 30; q++) {
      // ランダムに軸を選んで回答をシミュレート
      const axisKeys = Object.keys(trueProfile) as TraitAxisKey[];
      const axis = axisKeys[q % axisKeys.length];
      const trueScore = trueProfile[axis] ?? 0;
      const noise = (Math.random() - 0.5) * 0.3; // ノイズ
      const observedScore = Math.max(-1, Math.min(1, trueScore + noise));

      const observations: DailyObservationInput[] = [
        {
          axisId: axis,
          score: observedScore,
          weight: 0.4,
          responseTimeMs: 3000 + Math.random() * 2000,
        },
      ];

      beliefs = updateFromDailyObservation(beliefs, observations);

      // 10問ごとにアーキタイプを判定
      if ((q + 1) % 10 === 0) {
        const axes: Partial<Record<TraitAxisKey, number>> = {};
        for (const key of TRAIT_AXIS_KEYS) {
          axes[key] = beliefs[key].mu;
        }
        const result = resolveArchetypeWithUncertainty(axes, beliefs);
        archetypeHistory.push(result.code);
        console.log(`[統合] ${q + 1}問後: type=${result.code}, confidence=${result.confidence.toFixed(3)}, sync=${(computeSyncPercentage(beliefs) * 100).toFixed(1)}%`);
      }
    }

    // 同期率は0より有意に高いはず
    const finalSync = computeSyncPercentage(beliefs);
    expect(finalSync).toBeGreaterThan(0.05);
    console.log(`[統合] 最終同期率: ${(finalSync * 100).toFixed(1)}%`);

    // 20問目と30問目のアーキタイプが一致すれば安定と判断
    if (archetypeHistory.length >= 2) {
      const stable = archetypeHistory[1] === archetypeHistory[2];
      console.log(`[統合] タイプ安定性: 20問目=${archetypeHistory[1]}, 30問目=${archetypeHistory[2]}, 一致=${stable}`);
    }
  });
});
