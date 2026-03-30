import type { OriginV7Save, DraftChapter, MemoryChapter, MeaningLayer, CurrentPosition, ChapterLayers, ContradictionResolution, CollapseGrowthInsight, TargetedResponse, MemoryGem, MemoryDiveDraft, MicroQuestionAnswer, MicroQuestionStreak } from "./types";
import type { RootProfile, EraAffiliation, ActivityEntry, TurningPoint, ResidueItem } from "./workspaceTypes";
import { createEmptyDraft } from "./types";
import { mergeLayers } from "./layerExtraction";

const STORAGE_KEY = "culcept_origin_memory_v7";

/* ─── Load / Save ─── */

export function loadOriginV7(): OriginV7Save | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 7) return null;
    return parsed as OriginV7Save;
  } catch {
    return null;
  }
}

export function saveOriginV7(data: OriginV7Save): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage full etc.
  }
}

export function createInitialData(): OriginV7Save {
  const now = new Date().toISOString();
  return {
    version: 7,
    chapters: [],
    draft: null,
    currentPosition: null,
    createdAt: now,
    updatedAt: now,
  };
}

/* ─── Draft management ─── */

export function getOrCreateData(): OriginV7Save {
  return loadOriginV7() ?? createInitialData();
}

export function saveDraft(draft: DraftChapter): void {
  const data = getOrCreateData();
  data.draft = draft;
  data.updatedAt = new Date().toISOString();
  saveOriginV7(data);
}

export function clearDraft(): void {
  const data = getOrCreateData();
  data.draft = null;
  data.updatedAt = new Date().toISOString();
  saveOriginV7(data);
}

export function loadDraft(): DraftChapter | null {
  return getOrCreateData().draft;
}

/* ─── Chapter management ─── */

export function saveChapter(
  draft: DraftChapter,
  meaning: MeaningLayer,
  meta?: { title?: string; echoes?: string[]; layers?: ChapterLayers },
): MemoryChapter {
  if (!draft.period) throw new Error("period is required");

  const now = new Date().toISOString();
  const chapter: MemoryChapter = {
    id: crypto.randomUUID(),
    title: meta?.title || "",
    echoes: meta?.echoes ?? [],
    fact: {
      period: draft.period,
      triggers: draft.triggers,
    },
    mood: {
      atmosphere: draft.atmosphere ?? "",
      perspective: draft.perspective ?? "",
      comparison: draft.comparison ?? "",
    },
    meaning,
    layers: meta?.layers ?? draft.aiLayers ?? undefined,
    connections: [],
    createdAt: now,
    updatedAt: now,
    revisitCount: 0,
  };

  const data = getOrCreateData();
  data.chapters.push(chapter);
  data.draft = null;
  data.updatedAt = now;
  saveOriginV7(data);

  return chapter;
}

export function getChapters(): MemoryChapter[] {
  return getOrCreateData().chapters;
}

/* ─── Chapter update (deep exploration) ─── */

export function updateChapter(
  chapterId: string,
  updatedLayers: Partial<ChapterLayers>,
  newEchoes?: string[],
  newTitle?: string,
  hypothesis?: string,
): MemoryChapter | null {
  const data = getOrCreateData();
  const idx = data.chapters.findIndex((c) => c.id === chapterId);
  if (idx === -1) return null;

  const chapter = data.chapters[idx];
  const now = new Date().toISOString();

  // Merge layers
  chapter.layers = mergeLayers(chapter.layers ?? {}, updatedLayers);

  // Merge echoes (deduplicated)
  if (newEchoes && newEchoes.length > 0) {
    const existing = new Set(chapter.echoes);
    for (const e of newEchoes) {
      if (!existing.has(e)) {
        chapter.echoes.push(e);
        existing.add(e);
      }
    }
  }

  // Update title if provided
  if (newTitle) {
    chapter.title = newTitle;
  }

  // Update hypothesis in meaning
  if (hypothesis) {
    chapter.meaning.finalText = hypothesis;
  }

  chapter.updatedAt = now;
  chapter.revisitCount += 1;

  data.chapters[idx] = chapter;
  data.updatedAt = now;
  saveOriginV7(data);

  return chapter;
}

/* ─── Spawn fragment (derivative chapter) ─── */

export function spawnFragment(
  parentChapter: MemoryChapter,
  layers: ChapterLayers,
  meta?: { title?: string; echoes?: string[]; hypothesis?: string },
): MemoryChapter {
  const now = new Date().toISOString();
  const shortId = crypto.randomUUID().slice(0, 8);

  const fragment: MemoryChapter = {
    id: `${parentChapter.id}_sub_${shortId}`,
    title: meta?.title || "",
    echoes: meta?.echoes ?? [],
    fact: {
      period: parentChapter.fact.period,
      triggers: [],
    },
    mood: {
      atmosphere: parentChapter.mood.atmosphere,
      perspective: "",
      comparison: "",
    },
    meaning: {
      aiNarrative: {
        narrative: meta?.hypothesis ?? "",
        generatedAt: now,
        model: "spawned",
      },
      correction: {
        level: "close",
        editedText: null,
        correctedAt: now,
      },
      finalText: meta?.hypothesis ?? "",
    },
    layers,
    connections: [],
    parentChapterId: parentChapter.id,
    createdAt: now,
    updatedAt: now,
    revisitCount: 0,
  };

  const data = getOrCreateData();
  data.chapters.push(fragment);
  data.updatedAt = now;
  saveOriginV7(data);

  return fragment;
}

/* ─── Current Position ─── */

export function saveCurrentPosition(pos: CurrentPosition): void {
  const data = getOrCreateData();
  data.currentPosition = pos;
  data.updatedAt = new Date().toISOString();
  saveOriginV7(data);
}

export function loadCurrentPosition(): CurrentPosition | null {
  return getOrCreateData().currentPosition;
}

export function startNewDraft(): DraftChapter {
  const draft = createEmptyDraft();
  saveDraft(draft);
  return draft;
}

/* ─── Root Profile ─── */

export function saveRootProfile(profile: RootProfile): void {
  const data = getOrCreateData();
  data.rootProfile = profile;
  data.updatedAt = new Date().toISOString();
  saveOriginV7(data);
}

export function loadRootProfile(): RootProfile | null {
  return getOrCreateData().rootProfile ?? null;
}

/* ─── Era Affiliations ─── */

export function saveEraAffiliation(era: EraAffiliation): void {
  const data = getOrCreateData();
  const list = data.eraAffiliations ?? [];
  const idx = list.findIndex((e) => e.id === era.id);
  if (idx === -1) {
    list.push(era);
  } else {
    list[idx] = era;
  }
  data.eraAffiliations = list;
  data.updatedAt = new Date().toISOString();
  saveOriginV7(data);
}

export function updateEraAffiliation(id: string, update: Partial<EraAffiliation>): void {
  const data = getOrCreateData();
  const list = data.eraAffiliations ?? [];
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...update };
  data.eraAffiliations = list;
  data.updatedAt = new Date().toISOString();
  saveOriginV7(data);
}

export function deleteEraAffiliation(id: string): void {
  const data = getOrCreateData();
  data.eraAffiliations = (data.eraAffiliations ?? []).filter((e) => e.id !== id);
  data.updatedAt = new Date().toISOString();
  saveOriginV7(data);
}

export function loadEraAffiliations(): EraAffiliation[] {
  return getOrCreateData().eraAffiliations ?? [];
}

/* ─── Activities ─── */

export function saveActivity(activity: ActivityEntry): void {
  const data = getOrCreateData();
  const list = data.activities ?? [];
  const idx = list.findIndex((a) => a.id === activity.id);
  if (idx === -1) {
    list.push(activity);
  } else {
    list[idx] = activity;
  }
  data.activities = list;
  data.updatedAt = new Date().toISOString();
  saveOriginV7(data);
}

export function updateActivity(id: string, update: Partial<ActivityEntry>): void {
  const data = getOrCreateData();
  const list = data.activities ?? [];
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...update };
  data.activities = list;
  data.updatedAt = new Date().toISOString();
  saveOriginV7(data);
}

export function deleteActivity(id: string): void {
  const data = getOrCreateData();
  data.activities = (data.activities ?? []).filter((a) => a.id !== id);
  data.updatedAt = new Date().toISOString();
  saveOriginV7(data);
}

export function loadActivities(): ActivityEntry[] {
  return getOrCreateData().activities ?? [];
}

/* ─── Turning Points ─── */

export function saveTurningPoint(tp: TurningPoint): void {
  const data = getOrCreateData();
  const list = data.turningPoints ?? [];
  const idx = list.findIndex((t) => t.id === tp.id);
  if (idx === -1) {
    list.push(tp);
  } else {
    list[idx] = tp;
  }
  data.turningPoints = list;
  data.updatedAt = new Date().toISOString();
  saveOriginV7(data);
}

export function updateTurningPoint(id: string, update: Partial<TurningPoint>): void {
  const data = getOrCreateData();
  const list = data.turningPoints ?? [];
  const idx = list.findIndex((t) => t.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...update };
  data.turningPoints = list;
  data.updatedAt = new Date().toISOString();
  saveOriginV7(data);
}

export function deleteTurningPoint(id: string): void {
  const data = getOrCreateData();
  data.turningPoints = (data.turningPoints ?? []).filter((t) => t.id !== id);
  data.updatedAt = new Date().toISOString();
  saveOriginV7(data);
}

export function loadTurningPoints(): TurningPoint[] {
  return getOrCreateData().turningPoints ?? [];
}

/* ─── Residue Board ─── */

export function saveResidueItem(item: ResidueItem): void {
  const data = getOrCreateData();
  const list = data.residueBoard ?? [];
  const idx = list.findIndex((r) => r.id === item.id);
  if (idx === -1) {
    list.push(item);
  } else {
    list[idx] = item;
  }
  data.residueBoard = list;
  data.updatedAt = new Date().toISOString();
  saveOriginV7(data);
}

export function updateResidueItem(id: string, update: Partial<ResidueItem>): void {
  const data = getOrCreateData();
  const list = data.residueBoard ?? [];
  const idx = list.findIndex((r) => r.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...update };
  data.residueBoard = list;
  data.updatedAt = new Date().toISOString();
  saveOriginV7(data);
}

export function deleteResidueItem(id: string): void {
  const data = getOrCreateData();
  data.residueBoard = (data.residueBoard ?? []).filter((r) => r.id !== id);
  data.updatedAt = new Date().toISOString();
  saveOriginV7(data);
}

export function loadResidueBoard(): ResidueItem[] {
  return getOrCreateData().residueBoard ?? [];
}

/* ─── v6: Contradiction Resolutions ─── */

export function saveContradictionResolution(resolution: ContradictionResolution): void {
  const data = getOrCreateData();
  const list = data.contradictionResolutions ?? [];
  const idx = list.findIndex((r) => r.contradictionId === resolution.contradictionId);
  if (idx === -1) {
    list.push(resolution);
  } else {
    list[idx] = resolution;
  }
  data.contradictionResolutions = list;
  data.updatedAt = new Date().toISOString();
  saveOriginV7(data);
}

export function loadContradictionResolutions(): ContradictionResolution[] {
  return getOrCreateData().contradictionResolutions ?? [];
}

/* ─── v6: Collapse/Growth Insights ─── */

export function saveCollapseGrowthInsight(insight: CollapseGrowthInsight): void {
  const data = getOrCreateData();
  const list = data.collapseGrowthInsights ?? [];
  const idx = list.findIndex(
    (i) => i.sourceId === insight.sourceId && i.type === insight.type,
  );
  if (idx === -1) {
    list.push(insight);
  } else {
    list[idx] = insight;
  }
  data.collapseGrowthInsights = list;
  data.updatedAt = new Date().toISOString();
  saveOriginV7(data);
}

export function loadCollapseGrowthInsights(): CollapseGrowthInsight[] {
  return getOrCreateData().collapseGrowthInsights ?? [];
}

/* ─── v6: Targeted Responses (Vector Refinement) ─── */

export function saveTargetedResponse(response: TargetedResponse): void {
  const data = getOrCreateData();
  const list = data.targetedResponses ?? [];
  const idx = list.findIndex((r) => r.promptId === response.promptId);
  if (idx === -1) {
    list.push(response);
  } else {
    list[idx] = response;
  }
  data.targetedResponses = list;
  data.updatedAt = new Date().toISOString();
  saveOriginV7(data);
}

export function loadTargetedResponses(): TargetedResponse[] {
  return getOrCreateData().targetedResponses ?? [];
}

/* ─── v8: Memory Gems ─── */

export function saveMemoryGem(gem: MemoryGem): void {
  const data = getOrCreateData();
  const list = data.memoryGems ?? [];
  list.push(gem);
  data.memoryGems = list;
  data.updatedAt = new Date().toISOString();
  saveOriginV7(data);
}

export function loadMemoryGems(): MemoryGem[] {
  return getOrCreateData().memoryGems ?? [];
}

/* ─── v8: Memory Dive Draft ─── */

export function saveMemoryDiveDraft(draft: MemoryDiveDraft | null): void {
  const data = getOrCreateData();
  data.memoryDiveDraft = draft;
  data.updatedAt = new Date().toISOString();
  saveOriginV7(data);
}

export function loadMemoryDiveDraft(): MemoryDiveDraft | null {
  return getOrCreateData().memoryDiveDraft ?? null;
}

/* ─── v8: Micro-Question Answers ─── */

export function saveMicroQuestionAnswer(answer: MicroQuestionAnswer): void {
  const data = getOrCreateData();
  const list = data.microQuestionAnswers ?? [];
  list.push(answer);
  data.microQuestionAnswers = list;
  data.updatedAt = new Date().toISOString();
  saveOriginV7(data);
}

export function loadMicroQuestionAnswers(): MicroQuestionAnswer[] {
  return getOrCreateData().microQuestionAnswers ?? [];
}

/* ─── v8: Micro-Question Streak ─── */

export function saveMicroQuestionStreak(streak: MicroQuestionStreak): void {
  const data = getOrCreateData();
  data.microQuestionStreak = streak;
  data.updatedAt = new Date().toISOString();
  saveOriginV7(data);
}

export function loadMicroQuestionStreak(): MicroQuestionStreak {
  return getOrCreateData().microQuestionStreak ?? {
    currentStreak: 0,
    longestStreak: 0,
    lastAnsweredDate: "",
    totalAnswered: 0,
  };
}

/* ─── v8: Birth Date ─── */

export function saveBirthDate(year: number, month: number): void {
  const data = getOrCreateData();
  data.birthYear = year;
  data.birthMonth = month;
  data.updatedAt = new Date().toISOString();
  saveOriginV7(data);
}

export function loadBirthDate(): { year: number; month: number } | null {
  const data = getOrCreateData();
  if (!data.birthYear || !data.birthMonth) return null;
  return { year: data.birthYear, month: data.birthMonth };
}
