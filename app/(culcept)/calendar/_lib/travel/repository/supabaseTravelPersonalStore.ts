// app/(culcept)/calendar/_lib/travel/repository/supabaseTravelPersonalStore.ts
// ════════════════════════════════════════════════════════════════════════
// Phase E-3B: TravelPersonalStore の Supabase 実装（write adapter・local-only 検証・dormant）。
//
// ⚠ flag OFF（既定）では factory が LocalStorage を返す＝これは使われない（点火は別 GO）。
//   auth セッション + RLS・owner-only・**service_role 不使用**。
//
// 実装範囲:
//   - saved(heart): readSavedIds / writeSavedIds（location_note_saves・reconcile・upsert/delete）✅
//   - userNotes(＋投稿/自分メモ): readUserNotes / writeUserNotes（location_notes・private/self_memo/self・写真なし）✅
//   - addedItinerary(旅程追加): **API gap** — StoredAddedEntry/ScheduleItem に day_id が無く、
//     travel_itinerary_items / location_note_to_itinerary（day_id 必須）へ安全に書けない。
//     捏造 day_id・fixture 流用は禁止。public API を壊さず、ここでは NotImplemented を投げる。
//     → docs/travel-personal-store-write-adapter-e3b.md「API gap」参照。次フェーズで API 再設計。
//
// writeUserNotes の semantics: localStorage の bulk-replace（全件配列で persist）に追従。
//   client id は `user-<ts>`（非 uuid）で PK 不可・id round-trip 無 → id マッチ不可。
//   そこで「insert(new uuids) → 旧 self/self_memo/private 行を delete」の順（**no-loss 優先**:
//   insert 失敗時は何も消えない／delete 失敗時は重複のみ・次回 write で収束）。非原子性は既知制約
//   （production は server RPC/トランザクション推奨）。flag OFF・localStorage ミラー下では許容。
// ════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocationItem } from "../types";
import type { StoredAddedEntry } from "../travelLocalStore";
import type { TravelPersonalStore } from "./travelPersonalStore";
import { TravelRepositoryNotImplementedError } from "./travelRepository";
import { mapLocationNoteRow, type LocationNoteRow } from "./locationNoteMapper";
import type { PhotoRow } from "./tripDayAssembler";
import { diffSaveIds, buildSaveRow, buildUserNoteInsertRow } from "./personalStoreWrite";

export class SupabaseTravelPersonalStore implements TravelPersonalStore {
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

  private async uid(sb: SupabaseClient): Promise<string | null> {
    const {
      data: { user },
    } = await sb.auth.getUser();
    return user?.id ?? null;
  }

  // ── 旅程追加（API gap・day_id 不在）──────────────────────────────────────
  async readAddedEntries(): Promise<StoredAddedEntry[]> {
    throw new TravelRepositoryNotImplementedError("readAddedEntries (API gap: day_id 不在)");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async writeAddedEntries(_entries: StoredAddedEntry[]): Promise<void> {
    throw new TravelRepositoryNotImplementedError("writeAddedEntries (API gap: day_id 不在)");
  }

  // ── 保存(heart)─────────────────────────────────────────────────────────
  async readSavedIds(): Promise<string[]> {
    const sb = await this.getClient();
    const { data, error } = await sb.from("location_note_saves").select("location_note_id");
    if (error || !data) return [];
    return data
      .map((r) => (r as { location_note_id: string }).location_note_id)
      .filter((x): x is string => typeof x === "string");
  }

  async writeSavedIds(ids: string[]): Promise<void> {
    const sb = await this.getClient();
    const uid = await this.uid(sb);
    if (!uid) throw new Error("writeSavedIds: not authenticated");

    const existing = await this.readSavedIds();
    const { toAdd, toRemove } = diffSaveIds(existing, ids);

    if (toAdd.length) {
      // duplicate は unique 制約 / upsert ignore で安全（idempotent）
      await sb
        .from("location_note_saves")
        .upsert(
          toAdd.map((id) => buildSaveRow(uid, id)),
          { onConflict: "user_id,location_note_id", ignoreDuplicates: true }
        );
    }
    if (toRemove.length) {
      // RLS owner-only ＝自分の save 行のみ削除可
      await sb.from("location_note_saves").delete().in("location_note_id", toRemove);
    }
  }

  // ── ＋投稿 / 自分メモ ─────────────────────────────────────────────────
  async readUserNotes(): Promise<LocationItem[]> {
    const sb = await this.getClient();
    const uid = await this.uid(sb);
    if (!uid) return [];
    // 自分の note のみ（owner）。published 他者分は read 対象外。
    const { data: notes, error } = await sb
      .from("location_notes")
      .select("*")
      .eq("user_id", uid)
      .is("deleted_at", null);
    if (error || !notes || notes.length === 0) return [];

    const rows = notes as LocationNoteRow[];
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
    return rows.map((r) => mapLocationNoteRow(r, photoById));
  }

  /**
   * 自分の投稿ノート（self/self_memo/private）を bulk-replace。
   * no-loss 優先: insert(new) → 旧行 delete の順（非原子性は既知制約・docs 参照）。
   */
  async writeUserNotes(notes: LocationItem[]): Promise<void> {
    const sb = await this.getClient();
    const uid = await this.uid(sb);
    if (!uid) throw new Error("writeUserNotes: not authenticated");

    // 既存の「自分が posted した private/self_memo/self」行 id（置換対象スコープ）
    const { data: existingRows } = await sb
      .from("location_notes")
      .select("id")
      .eq("user_id", uid)
      .eq("contributor_type", "self")
      .eq("source_type", "self_memo")
      .eq("status", "private")
      .is("deleted_at", null);
    const oldIds = ((existingRows ?? []) as { id: string }[]).map((r) => r.id);

    // 1) insert 新規（DB 採番 uuid・no-loss: 失敗しても旧は残る）
    if (notes.length) {
      const rows = notes.map((n) => buildUserNoteInsertRow(n, uid));
      const { error: insErr } = await sb.from("location_notes").insert(rows);
      if (insErr) throw insErr; // 旧行は無傷
    }
    // 2) 旧行 delete（RLS owner-only）。失敗時は重複のみ・次回収束。
    if (oldIds.length) {
      await sb.from("location_notes").delete().in("id", oldIds);
    }
  }
}
