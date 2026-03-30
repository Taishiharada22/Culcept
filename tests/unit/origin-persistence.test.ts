import { describe, it, expect } from "vitest";

import {
  createEmptyOriginSave,
  resolveOriginLandingState,
} from "../../lib/origin/v7/persistence";
import type { DraftChapter, MemoryChapter } from "../../lib/origin/v7/types";

function makeDraft(overrides: Partial<DraftChapter> = {}): DraftChapter {
  return {
    period: null,
    atmosphere: null,
    perspective: null,
    comparison: null,
    triggers: [],
    aiNarrative: null,
    aiTitle: null,
    aiEchoes: null,
    aiLayers: null,
    correction: null,
    ...overrides,
  };
}

function makeChapter(id: string): MemoryChapter {
  return {
    id,
    title: "Chapter",
    echoes: ["余韻"],
    fact: {
      period: "high_school",
      triggers: ["library"],
    },
    mood: {
      atmosphere: "quiet",
      perspective: "serious",
      comparison: "softened",
    },
    meaning: {
      aiNarrative: {
        narrative: "narrative",
        generatedAt: "2026-03-09T00:00:00.000Z",
        model: "test",
      },
      correction: {
        level: "close",
        editedText: "narrative",
        correctedAt: "2026-03-09T00:00:00.000Z",
      },
      finalText: "narrative",
    },
    connections: [],
    createdAt: "2026-03-09T00:00:00.000Z",
    updatedAt: "2026-03-09T00:00:00.000Z",
    revisitCount: 0,
  };
}

describe("Origin persistence", () => {
  it("completed result takes priority over empty-state fallback", () => {
    const save = {
      ...createEmptyOriginSave("2026-03-09T00:00:00.000Z"),
      chapters: [makeChapter("chapter-1")],
    };

    const resolved = resolveOriginLandingState({
      save,
      meta: {
        activeSessionId: null,
        activeSessionStatus: null,
        latestSessionId: "session-1",
        latestSessionCompleted: true,
        latestSessionResultGenerated: true,
        latestRecordId: "chapter-1",
      },
    });

    expect(resolved.primaryView).toBe("result");
    expect(resolved.resumeAvailable).toBe(false);
  });

  it("completed session without result falls into generating before empty", () => {
    const resolved = resolveOriginLandingState({
      save: createEmptyOriginSave("2026-03-09T00:00:00.000Z"),
      meta: {
        activeSessionId: null,
        activeSessionStatus: null,
        latestSessionId: "session-2",
        latestSessionCompleted: true,
        latestSessionResultGenerated: false,
        latestRecordId: null,
      },
    });

    expect(resolved.primaryView).toBe("generating");
  });

  it("in-progress draft resumes when there is no saved result yet", () => {
    const save = {
      ...createEmptyOriginSave("2026-03-09T00:00:00.000Z"),
      draft: makeDraft({ period: "high_school" }),
    };

    const resolved = resolveOriginLandingState({
      save,
      meta: {
        activeSessionId: "session-3",
        activeSessionStatus: "in_progress",
        latestSessionId: "session-3",
        latestSessionCompleted: false,
        latestSessionResultGenerated: false,
        latestRecordId: null,
      },
    });

    expect(resolved.primaryView).toBe("resume");
    expect(resolved.resumeAvailable).toBe(true);
  });

  it("saved result stays visible even when a newer draft exists", () => {
    const save = {
      ...createEmptyOriginSave("2026-03-09T00:00:00.000Z"),
      chapters: [makeChapter("chapter-2")],
      draft: makeDraft({ period: "thirties" }),
    };

    const resolved = resolveOriginLandingState({
      save,
      meta: {
        activeSessionId: "session-4",
        activeSessionStatus: "in_progress",
        latestSessionId: "session-4",
        latestSessionCompleted: false,
        latestSessionResultGenerated: false,
        latestRecordId: "chapter-2",
      },
    });

    expect(resolved.primaryView).toBe("result");
    expect(resolved.resumeAvailable).toBe(true);
  });
});
