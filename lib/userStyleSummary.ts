import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const OPTIONAL_COLUMNS = ["mood_keywords", "favorite_colors"] as const;

function splitColumns(select: string) {
  return select
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean);
}

function uniqueColumns(columns: string[]) {
  return Array.from(new Set(columns.filter(Boolean)));
}

function extractMissingColumns(error: unknown) {
  if (!error || typeof error !== "object") return [] as string[];

  const code = String((error as { code?: unknown }).code ?? "");
  const message = String((error as { message?: unknown }).message ?? "");
  if (code !== "42703" && code !== "PGRST204") return [] as string[];

  return OPTIONAL_COLUMNS.filter((column) => message.includes(column));
}

function stripColumns(select: string, columnsToRemove: string[], fallbackSelect: string) {
  const remaining = splitColumns(select).filter((column) => !columnsToRemove.includes(column));
  const normalized = uniqueColumns(remaining);
  if (normalized.length > 0) return normalized.join(",");
  return fallbackSelect;
}

export async function selectUserStyleSummaryMaybeSingle(
  supabase: SupabaseClient,
  userId: string,
  select: string,
  fallbackSelect = "user_id",
) {
  let currentSelect = select;
  const attempted = new Set<string>();

  while (true) {
    const result = await supabase
      .from("user_style_summary")
      .select(currentSelect)
      .eq("user_id", userId)
      .maybeSingle();

    const missingColumns = extractMissingColumns(result.error);
    if (missingColumns.length === 0) return result;

    const nextSelect = stripColumns(currentSelect, missingColumns, fallbackSelect);
    if (attempted.has(nextSelect) || nextSelect === currentSelect) return result;

    attempted.add(currentSelect);
    currentSelect = nextSelect;
  }
}

export async function selectUserStyleSummaryForUsers(
  supabase: SupabaseClient,
  userIds: string[],
  select: string,
  fallbackSelect = "user_id",
) {
  let currentSelect = select;
  const attempted = new Set<string>();

  while (true) {
    const result = await supabase
      .from("user_style_summary")
      .select(currentSelect)
      .in("user_id", userIds);

    const missingColumns = extractMissingColumns(result.error);
    if (missingColumns.length === 0) return result;

    const nextSelect = stripColumns(currentSelect, missingColumns, fallbackSelect);
    if (attempted.has(nextSelect) || nextSelect === currentSelect) return result;

    attempted.add(currentSelect);
    currentSelect = nextSelect;
  }
}

export async function upsertUserStyleSummary<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  payload: T,
) {
  let currentPayload: Record<string, unknown> = { ...payload };
  const attempted = new Set<string>();

  while (true) {
    const result = await supabase.from("user_style_summary").upsert(currentPayload, { onConflict: "user_id" });
    const missingColumns = extractMissingColumns(result.error);
    if (missingColumns.length === 0) return result;

    let changed = false;
    for (const column of missingColumns) {
      if (column in currentPayload) {
        delete currentPayload[column];
        changed = true;
      }
    }

    const signature = Object.keys(currentPayload).sort().join(",");
    if (!changed || attempted.has(signature)) return result;
    attempted.add(signature);
  }
}
