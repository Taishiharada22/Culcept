/**
 * P3 W2-1 — icsPreviewBuilder contract test (= pure module、 簡易重複候補判定)
 *
 * 検証範囲:
 *   - drafts 空 → []
 *   - existingAnchors 空 → 全 draft.candidates=[]
 *   - exact_match (= title + date + startTime 一致)
 *   - same_title_same_day (= title + date 一致、 時刻違い)
 *   - same_time (= date + startTime 一致、 title 違い)
 *   - 一致なし → candidates=[]
 *   - 複数 anchor との比較で各々判定
 *   - recurring draft (= validFrom 比較)
 *   - describeDuplicateReason 日本語ラベル
 *
 * 不変原則: pure、 deterministic、 入力 mutate なし
 */

import { describe, expect, it } from "vitest";

import {
  buildIcsPreview,
  describeDuplicateReason,
  type DuplicateReason,
} from "@/lib/plan/ics/icsPreviewBuilder";
import type { IcsAnchorDraft } from "@/lib/plan/ics/icsToAnchorMapper";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeOneOffDraft(overrides: Partial<IcsAnchorDraft> = {}): IcsAnchorDraft {
  return {
    anchorKind: "one_off",
    title: "Test Event",
    startTime: "09:00",
    date: "2026-06-01",
    rigidity: "hard",
    sourceUid: "test-uid-001",
    source: {
      uid: "test-uid-001",
      summary: "Test Event",
      startDateIso: "2026-06-01T09:00:00.000Z",
      isAllDay: false,
    },
    ...overrides,
  };
}

function makeOneOffAnchor(overrides: Partial<ExternalAnchor> = {}): ExternalAnchor {
  return {
    anchorKind: "one_off",
    id: "anchor-001",
    userId: "user-test",
    title: "Existing Event",
    startTime: "09:00",
    date: "2026-06-01",
    rigidity: "hard",
    sourceId: "source-001",
    confirmedAt: "2026-05-25T10:00:00.000Z",
    ...overrides,
  } as ExternalAnchor;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildIcsPreview
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildIcsPreview: basic", () => {
  it("drafts 空 → []", () => {
    const result = buildIcsPreview([], []);
    expect(result).toEqual([]);
  });

  it("existingAnchors 空 → 全 draft.candidates=[]", () => {
    const drafts = [makeOneOffDraft({ sourceUid: "u1" })];
    const result = buildIcsPreview(drafts, []);
    expect(result.length).toBe(1);
    expect(result[0]!.duplicateCandidates).toEqual([]);
  });
});

describe("buildIcsPreview: exact_match (= title + date + startTime)", () => {
  it("title / date / startTime 完全一致 → exact_match", () => {
    const drafts = [
      makeOneOffDraft({
        sourceUid: "u1",
        title: "Team Meeting",
        date: "2026-06-01",
        startTime: "09:00",
      }),
    ];
    const anchors = [
      makeOneOffAnchor({
        id: "a1",
        title: "Team Meeting",
        date: "2026-06-01",
        startTime: "09:00",
      }),
    ];
    const result = buildIcsPreview(drafts, anchors);
    expect(result[0]!.duplicateCandidates.length).toBe(1);
    expect(result[0]!.duplicateCandidates[0]!.reason).toBe("exact_match");
    expect(result[0]!.duplicateCandidates[0]!.existingAnchorId).toBe("a1");
    expect(result[0]!.duplicateCandidates[0]!.existingTitle).toBe("Team Meeting");
  });
});

describe("buildIcsPreview: same_title_same_day (= title + date、 時刻違い)", () => {
  it("title + date 一致、 startTime 違い → same_title_same_day", () => {
    const drafts = [
      makeOneOffDraft({
        sourceUid: "u1",
        title: "Daily Standup",
        date: "2026-06-01",
        startTime: "10:00",
      }),
    ];
    const anchors = [
      makeOneOffAnchor({
        id: "a1",
        title: "Daily Standup",
        date: "2026-06-01",
        startTime: "11:00",
      }),
    ];
    const result = buildIcsPreview(drafts, anchors);
    expect(result[0]!.duplicateCandidates.length).toBe(1);
    expect(result[0]!.duplicateCandidates[0]!.reason).toBe("same_title_same_day");
  });
});

describe("buildIcsPreview: same_time (= date + startTime、 title 違い)", () => {
  it("date + startTime 一致、 title 違い → same_time", () => {
    const drafts = [
      makeOneOffDraft({
        sourceUid: "u1",
        title: "New Event",
        date: "2026-06-01",
        startTime: "09:00",
      }),
    ];
    const anchors = [
      makeOneOffAnchor({
        id: "a1",
        title: "Other Event",
        date: "2026-06-01",
        startTime: "09:00",
      }),
    ];
    const result = buildIcsPreview(drafts, anchors);
    expect(result[0]!.duplicateCandidates.length).toBe(1);
    expect(result[0]!.duplicateCandidates[0]!.reason).toBe("same_time");
  });
});

describe("buildIcsPreview: 一致なし", () => {
  it("date 違い → candidates=[]", () => {
    const drafts = [
      makeOneOffDraft({
        sourceUid: "u1",
        date: "2026-06-01",
        startTime: "09:00",
      }),
    ];
    const anchors = [
      makeOneOffAnchor({
        id: "a1",
        date: "2026-07-15", // 別日
        startTime: "09:00",
      }),
    ];
    const result = buildIcsPreview(drafts, anchors);
    expect(result[0]!.duplicateCandidates).toEqual([]);
  });

  it("date 同じだが title / startTime ともに違う → candidates=[]", () => {
    const drafts = [
      makeOneOffDraft({
        sourceUid: "u1",
        title: "Apple",
        date: "2026-06-01",
        startTime: "09:00",
      }),
    ];
    const anchors = [
      makeOneOffAnchor({
        id: "a1",
        title: "Orange",
        date: "2026-06-01",
        startTime: "15:00",
      }),
    ];
    const result = buildIcsPreview(drafts, anchors);
    expect(result[0]!.duplicateCandidates).toEqual([]);
  });
});

describe("buildIcsPreview: 複数 anchor 比較", () => {
  it("draft 1 件 + anchor 3 件 → 該当する全 anchor 候補返す", () => {
    const drafts = [
      makeOneOffDraft({
        sourceUid: "u1",
        title: "Meeting",
        date: "2026-06-01",
        startTime: "09:00",
      }),
    ];
    const anchors = [
      makeOneOffAnchor({
        id: "a1",
        title: "Meeting", // exact_match
        date: "2026-06-01",
        startTime: "09:00",
      }),
      makeOneOffAnchor({
        id: "a2",
        title: "Other",
        date: "2026-06-01",
        startTime: "09:00", // same_time
      }),
      makeOneOffAnchor({
        id: "a3",
        title: "Meeting",
        date: "2026-06-01",
        startTime: "14:00", // same_title_same_day
      }),
    ];
    const result = buildIcsPreview(drafts, anchors);
    expect(result[0]!.duplicateCandidates.length).toBe(3);
    const reasons = result[0]!.duplicateCandidates.map((c) => c.reason);
    expect(reasons).toContain("exact_match");
    expect(reasons).toContain("same_time");
    expect(reasons).toContain("same_title_same_day");
  });
});

describe("buildIcsPreview: pure 性", () => {
  it("入力 mutate なし", () => {
    const drafts = [makeOneOffDraft({})];
    const anchors = [makeOneOffAnchor({})];
    const snapshotDrafts = JSON.stringify(drafts);
    const snapshotAnchors = JSON.stringify(anchors);
    buildIcsPreview(drafts, anchors);
    expect(JSON.stringify(drafts)).toBe(snapshotDrafts);
    expect(JSON.stringify(anchors)).toBe(snapshotAnchors);
  });

  it("同入力 → 同出力 (= deterministic)", () => {
    const drafts = [makeOneOffDraft({})];
    const anchors = [makeOneOffAnchor({})];
    const r1 = buildIcsPreview(drafts, anchors);
    const r2 = buildIcsPreview(drafts, anchors);
    expect(r1).toEqual(r2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// describeDuplicateReason
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("describeDuplicateReason: 日本語ラベル", () => {
  it("exact_match → 「同じ予定が既にあります」", () => {
    expect(describeDuplicateReason("exact_match")).toBe(
      "同じ予定が既にあります",
    );
  });

  it("same_title_same_day → 「同じタイトル」 含む", () => {
    expect(describeDuplicateReason("same_title_same_day")).toContain(
      "同じタイトル",
    );
  });

  it("same_time → 「同じ時刻」 含む", () => {
    expect(describeDuplicateReason("same_time")).toContain("同じ時刻");
  });

  it("unknown reason → fallback", () => {
    expect(
      describeDuplicateReason("unknown_reason" as DuplicateReason),
    ).toBe("重複候補あり");
  });
});
