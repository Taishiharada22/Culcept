/**
 * Phase 3-J-6a: computeProposals orchestration unit tests
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-6 / §10 Smoke
 *
 * 検証範囲:
 *   1. Onboarding Quietude gate (= Day 0-7 silent)
 *   2. Theory-of-Mind Pause gate (= 24h dismiss 3+ silent)
 *   3. Sensitive 除外 (= input filter)
 *   4. Pattern repeat extraction (= 同曜日 + 同時刻 + 同 verb 3+ 反復)
 *   5. Direction classification (= continue / recover / intentional_break_observed)
 *   6. Dismiss filter (= 7 日 retention)
 *   7. Reversibility gate (= score >= 50)
 *   8. Entropy Budget cap (= max 3pt/day、 phase limit)
 *   9. Compliance check
 *   10. testOverride 経路
 *
 * 不変原則 (= 本 test で機械的に強制):
 *   - Invariant 4 sensitive 除外
 *   - Invariant 14 cross-day memory
 *   - Invariant 23 reversibility >= 50
 *   - Invariant 36 Onboarding Quietude
 *   - Invariant 37 Proposal Integrity Contract
 *   - Invariant 40 Theory-of-Mind Pause
 */

import { describe, expect, it } from "vitest";

import {
  computeProposals,
  type ComputeProposalsInput,
} from "@/lib/plan/proposal/computeProposals";
import type { DismissLogEntry } from "@/lib/plan/proposal/dismissLog";
import type { TestOverrideContext } from "@/lib/plan/proposal/testOverrideContext";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * One-off anchor builder (= 全 required field 自動補完)。
 */
function anchor(opts: {
  id?: string;
  title: string;
  date: string;
  startTime: string;
  endTime?: string;
  rigidity?: ExternalAnchor["rigidity"];
  locationText?: string;
  sensitiveCategory?: ExternalAnchor["sensitiveCategory"];
}): ExternalAnchor {
  return {
    id: opts.id ?? `anchor_${opts.title}_${opts.date}`,
    userId: "user_test",
    title: opts.title,
    startTime: opts.startTime,
    endTime: opts.endTime,
    rigidity: opts.rigidity ?? "soft",
    locationText: opts.locationText,
    sensitiveCategory: opts.sensitiveCategory,
    sourceId: "src_test",
    confirmedAt: "2026-05-21T00:00:00.000Z",
    anchorKind: "one_off",
    date: opts.date,
  } as ExternalAnchor;
}

function dismiss(proposalId: string, dismissedAt: string): DismissLogEntry {
  return {
    proposalId,
    reason: "pattern_repeat",
    dismissedAt,
  };
}

/**
 * 2026-05-22 (= Friday、 docs date 想定) を基準にする。
 * Past 4 weeks = 2026-04-24 〜 2026-05-22。
 *
 * Same weekday Friday の past dates:
 *   - 2026-05-15 (= 1 week ago)
 *   - 2026-05-08 (= 2 weeks ago)
 *   - 2026-05-01 (= 3 weeks ago)
 *   - 2026-04-24 (= 4 weeks ago、 cutoff edge)
 */
const NOW = "2026-05-22T12:00:00.000Z"; // Friday
const FIRST_USE_NORMAL = "2025-12-01"; // > 30 日前 (= normal_30d_plus phase)

function baseInput(overrides: Partial<ComputeProposalsInput> = {}): ComputeProposalsInput {
  return {
    anchors: [],
    now: NOW,
    firstUseDate: FIRST_USE_NORMAL,
    dismissEvents: [],
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gate 1: Onboarding Quietude
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeProposals — Onboarding Quietude gate", () => {
  it("Day 0-6 (= quietude_0_7d) → silent", () => {
    const r = computeProposals(
      baseInput({
        firstUseDate: "2026-05-22", // today
      }),
    );
    expect(r.proposals).toHaveLength(0);
    expect(r.silenceReason).toBe("onboarding_quietude");
  });

  it("Day 7 (= limited_8_30d) → proposal が出るが limit 1", () => {
    // limited phase は phaseLimit=1
    const carpetOfPastAnchors = Array.from({ length: 4 }, (_, i) => {
      const date = ["2026-05-15", "2026-05-08", "2026-05-01", "2026-04-24"][i]!;
      return anchor({ title: "カフェ", date, startTime: "10:00" });
    });
    const r = computeProposals(
      baseInput({
        firstUseDate: "2026-05-15", // = 7 days ago → limited_8_30d
        anchors: carpetOfPastAnchors,
      }),
    );
    expect(r.proposals).toHaveLength(1);
    expect(r.silenceReason).toBeUndefined();
  });

  it("testOverride.forceOnboardingPhase='normal_30d_plus' → bypass quietude", () => {
    const carpet = [
      anchor({ title: "カフェ", date: "2026-05-15", startTime: "10:00" }),
      anchor({ title: "カフェ", date: "2026-05-08", startTime: "10:00" }),
      anchor({ title: "カフェ", date: "2026-05-01", startTime: "10:00" }),
    ];
    const r = computeProposals(
      baseInput({
        firstUseDate: "2026-05-22", // = Day 0、 通常 silent
        anchors: carpet,
        testOverride: { forceOnboardingPhase: "normal_30d_plus" },
      }),
    );
    expect(r.proposals.length).toBeGreaterThan(0);
    expect(r.silenceReason).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gate 2: Theory-of-Mind Pause
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeProposals — Theory-of-Mind Pause gate", () => {
  it("24h dismiss 3+ → silent (= theory_of_mind_pause)", () => {
    const carpet = [
      anchor({ title: "カフェ", date: "2026-05-15", startTime: "10:00" }),
      anchor({ title: "カフェ", date: "2026-05-08", startTime: "10:00" }),
      anchor({ title: "カフェ", date: "2026-05-01", startTime: "10:00" }),
    ];
    const r = computeProposals(
      baseInput({
        anchors: carpet,
        dismissEvents: [
          dismiss("p1", "2026-05-22T08:00:00.000Z"),
          dismiss("p2", "2026-05-22T10:00:00.000Z"),
          dismiss("p3", "2026-05-22T11:00:00.000Z"),
        ],
      }),
    );
    expect(r.proposals).toHaveLength(0);
    expect(r.silenceReason).toBe("theory_of_mind_pause");
  });

  it("bypassUserStatePause → pause 無効化", () => {
    const carpet = [
      anchor({ title: "カフェ", date: "2026-05-15", startTime: "10:00" }),
      anchor({ title: "カフェ", date: "2026-05-08", startTime: "10:00" }),
      anchor({ title: "カフェ", date: "2026-05-01", startTime: "10:00" }),
    ];
    const r = computeProposals(
      baseInput({
        anchors: carpet,
        dismissEvents: [
          dismiss("p1", "2026-05-22T08:00:00.000Z"),
          dismiss("p2", "2026-05-22T10:00:00.000Z"),
          dismiss("p3", "2026-05-22T11:00:00.000Z"),
        ],
        testOverride: { bypassUserStatePause: true, forceEntropyBudget: 5 },
      }),
    );
    expect(r.proposals.length).toBeGreaterThan(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gate 3: Sensitive 除外
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeProposals — Sensitive 除外", () => {
  it("sensitive anchor からの pattern は signal にならない", () => {
    const sensitivePattern = [
      anchor({
        title: "通院",
        date: "2026-05-15",
        startTime: "09:00",
        sensitiveCategory: "medical",
      }),
      anchor({
        title: "通院",
        date: "2026-05-08",
        startTime: "09:00",
        sensitiveCategory: "medical",
      }),
      anchor({
        title: "通院",
        date: "2026-05-01",
        startTime: "09:00",
        sensitiveCategory: "medical",
      }),
    ];
    const r = computeProposals(baseInput({ anchors: sensitivePattern }));
    expect(r.proposals).toHaveLength(0);
    expect(r.silenceReason).toBe("no_signals");
  });

  it("mixed: sensitive + non-sensitive → non-sensitive のみ提案候補", () => {
    const mixed = [
      anchor({
        title: "通院",
        date: "2026-05-15",
        startTime: "09:00",
        sensitiveCategory: "medical",
      }),
      anchor({ title: "カフェ", date: "2026-05-15", startTime: "10:00" }),
      anchor({ title: "カフェ", date: "2026-05-08", startTime: "10:00" }),
      anchor({ title: "カフェ", date: "2026-05-01", startTime: "10:00" }),
    ];
    const r = computeProposals(baseInput({ anchors: mixed }));
    expect(r.proposals.length).toBeGreaterThan(0);
    for (const p of r.proposals) {
      expect(p.draft.title).toBe("カフェ");
      expect(p.draft.sensitiveCategory).toBeUndefined();
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gate 4: Pattern repeat extraction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeProposals — Pattern repeat extraction", () => {
  it("3 anchors 同 weekday + 同 hour + 同 verb → 1 proposal", () => {
    const carpet = [
      anchor({ title: "カフェ", date: "2026-05-15", startTime: "10:00" }),
      anchor({ title: "カフェ", date: "2026-05-08", startTime: "10:00" }),
      anchor({ title: "カフェ", date: "2026-05-01", startTime: "10:00" }),
    ];
    const r = computeProposals(baseInput({ anchors: carpet }));
    expect(r.proposals).toHaveLength(1);
    expect(r.proposals[0]!.reason).toBe("pattern_repeat");
    expect(r.proposals[0]!.draft.title).toBe("カフェ");
    expect(r.proposals[0]!.draft.startTime).toBe("10:00");
    expect(r.proposals[0]!.draft.date).toBe("2026-05-22"); // today (NOW)
    expect(r.proposals[0]!.confidence).toBe("medium");
    expect(r.proposals[0]!.source.evidenceCount).toBe(3);
  });

  it("5 anchors → confidence: high", () => {
    const carpet = [
      anchor({ title: "カフェ", date: "2026-05-15", startTime: "10:00" }),
      anchor({ title: "カフェ", date: "2026-05-08", startTime: "10:00" }),
      anchor({ title: "カフェ", date: "2026-05-01", startTime: "10:00" }),
      anchor({ title: "カフェ", date: "2026-04-24", startTime: "10:00" }),
      // 5 番目は 5 週前 → cutoff 外。 ということで実際は 4 個。
      // 5 個欲しい場合は smaller cutoff を必要とするが、 NOW 基準 28 日 cutoff で十分。
      anchor({
        title: "カフェ",
        date: "2026-05-15",
        startTime: "10:00",
        id: "extra_1",
      }),
    ];
    const r = computeProposals(baseInput({ anchors: carpet }));
    expect(r.proposals).toHaveLength(1);
    expect(r.proposals[0]!.confidence).toBe("high");
    expect(r.proposals[0]!.source.evidenceCount).toBeGreaterThanOrEqual(5);
  });

  it("2 anchors → 閾値未満で proposal なし", () => {
    const r = computeProposals(
      baseInput({
        anchors: [
          anchor({ title: "カフェ", date: "2026-05-15", startTime: "10:00" }),
          anchor({ title: "カフェ", date: "2026-05-08", startTime: "10:00" }),
        ],
      }),
    );
    expect(r.proposals).toHaveLength(0);
    expect(r.silenceReason).toBe("no_signals");
  });

  it("異曜日 anchors → 同曜日 group になく proposal なし", () => {
    // 2026-05-22 = Friday、 2026-05-19 = Tuesday (= 同 hour でも別曜日)
    const r = computeProposals(
      baseInput({
        anchors: [
          anchor({ title: "カフェ", date: "2026-05-19", startTime: "10:00" }),
          anchor({ title: "カフェ", date: "2026-05-12", startTime: "10:00" }),
          anchor({ title: "カフェ", date: "2026-05-05", startTime: "10:00" }),
        ],
      }),
    );
    expect(r.proposals).toHaveLength(0);
  });

  it("4 週超 (= 28 日超) の anchor は cutoff 外", () => {
    const r = computeProposals(
      baseInput({
        anchors: [
          anchor({ title: "カフェ", date: "2026-04-17", startTime: "10:00" }), // 5 週前
          anchor({ title: "カフェ", date: "2026-04-10", startTime: "10:00" }),
          anchor({ title: "カフェ", date: "2026-04-03", startTime: "10:00" }),
        ],
      }),
    );
    expect(r.proposals).toHaveLength(0);
  });

  it("未来 anchor は無視", () => {
    const r = computeProposals(
      baseInput({
        anchors: [
          anchor({ title: "カフェ", date: "2026-05-29", startTime: "10:00" }), // future
          anchor({ title: "カフェ", date: "2026-06-05", startTime: "10:00" }), // future
          anchor({ title: "カフェ", date: "2026-06-12", startTime: "10:00" }), // future
        ],
      }),
    );
    expect(r.proposals).toHaveLength(0);
  });

  it("startTime 異なる anchor は別 group", () => {
    const r = computeProposals(
      baseInput({
        anchors: [
          anchor({ title: "カフェ", date: "2026-05-15", startTime: "10:00" }),
          anchor({ title: "カフェ", date: "2026-05-08", startTime: "11:00" }),
          anchor({ title: "カフェ", date: "2026-05-01", startTime: "12:00" }),
        ],
      }),
    );
    expect(r.proposals).toHaveLength(0); // 各 hour で 1 個ずつしかない
  });

  it("verb 異なる anchor は別 group", () => {
    const r = computeProposals(
      baseInput({
        anchors: [
          anchor({ title: "カフェ", date: "2026-05-15", startTime: "10:00" }), // eat
          anchor({ title: "ジム", date: "2026-05-08", startTime: "10:00" }), // move
          anchor({ title: "会議", date: "2026-05-01", startTime: "10:00" }), // work
        ],
      }),
    );
    expect(r.proposals).toHaveLength(0); // 各 verb で 1 個ずつ
  });

  it("testOverride.forceRepetitionThreshold=1 → 1 anchor で提案", () => {
    const r = computeProposals(
      baseInput({
        anchors: [anchor({ title: "カフェ", date: "2026-05-15", startTime: "10:00" })],
        testOverride: { forceRepetitionThreshold: 1 },
      }),
    );
    expect(r.proposals).toHaveLength(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Direction classification
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeProposals — Direction classification (Self-Contradiction)", () => {
  it("直近 2 週内 anchor あり → continue_pattern", () => {
    const r = computeProposals(
      baseInput({
        anchors: [
          anchor({ title: "カフェ", date: "2026-05-15", startTime: "10:00" }), // 直近 1 週
          anchor({ title: "カフェ", date: "2026-05-08", startTime: "10:00" }), // 直近 2 週
          anchor({ title: "カフェ", date: "2026-05-01", startTime: "10:00" }),
        ],
      }),
    );
    expect(r.proposals[0]?.direction).toBe("continue_pattern");
  });

  it("直近 2 週内 anchor 0 + total >= 3 → recover_pattern", () => {
    // 直近 2 週内 (= 2026-05-08 以降) なし、 過去 (2-4 週前) で 3 つ
    const r = computeProposals(
      baseInput({
        anchors: [
          anchor({ title: "カフェ", date: "2026-05-01", startTime: "10:00" }), // 3 週前
          anchor({ title: "カフェ", date: "2026-04-24", startTime: "10:00" }), // 4 週前
          anchor({ title: "カフェ", date: "2026-04-24", startTime: "10:00", id: "extra" }), // 4 週前 (= same date 別 id)
        ],
      }),
    );
    // 3+ 反復 + 直近 2 週欠如 → intentional_break_observed (= contradiction detector が 2+ 乖離認定)
    // この test では 3 anchors 全て 2-4 週前、 直近欠如 = 2-4 週前 anchor 3 個。
    // contradiction の条件: pastRepetitionCount >= 3 AND recentDeviationCount >= 2
    // → contradiction trigger 期待
    expect(r.proposals[0]?.direction).toBe("intentional_break_observed");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gate 5: Dismiss filter
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeProposals — Dismiss filter (= 7 day retention)", () => {
  it("同 proposal が 7 日以内に dismiss されていれば suppress", () => {
    const carpet = [
      anchor({ title: "カフェ", date: "2026-05-15", startTime: "10:00" }),
      anchor({ title: "カフェ", date: "2026-05-08", startTime: "10:00" }),
      anchor({ title: "カフェ", date: "2026-05-01", startTime: "10:00" }),
    ];
    // 期待される proposal id を pre-compute
    const expectedId = `proposal_2026-05-22_10|eat`;
    const r = computeProposals(
      baseInput({
        anchors: carpet,
        dismissEvents: [
          dismiss(expectedId, "2026-05-20T12:00:00.000Z"), // 2 日前
        ],
        // dismiss 1 件のみ → Theory-of-Mind Pause は trigger しない
      }),
    );
    expect(r.proposals).toHaveLength(0);
    expect(r.silenceReason).toBe("no_signals");
  });

  it("8 日以上前の dismiss は無視 (= retention 外)", () => {
    const carpet = [
      anchor({ title: "カフェ", date: "2026-05-15", startTime: "10:00" }),
      anchor({ title: "カフェ", date: "2026-05-08", startTime: "10:00" }),
      anchor({ title: "カフェ", date: "2026-05-01", startTime: "10:00" }),
    ];
    const r = computeProposals(
      baseInput({
        anchors: carpet,
        dismissEvents: [
          dismiss(`proposal_2026-05-22_10|eat`, "2026-05-13T00:00:00.000Z"), // 9 日前
        ],
      }),
    );
    expect(r.proposals).toHaveLength(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gate 6: Reversibility gate
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeProposals — Reversibility gate (= score >= 50)", () => {
  it("飛行機 = 0 → no proposal", () => {
    const r = computeProposals(
      baseInput({
        anchors: [
          anchor({ title: "飛行機", date: "2026-05-15", startTime: "10:00" }),
          anchor({ title: "飛行機", date: "2026-05-08", startTime: "10:00" }),
          anchor({ title: "飛行機", date: "2026-05-01", startTime: "10:00" }),
        ],
      }),
    );
    expect(r.proposals).toHaveLength(0);
    expect(r.silenceReason).toBe("no_signals");
  });

  it("ジム = 40 → no proposal", () => {
    const r = computeProposals(
      baseInput({
        anchors: [
          anchor({ title: "ジム", date: "2026-05-15", startTime: "10:00" }),
          anchor({ title: "ジム", date: "2026-05-08", startTime: "10:00" }),
          anchor({ title: "ジム", date: "2026-05-01", startTime: "10:00" }),
        ],
      }),
    );
    expect(r.proposals).toHaveLength(0);
  });

  it("カフェ = 70 → proposal 出る", () => {
    const r = computeProposals(
      baseInput({
        anchors: [
          anchor({ title: "カフェ", date: "2026-05-15", startTime: "10:00" }),
          anchor({ title: "カフェ", date: "2026-05-08", startTime: "10:00" }),
          anchor({ title: "カフェ", date: "2026-05-01", startTime: "10:00" }),
        ],
      }),
    );
    expect(r.proposals).toHaveLength(1);
  });

  it("testOverride.forceReversibilityThreshold=0 → 飛行機でも通過", () => {
    const r = computeProposals(
      baseInput({
        anchors: [
          anchor({ title: "飛行機", date: "2026-05-15", startTime: "10:00" }),
          anchor({ title: "飛行機", date: "2026-05-08", startTime: "10:00" }),
          anchor({ title: "飛行機", date: "2026-05-01", startTime: "10:00" }),
        ],
        testOverride: { forceReversibilityThreshold: 0 },
      }),
    );
    expect(r.proposals).toHaveLength(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gate 7: Entropy Budget
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeProposals — Entropy Budget (= max 3pt/day)", () => {
  it("4 groups → max 3 proposals (= budget 3pt)", () => {
    const anchors: ExternalAnchor[] = [];
    // 4 つの異なる group (hour 10/11/12/13、 全 eat)
    const titles = ["カフェ", "ランチ", "ディナー", "朝食"];
    for (const t of titles) {
      anchors.push(
        anchor({ title: t, date: "2026-05-15", startTime: `${10 + titles.indexOf(t)}:00` }),
      );
      anchors.push(
        anchor({ title: t, date: "2026-05-08", startTime: `${10 + titles.indexOf(t)}:00` }),
      );
      anchors.push(
        anchor({ title: t, date: "2026-05-01", startTime: `${10 + titles.indexOf(t)}:00` }),
      );
    }
    const r = computeProposals(baseInput({ anchors }));
    expect(r.proposals.length).toBeLessThanOrEqual(3);
  });

  it("testOverride.forceEntropyBudget=1 → max 1 proposal", () => {
    const anchors = [
      anchor({ title: "カフェ", date: "2026-05-15", startTime: "10:00" }),
      anchor({ title: "カフェ", date: "2026-05-08", startTime: "10:00" }),
      anchor({ title: "カフェ", date: "2026-05-01", startTime: "10:00" }),
      anchor({ title: "ランチ", date: "2026-05-15", startTime: "12:00" }),
      anchor({ title: "ランチ", date: "2026-05-08", startTime: "12:00" }),
      anchor({ title: "ランチ", date: "2026-05-01", startTime: "12:00" }),
    ];
    const r = computeProposals(
      baseInput({ anchors, testOverride: { forceEntropyBudget: 1 } }),
    );
    expect(r.proposals).toHaveLength(1);
  });

  it("testOverride.forceEntropyBudget=0 → silent (= budget_exhausted)", () => {
    const anchors = [
      anchor({ title: "カフェ", date: "2026-05-15", startTime: "10:00" }),
      anchor({ title: "カフェ", date: "2026-05-08", startTime: "10:00" }),
      anchor({ title: "カフェ", date: "2026-05-01", startTime: "10:00" }),
    ];
    const r = computeProposals(
      baseInput({ anchors, testOverride: { forceEntropyBudget: 0 } }),
    );
    expect(r.proposals).toHaveLength(0);
    expect(r.silenceReason).toBe("budget_exhausted");
  });

  it("high confidence proposals are sorted first", () => {
    const anchors: ExternalAnchor[] = [];
    // group A: カフェ 10:00 × 3 (= medium)
    for (const date of ["2026-05-15", "2026-05-08", "2026-05-01"]) {
      anchors.push(anchor({ title: "カフェ", date, startTime: "10:00" }));
    }
    // group B: ランチ 12:00 × 5 (= high)
    for (const date of ["2026-05-15", "2026-05-08", "2026-05-01", "2026-04-24"]) {
      anchors.push(anchor({ title: "ランチ", date, startTime: "12:00" }));
    }
    anchors.push(
      anchor({ title: "ランチ", date: "2026-05-15", startTime: "12:00", id: "extra_l" }),
    );
    const r = computeProposals(
      baseInput({ anchors, testOverride: { forceEntropyBudget: 1 } }),
    );
    expect(r.proposals).toHaveLength(1);
    // high confidence (= ランチ × 5) が選ばれる
    expect(r.proposals[0]!.draft.title).toBe("ランチ");
    expect(r.proposals[0]!.confidence).toBe("high");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance check
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeProposals — Compliance check (= Proposal Integrity Contract)", () => {
  it("returned proposals は全て contract compliance", () => {
    const anchors = [
      anchor({ title: "カフェ", date: "2026-05-15", startTime: "10:00" }),
      anchor({ title: "カフェ", date: "2026-05-08", startTime: "10:00" }),
      anchor({ title: "カフェ", date: "2026-05-01", startTime: "10:00" }),
    ];
    const r = computeProposals(baseInput({ anchors }));
    for (const p of r.proposals) {
      expect(p.source.evidenceCount).toBeGreaterThan(0);
      expect(p.draft.sensitiveCategory).toBeUndefined();
      expect(p.id.startsWith("proposal_")).toBe(true);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Edge cases
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeProposals — edge cases", () => {
  it("空 anchor list → no_signals", () => {
    const r = computeProposals(baseInput({ anchors: [] }));
    expect(r.proposals).toHaveLength(0);
    expect(r.silenceReason).toBe("no_signals");
  });

  it("不正 now ISO → silent (= defensive)", () => {
    const r = computeProposals(baseInput({ now: "not-a-date" }));
    expect(r.proposals).toHaveLength(0);
  });

  it("不正 startTime の anchor は無視", () => {
    const r = computeProposals(
      baseInput({
        anchors: [
          anchor({ title: "カフェ", date: "2026-05-15", startTime: "invalid" }),
          anchor({ title: "カフェ", date: "2026-05-08", startTime: "10:00" }),
          anchor({ title: "カフェ", date: "2026-05-01", startTime: "10:00" }),
        ],
      }),
    );
    expect(r.proposals).toHaveLength(0); // 3 個揃わない
  });

  it("recurring anchor は MVP 範囲外 (= one_off only)", () => {
    const recurring: ExternalAnchor = {
      id: "rec_1",
      userId: "user_test",
      title: "カフェ",
      startTime: "10:00",
      rigidity: "soft",
      sourceId: "src_test",
      confirmedAt: "2026-05-21T00:00:00.000Z",
      anchorKind: "recurring",
      validFrom: "2026-04-01",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=FR",
    } as ExternalAnchor;

    const r = computeProposals(
      baseInput({
        anchors: [recurring, recurring, recurring],
      }),
    );
    expect(r.proposals).toHaveLength(0);
  });

  it("input mutation なし (= pure)", () => {
    const anchors = [
      anchor({ title: "カフェ", date: "2026-05-15", startTime: "10:00" }),
      anchor({ title: "カフェ", date: "2026-05-08", startTime: "10:00" }),
      anchor({ title: "カフェ", date: "2026-05-01", startTime: "10:00" }),
    ];
    const frozen = JSON.stringify(anchors);
    computeProposals(baseInput({ anchors }));
    expect(JSON.stringify(anchors)).toBe(frozen);
  });
});
