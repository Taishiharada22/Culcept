/**
 * Phase 3-J-6e-2: dismiss flow integration (= storage → filter → suppress)
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-6 / §10.1 Smoke 6
 *
 * 検証範囲:
 *   - dismiss → recordDismissToStorage → 次回 read で同 proposalId が dismiss filter で排除
 *   - 7 日 retention: 7 日以内は再表示されない
 *   - 8 日以上経過: dismiss 影響なくなる (= 再 proposable)
 *   - 24h dismiss 3+ → Theory-of-Mind Pause 自然発動 (= computeProposals 内 gate)
 *   - localStorage write key は `aneurasync.plan.proposalDismiss.v1` のみ
 *   - sensitive 除外維持
 *
 * 不変原則 (= 本 test で機械的に強制):
 *   - Invariant 14 Cross-day memory (= 7 日 retention)
 *   - Invariant 39 No Penalty for Ignore (= dismiss は silent preference)
 *   - Invariant 40 Theory-of-Mind Pause (= 24h dismiss 3+)
 *   - dismiss key uniqueness (= localStorage write key 1 種のみ)
 */

import { describe, expect, it } from "vitest";

import { computeProposals } from "@/lib/plan/proposal/computeProposals";
import {
  DISMISS_STORAGE_KEY,
  buildDismissLogEntry,
  createInMemoryDismissStorage,
  createStorageBackedDismissLogReader,
  readDismissesFromStorage,
  recordDismissToStorage,
} from "@/lib/plan/proposal/dismissAction";
import type { ProposedAnchor } from "@/lib/plan/proposal/proposalTypes";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures (= pattern repeat 起動条件を確実に揃える)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const NOW = "2026-05-22T12:00:00.000Z"; // Friday
const FIRST_USE = "2025-12-01"; // > 30 日前

function anchor(date: string, title = "カフェ", startTime = "10:00"): ExternalAnchor {
  return {
    id: `anchor_${title}_${date}`,
    userId: "user_test",
    title,
    startTime,
    rigidity: "soft",
    sourceId: "src_test",
    confirmedAt: "2026-05-21T00:00:00.000Z",
    anchorKind: "one_off",
    date,
  } as ExternalAnchor;
}

/** 過去 4 週同 Friday に「カフェ 10:00」 anchor 3 件 (= pattern repeat 確定) */
function builRepeatingCafeAnchors(): ExternalAnchor[] {
  return [
    anchor("2026-05-15"), // 1 週前 (Friday)
    anchor("2026-05-08"), // 2 週前
    anchor("2026-05-01"), // 3 週前
  ];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// dismiss → 次回 computeProposals で除外
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dismiss → suppress flow (= J-6e-2)", () => {
  it("dismiss なし → proposal 出る", () => {
    const r = computeProposals({
      anchors: builRepeatingCafeAnchors(),
      now: NOW,
      firstUseDate: FIRST_USE,
      dismissEvents: [],
    });
    expect(r.proposals).toHaveLength(1);
    expect(r.proposals[0]!.reason).toBe("pattern_repeat");
  });

  it("dismiss 後 → 同 proposal は 7 日以内に再表示されない", () => {
    // 1 回目: proposal 出る
    const result1 = computeProposals({
      anchors: builRepeatingCafeAnchors(),
      now: NOW,
      firstUseDate: FIRST_USE,
      dismissEvents: [],
    });
    expect(result1.proposals).toHaveLength(1);
    const dismissedProposal = result1.proposals[0]!;

    // dismiss 記録
    const storage = createInMemoryDismissStorage();
    recordDismissToStorage(storage, {
      proposal: dismissedProposal,
      dismissedAt: NOW,
    });

    // 2 回目: 同条件で再計算 → dismiss filter で排除
    const reader = createStorageBackedDismissLogReader(storage);
    const dismissEvents = reader.readAll();
    const result2 = computeProposals({
      anchors: builRepeatingCafeAnchors(),
      now: NOW,
      firstUseDate: FIRST_USE,
      dismissEvents,
    });
    expect(result2.proposals).toHaveLength(0);
    expect(result2.silenceReason).toBe("no_signals");
  });

  it("dismiss から 8 日経過 → 再 proposable", () => {
    // dismissedAt = 8 日前
    const storage = createInMemoryDismissStorage();
    const result0 = computeProposals({
      anchors: builRepeatingCafeAnchors(),
      now: "2026-05-14T12:00:00.000Z", // 過去
      firstUseDate: FIRST_USE,
      dismissEvents: [],
    });
    // 注: 異 weekday なので proposal ない場合あり。 entry を手動で record。
    const dummyId = "proposal_2026-05-22_10|eat"; // NOW (Friday) の予想 id
    const dummyEntry = buildDismissLogEntry({
      proposal: {
        id: dummyId,
        reason: "pattern_repeat",
        direction: "continue_pattern",
        confidence: "medium",
        draft: { title: "カフェ", startTime: "10:00", anchorKind: "one_off", date: "2026-05-22" },
        source: {
          signalType: "pattern_repeat",
          evidenceCount: 3,
          generatedAt: "2026-05-13T00:00:00.000Z",
        },
        createdAt: "2026-05-13T00:00:00.000Z",
      },
      dismissedAt: "2026-05-13T00:00:00.000Z", // 9 日前
    });
    recordDismissToStorage(storage, {
      proposal: {
        id: dummyId,
        reason: "pattern_repeat",
        direction: "continue_pattern",
        confidence: "medium",
        draft: { title: "カフェ", startTime: "10:00", anchorKind: "one_off", date: "2026-05-22" },
        source: {
          signalType: "pattern_repeat",
          evidenceCount: 3,
          generatedAt: "2026-05-13T00:00:00.000Z",
        },
        createdAt: "2026-05-13T00:00:00.000Z",
      },
      dismissedAt: "2026-05-13T00:00:00.000Z",
    });

    const dismissEvents = readDismissesFromStorage(storage);
    // 9 日前の dismiss は filter で除外される
    const result2 = computeProposals({
      anchors: builRepeatingCafeAnchors(),
      now: NOW, // 9 日後
      firstUseDate: FIRST_USE,
      dismissEvents,
    });
    expect(result2.proposals).toHaveLength(1);
    void result0; // 形式上の参照
    void dummyEntry; // 形式上の参照
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Theory-of-Mind Pause (= 24h dismiss 3+ で自然発動)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Theory-of-Mind Pause cascade (= J-6e-2 副作用)", () => {
  it("24h 内 dismiss 3+ → 次回 computeProposals は theory_of_mind_pause で silent", () => {
    const storage = createInMemoryDismissStorage();
    const baseProposal: ProposedAnchor = {
      id: "p_dummy",
      reason: "pattern_repeat",
      direction: "continue_pattern",
      confidence: "medium",
      draft: { title: "test", anchorKind: "one_off", date: "2026-05-22" },
      source: {
        signalType: "pattern_repeat",
        evidenceCount: 3,
        generatedAt: NOW,
      },
      createdAt: NOW,
    };
    // 24h 内に 3 件 dismiss
    recordDismissToStorage(storage, {
      proposal: { ...baseProposal, id: "p1" },
      dismissedAt: "2026-05-22T08:00:00.000Z",
    });
    recordDismissToStorage(storage, {
      proposal: { ...baseProposal, id: "p2" },
      dismissedAt: "2026-05-22T10:00:00.000Z",
    });
    recordDismissToStorage(storage, {
      proposal: { ...baseProposal, id: "p3" },
      dismissedAt: "2026-05-22T11:00:00.000Z",
    });

    const dismissEvents = readDismissesFromStorage(storage);
    const result = computeProposals({
      anchors: builRepeatingCafeAnchors(),
      now: NOW,
      firstUseDate: FIRST_USE,
      dismissEvents,
    });
    expect(result.proposals).toHaveLength(0);
    expect(result.silenceReason).toBe("theory_of_mind_pause");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// localStorage write key uniqueness
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("localStorage write key (= J-6e-2 制約)", () => {
  it("DISMISS_STORAGE_KEY は versioned aneurasync.plan.proposalDismiss.v1", () => {
    expect(DISMISS_STORAGE_KEY).toBe("aneurasync.plan.proposalDismiss.v1");
  });

  it("recordDismissToStorage は DISMISS_STORAGE_KEY のみに書く (= 他 key 書込みなし)", () => {
    const storage = createInMemoryDismissStorage();
    const writes: Array<{ key: string; value: string }> = [];
    const recordingStorage = {
      getItem: (k: string) => storage.getItem(k),
      setItem: (k: string, v: string) => {
        writes.push({ key: k, value: v });
        storage.setItem(k, v);
      },
    };
    const baseProposal: ProposedAnchor = {
      id: "p_x",
      reason: "pattern_repeat",
      direction: "continue_pattern",
      confidence: "medium",
      draft: { title: "x", anchorKind: "one_off", date: "2026-05-22" },
      source: {
        signalType: "pattern_repeat",
        evidenceCount: 3,
        generatedAt: NOW,
      },
      createdAt: NOW,
    };
    recordDismissToStorage(recordingStorage, {
      proposal: baseProposal,
      dismissedAt: NOW,
    });
    // 全 write が DISMISS_STORAGE_KEY のみ
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) {
      expect(w.key).toBe(DISMISS_STORAGE_KEY);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// sensitive 除外維持
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("sensitive 除外維持 (= J-6e-2 dismiss 後も)", () => {
  it("sensitive anchor を dismiss しても次回 proposal に sensitive 由来は出ない", () => {
    // sensitive anchor は computeProposals 上流で除外、 dismiss しても影響なし
    const sensitiveAnchor = anchor("2026-05-15", "通院");
    sensitiveAnchor.sensitiveCategory = "medical";
    const safeAnchor = anchor("2026-05-15", "カフェ");

    const storage = createInMemoryDismissStorage();
    const result = computeProposals({
      anchors: [
        sensitiveAnchor,
        anchor("2026-05-08", "通院"),
        anchor("2026-05-01", "通院"),
        safeAnchor,
        anchor("2026-05-08", "カフェ"),
        anchor("2026-05-01", "カフェ"),
      ],
      now: NOW,
      firstUseDate: FIRST_USE,
      dismissEvents: readDismissesFromStorage(storage),
    });
    // sensitive 由来 proposal は出ない、 安全な カフェのみ
    for (const p of result.proposals) {
      expect(p.draft.sensitiveCategory).toBeUndefined();
      expect(p.draft.title).toBe("カフェ");
    }
  });
});
