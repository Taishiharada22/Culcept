/**
 * regexTargetDateFactory — OP-3A / Phase B v3.2 (CEO 2026-05-11)
 *
 * 検証観点:
 *   1. 既存 13 cases (= OP-3A pure factory test、 不破壊)
 *   2. v3.2 unit tests (= 5-layer boundary / 多日 ambiguity / Unicode 等)
 *   3. v3.2 matrix invariant tests (= 数億パターン耐性の invariant 担保)
 *   4. v3.2 timezone invariance (= UTC arithmetic 月末 edge case)
 *
 * Phase B v3.2 設計骨格:
 *   - 5-layer tri-state boundary (= L0 DANGER prefix / L1 EOS-非漢字 /
 *     L2 ACCEPT_WORD_PREFIXES / L3 ACCEPT_KANJI / L4 NAME_SUFFIX + checkNamePattern)
 *   - 多日 ambiguity (= 2+ distinct offsets) → no emit
 *   - factory signature 不変 / ruleId "extractTargetDate" 維持
 *   - `\p{Script=Han}/u` + `codePointAt` + `charBefore` で code-point safe
 *   - `computeJstDateFromOffset` UTC arithmetic で TZ-invariant
 *
 * 注意: 一部 test は `vi.useFakeTimers` + `vi.setSystemTime` で `new Date()` を
 *       固定する (= 厳密日付値検証用)。 既存 13 cases は format check のみで
 *       fake timer 不要。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  regexTargetDateFactory,
  type RegexTargetDateInput,
} from "@/lib/alter-morning/comprehension/operationFactories/regexTargetDateFactory";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 既存 13 cases (= OP-3A 不破壊 regression)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("regexTargetDateFactory (OP-3A)", () => {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 空配列 case
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("utterance 空文字 → 空配列", () => {
    const result = regexTargetDateFactory({ utterance: "" });
    expect(result).toEqual([]);
  });

  it("日付 signal なし → 空配列 (= 「カフェに行く」)", () => {
    const result = regexTargetDateFactory({ utterance: "カフェに行く" });
    expect(result).toEqual([]);
  });

  it("「今日」 → 空配列 (= extractTargetDate は undefined を返す既存挙動)", () => {
    // intentParser.ts:911: 「今日」 は明示的に undefined を返す = factory は空配列
    const result = regexTargetDateFactory({ utterance: "今日は仕事だ" });
    expect(result).toEqual([]);
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 「明日」 / 「明後日」 → envelope 1 件
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("「明日」 → envelope 1 件 (regex_deterministic / 600 / high)", () => {
    const result = regexTargetDateFactory({ utterance: "明日のプラン" });
    expect(result).toHaveLength(1);
    const env = result[0];
    expect(env.type).toBe("set_target_date");
    expect(env.source).toBe("regex_deterministic");
    expect(env.priority).toBe(600);
    expect(env.confidence).toBe("high");
    expect(env.provenance.source_type).toBe("utterance");
    expect(env.provenance.from_utterance).toBe(true);
    // payload.date は "YYYY-MM-DD" 形式
    expect(env.payload.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("「明後日」 → envelope 1 件", () => {
    const result = regexTargetDateFactory({ utterance: "明後日のミーティング" });
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("regex_deterministic");
    expect(result[0].payload.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("「明日 8 時」 → envelope 1 件 (= 時刻併存しても extractTargetDate は明日を抽出)", () => {
    const result = regexTargetDateFactory({ utterance: "明日 8 時に渋谷" });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("set_target_date");
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // trace
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("trace.ruleId = 'extractTargetDate'", () => {
    const result = regexTargetDateFactory({ utterance: "明日カフェ" });
    expect(result[0].trace?.ruleId).toBe("extractTargetDate");
  });

  it("sourceTurnIndex 指定 → trace.sourceTurnIndex に反映", () => {
    const result = regexTargetDateFactory({
      utterance: "明後日のプラン",
      sourceTurnIndex: 3,
    });
    expect(result[0].trace?.sourceTurnIndex).toBe(3);
    expect(result[0].trace?.ruleId).toBe("extractTargetDate");
  });

  it("sourceTurnIndex 未指定 → trace は ruleId のみ", () => {
    const result = regexTargetDateFactory({ utterance: "明日" });
    expect(result[0].trace?.ruleId).toBe("extractTargetDate");
    expect(result[0].trace?.sourceTurnIndex).toBeUndefined();
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // pure function
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("input mutate しない (= pure)", () => {
    const input: RegexTargetDateInput = {
      utterance: "明日のプラン",
      sourceTurnIndex: 1,
    };
    const inputSnapshot = JSON.stringify(input);
    regexTargetDateFactory(input);
    expect(JSON.stringify(input)).toBe(inputSnapshot);
  });

  it("同じ input で同じ shape (= pure)", () => {
    // 注: extractTargetDate は new Date() を使うので payload.date は実行時刻に依存。
    // ここでは shape のみ pure であることを検証。
    const input: RegexTargetDateInput = { utterance: "明後日" };
    const r1 = regexTargetDateFactory(input);
    const r2 = regexTargetDateFactory(input);
    expect(r1).toHaveLength(r2.length);
    expect(r1[0]?.source).toBe(r2[0]?.source);
    expect(r1[0]?.priority).toBe(r2[0]?.priority);
    expect(r1[0]?.confidence).toBe(r2[0]?.confidence);
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // provenance shape
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("provenance.source_span は空配列 (= extractTargetDate は個別 span 不返却)", () => {
    const result = regexTargetDateFactory({ utterance: "明日カフェ" });
    expect(result[0].provenance.source_span).toEqual([]);
  });

  it("provenance.provenance_confidence は high", () => {
    const result = regexTargetDateFactory({ utterance: "明後日" });
    expect(result[0].provenance.provenance_confidence).toBe("high");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase B v3.2 helpers: fake timer setup for date-strict tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Fake "now" = 2026-05-10 06:00:00 UTC = 2026-05-10 15:00:00 JST
 *
 * 期待 JST date (= computeJstDateFromOffset):
 *   offset -2 → 2026-05-08 (一昨日)
 *   offset -1 → 2026-05-09 (昨日)
 *   offset  0 → 2026-05-10 (今日、 ただし factory は no emit)
 *   offset +1 → 2026-05-11 (明日)
 *   offset +2 → 2026-05-12 (明後日 / あさって)
 *   offset +3 → 2026-05-13 (明明後日 / しあさって)
 */
const FAKE_NOW = new Date("2026-05-10T06:00:00Z");
const DATE_TOMORROW = "2026-05-11";
const DATE_DAY_AFTER = "2026-05-12";
const DATE_DAY_AFTER_AFTER = "2026-05-13";
const DATE_YESTERDAY = "2026-05-09";
const DATE_DAY_BEFORE_YESTERDAY = "2026-05-08";

function useFakeTime(): void {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase B v3.2 — unit tests (= category A〜S)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase B v3.2 — unit tests", () => {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // A. ACCEPT regression (= 既存挙動の維持)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("A. ACCEPT regression", () => {
    useFakeTime();

    it("「明日」 単独 → +1", () => {
      const r = regexTargetDateFactory({ utterance: "明日" });
      expect(r).toHaveLength(1);
      expect(r[0].payload.date).toBe(DATE_TOMORROW);
    });

    it("「明後日」 単独 → +2", () => {
      const r = regexTargetDateFactory({ utterance: "明後日" });
      expect(r[0].payload.date).toBe(DATE_DAY_AFTER);
    });

    it("「昨日」 単独 → -1", () => {
      const r = regexTargetDateFactory({ utterance: "昨日" });
      expect(r[0].payload.date).toBe(DATE_YESTERDAY);
    });

    it("「一昨日」 単独 → -2", () => {
      const r = regexTargetDateFactory({ utterance: "一昨日" });
      expect(r[0].payload.date).toBe(DATE_DAY_BEFORE_YESTERDAY);
    });

    it("「あさって」 単独 → +2", () => {
      const r = regexTargetDateFactory({ utterance: "あさって" });
      expect(r[0].payload.date).toBe(DATE_DAY_AFTER);
    });

    it("「おととい」 単独 → -2", () => {
      const r = regexTargetDateFactory({ utterance: "おととい" });
      expect(r[0].payload.date).toBe(DATE_DAY_BEFORE_YESTERDAY);
    });

    it("「明明後日」 単独 → +3 (= 長 token 優先)", () => {
      const r = regexTargetDateFactory({ utterance: "明明後日" });
      expect(r[0].payload.date).toBe(DATE_DAY_AFTER_AFTER);
    });

    it("「しあさって」 単独 → +3 (= 長 token 優先)", () => {
      const r = regexTargetDateFactory({ utterance: "しあさって" });
      expect(r[0].payload.date).toBe(DATE_DAY_AFTER_AFTER);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // B. ACCEPT 時刻 KANJI (= 朝/昼/夜/中/頃/午/深 等)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("B. ACCEPT 時刻 KANJI", () => {
    useFakeTime();

    const cases: Array<[string, string]> = [
      ["明日朝", DATE_TOMORROW],
      ["明日昼", DATE_TOMORROW],
      ["明日夜", DATE_TOMORROW],
      ["明日中", DATE_TOMORROW],
      ["明日頃", DATE_TOMORROW],
      ["明日午前", DATE_TOMORROW],
      ["明日深夜", DATE_TOMORROW],
    ];
    for (const [input, expected] of cases) {
      it(`「${input}」 → ${expected}`, () => {
        const r = regexTargetDateFactory({ utterance: input });
        expect(r[0].payload.date).toBe(expected);
      });
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // C. ACCEPT 活動 KANJI (= 会/仕/出/病/学/面 等)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("C. ACCEPT 活動 KANJI", () => {
    useFakeTime();

    const cases: Array<[string, string]> = [
      ["明日会議", DATE_TOMORROW],
      ["明日仕事", DATE_TOMORROW],
      ["明日出張", DATE_TOMORROW],
      ["明日病院", DATE_TOMORROW],
      ["明日学校", DATE_TOMORROW],
      ["明日面接", DATE_TOMORROW],
      ["明日打合せ", DATE_TOMORROW],
      ["明日授業", DATE_TOMORROW],
      ["明日試験", DATE_TOMORROW],
      ["明日通院", DATE_TOMORROW],
      ["明日帰宅", DATE_TOMORROW],
      ["明日旅行", DATE_TOMORROW],
      ["明日入院", DATE_TOMORROW],
      ["明日予定", DATE_TOMORROW],
      ["明日集合", DATE_TOMORROW],
      ["明日練習", DATE_TOMORROW],
      ["明日研修", DATE_TOMORROW],
      ["明日訪問", DATE_TOMORROW],
    ];
    for (const [input, expected] of cases) {
      it(`「${input}」 → ${expected}`, () => {
        const r = regexTargetDateFactory({ utterance: input });
        expect(r[0].payload.date).toBe(expected);
      });
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // D. ACCEPT 非漢字境界 (= 句読点 / 空白 / ひらがな / カタカナ / 数字 / 英字)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("D. ACCEPT 非漢字境界", () => {
    useFakeTime();

    const cases: Array<[string, string]> = [
      ["明日、渋谷", DATE_TOMORROW],
      ["明日。", DATE_TOMORROW],
      ["明日!", DATE_TOMORROW],
      ["明日?", DATE_TOMORROW],
      ["明日 渋谷", DATE_TOMORROW],
      ["明日　仕事", DATE_TOMORROW], // 全角空白
      ["明日\n用事", DATE_TOMORROW],
      ["明日\tランチ", DATE_TOMORROW],
      ["明日は渋谷", DATE_TOMORROW],
      ["明日も渋谷", DATE_TOMORROW],
      ["明日に行く", DATE_TOMORROW],
      ["明日のプラン", DATE_TOMORROW],
      ["明日まで", DATE_TOMORROW],
      ["明日から", DATE_TOMORROW],
      ["明日ランチ", DATE_TOMORROW],
      ["明日ミーティング", DATE_TOMORROW],
      ["明日19時", DATE_TOMORROW],
      ["明日８時", DATE_TOMORROW], // 全角数字
      ["明日OK", DATE_TOMORROW],
      ["明日Zoom", DATE_TOMORROW],
      ["明日Ｚｏｏｍ", DATE_TOMORROW], // 全角英字
      ["明日🎉", DATE_TOMORROW],
      ["明日(備考)", DATE_TOMORROW],
      ["明日「会議」", DATE_TOMORROW],
    ];
    for (const [input, expected] of cases) {
      it(`「${input}」 → ${expected}`, () => {
        const r = regexTargetDateFactory({ utterance: input });
        expect(r[0].payload.date).toBe(expected);
      });
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // E. ACCEPT_WORD_PREFIXES Tier 0 (= GPT 指摘 fix + v3.2 拡張)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("E. ACCEPT_WORD_PREFIXES Tier 0", () => {
    useFakeTime();

    const cases: Array<[string, string]> = [
      // 美/子/花/麻/香 系 compound
      ["明日美容院に行く", DATE_TOMORROW],
      ["明日美容室", DATE_TOMORROW],
      ["明日美容", DATE_TOMORROW],
      ["明日美術館", DATE_TOMORROW],
      ["明日美術", DATE_TOMORROW],
      ["明日子供と公園", DATE_TOMORROW],
      ["明日子どもと出かける", DATE_TOMORROW],
      ["明日花火大会", DATE_TOMORROW],
      ["明日花火", DATE_TOMORROW],
      ["明日花見", DATE_TOMORROW],
      ["明日麻雀", DATE_TOMORROW],
      ["明日香水買う", DATE_TOMORROW],
      // 曜日 series
      ["明日月曜", DATE_TOMORROW],
      ["明日月曜日", DATE_TOMORROW],
      ["明日火曜", DATE_TOMORROW],
      ["明日火曜日", DATE_TOMORROW],
      ["明日水曜", DATE_TOMORROW],
      ["明日水曜日", DATE_TOMORROW],
      ["明日木曜", DATE_TOMORROW],
      ["明日木曜日", DATE_TOMORROW],
      ["明日金曜", DATE_TOMORROW],
      ["明日金曜日", DATE_TOMORROW],
      ["明日土曜", DATE_TOMORROW],
      ["明日土曜日", DATE_TOMORROW],
      ["明日日曜", DATE_TOMORROW],
      ["明日日曜日", DATE_TOMORROW],
      // 日タイプ
      ["明日祝日", DATE_TOMORROW],
      ["明日休日", DATE_TOMORROW],
      ["明日平日", DATE_TOMORROW],
      // 休 series (= 6 entries、 v3.2 CEO 補正で 休む/休ん 追加)
      ["明日休み", DATE_TOMORROW],
      ["明日休暇", DATE_TOMORROW],
      ["明日休校", DATE_TOMORROW],
      ["明日休業", DATE_TOMORROW],
      ["明日休む", DATE_TOMORROW],
      ["明日休むつもり", DATE_TOMORROW],
      ["明日休む予定", DATE_TOMORROW],
      ["明日休んでいい?", DATE_TOMORROW],
      ["明日休んで病院行く", DATE_TOMORROW],
      ["明日休んだほうがいい", DATE_TOMORROW],
    ];
    for (const [input, expected] of cases) {
      it(`「${input}」 → ${expected}`, () => {
        const r = regexTargetDateFactory({ utterance: input });
        expect(r[0].payload.date).toBe(expected);
      });
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // F. REJECT name 単独 / 敬称 (= Issue #98 主)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("F. REJECT name 単独 / 敬称", () => {
    const cases: string[] = [
      "明日香",
      "明日子",
      "明日美",
      "明日華",
      "明日菜",
      "明日奈",
      "明日花",
      "今日子",
      "昨日子",
      "明後日香",
      "明日香さん",
      "明日香ちゃん",
      "明日香くん",
      "明日子先生",
      "明日香様",
    ];
    for (const input of cases) {
      it(`「${input}」 → no emit`, () => {
        expect(regexTargetDateFactory({ utterance: input })).toEqual([]);
      });
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // G. REJECT 多字 name (= NAME + NAME)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("G. REJECT 多字 name", () => {
    const cases: string[] = [
      "明日香美",
      "明日香子",
      "明日香奈",
      "明日麻紀",
    ];
    for (const input of cases) {
      it(`「${input}」 → no emit`, () => {
        expect(regexTargetDateFactory({ utterance: input })).toEqual([]);
      });
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // H. REJECT name + 句読点 (= 名前単独切れ)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("H. REJECT name + 句読点", () => {
    const cases: string[] = [
      "明日香、",
      "明日香。",
      "明日香!",
      "明日子?",
    ];
    for (const input of cases) {
      // 注: これら単独 utterance は REJECT。 後続に別 ACCEPT 明日があれば emit
      // するケースは category K で検証。
      it(`「${input}」 単独 → no emit`, () => {
        expect(regexTargetDateFactory({ utterance: input })).toEqual([]);
      });
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // I. UNKNOWN 曖昧 compound
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("I. UNKNOWN 曖昧 compound", () => {
    // 注: 散歩 は ACCEPT_KANJI (= 散) に含まれるため emit。 UNKNOWN 列挙には含めない。
    const cases: string[] = [
      "明日香澄",
      "明日香村",
      "明日経済について",
      "明日東京に行く",
      "明日山田と会う",
      "明日撮影",
      "明日法事",
    ];
    for (const input of cases) {
      it(`「${input}」 → no emit (= UNKNOWN)`, () => {
        expect(regexTargetDateFactory({ utterance: input })).toEqual([]);
      });
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // J. 長 token 優先 (= 明明後日 / しあさって overlap dedup)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("J. 長 token 優先", () => {
    useFakeTime();

    it("「明明後日朝」 → +3 (= overlap dedup で 明明後日 勝利)", () => {
      const r = regexTargetDateFactory({ utterance: "明明後日朝" });
      expect(r[0].payload.date).toBe(DATE_DAY_AFTER_AFTER);
    });

    it("「しあさってランチ」 → +3 (= overlap dedup で しあさって 勝利)", () => {
      const r = regexTargetDateFactory({ utterance: "しあさってランチ" });
      expect(r[0].payload.date).toBe(DATE_DAY_AFTER_AFTER);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // K. 複数 occurrence 救済 (= 第1 REJECT/UNKNOWN、 第2 ACCEPT)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("K. 複数 occurrence 救済", () => {
    useFakeTime();

    it("「明日香、明日ランチ」 → +1 (= 香 REJECT、 ラ ACCEPT)", () => {
      const r = regexTargetDateFactory({ utterance: "明日香、明日ランチ" });
      expect(r[0].payload.date).toBe(DATE_TOMORROW);
    });

    it("「今日子と明日会議」 → +1 (= 今日 UNKNOWN、 明日 ACCEPT)", () => {
      const r = regexTargetDateFactory({ utterance: "今日子と明日会議" });
      expect(r[0].payload.date).toBe(DATE_TOMORROW);
    });

    it("「明日香さんと明後日会議」 → +2 (= 明日 REJECT、 明後日 ACCEPT)", () => {
      const r = regexTargetDateFactory({ utterance: "明日香さんと明後日会議" });
      expect(r[0].payload.date).toBe(DATE_DAY_AFTER);
    });

    it("「明日明日明日仕事」 → +1 (= 末尾 ACCEPT 救済)", () => {
      const r = regexTargetDateFactory({ utterance: "明日明日明日仕事" });
      expect(r[0].payload.date).toBe(DATE_TOMORROW);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // L. DANGER_PREFIX (= 不/未/非/無/説/解/究/証/判 が prev kanji)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("L. DANGER_PREFIX 弾き", () => {
    useFakeTime();

    it("「不明日だが明日会議」 → +1 (= 不明日 弾き、 明日会議 ACCEPT)", () => {
      const r = regexTargetDateFactory({ utterance: "不明日だが明日会議" });
      expect(r[0].payload.date).toBe(DATE_TOMORROW);
    });

    it("「説明日が明日です」 → +1 (= 説明日 弾き、 明日 ACCEPT)", () => {
      const r = regexTargetDateFactory({ utterance: "説明日が明日です" });
      expect(r[0].payload.date).toBe(DATE_TOMORROW);
    });

    it("「判明日が明日です」 → +1 (= 判明日 弾き、 明日 ACCEPT)", () => {
      const r = regexTargetDateFactory({ utterance: "判明日が明日です" });
      expect(r[0].payload.date).toBe(DATE_TOMORROW);
    });

    it("「証明日について話す」 → no emit (= 証明日 のみ、 後続救済なし)", () => {
      expect(
        regexTargetDateFactory({ utterance: "証明日について話す" }),
      ).toEqual([]);
    });

    it("「会議明日」 (= 圧縮表現、 議 は DANGER 非該当) → +1", () => {
      const r = regexTargetDateFactory({ utterance: "会議明日" });
      expect(r[0].payload.date).toBe(DATE_TOMORROW);
    });

    it("「予定は明日」 (= prev = は hiragana) → +1", () => {
      const r = regexTargetDateFactory({ utterance: "予定は明日" });
      expect(r[0].payload.date).toBe(DATE_TOMORROW);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // M. Unicode / SMP / 全角
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("M. Unicode / SMP", () => {
    useFakeTime();

    it("「明日𠮷さんと打合せ」 (= SMP 漢字直接接続) → no emit (= UNKNOWN)", () => {
      expect(
        regexTargetDateFactory({ utterance: "明日𠮷さんと打合せ" }),
      ).toEqual([]);
    });

    it("「明日 𠮷さんと打合せ」 (= 半角空白で境界成立) → +1", () => {
      const r = regexTargetDateFactory({ utterance: "明日 𠮷さんと打合せ" });
      expect(r[0].payload.date).toBe(DATE_TOMORROW);
    });

    it("「明日、𠮷さんと打合せ」 (= 句読点で境界成立) → +1", () => {
      const r = regexTargetDateFactory({ utterance: "明日、𠮷さんと打合せ" });
      expect(r[0].payload.date).toBe(DATE_TOMORROW);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // N. hiragana date token boundary
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("N. hiragana date token boundary", () => {
    useFakeTime();

    const cases: Array<[string, string]> = [
      ["あさってランチ", DATE_DAY_AFTER],
      ["あさっての朝", DATE_DAY_AFTER],
      ["あさって、", DATE_DAY_AFTER],
      ["おとといから", DATE_DAY_BEFORE_YESTERDAY],
      ["おとといゲーム", DATE_DAY_BEFORE_YESTERDAY],
    ];
    for (const [input, expected] of cases) {
      it(`「${input}」 → ${expected}`, () => {
        const r = regexTargetDateFactory({ utterance: input });
        expect(r[0].payload.date).toBe(expected);
      });
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // O. defensive (= 空 / 日付なし)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("O. defensive", () => {
    it("空 utterance → 空配列", () => {
      expect(regexTargetDateFactory({ utterance: "" })).toEqual([]);
    });

    it("日付 signal 完全になし → 空配列", () => {
      expect(regexTargetDateFactory({ utterance: "渋谷でランチ" })).toEqual([]);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // P. negative regression (= 日付 token 不在)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("P. negative regression", () => {
    const cases: string[] = [
      "ランチ",
      "渋谷",
      "予定として、ランチを入れたい",
      "香水を買う", // 香 単独だが date token 不在
    ];
    for (const input of cases) {
      it(`「${input}」 → no emit`, () => {
        expect(regexTargetDateFactory({ utterance: input })).toEqual([]);
      });
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Q. Issue #98 主 — 「予定として、明日香さんとランチを入れたい」
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("Q. Issue #98 主", () => {
    it("「予定として、明日香さんとランチを入れたい」 → no emit", () => {
      expect(
        regexTargetDateFactory({
          utterance: "予定として、明日香さんとランチを入れたい",
        }),
      ).toEqual([]);
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase B v3.2 — matrix invariant tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase B v3.2 — matrix invariant tests", () => {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1. UNKNOWN kanji × 明日 → no emit (= 数億パターン耐性の本質 invariant)
  //
  // 列挙: ACCEPT_KANJI / NAME_SUFFIX_KANJI / DANGER_PREFIX_KANJI /
  //       ACCEPT_WORD_PREFIXES starter kanji いずれにも含まれない常用漢字
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("invariant 1: UNKNOWN kanji × 明日 → no emit", () => {
    const UNKNOWN_KANJI: readonly string[] = [
      "山", "川", "池", "海", "空", "雨", "雪", "風", "星",
      "国", "道", "駅", "港", "橋", "街", "町", "県", "市", "区",
      "東", "西", "南", "北",
      "大", "小", "新", "旧", "高", "低", "長", "短", "広", "狭",
      "遠", "近", "多", "少", "強", "弱", "重", "軽",
      "硬", "軟", "速", "古", "色",
      "政", "社", "自", "鳥", "魚", "虫", "蛇",
      "牛", "馬", "猫",
      "問", "科", "芸", "音", "絵",
      "映", "劇", "詩", "歌", "語", "言",
      "書", "読", "事", "時",
      "週", "季", "春", "夏", "秋", "冬",
      "雷", "霧",
    ];
    for (const k of UNKNOWN_KANJI) {
      it(`「明日${k}」 → no emit`, () => {
        expect(regexTargetDateFactory({ utterance: `明日${k}` })).toEqual([]);
      });
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2. ACCEPT_KANJI × 明日 → emit (+1)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("invariant 2: ACCEPT_KANJI × 明日 → emit (+1)", () => {
    useFakeTime();

    const ACCEPT_KANJI_LIST: readonly string[] = [
      "朝", "昼", "夜", "晩", "夕", "中", "頃", "内", "末", "早", "深", "午",
      "会", "仕", "出", "病", "学", "面", "打", "授", "講", "試", "検", "治",
      "通", "残", "旅", "部", "食", "飲", "散", "帰", "来", "入", "退", "予",
      "約", "集", "練", "研", "訪", "招",
    ];
    for (const k of ACCEPT_KANJI_LIST) {
      it(`「明日${k}」 → emit ${DATE_TOMORROW}`, () => {
        const r = regexTargetDateFactory({ utterance: `明日${k}` });
        expect(r).toHaveLength(1);
        expect(r[0].source).toBe("regex_deterministic");
        expect(r[0].payload.date).toBe(DATE_TOMORROW);
      });
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3. NAME_SUFFIX_KANJI × {EOS, 敬称, 句読点} → no emit
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("invariant 3: NAME_SUFFIX × {EOS, さん, 、} → no emit", () => {
    const NAME_SUFFIX_LIST: readonly string[] = [
      "香", "子", "美", "華", "菜", "奈", "花",
      "江", "代", "恵", "紀", "沙", "麻",
      "太", "郎", "平", "介", "助", "之",
    ];
    const CONTEXTS: ReadonlyArray<{ suffix: string; label: string }> = [
      { suffix: "", label: "EOS" },
      { suffix: "さん", label: "敬称" },
      { suffix: "、", label: "句読点" },
    ];
    for (const k of NAME_SUFFIX_LIST) {
      for (const { suffix, label } of CONTEXTS) {
        it(`「明日${k}${suffix}」 (= ${label}) → no emit`, () => {
          expect(
            regexTargetDateFactory({ utterance: `明日${k}${suffix}` }),
          ).toEqual([]);
        });
      }
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 4. ACCEPT_WORD_PREFIXES Tier 0 × 明日 → emit (+1)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("invariant 4: ACCEPT_WORD_PREFIXES Tier 0 × 明日 → emit (+1)", () => {
    useFakeTime();

    const TIER_0: readonly string[] = [
      // 美/子/花/麻/香 系
      "美容院", "美容室", "美容", "美術館", "美術",
      "子供", "子ども",
      "花火大会", "花火", "花見",
      "麻雀", "香水",
      // 曜日 series
      "月曜", "月曜日", "火曜", "火曜日", "水曜", "水曜日",
      "木曜", "木曜日", "金曜", "金曜日", "土曜", "土曜日",
      "日曜", "日曜日",
      // 日タイプ
      "祝日", "休日", "平日",
      // 休 series (= 6 entries、 v3.2 CEO 補正で 休む/休ん 追加)
      "休み", "休暇", "休校", "休業", "休む", "休ん",
    ];
    for (const w of TIER_0) {
      it(`「明日${w}」 → emit ${DATE_TOMORROW}`, () => {
        const r = regexTargetDateFactory({ utterance: `明日${w}` });
        expect(r).toHaveLength(1);
        expect(r[0].payload.date).toBe(DATE_TOMORROW);
      });
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 5a. DANGER_PREFIX × 明日 substring → no emit
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("invariant 5a: DANGER_PREFIX × 明日 substring → no emit", () => {
    const DANGER: readonly string[] = [
      "不", "未", "非", "無", "説", "解", "究", "証", "判",
    ];
    for (const d of DANGER) {
      it(`「${d}明日に予定」 → no emit (= prev DANGER prefix)`, () => {
        expect(
          regexTargetDateFactory({ utterance: `${d}明日に予定` }),
        ).toEqual([]);
      });
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 5b. DANGER_PREFIX 弾き + 後続 ACCEPT 救済 (= GPT 指摘 v3.2)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("invariant 5b: DANGER 弾き + 後続 ACCEPT 救済", () => {
    useFakeTime();

    it("「説明日が明日です」 → +1 (= 第1 DANGER、 第2 ACCEPT)", () => {
      const r = regexTargetDateFactory({ utterance: "説明日が明日です" });
      expect(r[0].payload.date).toBe(DATE_TOMORROW);
    });

    it("「判明日が明日です」 → +1 (= 第1 DANGER、 第2 ACCEPT)", () => {
      const r = regexTargetDateFactory({ utterance: "判明日が明日です" });
      expect(r[0].payload.date).toBe(DATE_TOMORROW);
    });

    it("「不明日だが明日会議」 → +1 (= 第1 DANGER、 第2 ACCEPT)", () => {
      const r = regexTargetDateFactory({ utterance: "不明日だが明日会議" });
      expect(r[0].payload.date).toBe(DATE_TOMORROW);
    });

    it("「証明日について話す」 → no emit (= DANGER のみ、 救済なし)", () => {
      expect(
        regexTargetDateFactory({ utterance: "証明日について話す" }),
      ).toEqual([]);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 6. Long-token overlap → longest が dedup で勝つ
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("invariant 6: long-token overlap", () => {
    useFakeTime();

    const cases: Array<[string, string]> = [
      ["明明後日", DATE_DAY_AFTER_AFTER],
      ["しあさって", DATE_DAY_AFTER_AFTER],
      ["明明後日の朝", DATE_DAY_AFTER_AFTER],
      ["しあさってに", DATE_DAY_AFTER_AFTER],
    ];
    for (const [input, expected] of cases) {
      it(`「${input}」 → ${expected}`, () => {
        const r = regexTargetDateFactory({ utterance: input });
        expect(r).toHaveLength(1);
        expect(r[0].payload.date).toBe(expected);
      });
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 7. 多日 ambiguity (= 2+ distinct offsets) → no emit
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("invariant 7: multi-date ambiguity → no emit", () => {
    const cases: string[] = [
      "明日と明後日",
      "明後日と明日",
      "明日か明後日",
      "明日から明後日まで",
      "今日と明日と明後日",
      "明日と昨日",
    ];
    for (const input of cases) {
      it(`「${input}」 → no emit (= multi-date ambiguity)`, () => {
        expect(regexTargetDateFactory({ utterance: input })).toEqual([]);
      });
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase B v3.2 — timezone invariance (= UTC arithmetic 月末 edge case)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase B v3.2 — timezone invariance", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("JST 月末 23:00 「明日」 → 翌月 1 日 (= +1 日のみ、 +2 日ずれない)", () => {
    // JST 2026-05-31 23:00 = UTC 2026-05-31 14:00
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-31T14:00:00Z"));
    const r = regexTargetDateFactory({ utterance: "明日" });
    expect(r[0].payload.date).toBe("2026-06-01");
  });

  it("JST 月末 23:00 「明後日」 → 翌月 2 日", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-31T14:00:00Z"));
    const r = regexTargetDateFactory({ utterance: "明後日" });
    expect(r[0].payload.date).toBe("2026-06-02");
  });

  it("JST 年末 23:00 「明日」 → 翌年 1 月 1 日", () => {
    // JST 2026-12-31 23:00 = UTC 2026-12-31 14:00
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T14:00:00Z"));
    const r = regexTargetDateFactory({ utterance: "明日" });
    expect(r[0].payload.date).toBe("2027-01-01");
  });

  it("JST 月初 00:30 「明日」 → 同月 2 日", () => {
    // JST 2026-06-01 00:30 = UTC 2026-05-31 15:30
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-31T15:30:00Z"));
    const r = regexTargetDateFactory({ utterance: "明日" });
    expect(r[0].payload.date).toBe("2026-06-02");
  });

  it("JST 午前 09:00 「昨日」 → 前日", () => {
    // JST 2026-05-15 09:00 = UTC 2026-05-15 00:00
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T00:00:00Z"));
    const r = regexTargetDateFactory({ utterance: "昨日" });
    expect(r[0].payload.date).toBe("2026-05-14");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase B v3.2 — multi-date policy 詳細検証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase B v3.2 — multi-date policy", () => {
  useFakeTime();

  it("「今日と明日」 → no emit (= 0 と +1 で 2 distinct offsets)", () => {
    expect(regexTargetDateFactory({ utterance: "今日と明日" })).toEqual([]);
  });

  it("「今日か明日」 → no emit", () => {
    expect(regexTargetDateFactory({ utterance: "今日か明日" })).toEqual([]);
  });

  it("「明日と明後日でやる」 → no emit (= +1 と +2)", () => {
    expect(
      regexTargetDateFactory({ utterance: "明日と明後日でやる" }),
    ).toEqual([]);
  });

  it("「明日か明後日ランチ」 → no emit", () => {
    expect(
      regexTargetDateFactory({ utterance: "明日か明後日ランチ" }),
    ).toEqual([]);
  });

  it("「明日と明日」 (= 同 offset 反復) → +1 (= unique offset)", () => {
    const r = regexTargetDateFactory({ utterance: "明日と明日" });
    expect(r).toHaveLength(1);
    expect(r[0].payload.date).toBe(DATE_TOMORROW);
  });

  it("「明日も明日も明日も」 (= 反復 3 回) → +1", () => {
    const r = regexTargetDateFactory({ utterance: "明日も明日も明日も" });
    expect(r[0].payload.date).toBe(DATE_TOMORROW);
  });

  it("「今日子と明日学校」 (= 今日子 UNKNOWN、 明日学校 ACCEPT) → +1", () => {
    const r = regexTargetDateFactory({ utterance: "今日子と明日学校" });
    expect(r[0].payload.date).toBe(DATE_TOMORROW);
  });

  it("「明日香、明日仕事」 (= 第1 REJECT、 第2 ACCEPT) → +1", () => {
    const r = regexTargetDateFactory({ utterance: "明日香、明日仕事" });
    expect(r[0].payload.date).toBe(DATE_TOMORROW);
  });
});
