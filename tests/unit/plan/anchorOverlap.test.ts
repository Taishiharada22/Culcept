/**
 * Anchor Overlap Detection — pure helper tests (Phase 2-E)
 *
 * 設計書: docs/alter-plan-phase2-e-time-overlap-mini-design.md §4, §7, §8
 *
 * 検証範囲:
 *   - detectTimedAnchorOverlaps の判定
 *     - 基本 (overlap detection): 5 ケース
 *     - defensive skip (untimed / inverted / zero-duration): 5 ケース
 *     - 3 件以上 / boundary: 3 ケース
 *     - malformed / 範囲外: 3 ケース
 *     - multi-day / midnight cross 安全性: 1 ケース
 *     - recurring / sensitive: 2 ケース
 *     - pure / immutability: 2 ケース
 *   - isAnchorOverlapping (Set.has wrap): 1 ケース
 *
 * GPT 補正 (2026-05-21):
 *   - sensitive anchor も時刻重なり判定の対象 (= 3 tab Cross-tab 一貫性)
 *   - 時刻重なり indicator は外部送信でも場所情報でもない
 */

import { describe, it, expect } from "vitest";

import type {
  ExternalAnchor,
  OneOffExternalAnchor,
  RecurringExternalAnchor,
  AnchorSensitiveCategory,
} from "@/lib/plan/external-anchor";
import {
  detectTimedAnchorOverlaps,
  isAnchorOverlapping,
} from "@/lib/plan/anchorOverlap";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test fixture builders
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface OneOffFixture {
  id: string;
  startTime?: string | null;
  endTime?: string | null;
  sensitive?: AnchorSensitiveCategory;
}

function oneOff(opts: OneOffFixture): OneOffExternalAnchor {
  const anchor: OneOffExternalAnchor = {
    id: opts.id,
    userId: "u-test",
    title: `anchor-${opts.id}`,
    // null を意図的に通すために cast (helper の defensive 性 test)
    startTime: (opts.startTime ?? undefined) as string,
    rigidity: "soft",
    sourceId: "src-test",
    confirmedAt: "2026-05-21T00:00:00Z",
    anchorKind: "one_off",
    date: "2026-05-25", // 月曜
  };
  if (opts.endTime !== undefined) {
    anchor.endTime = (opts.endTime ?? undefined) as string;
  }
  if (opts.sensitive) {
    anchor.sensitiveCategory = opts.sensitive;
  }
  return anchor;
}

function recurring(opts: { id: string; startTime: string; endTime: string }): RecurringExternalAnchor {
  return {
    id: opts.id,
    userId: "u-test",
    title: `anchor-${opts.id}`,
    startTime: opts.startTime,
    endTime: opts.endTime,
    rigidity: "soft",
    sourceId: "src-test",
    confirmedAt: "2026-05-21T00:00:00Z",
    anchorKind: "recurring",
    validFrom: "2026-01-01",
    recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("detectTimedAnchorOverlaps", () => {
  // ─── 基本判定 (overlap detection) ───

  describe("基本判定 (overlap detection)", () => {
    it("完全別時刻 (09-10 / 11-12) → empty Set", () => {
      const r = detectTimedAnchorOverlaps([
        oneOff({ id: "a", startTime: "09:00", endTime: "10:00" }),
        oneOff({ id: "b", startTime: "11:00", endTime: "12:00" }),
      ]);
      expect(r.size).toBe(0);
    });

    it("完全重複 (09-10 / 09-10) → 両 id", () => {
      const r = detectTimedAnchorOverlaps([
        oneOff({ id: "a", startTime: "09:00", endTime: "10:00" }),
        oneOff({ id: "b", startTime: "09:00", endTime: "10:00" }),
      ]);
      expect(r.has("a")).toBe(true);
      expect(r.has("b")).toBe(true);
      expect(r.size).toBe(2);
    });

    it("接触 touching (09-10 / 10-11) → 半開区間で overlap なし", () => {
      const r = detectTimedAnchorOverlaps([
        oneOff({ id: "a", startTime: "09:00", endTime: "10:00" }),
        oneOff({ id: "b", startTime: "10:00", endTime: "11:00" }),
      ]);
      expect(r.size).toBe(0);
    });

    it("完全包含 (09-12 / 10-11) → 両 id", () => {
      const r = detectTimedAnchorOverlaps([
        oneOff({ id: "a", startTime: "09:00", endTime: "12:00" }),
        oneOff({ id: "b", startTime: "10:00", endTime: "11:00" }),
      ]);
      expect(r.has("a")).toBe(true);
      expect(r.has("b")).toBe(true);
    });

    it("部分重複 (09-10:30 / 10-11) → 両 id", () => {
      const r = detectTimedAnchorOverlaps([
        oneOff({ id: "a", startTime: "09:00", endTime: "10:30" }),
        oneOff({ id: "b", startTime: "10:00", endTime: "11:00" }),
      ]);
      expect(r.has("a")).toBe(true);
      expect(r.has("b")).toBe(true);
    });
  });

  // ─── defensive skip ───

  describe("defensive skip", () => {
    it("zero-duration (09-09) は他とも overlap せず", () => {
      const r = detectTimedAnchorOverlaps([
        oneOff({ id: "a", startTime: "09:00", endTime: "09:00" }),
        oneOff({ id: "b", startTime: "08:30", endTime: "10:00" }),
      ]);
      expect(r.has("a")).toBe(false);
      // b は a と重なる時間範囲にあるが、a が skip されたので b 単独 (= 他とは比較不能)
      expect(r.size).toBe(0);
    });

    it("inverted (start > end) は skip", () => {
      const r = detectTimedAnchorOverlaps([
        oneOff({ id: "a", startTime: "10:00", endTime: "09:00" }), // inverted
        oneOff({ id: "b", startTime: "09:30", endTime: "10:30" }),
      ]);
      expect(r.has("a")).toBe(false);
      expect(r.size).toBe(0);
    });

    it("endTime 未指定 (untimed) は skip", () => {
      const r = detectTimedAnchorOverlaps([
        oneOff({ id: "a", startTime: "09:00", endTime: undefined }),
        oneOff({ id: "b", startTime: "09:30", endTime: "10:30" }),
      ]);
      expect(r.has("a")).toBe(false);
      expect(r.size).toBe(0);
    });

    it("startTime 空文字 / null は skip", () => {
      const r = detectTimedAnchorOverlaps([
        oneOff({ id: "a", startTime: null, endTime: "10:00" }),
        oneOff({ id: "b", startTime: "09:30", endTime: "10:30" }),
      ]);
      expect(r.has("a")).toBe(false);
      expect(r.size).toBe(0);
    });

    it("両 null → skip", () => {
      const r = detectTimedAnchorOverlaps([
        oneOff({ id: "a", startTime: null, endTime: null }),
        oneOff({ id: "b", startTime: "09:00", endTime: "10:00" }),
      ]);
      expect(r.size).toBe(0);
    });
  });

  // ─── 3 件以上 / boundary ───

  describe("3 件以上 / boundary", () => {
    it("3 件同時 (09-10 / 09:30-10:30 / 09:45-10:15) → 全 3 件 overlap", () => {
      const r = detectTimedAnchorOverlaps([
        oneOff({ id: "a", startTime: "09:00", endTime: "10:00" }),
        oneOff({ id: "b", startTime: "09:30", endTime: "10:30" }),
        oneOff({ id: "c", startTime: "09:45", endTime: "10:15" }),
      ]);
      expect(r.has("a")).toBe(true);
      expect(r.has("b")).toBe(true);
      expect(r.has("c")).toBe(true);
      expect(r.size).toBe(3);
    });

    it("anchor 1 件のみ → empty (比較相手なし)", () => {
      const r = detectTimedAnchorOverlaps([
        oneOff({ id: "a", startTime: "09:00", endTime: "10:00" }),
      ]);
      expect(r.size).toBe(0);
    });

    it("empty array → empty Set", () => {
      const r = detectTimedAnchorOverlaps([]);
      expect(r.size).toBe(0);
    });
  });

  // ─── malformed / 範囲外 ───

  describe("malformed / 範囲外", () => {
    it("形式不正 \"abc\" → skip", () => {
      const r = detectTimedAnchorOverlaps([
        oneOff({ id: "a", startTime: "abc", endTime: "10:00" }),
        oneOff({ id: "b", startTime: "09:30", endTime: "10:30" }),
      ]);
      expect(r.size).toBe(0);
    });

    it("範囲外 \"25:00\" → skip", () => {
      const r = detectTimedAnchorOverlaps([
        oneOff({ id: "a", startTime: "25:00", endTime: "26:00" }),
        oneOff({ id: "b", startTime: "09:00", endTime: "10:00" }),
      ]);
      expect(r.size).toBe(0);
    });

    it("形式不正 \"9-00\" (separator 違い) → skip", () => {
      const r = detectTimedAnchorOverlaps([
        oneOff({ id: "a", startTime: "9-00", endTime: "10:00" }),
        oneOff({ id: "b", startTime: "09:30", endTime: "10:30" }),
      ]);
      expect(r.size).toBe(0);
    });

    it("秒部分 tolerant (\"09:00:00\") → 動作可", () => {
      const r = detectTimedAnchorOverlaps([
        oneOff({ id: "a", startTime: "09:00:00", endTime: "10:00:00" }),
        oneOff({ id: "b", startTime: "09:30:00", endTime: "10:30:00" }),
      ]);
      expect(r.has("a")).toBe(true);
      expect(r.has("b")).toBe(true);
    });

    it("1 桁 hour tolerant (\"9:00\") → 動作可", () => {
      const r = detectTimedAnchorOverlaps([
        oneOff({ id: "a", startTime: "9:00", endTime: "10:00" }),
        oneOff({ id: "b", startTime: "9:30", endTime: "10:30" }),
      ]);
      expect(r.has("a")).toBe(true);
      expect(r.has("b")).toBe(true);
    });
  });

  // ─── multi-day / midnight cross 安全性 ───

  describe("multi-day / midnight cross 安全性", () => {
    it("midnight cross (23:00-01:00 表現、start > end 表現) は skip (= 同日 helper では inverted 扱い)", () => {
      const r = detectTimedAnchorOverlaps([
        oneOff({ id: "a", startTime: "23:00", endTime: "01:00" }),
        oneOff({ id: "b", startTime: "23:30", endTime: "00:30" }),
      ]);
      // 両方とも start > end で skip → empty
      expect(r.size).toBe(0);
    });
  });

  // ─── recurring / sensitive ───

  describe("recurring / sensitive (GPT 補正反映)", () => {
    it("recurring + one_off 同日 overlap → 両 id (型に関係なく detect)", () => {
      const r = detectTimedAnchorOverlaps([
        recurring({ id: "a", startTime: "09:00", endTime: "10:00" }),
        oneOff({ id: "b", startTime: "09:30", endTime: "10:30" }),
      ]);
      expect(r.has("a")).toBe(true);
      expect(r.has("b")).toBe(true);
    });

    it("sensitive anchor 同士の overlap → 両 id (= 時刻重なりは外部送信でも内容開示でもない)", () => {
      const r = detectTimedAnchorOverlaps([
        oneOff({ id: "a", startTime: "09:00", endTime: "10:00", sensitive: "medical" }),
        oneOff({ id: "b", startTime: "09:30", endTime: "10:30", sensitive: "other" }),
      ]);
      expect(r.has("a")).toBe(true);
      expect(r.has("b")).toBe(true);
      // sensitivity は helper の判定に影響しない (UI 側で文言固定で privacy 維持)
    });
  });

  // ─── pure / immutability ───

  describe("pure / immutability", () => {
    it("deterministic: 同入力で同出力", () => {
      const input: ReadonlyArray<ExternalAnchor> = [
        oneOff({ id: "a", startTime: "09:00", endTime: "10:00" }),
        oneOff({ id: "b", startTime: "09:30", endTime: "10:30" }),
      ];
      const r1 = detectTimedAnchorOverlaps(input);
      const r2 = detectTimedAnchorOverlaps(input);
      expect([...r1].sort()).toEqual([...r2].sort());
    });

    it("入力 array / 各 anchor を mutate しない", () => {
      const input: ExternalAnchor[] = [
        oneOff({ id: "a", startTime: "09:00", endTime: "10:00" }),
        oneOff({ id: "b", startTime: "09:30", endTime: "10:30" }),
      ];
      const snapshot = JSON.stringify(input);
      detectTimedAnchorOverlaps(input);
      expect(JSON.stringify(input)).toBe(snapshot);
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isAnchorOverlapping", () => {
  it("Set.has wrap として動作", () => {
    const anchor = oneOff({ id: "a", startTime: "09:00", endTime: "10:00" });
    const ids = new Set<string>(["a", "c"]);
    expect(isAnchorOverlapping(anchor, ids)).toBe(true);
    expect(isAnchorOverlapping(oneOff({ id: "z", startTime: "09:00", endTime: "10:00" }), ids)).toBe(false);
    expect(isAnchorOverlapping(anchor, new Set<string>())).toBe(false);
  });
});
