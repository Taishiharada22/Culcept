import type {
  CurrentPosition,
  DraftChapter,
  ExplorationStep,
  MemoryChapter,
  OriginV7Save,
} from "./types";

export type OriginSessionStatus =
  | "in_progress"
  | "generating"
  | "completed"
  | "cancelled";

export type OriginPrimaryView = "result" | "generating" | "resume" | "empty";

export type OriginViewMeta = {
  activeSessionId: string | null;
  activeSessionStatus: OriginSessionStatus | null;
  latestSessionId: string | null;
  latestSessionCompleted: boolean;
  latestSessionResultGenerated: boolean;
  latestRecordId: string | null;
};

export type OriginClientState = {
  save: OriginV7Save;
  meta: OriginViewMeta;
  primaryView: OriginPrimaryView;
  resumeAvailable: boolean;
  hasRemoteData: boolean;
};

export function createEmptyOriginSave(now = new Date().toISOString()): OriginV7Save {
  return {
    version: 7,
    chapters: [],
    draft: null,
    currentPosition: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function isDraftStarted(draft: DraftChapter | null | undefined): draft is DraftChapter {
  if (!draft) return false;
  return Boolean(
    draft.period ||
      draft.atmosphere ||
      draft.perspective ||
      draft.comparison ||
      draft.triggers.length > 0 ||
      draft.aiNarrative ||
      draft.correction,
  );
}

export function hasMeaningfulOriginSave(save: OriginV7Save | null | undefined): boolean {
  if (!save) return false;
  return (
    save.chapters.length > 0 ||
    isDraftStarted(save.draft) ||
    Boolean(save.currentPosition)
  );
}

export function inferStepFromDraft(draft: DraftChapter): ExplorationStep {
  if (!draft.period) return "period_selection";
  if (!draft.atmosphere) return "atmosphere";
  if (!draft.perspective) return "perspective";
  if (!draft.comparison) return "comparison";
  if (draft.triggers.length === 0) return "triggers";
  if (!draft.aiNarrative) return "ai_recovery";
  if (!draft.correction) return "correction";
  return "save";
}

function newerTimestamp(a?: string | null, b?: string | null): string {
  const aTime = a ? Date.parse(a) : Number.NaN;
  const bTime = b ? Date.parse(b) : Number.NaN;

  if (Number.isNaN(aTime) && Number.isNaN(bTime)) {
    return new Date().toISOString();
  }
  if (Number.isNaN(aTime)) return b ?? new Date().toISOString();
  if (Number.isNaN(bTime)) return a ?? new Date().toISOString();
  return aTime >= bTime ? (a as string) : (b as string);
}

function olderTimestamp(a?: string | null, b?: string | null): string {
  const aTime = a ? Date.parse(a) : Number.NaN;
  const bTime = b ? Date.parse(b) : Number.NaN;

  if (Number.isNaN(aTime) && Number.isNaN(bTime)) {
    return new Date().toISOString();
  }
  if (Number.isNaN(aTime)) return b ?? new Date().toISOString();
  if (Number.isNaN(bTime)) return a ?? new Date().toISOString();
  return aTime <= bTime ? (a as string) : (b as string);
}

function mergeChapters(
  primary: MemoryChapter[],
  secondary: MemoryChapter[],
): MemoryChapter[] {
  const byId = new Map<string, MemoryChapter>();

  for (const chapter of [...primary, ...secondary]) {
    const existing = byId.get(chapter.id);
    if (!existing) {
      byId.set(chapter.id, chapter);
      continue;
    }

    const existingUpdated = Date.parse(existing.updatedAt);
    const incomingUpdated = Date.parse(chapter.updatedAt);
    if (Number.isNaN(existingUpdated) || incomingUpdated > existingUpdated) {
      byId.set(chapter.id, chapter);
    }
  }

  return Array.from(byId.values()).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}

function pickCurrentPosition(
  remote: CurrentPosition | null,
  local: CurrentPosition | null,
): CurrentPosition | null {
  if (!remote) return local;
  if (!local) return remote;

  const remoteAt = Date.parse(remote.completedAt);
  const localAt = Date.parse(local.completedAt);
  if (Number.isNaN(remoteAt)) return local;
  if (Number.isNaN(localAt)) return remote;
  return remoteAt >= localAt ? remote : local;
}

function pickDraft(
  remoteDraft: DraftChapter | null,
  remoteUpdatedAt: string,
  localDraft: DraftChapter | null,
  localUpdatedAt: string,
): DraftChapter | null {
  if (!isDraftStarted(remoteDraft)) return isDraftStarted(localDraft) ? localDraft : null;
  if (!isDraftStarted(localDraft)) return remoteDraft;

  const remoteTime = Date.parse(remoteUpdatedAt);
  const localTime = Date.parse(localUpdatedAt);

  // サーバー優先: タイムスタンプが等しいか、ローカル側が不正値ならサーバーを採用
  if (Number.isNaN(localTime) || remoteTime >= localTime) return remoteDraft;
  if (Number.isNaN(remoteTime)) return localDraft;

  return localDraft;
}

export function mergeOriginSaves(
  remoteSave: OriginV7Save | null | undefined,
  localSave: OriginV7Save | null | undefined,
): OriginV7Save {
  if (!remoteSave && !localSave) return createEmptyOriginSave();
  if (!remoteSave) return localSave as OriginV7Save;
  if (!localSave) return remoteSave;

  return {
    version: 7,
    chapters: mergeChapters(remoteSave.chapters, localSave.chapters),
    draft: pickDraft(
      remoteSave.draft,
      remoteSave.updatedAt,
      localSave.draft,
      localSave.updatedAt,
    ),
    currentPosition: pickCurrentPosition(
      remoteSave.currentPosition,
      localSave.currentPosition,
    ),
    createdAt: olderTimestamp(remoteSave.createdAt, localSave.createdAt),
    updatedAt: newerTimestamp(remoteSave.updatedAt, localSave.updatedAt),
    // ── ワークスペースデータ（updatedAtが新しい方を採用） ──
    rootProfile: (() => {
      // サーバー優先: タイムスタンプが等しいかサーバーが新しければサーバーを採用
      const rTime = Date.parse(remoteSave.updatedAt);
      const lTime = Date.parse(localSave.updatedAt);
      if (Number.isNaN(lTime) || rTime >= lTime) return remoteSave.rootProfile ?? localSave.rootProfile;
      return localSave.rootProfile ?? remoteSave.rootProfile;
    })(),
    eraAffiliations: mergeArrayById(remoteSave.eraAffiliations, localSave.eraAffiliations),
    activities: mergeArrayById(remoteSave.activities, localSave.activities),
    turningPoints: mergeArrayById(remoteSave.turningPoints, localSave.turningPoints),
    residueBoard: mergeArrayById(remoteSave.residueBoard, localSave.residueBoard),
    // ── オンボーディング完了フラグ（どちらかがtrueなら完了） ──
    onboarded: remoteSave.onboarded || localSave.onboarded || undefined,
  };
}

/** Merge two arrays of items with `id` field, deduplicating by id (first occurrence wins). */
function mergeArrayById<T extends { id: string }>(
  primary?: T[],
  secondary?: T[],
): T[] | undefined {
  if (!primary && !secondary) return undefined;
  if (!primary) return secondary;
  if (!secondary) return primary;

  const byId = new Map<string, T>();
  for (const item of [...primary, ...secondary]) {
    if (!byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values());
}

export function resolveOriginLandingState(params: {
  save: OriginV7Save;
  meta: OriginViewMeta;
}): { primaryView: OriginPrimaryView; resumeAvailable: boolean } {
  const { save, meta } = params;
  const hasResults = save.chapters.length > 0;
  const hasDraft = isDraftStarted(save.draft);
  const latestCompletedWithoutResult =
    meta.latestSessionCompleted && !meta.latestSessionResultGenerated;

  if (hasResults) {
    return {
      primaryView: "result",
      resumeAvailable: hasDraft || meta.activeSessionStatus === "in_progress",
    };
  }

  if (latestCompletedWithoutResult || meta.activeSessionStatus === "generating") {
    return {
      primaryView: "generating",
      resumeAvailable: hasDraft,
    };
  }

  if (hasDraft || meta.activeSessionStatus === "in_progress") {
    return {
      primaryView: "resume",
      resumeAvailable: hasDraft,
    };
  }

  return {
    primaryView: "empty",
    resumeAvailable: false,
  };
}
