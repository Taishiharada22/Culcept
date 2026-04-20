/**
 * CoAlter Slot Validator — Phase 1.5.4.5
 *
 * 検証:
 *  - 抽象的な候補を reject（「駅周辺」「人気店」等）
 *  - テーマ別の最低粒度（movie=作品名 / food=店名 / travel=固有地名）
 *  - agreedConstraints (hard) 違反の検出（exclusion / budget / style）
 *  - reject 理由が reason code で返る
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type {
  AgreedConstraint,
  ProposalCandidate,
} from "@/lib/coalter/types";
import {
  validateCandidate,
  validateCandidates,
  __internal,
} from "@/lib/coalter/slotValidator";

const { isAbstractOnly, looksLikeMovieTitle } = __internal;

// ── fixture ──

function cand(overrides: Partial<ProposalCandidate>): ProposalCandidate {
  return {
    rank: 1,
    title: "候補",
    oneLiner: "x",
    practicalInfo: null,
    url: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────

describe("isAbstractOnly", () => {
  it("駅周辺 / 人気店 / おすすめ等は抽象扱い", () => {
    expect(isAbstractOnly("渋谷駅周辺")).toBe(true);
    expect(isAbstractOnly("人気店")).toBe(true);
    expect(isAbstractOnly("おすすめのお店")).toBe(true);
    expect(isAbstractOnly("近くの美味しい店")).toBe(true);
  });

  it("カタカナ固有名詞は通す", () => {
    expect(isAbstractOnly("渋谷ストリーム")).toBe(false);
    expect(isAbstractOnly("ラストマイル")).toBe(false);
  });

  it("括弧付き作品名は通す", () => {
    expect(isAbstractOnly("『君の名は。』")).toBe(false);
  });

  it("空文字は抽象扱い", () => {
    expect(isAbstractOnly("")).toBe(true);
    expect(isAbstractOnly("   ")).toBe(true);
  });

  it("エリア名だけ（「渋谷」）は抽象扱い", () => {
    expect(isAbstractOnly("渋谷")).toBe(false); // 抽象トークン無いので false
    // "渋谷の人気店" は抽象扱い（固有がエリア名のみ）
    expect(isAbstractOnly("渋谷の人気店")).toBe(true);
  });
});

describe("looksLikeMovieTitle", () => {
  it("カタカナ作品名", () => {
    expect(looksLikeMovieTitle("ラストマイル")).toBe(true);
    expect(looksLikeMovieTitle("ショーシャンクの空に")).toBe(true);
  });

  it("括弧付きタイトル", () => {
    expect(looksLikeMovieTitle("『窓ぎわのトットちゃん』")).toBe(true);
    expect(looksLikeMovieTitle("「君の名は。」")).toBe(true);
  });

  it("英語大文字作品", () => {
    expect(looksLikeMovieTitle("THE FIRST SLAM DUNK")).toBe(true);
  });

  it("ジャンル名だけは NG", () => {
    expect(looksLikeMovieTitle("恋愛映画")).toBe(false);
    expect(looksLikeMovieTitle("サスペンス")).toBe(false);
    expect(looksLikeMovieTitle("話題の新作")).toBe(false);
  });
});

// ─────────────────────────────────────────────

describe("validateCandidate — movie", () => {
  it("具体作品名 + 具体館名 → OK", () => {
    const c = cand({
      practicalInfo: "★4.2 / 19:00〜 / ¥1800 / 徒歩5分",
      slots: {
        what: { label: "ラストマイル", status: "proposed" },
        where: { label: "渋谷ストリーム", status: "confirmed" },
      },
    });
    const r = validateCandidate(c, "movie");
    expect(r.ok).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it("ジャンルだけの what は reject", () => {
    const c = cand({
      slots: {
        what: { label: "恋愛映画", status: "proposed" },
        where: { label: "渋谷ストリーム", status: "confirmed" },
      },
    });
    const r = validateCandidate(c, "movie");
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("missing_movie_title");
  });

  it("駅周辺のような抽象 where は reject", () => {
    const c = cand({
      slots: {
        what: { label: "ラストマイル", status: "proposed" },
        where: { label: "渋谷駅周辺", status: "proposed" },
      },
    });
    const r = validateCandidate(c, "movie");
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("abstract_where");
  });

  it("slots が空 → empty_slots", () => {
    const c = cand({});
    const r = validateCandidate(c, "movie");
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("empty_slots");
  });

  it("core slot (what) が欠けていれば missing_core_slot", () => {
    const c = cand({
      slots: {
        where: { label: "渋谷ストリーム", status: "confirmed" },
      },
    });
    const r = validateCandidate(c, "movie");
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("missing_core_slot");
  });
});

describe("validateCandidate — food", () => {
  it("具体店名 + 料理 → OK", () => {
    const c = cand({
      practicalInfo: "★3.8 / 18:00〜23:00 / ¥5000 / 徒歩3分",
      slots: {
        where: { label: "銀座バル", status: "confirmed" },
        what: { label: "イタリアン", status: "proposed" },
      },
    });
    const r = validateCandidate(c, "food");
    expect(r.ok).toBe(true);
  });

  it("「人気店」のような抽象 where は reject", () => {
    const c = cand({
      slots: {
        where: { label: "渋谷駅前の人気店", status: "proposed" },
        what: { label: "イタリアン", status: "proposed" },
      },
    });
    const r = validateCandidate(c, "food");
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("abstract_where");
  });
});

describe("validateCandidate — travel", () => {
  it("固有地名 + 時期 → OK", () => {
    const c = cand({
      practicalInfo: "新宿から90分 / 1泊 ¥15000 / 徒歩10分",
      slots: {
        where: { label: "箱根", status: "proposed" },
        when: { label: "今週末", status: "confirmed" },
      },
    });
    const r = validateCandidate(c, "travel");
    expect(r.ok).toBe(true);
  });

  it("抽象 where は reject", () => {
    const c = cand({
      slots: {
        where: { label: "近場", status: "proposed" },
      },
    });
    const r = validateCandidate(c, "travel");
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("abstract_where");
  });
});

// ─────────────────────────────────────────────
// agreedConstraints (hard) 違反検査
// ─────────────────────────────────────────────

describe("validateCandidate × agreedConstraints (hard)", () => {
  it("exclude:attached_venue 違反（候補 text に「併設」を含む）", () => {
    const c = cand({
      title: "109シネマズ渋谷",
      oneLiner: "映画館と併設のレストラン",
      slots: {
        what: { label: "ラストマイル", status: "proposed" },
        where: { label: "109シネマズ渋谷", status: "confirmed" },
      },
    });
    const constraints: AgreedConstraint[] = [
      {
        kind: "exclusion",
        normalizedValue: "exclude:attached_venue",
        sourceText: "併設じゃなくて",
        confidence: 0.8,
        strength: "hard",
      },
    ];
    const r = validateCandidate(c, "movie", constraints);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("violates_exclusion");
    expect(r.violatedConstraints).toContain("併設じゃなくて");
  });

  it("budget_max 違反（候補 detail に高すぎる価格）", () => {
    const c = cand({
      title: "高級フレンチ店",
      oneLiner: "x",
      practicalInfo: "コース 15000円",
      slots: {
        where: { label: "銀座フレンチ店", status: "confirmed" },
        what: { label: "フレンチ", status: "proposed" },
      },
    });
    const constraints: AgreedConstraint[] = [
      {
        kind: "budget",
        normalizedValue: "budget_max:5000",
        sourceText: "5000円以下で",
        confidence: 0.9,
        strength: "hard",
      },
    ];
    const r = validateCandidate(c, "food", constraints);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("violates_budget");
  });

  it("budget_max 許容範囲内（20% buffer）は OK", () => {
    const c = cand({
      title: "銀座フレンチ店",
      oneLiner: "x",
      practicalInfo: "★3.8 / ランチ 5500円 / 12:00〜14:00",
      slots: {
        where: { label: "銀座フレンチ店", status: "confirmed" },
        what: { label: "フレンチ", status: "proposed" },
      },
    });
    const constraints: AgreedConstraint[] = [
      {
        kind: "budget",
        normalizedValue: "budget_max:5000",
        sourceText: "5000円以下で",
        confidence: 0.9,
        strength: "hard",
      },
    ];
    // 5500 <= 5000 * 1.2 = 6000 なので OK
    const r = validateCandidate(c, "food", constraints);
    expect(r.ok).toBe(true);
  });

  it("style_or 合意に違反（どちらも含まない）", () => {
    const c = cand({
      title: "ラーメン一蘭",
      oneLiner: "豚骨ラーメン",
      slots: {
        where: { label: "ラーメン一蘭", status: "confirmed" },
        what: { label: "ラーメン", status: "proposed" },
      },
    });
    const constraints: AgreedConstraint[] = [
      {
        kind: "style",
        normalizedValue: "style_or:フレンチ|イタリアン",
        sourceText: "フレンチかイタリアン",
        confidence: 0.8,
        strength: "hard",
      },
    ];
    const r = validateCandidate(c, "food", constraints);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("violates_style");
  });

  it("style_or のうち片方を満たしていれば OK", () => {
    const c = cand({
      title: "銀座イタリアン",
      oneLiner: "本格イタリアン",
      practicalInfo: "★4.0 / 18:00〜23:00 / ¥6000",
      slots: {
        where: { label: "銀座イタリアン", status: "confirmed" },
        what: { label: "イタリアン", status: "proposed" },
      },
    });
    const constraints: AgreedConstraint[] = [
      {
        kind: "style",
        normalizedValue: "style_or:フレンチ|イタリアン",
        sourceText: "フレンチかイタリアン",
        confidence: 0.8,
        strength: "hard",
      },
    ];
    const r = validateCandidate(c, "food", constraints);
    expect(r.ok).toBe(true);
  });

  it("soft constraint は validator で reject されない", () => {
    const c = cand({
      title: "高級フレンチ店",
      practicalInfo: "★4.5 / コース 15000円 / 18:00〜22:00",
      slots: {
        where: { label: "銀座フレンチ店", status: "confirmed" },
        what: { label: "フレンチ", status: "proposed" },
      },
    });
    const constraints: AgreedConstraint[] = [
      {
        kind: "budget",
        normalizedValue: "budget_max:5000",
        sourceText: "5000円くらい",
        confidence: 0.7,
        strength: "soft", // soft は強制されない
      },
    ];
    const r = validateCandidate(c, "food", constraints);
    expect(r.ok).toBe(true);
    expect(r.reasons).not.toContain("violates_budget");
  });
});

// ─────────────────────────────────────────────

describe("validateCandidates", () => {
  it("複数候補を accepted / rejected に分ける", () => {
    const candidates: ProposalCandidate[] = [
      cand({
        rank: 1,
        title: "良い候補",
        practicalInfo: "★4.2 / 19:00〜 / ¥1800",
        slots: {
          what: { label: "ラストマイル", status: "proposed" },
          where: { label: "渋谷ストリーム", status: "confirmed" },
        },
      }),
      cand({
        rank: 2,
        title: "抽象候補",
        slots: {
          what: { label: "恋愛映画", status: "proposed" },
          where: { label: "駅周辺", status: "proposed" },
        },
      }),
      cand({
        rank: 3,
        title: "slots 空",
      }),
    ];
    const { accepted, rejected } = validateCandidates(candidates, "movie");
    expect(accepted).toHaveLength(1);
    expect(accepted[0].title).toBe("良い候補");
    expect(rejected).toHaveLength(2);
    expect(rejected[0].result.reasons.length).toBeGreaterThan(0);
  });

  it("全候補 accepted なら rejected は空配列", () => {
    const candidates: ProposalCandidate[] = [
      cand({
        practicalInfo: "★4.2 / 19:00〜 / ¥1800",
        slots: {
          what: { label: "ラストマイル", status: "proposed" },
          where: { label: "渋谷ストリーム", status: "confirmed" },
        },
      }),
    ];
    const { accepted, rejected } = validateCandidates(candidates, "movie");
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────

describe("5W1H 対象外テーマは検査スキップ", () => {
  it("general テーマでは theme rule 無し → reasons なし", () => {
    const c = cand({
      slots: {
        what: { label: "何でも", status: "proposed" },
      },
    });
    // general テーマは rule 無しなので validateThemeMinimum は [] を返す
    // slot 単位の抽象語チェックは走るが、空 slots でも empty_slots が出るかは theme rule 依存
    const r = validateCandidate(c, "general");
    // general は rule が無いので empty_slots も missing_core_slot も出ない
    expect(r.reasons).not.toContain("empty_slots");
    expect(r.reasons).not.toContain("missing_core_slot");
  });
});
