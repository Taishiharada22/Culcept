/**
 * P3 W3-5 — importIcsAnchorsAction pure helper 単体 test
 *
 * 検証範囲:
 *   - partitionDraftsByExistingUids: dedup edge case (= 空 / 全 match / 混在 / externalUid 未定義 / 空文字)
 *   - draftToAnchorInput: 変換 contract (= one_off / recurring / sourceType='ics' / externalUid)
 *   - memory repository を介した externalUid round-trip (= W3-3 mapping の SoT 検証)
 *
 * 不変原則:
 *   - pure helper は deterministic、 入力 mutate なし
 *   - server action 本体 (= supabase + auth) は本 test の範囲外
 */

import { describe, expect, it } from "vitest";

import type {
  ExternalAnchor,
  OneOffExternalAnchor,
} from "@/lib/plan/external-anchor";
import { createMemoryExternalAnchorRepository } from "@/lib/plan/external-anchor-repository-memory";
import {
  draftToAnchorInput,
  partitionDraftsByExistingUids,
} from "@/lib/plan/ics/importIcsAnchorsHelpers";
import type { IcsAnchorDraft } from "@/lib/plan/ics/icsToAnchorMapper";

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
    sourceUid: "uid-001",
    source: {
      uid: "uid-001",
      summary: "Test Event",
      startDateIso: "2026-06-01T09:00:00.000Z",
      isAllDay: false,
    },
    ...overrides,
  };
}

function makeRecurringDraft(
  overrides: Partial<IcsAnchorDraft> = {},
): IcsAnchorDraft {
  return {
    anchorKind: "recurring",
    title: "Weekly Standup",
    startTime: "10:00",
    validFrom: "2026-06-01",
    recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
    rigidity: "hard",
    sourceUid: "uid-recur-001",
    source: {
      uid: "uid-recur-001",
      summary: "Weekly Standup",
      startDateIso: "2026-06-01T10:00:00.000Z",
      isAllDay: false,
      recurrenceRuleRaw: "FREQ=WEEKLY;BYDAY=MO",
    },
    ...overrides,
  };
}

function makeAnchor(
  overrides: Partial<OneOffExternalAnchor> = {},
): ExternalAnchor {
  const base: OneOffExternalAnchor = {
    anchorKind: "one_off",
    id: "anchor-001",
    userId: "user-A",
    sourceId: "source-001",
    title: "Existing",
    startTime: "09:00",
    date: "2026-06-01",
    rigidity: "hard",
    confirmedAt: "2026-05-26T10:00:00.000Z",
  };
  return { ...base, ...overrides };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// partitionDraftsByExistingUids
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("partitionDraftsByExistingUids", () => {
  it("drafts 空 → kept=[], skipped=0", () => {
    const r = partitionDraftsByExistingUids([], [makeAnchor()]);
    expect(r.kept).toEqual([]);
    expect(r.skipped).toBe(0);
  });

  it("existingAnchors 空 → 全 draft kept", () => {
    const drafts = [
      makeOneOffDraft({ sourceUid: "a" }),
      makeOneOffDraft({ sourceUid: "b" }),
    ];
    const r = partitionDraftsByExistingUids(drafts, []);
    expect(r.kept).toHaveLength(2);
    expect(r.skipped).toBe(0);
  });

  it("全 draft が既存 UID と一致 → kept=[], skipped=N", () => {
    const drafts = [
      makeOneOffDraft({ sourceUid: "uid-001" }),
      makeOneOffDraft({ sourceUid: "uid-002" }),
    ];
    const existing = [
      makeAnchor({ id: "a1", externalUid: "uid-001" }),
      makeAnchor({ id: "a2", externalUid: "uid-002" }),
    ];
    const r = partitionDraftsByExistingUids(drafts, existing);
    expect(r.kept).toEqual([]);
    expect(r.skipped).toBe(2);
  });

  it("混在 → 一致したものだけ skip、 残りは kept (順序保持)", () => {
    const drafts = [
      makeOneOffDraft({ sourceUid: "new-1", title: "新規 1" }),
      makeOneOffDraft({ sourceUid: "dup-1", title: "重複 1" }),
      makeOneOffDraft({ sourceUid: "new-2", title: "新規 2" }),
    ];
    const existing = [makeAnchor({ id: "a1", externalUid: "dup-1" })];
    const r = partitionDraftsByExistingUids(drafts, existing);
    expect(r.skipped).toBe(1);
    expect(r.kept).toHaveLength(2);
    expect(r.kept[0]?.title).toBe("新規 1");
    expect(r.kept[1]?.title).toBe("新規 2");
  });

  it("既存 anchor の externalUid 未定義 → dedup 対象外 (= 全 draft kept)", () => {
    const drafts = [makeOneOffDraft({ sourceUid: "uid-001" })];
    const existing = [makeAnchor({ id: "a1" /* externalUid 未設定 */ })];
    const r = partitionDraftsByExistingUids(drafts, existing);
    expect(r.kept).toHaveLength(1);
    expect(r.skipped).toBe(0);
  });

  it("既存 anchor の externalUid が空文字 → dedup 対象外 (= 守備的)", () => {
    const drafts = [makeOneOffDraft({ sourceUid: "uid-001" })];
    const existing = [makeAnchor({ id: "a1", externalUid: "" })];
    const r = partitionDraftsByExistingUids(drafts, existing);
    expect(r.kept).toHaveLength(1);
    expect(r.skipped).toBe(0);
  });

  it("入力 mutate なし (= 参照同一性保持)", () => {
    const drafts = [makeOneOffDraft({ sourceUid: "a" })];
    const existing = [makeAnchor({ externalUid: "b" })];
    const draftsCopy = [...drafts];
    const existingCopy = [...existing];
    partitionDraftsByExistingUids(drafts, existing);
    expect(drafts).toEqual(draftsCopy);
    expect(existing).toEqual(existingCopy);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// draftToAnchorInput
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("draftToAnchorInput", () => {
  it("one_off draft → CreateOneOffAnchorInput (= sourceType='ics' + externalUid)", () => {
    const draft = makeOneOffDraft({
      sourceUid: "ics-uid-abc",
      title: "歯科予約",
      startTime: "14:30",
      endTime: "15:00",
      date: "2026-06-15",
      locationText: "クリニック",
      rigidity: "hard",
    });
    const input = draftToAnchorInput(draft);
    expect(input.anchorKind).toBe("one_off");
    expect(input.sourceType).toBe("ics");
    expect(input.externalUid).toBe("ics-uid-abc");
    expect(input.title).toBe("歯科予約");
    expect(input.startTime).toBe("14:30");
    expect(input.endTime).toBe("15:00");
    expect(input.locationText).toBe("クリニック");
    expect(input.rigidity).toBe("hard");
    if (input.anchorKind === "one_off") {
      expect(input.date).toBe("2026-06-15");
    }
  });

  it("recurring draft → CreateRecurringAnchorInput (= validFrom + recurrenceRule)", () => {
    const draft = makeRecurringDraft({
      sourceUid: "ics-uid-recur",
      title: "週次 1on1",
      startTime: "10:00",
      validFrom: "2026-06-01",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=TU",
      rigidity: "soft",
    });
    const input = draftToAnchorInput(draft);
    expect(input.anchorKind).toBe("recurring");
    expect(input.sourceType).toBe("ics");
    expect(input.externalUid).toBe("ics-uid-recur");
    expect(input.rigidity).toBe("soft");
    if (input.anchorKind === "recurring") {
      expect(input.validFrom).toBe("2026-06-01");
      expect(input.recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=TU");
    }
  });

  it("optional fields 未設定 → 出力にも未設定 (= exactOptionalPropertyTypes 互換)", () => {
    const draft: IcsAnchorDraft = {
      anchorKind: "one_off",
      title: "Min Event",
      startTime: "08:00",
      date: "2026-07-01",
      rigidity: "hard",
      sourceUid: "uid-min",
      source: {
        uid: "uid-min",
        summary: "Min Event",
        startDateIso: "2026-07-01T08:00:00.000Z",
        isAllDay: false,
      },
    };
    const input = draftToAnchorInput(draft);
    expect(input.endTime).toBeUndefined();
    expect(input.locationText).toBeUndefined();
  });

  it("malformed one_off (= date 欠落) → throw (= mapper bug 検出)", () => {
    const broken: IcsAnchorDraft = {
      anchorKind: "one_off",
      title: "Broken",
      startTime: "09:00",
      // date 欠落
      rigidity: "hard",
      sourceUid: "uid-broken",
      source: {
        uid: "uid-broken",
        summary: "Broken",
        startDateIso: "2026-06-01T09:00:00.000Z",
        isAllDay: false,
      },
    };
    expect(() => draftToAnchorInput(broken)).toThrow(/one_off.*missing date/);
  });

  it("malformed recurring (= recurrenceRule 欠落) → throw", () => {
    const broken: IcsAnchorDraft = {
      anchorKind: "recurring",
      title: "Broken Recur",
      startTime: "10:00",
      validFrom: "2026-06-01",
      // recurrenceRule 欠落
      rigidity: "hard",
      sourceUid: "uid-broken-r",
      source: {
        uid: "uid-broken-r",
        summary: "Broken Recur",
        startDateIso: "2026-06-01T10:00:00.000Z",
        isAllDay: false,
      },
    };
    expect(() => draftToAnchorInput(broken)).toThrow(
      /recurring.*missing validFrom\/recurrenceRule/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// externalUid round-trip through memory repository
// (= W3-3 supabase repository の SoT 検証として memory 経由で代用)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("externalUid round-trip through repository", () => {
  it("ics source + externalUid 付き one_off → listAnchors で externalUid 復元", async () => {
    const repo = createMemoryExternalAnchorRepository();
    const draft = makeOneOffDraft({
      sourceUid: "ics-round-trip-001",
      title: "通院",
      date: "2026-06-10",
      startTime: "16:00",
    });
    const input = draftToAnchorInput(draft);
    const r = await repo.createSourceWithAnchors("user-A", {
      source: { sourceType: "ics", rawRetention: "discarded" },
      anchors: [input],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return; // narrow

    expect(r.source.sourceType).toBe("ics");
    expect(r.anchors).toHaveLength(1);
    expect(r.anchors[0]?.externalUid).toBe("ics-round-trip-001");

    // listAnchors からも externalUid が返る
    const list = await repo.listAnchors("user-A");
    expect(list).toHaveLength(1);
    expect(list[0]?.externalUid).toBe("ics-round-trip-001");
  });

  it("ics source + recurring → externalUid 復元 (= recurring branch も対称)", async () => {
    const repo = createMemoryExternalAnchorRepository();
    const draft = makeRecurringDraft({
      sourceUid: "ics-recur-uid",
      title: "週次予約",
      startTime: "09:30",
      validFrom: "2026-06-01",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=FR",
    });
    const input = draftToAnchorInput(draft);
    const r = await repo.createSourceWithAnchors("user-A", {
      source: { sourceType: "ics", rawRetention: "discarded" },
      anchors: [input],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const list = await repo.listAnchors("user-A");
    expect(list[0]?.externalUid).toBe("ics-recur-uid");
    expect(list[0]?.anchorKind).toBe("recurring");
  });

  it("manual source (= externalUid なし入力) → externalUid undefined 維持", async () => {
    const repo = createMemoryExternalAnchorRepository();
    const r = await repo.createSourceWithAnchors("user-A", {
      source: { sourceType: "manual" },
      anchors: [
        {
          anchorKind: "one_off",
          title: "手動予約",
          date: "2026-06-20",
          startTime: "11:00",
          rigidity: "hard",
          sourceType: "manual",
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.anchors[0]?.externalUid).toBeUndefined();
  });
});
