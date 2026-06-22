// app/(culcept)/calendar/_lib/travel/repository/supabaseLocationNotesRepository.ts
// ════════════════════════════════════════════════════════════════════════
// Phase E-3A: LocationNotesRepository の Supabase 実装 — **read-only**。
//
// ⚠ read のみ（insert/update/delete なし）。service_role 不使用（auth セッション + anon + RLS）。
//   flag OFF（既定）では factory がこれを生成しない＝production 経路に乗らない（点火は別 GO）。
//
// 可視性は **RLS に委譲**（location_notes_read policy）:
//   自分の note（全 status）OR 公開可視（published ∧ approved ∧ 未削除）。
//   ★ published は Phase G まで実運用しない＝当面は実質「自分の note のみ」。
//
// メタ（都道府県候補 / themes / areaChips / preferenceChips 等）は location_notes に列が無いため
// 当面 EMPTY_LOCATION_NOTES_DATA の shell を使う（DB メタ table は将来）。items のみ DB-backed。
// ════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocationNotesData } from "../types";
import { EMPTY_LOCATION_NOTES_DATA } from "../locationNotesData";
import type { LocationNotesRepository } from "./locationNotesRepository";
import { mapLocationNoteRow, type LocationNoteRow } from "./locationNoteMapper";
import type { PhotoRow } from "./tripDayAssembler";

export class SupabaseLocationNotesRepository implements LocationNotesRepository {
  private client: SupabaseClient | null;

  constructor(client?: SupabaseClient) {
    this.client = client ?? null;
  }

  private async getClient(): Promise<SupabaseClient> {
    if (this.client) return this.client;
    const { supabaseBrowser } = await import("@/lib/supabase/client");
    this.client = supabaseBrowser() as unknown as SupabaseClient;
    return this.client;
  }

  async getLocationNotes(prefecture: string): Promise<LocationNotesData> {
    const sb = await this.getClient();

    // RLS が可視性を担保（own 全status / published+approved+未削除）。deleted_at は防御的に除外。
    const { data: notes, error } = await sb
      .from("location_notes")
      .select("*")
      .eq("prefecture", prefecture)
      .is("deleted_at", null);

    if (error || !notes || notes.length === 0) {
      // 取得失敗 / 0 件 → 空（fixture 由来のメタ shell・items 空）。捏造しない。
      return EMPTY_LOCATION_NOTES_DATA;
    }

    const rows = notes as LocationNoteRow[];

    // 参照写真をまとめて取得（read-only join）
    const photoIds = rows.map((r) => r.photo_id).filter((x): x is string => !!x);
    let photoById = new Map<string, PhotoRow>();
    if (photoIds.length) {
      const { data: photos } = await sb
        .from("travel_photos")
        .select("*")
        .in("id", [...new Set(photoIds)])
        .is("deleted_at", null);
      photoById = new Map(((photos ?? []) as PhotoRow[]).map((p) => [p.id, p]));
    }

    const items = rows.map((r) => mapLocationNoteRow(r, photoById));
    // メタは当面 fixture 由来 shell（DB メタ table は将来）。items のみ DB-backed。
    return { ...EMPTY_LOCATION_NOTES_DATA, items };
  }
}
