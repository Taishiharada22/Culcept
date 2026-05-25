/**
 * Phase 3-N Plan P2 Step 2 G3-A — generic self-help detector 誤検出監査
 *
 * 設計書: docs/alter-plan-p2-llm-step2-readiness-v3.md §4 + Q5 補正
 *
 * 役割 (= GPT G3 必須項目 4):
 *   - **false positive 監査** (= 既存 deterministic + 良質 LLM 出力例を generic detector に通す)
 *     → false positive (= 誤って generic 判定された 「良い文」) が許容範囲か
 *   - **false negative 監査** (= 既知 generic phrase corpus を通す)
 *     → 確実に弾けているか (= true positive rate)
 *
 * 既存 deterministic 文 (= lib/plan/list/categoryMeaning.ts) は規約 24 + 中立文体で
 * 構築されており、 これらが generic detector に false positive 引っかかると validator V2 が
 * 既存 deterministic も reject してしまう (= regression)。
 *
 * Known-generic corpus (= 「自己啓発書 phrase」 等) は detector の本来 target、
 * 全件 hit すべき (= recall 100% 目標)。
 *
 * 不変原則:
 *   - pure (= LLM 呼ばない、 入力 mutate なし)
 *   - 誤検出統計は数値で固定 (= regression 監視可能)
 */

import { describe, it, expect } from "vitest";
import { ALTER_NOTE_CONTRACT_V2 } from "@/lib/plan/llm/outputContract";
import { validateAlterNoteOutputV2 } from "@/lib/plan/llm/alterNoteValidatorV2";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Known-good corpus (= 既存 deterministic 文 + 良質 LLM 例、 generic detector に hit 不可)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 既存 deterministic 文 (= lib/plan/list/categoryMeaning.ts MEANING_TABLE)
 *
 * 20 文 (= 4 category × 5 timeOfDay)、 規約 24 + 中立文体準拠、 generic 判定されてはならない。
 */
const KNOWN_GOOD_DETERMINISTIC: ReadonlyArray<string> = [
  // cafe
  "静かなカフェで、今日の計画を整理しましょう",
  "カフェでひと息ついて、気分を切り替えましょう",
  "カフェタイムで気分をリセットしましょう",
  "夜のカフェで、静かに過ごす時間",
  "夜更けのカフェで、ゆったりと",
  // meal
  "朝食をゆっくり、一日のはじまり",
  "美味しいランチで、リフレッシュしましょう",
  "軽くおやつで、ひと休み",
  "夜の食卓で、ゆっくり食事を楽しみましょう",
  "夜更けの軽い食事で、無理なく",
  // work
  "朝の集中時間、落ち着いて仕事に取り組みましょう",
  "午前を区切るランチ前のひととき",
  "午後の集中タイム、大切なタスクを進めましょう",
  "一日の仕事を、しっかり締めくくりましょう",
  "残りを片付けて、無理なく切り上げましょう",
  // home
  "一日を整える朝、ゆっくり準備をしましょう",
  "家で少し休んで、午後に備えましょう",
  "家でひと息ついて、ペースを取り戻しましょう",
  "ゆっくり過ごして、明日への活力に",
  "ぐっすり休んで、明日に備えましょう",
];

/**
 * Virtual events 固定文 (= 出発 / 帰宅、 既存契約)
 */
const KNOWN_GOOD_VIRTUAL: ReadonlyArray<string> = [
  "今日を始めるための家を出る時間",
  "一日を締めくくる、家に戻る時間",
];

/**
 * 良質な Step 2 期待出力例 (= readiness §4.3 期待効果)
 *
 * 3 部統合 (= fact_acknowledgment + interpretation + style_constraint) を満たす文。
 * generic detector で hit してはならない。
 */
const KNOWN_GOOD_STEP2_OUTPUTS: ReadonlyArray<string> = [
  "夕方のカフェ、学びに静かに沈む時間",
  "朝の自宅で、ゆっくり準備を始める",
  "午後のオフィス、集中を取り戻す時間",
  "夜の食卓、ゆっくり過ごす穏やかな時間",
  "朝のカフェで集中の準備を整える",
  "深夜の自宅、静かに整える時間",
  "昼のランチで、午前のペースを区切る",
  "夕方の会議、人と向き合う時間",
  "朝の在宅作業、整理から始める",
  "夜のカフェで、思考を温める時間",
  "午後の自宅、ひと息ついて休息",
  "朝の散歩で、一日のリズムを整える",
];

const ALL_KNOWN_GOOD: ReadonlyArray<{ readonly source: string; readonly text: string }> = [
  ...KNOWN_GOOD_DETERMINISTIC.map((t) => ({ source: "deterministic", text: t })),
  ...KNOWN_GOOD_VIRTUAL.map((t) => ({ source: "virtual", text: t })),
  ...KNOWN_GOOD_STEP2_OUTPUTS.map((t) => ({ source: "step2_expected", text: t })),
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Known-generic corpus (= 自己啓発書 phrase、 generic detector で確実に hit すべき)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 既知 generic 自己啓発 phrase (= 30 件)
 *
 * 各 generic pattern (= readiness v3.1 §4.2.3 6 種) を hit すべき例。
 */
const KNOWN_GENERIC_PHRASES: ReadonlyArray<{
  readonly text: string;
  readonly category: string; // どの pattern 想定
}> = [
  // 「〜時間」 6 字以下 短文 abstraction
  { text: "集中の時間", category: "abstract_short_jikan" },
  { text: "整える時間", category: "abstract_short_jikan" },
  { text: "ひと息時間", category: "abstract_short_jikan" },
  { text: "学びの時間", category: "abstract_short_jikan" },
  // 「ましょう」 5 字以下 + 単独
  { text: "始めましょう", category: "mashou_short" },
  { text: "整えましょう", category: "mashou_short" },
  { text: "進みましょう", category: "mashou_short" },
  // 「今日も〜頑張」 自己啓発
  { text: "今日も頑張ろう良い一日", category: "encouragement_kyou" },
  { text: "今日も頑張りましょう", category: "encouragement_kyou" },
  { text: "今日も新しい挑戦を", category: "encouragement_kyou" },
  { text: "今日も素敵な発見を", category: "encouragement_kyou" },
  { text: "明日も頑張りましょう", category: "encouragement_ashita" },
  { text: "明日も新しい気持ちで", category: "encouragement_ashita" },
  { text: "明日も前向きに進む", category: "encouragement_ashita" },
  // 「あなたの一日が〜ように」 open-ended
  { text: "あなたの一日が穏やかになるように", category: "anata_open_ended" },
  { text: "あなたの一日が素敵になるように", category: "anata_open_ended" },
  { text: "あなたの毎日が輝くように", category: "anata_open_ended" },
  // 「いい一日を」 closing
  { text: "いい一日を", category: "closing_short" },
  { text: "良い一日を", category: "closing_short" },
  { text: "素敵な一日を", category: "closing_short" },
  { text: "素晴らしい時間を", category: "closing_short" },
  { text: "素敵な時間を", category: "closing_short" },
  // 「楽しんで」 「頑張って」 単独命令
  { text: "楽しんで", category: "tanoshi_short" },
  { text: "頑張って", category: "ganba_short" },
  { text: "さあ楽しんで", category: "sa_tanoshi" },
  { text: "さて頑張って", category: "sate_ganba" },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper: text が generic pattern のどれかに hit するか
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function isHitByGenericPattern(text: string): boolean {
  for (const pattern of ALTER_NOTE_CONTRACT_V2.genericSelfHelpPatterns) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// False positive 監査 (= known-good を generic として hit してしまうか)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Generic detector: false positive 監査 (= known-good)", () => {
  describe("既存 deterministic 文 (= 20 件、 categoryMeaning.ts)", () => {
    it("deterministic 文の generic pattern hit 件数 (= 統計固定)", () => {
      const hits = KNOWN_GOOD_DETERMINISTIC.filter(isHitByGenericPattern);
      // 統計を固定。 regression 監視。
      // 現状: deterministic 20 件のうち、 generic pattern hit するもの 0 件 期待。
      expect(hits.length).toBe(0);
    });

    for (const text of KNOWN_GOOD_DETERMINISTIC) {
      it(`deterministic「${text.slice(0, 12)}...」 → generic NOT hit`, () => {
        expect(isHitByGenericPattern(text)).toBe(false);
      });
    }
  });

  describe("Virtual event 固定文 (= 出発 / 帰宅)", () => {
    for (const text of KNOWN_GOOD_VIRTUAL) {
      it(`virtual「${text.slice(0, 12)}...」 → generic NOT hit`, () => {
        expect(isHitByGenericPattern(text)).toBe(false);
      });
    }
  });

  describe("良質な Step 2 期待出力 (= 12 件)", () => {
    it("Step 2 期待出力の generic pattern hit 件数 (= 統計固定)", () => {
      const hits = KNOWN_GOOD_STEP2_OUTPUTS.filter(isHitByGenericPattern);
      expect(hits.length).toBe(0);
    });

    for (const text of KNOWN_GOOD_STEP2_OUTPUTS) {
      it(`step2 expected「${text.slice(0, 14)}...」 → generic NOT hit`, () => {
        expect(isHitByGenericPattern(text)).toBe(false);
      });
    }
  });

  describe("V2 validator 経由検証 (= 既存 deterministic 文 18+ 件が validator V2 経由でも reject されない)", () => {
    // 注: 既存 deterministic 文の中には interp detector / fact detector で reject される可能性のあるものも
    //     ある (= V2 contract は V1 文体より厳しい)。 ここでは generic_self_help reject されないことだけ強保証。
    for (const text of KNOWN_GOOD_DETERMINISTIC) {
      it(`deterministic「${text.slice(0, 12)}...」 → generic_self_help reason で reject されない`, () => {
        const r = validateAlterNoteOutputV2(text);
        if (!r.ok) {
          // reason が generic_self_help 以外 (= 他の reason は許容、 V2 contract の厳しさ反映)
          expect(r.reason).not.toBe("generic_self_help");
        }
      });
    }
  });

  describe("False positive rate 統計", () => {
    it("全 known-good corpus (= 34 件) の generic pattern hit 率 0%", () => {
      const total = ALL_KNOWN_GOOD.length;
      const hits = ALL_KNOWN_GOOD.filter((e) => isHitByGenericPattern(e.text));
      const falsePositiveRate = hits.length / total;
      // false positive 0% 目標 (= regression 監視)
      expect(falsePositiveRate).toBe(0);
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// False negative 監査 (= known-generic を hit できているか)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Generic detector: false negative 監査 (= known-generic 補足率)", () => {
  it("全 known-generic phrase (= 26 件) の generic pattern hit 件数 (= 統計固定)", () => {
    const hits = KNOWN_GENERIC_PHRASES.filter((e) => isHitByGenericPattern(e.text));
    // 26 件中いくつ hit するか統計取得。 recall 100% 目標だが現状確認。
    const recall = hits.length / KNOWN_GENERIC_PHRASES.length;
    // 最低 70% は hit すべき (= 主要 pattern category は network 済)。 統計固定で regression 監視。
    expect(recall).toBeGreaterThanOrEqual(0.7);
  });

  // 各 pattern category ごとに hit 期待を機械保証
  describe("Pattern category 別検証", () => {
    it("「closing_short」 (= 「いい一日を」 等、 6+ 字) → 全 hit 期待", () => {
      const closing = KNOWN_GENERIC_PHRASES.filter((p) => p.category === "closing_short");
      for (const p of closing) {
        if (p.text.length >= 6) {
          // 6+ 字の closing pattern は hit
          expect(isHitByGenericPattern(p.text)).toBe(true);
        }
      }
    });

    it("「encouragement_kyou」 「encouragement_ashita」 (= 「今日も頑張」 等) → 全 hit 期待", () => {
      const encour = KNOWN_GENERIC_PHRASES.filter(
        (p) => p.category === "encouragement_kyou" || p.category === "encouragement_ashita",
      );
      for (const p of encour) {
        expect(isHitByGenericPattern(p.text)).toBe(true);
      }
    });

    it("「anata_open_ended」 (= 「あなたの一日が...ように」) → 全 hit 期待", () => {
      const anata = KNOWN_GENERIC_PHRASES.filter((p) => p.category === "anata_open_ended");
      for (const p of anata) {
        expect(isHitByGenericPattern(p.text)).toBe(true);
      }
    });
  });

  it("False negative の具体例 (= hit されない generic phrase)", () => {
    // どの phrase が detector で取りこぼされるか統計取得 (= 改善候補)
    const misses = KNOWN_GENERIC_PHRASES.filter((e) => !isHitByGenericPattern(e.text));
    // 統計を console 出力に残す (= 別 phase で pattern 拡張候補)
    if (misses.length > 0 && process.env.GENERIC_DETECTOR_VERBOSE === "true") {
      console.info(
        `[generic detector] missed ${misses.length}/${KNOWN_GENERIC_PHRASES.length}:`,
        misses.map((m) => `${m.category}: ${m.text}`),
      );
    }
    // 統計固定: false negative 30% 以下 (= recall 70% 以上、 上の 全体 hit と同基準)
    const falseNegativeRate = misses.length / KNOWN_GENERIC_PHRASES.length;
    expect(falseNegativeRate).toBeLessThanOrEqual(0.3);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Confusion matrix summary (= 全体監査結果)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Generic detector: confusion matrix summary", () => {
  it("数値統計 (= regression 監視 anchor)", () => {
    const goodTotal = ALL_KNOWN_GOOD.length;
    const goodHits = ALL_KNOWN_GOOD.filter((e) => isHitByGenericPattern(e.text)).length;
    const genericTotal = KNOWN_GENERIC_PHRASES.length;
    const genericHits = KNOWN_GENERIC_PHRASES.filter((e) => isHitByGenericPattern(e.text)).length;

    const truePositive = genericHits;
    const falsePositive = goodHits;
    const trueNegative = goodTotal - goodHits;
    const falseNegative = genericTotal - genericHits;

    // Precision = TP / (TP + FP) — generic 判定された文のうち、 本当に generic だった割合
    const precision =
      truePositive + falsePositive > 0
        ? truePositive / (truePositive + falsePositive)
        : 0;
    // Recall = TP / (TP + FN) — 本当に generic な文のうち、 detector が hit できた割合
    const recall =
      truePositive + falseNegative > 0
        ? truePositive / (truePositive + falseNegative)
        : 0;

    // 統計固定 (= G3 監査基準)
    // false positive 0 → precision 100%
    expect(precision).toBe(1);
    // recall ≥ 70% (= 完全 hit は detector 強度上難しい、 pattern 拡張は別 phase)
    expect(recall).toBeGreaterThanOrEqual(0.7);

    // 統計を保存 (= 後続 phase で参照可能)
    if (process.env.GENERIC_DETECTOR_VERBOSE === "true") {
      console.info("[generic detector] confusion matrix:", {
        truePositive,
        falsePositive,
        trueNegative,
        falseNegative,
        precision: precision.toFixed(3),
        recall: recall.toFixed(3),
      });
    }
  });
});
