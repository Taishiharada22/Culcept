// app/(culcept)/calendar/_lib/travel/repository/supabaseTravelPersonalStore.ts
// ════════════════════════════════════════════════════════════════════════
// Phase E-3B / E-3C-3: TravelPersonalStore の Supabase 実装（write adapter・local-only 検証・dormant）。
//
// ⚠ flag OFF（既定）では factory が LocalStorage を返す＝これは使われない（点火は別 GO）。
//   auth セッション + RLS・owner-only・**service_role 不使用**。
//
// 実装範囲:
//   - saved(heart): readSavedIds / writeSavedIds（location_note_saves・reconcile・upsert/delete）✅
//   - userNotes(＋投稿/自分メモ): readUserNotes / writeUserNotes（location_notes・private/self_memo/self・写真なし）✅
//   - addedItinerary(旅程追加): readAddedEntries=[] / writeAddedEntries=**新規追加のみ安全 insert**（E-3C-3）✅
//     E-3C-1 で StoredAddedEntry に day/trip 文脈が載るようになった（addToItinerary signature は不変）。
//     context 不足（dayId/sourceId が uuid でない）entry は skip（捏造保存しない）。bulk delete はしない。
//     travel_itinerary_items + location_note_to_itinerary は E-3C-3 hardening migration で owner/可視のみ許可。
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
import { mapLocationNoteRow, type LocationNoteRow } from "./locationNoteMapper";
import type { PhotoRow } from "./tripDayAssembler";
import {
  diffSaveIds,
  buildSaveRow,
  buildUserNoteInsertRow,
  isWritableAddedEntry,
  buildItineraryItemInsertRow,
} from "./personalStoreWrite";

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

  // ── 旅程追加（E-3C-3: day/trip 文脈付き entry の安全 insert）──────────────
  //   readAddedEntries は **空配列**を返す。理由: DB 経路では user_added の itinerary item は
  //   getTripDay の day.schedule に既に含まれるため、ここで返すと useMergedSchedule で二重表示になる。
  //   永続済み追加分は getTripDay 側が唯一の source。
  async readAddedEntries(): Promise<StoredAddedEntry[]> {
    return [];
  }

  /**
   * 新規追加のみ安全 insert（append）。**bulk delete はしない**（localStorage 全量置換 semantics を持ち込まない）。
   * - context 不足（dayId/sourceId が uuid でない）→ skip（捏造保存しない）
   * - day 所有を RLS select で確認（他人の day には書かない）
   * - duplicate（day_id, source_location_note_id）→ no-op
   * - 失敗は fail-soft（throw しない・既存 store 方針）
   */
  async writeAddedEntries(entries: StoredAddedEntry[]): Promise<void> {
    const sb = await this.getClient();
    const uid = await this.uid(sb);
    if (!uid) return; // 未認証は fail-soft

    for (const e of entries) {
      try {
        if (!isWritableAddedEntry(e)) continue; // dayId/sourceId が uuid でない → skip

        // day 所有確認（RLS owner-only select＝自分の未削除 day のみ返る。他人/不存在は skip）
        const { data: day } = await sb
          .from("travel_days")
          .select("id")
          .eq("id", e.dayId!)
          .is("deleted_at", null)
          .maybeSingle();
        if (!day) continue;

        // duplicate（day_id, source_location_note_id）→ no-op
        const { data: dup } = await sb
          .from("travel_itinerary_items")
          .select("id")
          .eq("day_id", e.dayId!)
          .eq("source_location_note_id", e.sourceId)
          .is("deleted_at", null)
          .maybeSingle();
        if (dup) continue;

        // sort_order = 当該 day の max+1
        const { data: maxRow } = await sb
          .from("travel_itinerary_items")
          .select("sort_order")
          .eq("day_id", e.dayId!)
          .order("sort_order", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextSort = ((maxRow as { sort_order?: number } | null)?.sort_order ?? -1) + 1;

        // 1) item insert（RLS: day 所有も WITH CHECK で再担保）
        const { data: item, error: itemErr } = await sb
          .from("travel_itinerary_items")
          .insert(buildItineraryItemInsertRow(e, uid, nextSort))
          .select("id")
          .single();
        if (itemErr || !item) continue; // fail-soft

        // 2) link insert（hardened policy: note 可視 ∧ day/item 所有）
        await sb.from("location_note_to_itinerary").insert({
          user_id: uid,
          location_note_id: e.sourceId,
          itinerary_item_id: (item as { id: string }).id,
          day_id: e.dayId!,
        });
      } catch {
        // entry 単位 fail-soft（次の entry へ）
        continue;
      }
    }
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
