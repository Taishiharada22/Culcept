import { describe, it, expect } from "vitest";

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import {
  EXISTING_FALLBACK_BLOCK_MIN,
  anchorsToTimelineBlocks,
} from "@/app/(culcept)/plan/components/compose/anchorsToTimelineBlocks";

function oneOff(
  id: string,
  startTime: string,
  endTime: string | undefined,
  title = "予定",
): ExternalAnchor {
  return {
    id,
    userId: "u1",
    anchorKind: "one_off",
    date: "2026-06-01",
    title,
    startTime,
    ...(endTime !== undefined ? { endTime } : {}),
    rigidity: "soft",
    sourceId: "s1",
    confirmedAt: "2026-06-01T00:00:00.000Z",
  } as ExternalAnchor;
}

describe("anchorsToTimelineBlocks", () => {
  it("end あり → その end、tone=existing", () => {
    const blocks = anchorsToTimelineBlocks([oneOff("a", "15:00", "17:00", "会議")]);
    expect(blocks).toEqual([
      { id: "a", label: "会議", startMin: 900, endMin: 1020, tone: "existing" },
    ]);
  });

  it("end 無 → start + 既定長（表示専用）", () => {
    const blocks = anchorsToTimelineBlocks([oneOff("a", "10:00", undefined)]);
    expect(blocks[0].startMin).toBe(600);
    expect(blocks[0].endMin).toBe(600 + EXISTING_FALLBACK_BLOCK_MIN);
  });

  it("wrap（end ≤ start）→ start + 既定長（表示専用）", () => {
    const blocks = anchorsToTimelineBlocks([oneOff("a", "23:30", "00:30")]);
    expect(blocks[0].startMin).toBe(1410);
    expect(blocks[0].endMin).toBe(1410 + EXISTING_FALLBACK_BLOCK_MIN);
  });

  it("HH:MM:SS も分に変換", () => {
    const blocks = anchorsToTimelineBlocks([oneOff("a", "09:05:30", "10:00:00")]);
    expect(blocks[0].startMin).toBe(545);
    expect(blocks[0].endMin).toBe(600);
  });

  it("startMin 昇順に並べる", () => {
    const blocks = anchorsToTimelineBlocks([
      oneOff("late", "18:00", "19:00"),
      oneOff("early", "07:00", "08:00"),
    ]);
    expect(blocks.map((b) => b.id)).toEqual(["early", "late"]);
  });
});
