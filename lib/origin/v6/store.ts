// lib/origin/v6/store.ts
// localStorage persistence for the Life Map v6.

import type {
  RoadmapSave,
  ChapterProgress,
  ChapterStatus,
  ThemeType,
  BranchAnswer,
  ChapterDef,
} from "./types";
import { UNLOCK_THRESHOLD, COMPLETE_THRESHOLD } from "./chapters";

const STORAGE_KEY = "culcept_life_roadmap_v6";

/* ─── Load / Save ─── */

export function loadRoadmapData(): RoadmapSave | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 6) return null;
    return parsed as RoadmapSave;
  } catch {
    return null;
  }
}

export function saveRoadmapData(data: RoadmapSave): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors
  }
}

/* ─── Create initial data ─── */

export function createInitialData(
  chapters: ChapterDef[],
  originChapterId?: string,
): RoadmapSave {
  const now = new Date().toISOString();
  const chapterStates: Record<string, ChapterProgress> = {};

  for (const ch of chapters) {
    chapterStates[ch.id] = {
      status: ch.order === 0 ? "available" : "locked",
      branches: {},
    };
  }

  return {
    version: 6,
    chapters: chapterStates,
    originChapterId: originChapterId ?? chapters[0]?.id ?? "birth",
    createdAt: now,
    updatedAt: now,
  };
}

/* ─── Getters ─── */

export function getChapterProgress(
  data: RoadmapSave,
  chapterId: string,
): ChapterProgress {
  return (
    data.chapters[chapterId] ?? { status: "locked" as ChapterStatus, branches: {} }
  );
}

export function countBranchAnswers(progress: ChapterProgress): number {
  return Object.keys(progress.branches).filter(
    (k) => (progress.branches[k as ThemeType] ?? []).length > 0,
  ).length;
}

/* ─── Compute branch strength (how many answers for a theme) ─── */

export function getBranchStrength(
  progress: ChapterProgress,
  theme: ThemeType,
): number {
  return (progress.branches[theme] ?? []).length;
}

/* ─── Add a branch answer ─── */

export function addBranchAnswer(
  data: RoadmapSave,
  chapterId: string,
  theme: ThemeType,
  answer: BranchAnswer,
): RoadmapSave {
  const now = new Date().toISOString();
  const prev = getChapterProgress(data, chapterId);

  const existingAnswers = prev.branches[theme] ?? [];
  const updatedBranches = {
    ...prev.branches,
    [theme]: [...existingAnswers, answer],
  };

  const updatedProgress: ChapterProgress = {
    ...prev,
    status: prev.status === "available" ? "in_progress" : prev.status,
    branches: updatedBranches,
  };

  // Check if chapter should be marked complete
  const branchCount = Object.keys(updatedProgress.branches).filter(
    (k) => (updatedProgress.branches[k as ThemeType] ?? []).length > 0,
  ).length;
  if (branchCount >= COMPLETE_THRESHOLD && updatedProgress.status !== "complete") {
    updatedProgress.status = "complete";
  }

  return {
    ...data,
    chapters: {
      ...data.chapters,
      [chapterId]: updatedProgress,
    },
    updatedAt: now,
  };
}

/* ─── Recompute unlock states ─── */

export function recomputeUnlocks(
  data: RoadmapSave,
  orderedChapterIds: string[],
): RoadmapSave {
  const updated = { ...data, chapters: { ...data.chapters } };

  for (let i = 1; i < orderedChapterIds.length; i++) {
    const prevId = orderedChapterIds[i - 1];
    const currId = orderedChapterIds[i];
    const prev = getChapterProgress(updated, prevId);
    const curr = getChapterProgress(updated, currId);

    if (curr.status === "locked") {
      const prevAnswers = countBranchAnswers(prev);
      if (prevAnswers >= UNLOCK_THRESHOLD) {
        updated.chapters[currId] = { ...curr, status: "available" };
      }
    }
  }

  return updated;
}
