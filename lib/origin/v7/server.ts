import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CurrentPosition,
  DraftChapter,
  ExplorationStep,
  MemoryChapter,
  OriginV7Save,
} from "./types";
import {
  createEmptyOriginSave,
  hasMeaningfulOriginSave,
  inferStepFromDraft,
  resolveOriginLandingState,
  type OriginClientState,
  type OriginSessionStatus,
  type OriginViewMeta,
} from "./persistence";

type OriginProfileRow = {
  user_id: string;
  current_position: unknown | null;
  latest_session_id: string | null;
  latest_record_id: string | null;
  created_at: string;
  updated_at: string;
};

type OriginSessionRow = {
  id: string;
  status: OriginSessionStatus;
  current_step: ExplorationStep | null;
  draft: unknown | null;
  completed: boolean;
  finished_at: string | null;
  result_generated: boolean;
  result_generated_at: string | null;
  result_record_id: string | null;
  created_at: string;
  updated_at: string;
};

type OriginRecordRow = {
  id: string;
  session_id: string | null;
  chapter: unknown;
  created_at: string;
  updated_at: string;
};

type SupabaseLike = SupabaseClient<any, "public", any>;

function asDraft(value: unknown): DraftChapter | null {
  if (!value || typeof value !== "object") return null;
  return value as DraftChapter;
}

function asCurrentPosition(value: unknown): CurrentPosition | null {
  if (!value || typeof value !== "object") return null;
  return value as CurrentPosition;
}

function asChapter(row: OriginRecordRow): MemoryChapter | null {
  if (!row.chapter || typeof row.chapter !== "object") return null;
  const chapter = row.chapter as MemoryChapter;
  if (!chapter.id) return null;
  return chapter;
}

function maxTimestamp(values: Array<string | null | undefined>): string {
  const timestamps = values
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => !Number.isNaN(value));

  if (timestamps.length === 0) return new Date().toISOString();
  return new Date(Math.max(...timestamps)).toISOString();
}

function minTimestamp(values: Array<string | null | undefined>): string {
  const timestamps = values
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => !Number.isNaN(value));

  if (timestamps.length === 0) return new Date().toISOString();
  return new Date(Math.min(...timestamps)).toISOString();
}

function buildSave(params: {
  chapters: MemoryChapter[];
  draft: DraftChapter | null;
  currentPosition: CurrentPosition | null;
  profile: OriginProfileRow | null;
  activeSession: OriginSessionRow | null;
  latestSession: OriginSessionRow | null;
  records: OriginRecordRow[];
}): OriginV7Save {
  const { chapters, draft, currentPosition, profile, activeSession, latestSession, records } = params;
  if (!chapters.length && !draft && !currentPosition) {
    return createEmptyOriginSave();
  }

  return {
    version: 7,
    chapters,
    draft,
    currentPosition,
    createdAt: minTimestamp([
      profile?.created_at,
      activeSession?.created_at,
      latestSession?.created_at,
      ...records.map((record) => record.created_at),
    ]),
    updatedAt: maxTimestamp([
      profile?.updated_at,
      activeSession?.updated_at,
      latestSession?.updated_at,
      ...records.map((record) => record.updated_at),
    ]),
  };
}

async function getSessionById(
  supabase: SupabaseLike,
  userId: string,
  sessionId: string,
): Promise<OriginSessionRow | null> {
  const result = await supabase
    .from("origin_sessions")
    .select(
      "id,status,current_step,draft,completed,finished_at,result_generated,result_generated_at,result_record_id,created_at,updated_at",
    )
    .eq("user_id", userId)
    .eq("id", sessionId)
    .maybeSingle();

  if (result.error) throw result.error;
  return (result.data as OriginSessionRow | null) ?? null;
}

async function getActiveSession(
  supabase: SupabaseLike,
  userId: string,
): Promise<OriginSessionRow | null> {
  const result = await supabase
    .from("origin_sessions")
    .select(
      "id,status,current_step,draft,completed,finished_at,result_generated,result_generated_at,result_record_id,created_at,updated_at",
    )
    .eq("user_id", userId)
    .in("status", ["in_progress", "generating"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) throw result.error;
  return (result.data as OriginSessionRow | null) ?? null;
}

async function upsertProfile(
  supabase: SupabaseLike,
  userId: string,
  patch: {
    currentPosition?: CurrentPosition | null;
    latestSessionId?: string | null;
    latestRecordId?: string | null;
  },
): Promise<void> {
  const existing = await supabase
    .from("origin_profiles")
    .select("user_id,current_position,latest_session_id,latest_record_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing.error) throw existing.error;

  const payload = {
    user_id: userId,
    current_position:
      patch.currentPosition !== undefined
        ? patch.currentPosition
        : existing.data?.current_position ?? null,
    latest_session_id:
      patch.latestSessionId !== undefined
        ? patch.latestSessionId
        : existing.data?.latest_session_id ?? null,
    latest_record_id:
      patch.latestRecordId !== undefined
        ? patch.latestRecordId
        : existing.data?.latest_record_id ?? null,
  };

  const write = existing.data
    ? await supabase
        .from("origin_profiles")
        .update({
          current_position: payload.current_position,
          latest_session_id: payload.latest_session_id,
          latest_record_id: payload.latest_record_id,
        })
        .eq("user_id", userId)
    : await supabase.from("origin_profiles").insert(payload);

  if (write.error) throw write.error;
}

export async function loadOriginClientState(
  supabase: SupabaseLike,
  userId: string,
): Promise<OriginClientState> {
  try {
    const [profileResult, activeSessionResult, latestSessionResult, recordsResult] =
      await Promise.all([
        supabase
          .from("origin_profiles")
          .select("user_id,current_position,latest_session_id,latest_record_id,created_at,updated_at")
          .eq("user_id", userId)
          .maybeSingle(),
        getActiveSession(supabase, userId),
        supabase
          .from("origin_sessions")
          .select(
            "id,status,current_step,draft,completed,finished_at,result_generated,result_generated_at,result_record_id,created_at,updated_at",
          )
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("origin_records")
          .select("id,session_id,chapter,created_at,updated_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
      ]);

    if (profileResult.error) throw profileResult.error;
    if (latestSessionResult.error) throw latestSessionResult.error;
    if (recordsResult.error) throw recordsResult.error;

    const profile = (profileResult.data as OriginProfileRow | null) ?? null;
    const activeSession = activeSessionResult;
    const latestSession = (latestSessionResult.data as OriginSessionRow | null) ?? null;
    const records = (recordsResult.data as OriginRecordRow[] | null) ?? [];
    const chapters = records.map(asChapter).filter(Boolean) as MemoryChapter[];
    const draft = asDraft(activeSession?.draft ?? null);
    const currentPosition = asCurrentPosition(profile?.current_position ?? null);

    const save = buildSave({
      chapters,
      draft,
      currentPosition,
      profile,
      activeSession,
      latestSession,
      records,
    });

    const meta: OriginViewMeta = {
      activeSessionId: activeSession?.id ?? null,
      activeSessionStatus: activeSession?.status ?? null,
      latestSessionId: latestSession?.id ?? profile?.latest_session_id ?? null,
      latestSessionCompleted: latestSession?.completed ?? false,
      latestSessionResultGenerated: latestSession?.result_generated ?? false,
      latestRecordId:
        profile?.latest_record_id ?? latestSession?.result_record_id ?? chapters.at(-1)?.id ?? null,
    };

    const landing = resolveOriginLandingState({ save, meta });

    return {
      save,
      meta,
      primaryView: landing.primaryView,
      resumeAvailable: landing.resumeAvailable,
      hasRemoteData:
        hasMeaningfulOriginSave(save) ||
        Boolean(meta.latestSessionId) ||
        Boolean(meta.latestRecordId),
    };
  } catch (error) {
    console.warn("[origin] failed to load persisted state:", error);
    const save = createEmptyOriginSave();
    const meta: OriginViewMeta = {
      activeSessionId: null,
      activeSessionStatus: null,
      latestSessionId: null,
      latestSessionCompleted: false,
      latestSessionResultGenerated: false,
      latestRecordId: null,
    };
    return {
      save,
      meta,
      primaryView: "empty",
      resumeAvailable: false,
      hasRemoteData: false,
    };
  }
}

export async function persistOriginState(params: {
  supabase: SupabaseLike;
  userId: string;
  sessionId?: string | null;
  status?: OriginSessionStatus;
  currentStep?: ExplorationStep | null;
  draft?: DraftChapter | null;
  currentPosition?: CurrentPosition | null;
}): Promise<{ sessionId: string | null; status: OriginSessionStatus | null }> {
  const { supabase, userId, currentPosition } = params;

  if (currentPosition !== undefined) {
    await upsertProfile(supabase, userId, {
      currentPosition,
    });
  }

  let targetSession: OriginSessionRow | null = null;
  if (params.sessionId) {
    targetSession = await getSessionById(supabase, userId, params.sessionId);
  }

  if (!targetSession) {
    targetSession = await getActiveSession(supabase, userId);
  }

  const nextStatus: OriginSessionStatus | undefined =
    params.status ??
    (params.currentStep === "ai_recovery" && !params.draft?.aiNarrative
      ? "generating"
      : params.draft !== undefined || params.currentStep
        ? "in_progress"
        : undefined);

  if (nextStatus === "cancelled") {
    if (!targetSession) {
      return { sessionId: null, status: null };
    }

    const update = await supabase
      .from("origin_sessions")
      .update({
        status: "cancelled",
        draft: null,
        current_step: null,
      })
      .eq("id", targetSession.id)
      .eq("user_id", userId);

    if (update.error) throw update.error;
    return { sessionId: targetSession.id, status: "cancelled" };
  }

  const needsSession =
    nextStatus !== undefined ||
    params.draft !== undefined ||
    params.currentStep !== undefined;

  if (!needsSession) {
    return {
      sessionId: targetSession?.id ?? null,
      status: targetSession?.status ?? null,
    };
  }

  if (!targetSession) {
    const insert = await supabase
      .from("origin_sessions")
      .insert({
        user_id: userId,
        status: nextStatus ?? "in_progress",
        current_step: params.currentStep ?? (params.draft ? inferStepFromDraft(params.draft) : null),
        draft: params.draft ?? null,
      })
      .select(
        "id,status,current_step,draft,completed,finished_at,result_generated,result_generated_at,result_record_id,created_at,updated_at",
      )
      .single();

    if (insert.error) throw insert.error;
    targetSession = insert.data as OriginSessionRow;
  } else {
    const update = await supabase
      .from("origin_sessions")
      .update({
        status: nextStatus ?? targetSession.status,
        current_step:
          params.currentStep === undefined
            ? targetSession.current_step
            : params.currentStep,
        draft: params.draft === undefined ? targetSession.draft : params.draft,
      })
      .eq("id", targetSession.id)
      .eq("user_id", userId)
      .select(
        "id,status,current_step,draft,completed,finished_at,result_generated,result_generated_at,result_record_id,created_at,updated_at",
      )
      .single();

    if (update.error) throw update.error;
    targetSession = update.data as OriginSessionRow;
  }

  await upsertProfile(supabase, userId, {
    currentPosition,
    latestSessionId: targetSession.id,
  });

  return {
    sessionId: targetSession.id,
    status: targetSession.status,
  };
}

export async function completeOriginSession(params: {
  supabase: SupabaseLike;
  userId: string;
  sessionId?: string | null;
  chapter: MemoryChapter;
  currentPosition?: CurrentPosition | null;
}): Promise<{ sessionId: string; recordId: string }> {
  const { supabase, userId, chapter } = params;
  const now = new Date().toISOString();

  let targetSession: OriginSessionRow | null = null;
  if (params.sessionId) {
    targetSession = await getSessionById(supabase, userId, params.sessionId);
  }

  if (!targetSession) {
    targetSession = await getActiveSession(supabase, userId);
  }

  if (!targetSession) {
    const inserted = await supabase
      .from("origin_sessions")
      .insert({
        user_id: userId,
        status: "completed",
        current_step: null,
        draft: null,
        completed: true,
        finished_at: now,
        result_generated: true,
        result_generated_at: now,
      })
      .select(
        "id,status,current_step,draft,completed,finished_at,result_generated,result_generated_at,result_record_id,created_at,updated_at",
      )
      .single();

    if (inserted.error) throw inserted.error;
    targetSession = inserted.data as OriginSessionRow;
  }

  const recordWrite = await supabase.from("origin_records").upsert(
    {
      id: chapter.id,
      user_id: userId,
      session_id: targetSession.id,
      chapter,
    },
    { onConflict: "id" },
  );

  if (recordWrite.error) throw recordWrite.error;

  const sessionUpdate = await supabase
    .from("origin_sessions")
    .update({
      status: "completed",
      completed: true,
      finished_at: now,
      result_generated: true,
      result_generated_at: now,
      result_record_id: chapter.id,
      current_step: null,
      draft: null,
    })
    .eq("id", targetSession.id)
    .eq("user_id", userId);

  if (sessionUpdate.error) throw sessionUpdate.error;

  await upsertProfile(supabase, userId, {
    currentPosition: params.currentPosition,
    latestSessionId: targetSession.id,
    latestRecordId: chapter.id,
  });

  return {
    sessionId: targetSession.id,
    recordId: chapter.id,
  };
}
