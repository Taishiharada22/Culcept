/**
 * Phase E-3B — SupabaseTravelPersonalStore 実DB統合（**opt-in / local-only / write**）
 *
 *   RUN_TRAVEL_DB_IT=1 npx vitest run tests/unit/plan/personalStoreDb.it.test.ts
 *
 * 検証:
 *   - saved: save/unsave/duplicate（reconcile・idempotent）
 *   - userNotes: insert（private/self_memo/self）・bulk-replace（旧削除）・readUserNotes 往復
 *   - RLS negative: userB は userA の saves / 自分以外の userNotes を read 不可
 *   - probe: userB が userA の private note を save できるか（FK vs RLS の確認）
 *
 * service_role 不使用。URL/anon は local 公開デフォルト。
 */
import { describe, it, expect } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SupabaseTravelPersonalStore } from "@/app/(culcept)/calendar/_lib/travel/repository/supabaseTravelPersonalStore";
import type { LocationItem } from "@/app/(culcept)/calendar/_lib/travel/types";
import type { StoredAddedEntry } from "@/app/(culcept)/calendar/_lib/travel/travelLocalStore";

const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const RUN = process.env.RUN_TRAVEL_DB_IT === "1";
const d = RUN ? describe : describe.skip;

function newClient() {
  return createClient(LOCAL_URL, LOCAL_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function signUpUser(email: string): Promise<{ client: SupabaseClient; uid: string }> {
  const client = newClient();
  const { data, error } = await client.auth.signUp({ email, password: "password123" });
  if (error) throw error;
  if (!data.session) {
    const { error: e2 } = await client.auth.signInWithPassword({ email, password: "password123" });
    if (e2) throw e2;
  }
  if (!data.user) throw new Error("no user");
  return { client, uid: data.user.id };
}

function note(title: string): LocationItem {
  return {
    id: `user-${title}`,
    kind: "spot",
    prefecture: "京都府",
    title,
    areaLabel: "東山",
    classification: "standard",
    source: "traveler",
    author: { name: "あなた", source: "traveler" },
    genre: "カフェ",
    themeKeys: [],
    tags: [],
    rating: 0,
    ratingCount: 0,
    description: "メモ",
    photo: null,
  };
}

d("SupabaseTravelPersonalStore — local DB write", () => {
  it("saved: save/unsave/duplicate（reconcile・idempotent）", async () => {
    const stamp = Date.now();
    const { client, uid } = await signUpUser(`ps-save-${stamp}@example.com`);
    // FK 用に own published note を 2 件作る（save 対象）
    const { data: notes } = await client
      .from("location_notes")
      .insert([
        { user_id: uid, kind: "spot", prefecture: "京都府", title: `n1-${stamp}`, status: "published", moderation_status: "approved", contributor_type: "local", source_type: "firsthand" },
        { user_id: uid, kind: "spot", prefecture: "京都府", title: `n2-${stamp}`, status: "published", moderation_status: "approved", contributor_type: "local", source_type: "firsthand" },
      ])
      .select();
    const [id1, id2] = (notes as { id: string }[]).map((n) => n.id);

    const store = new SupabaseTravelPersonalStore(client);
    await store.writeSavedIds([id1, id2]);
    expect((await store.readSavedIds()).sort()).toEqual([id1, id2].sort());

    // duplicate（idempotent・unique）
    await store.writeSavedIds([id1, id2]);
    expect((await store.readSavedIds()).length).toBe(2);

    // unsave id2
    await store.writeSavedIds([id1]);
    expect(await store.readSavedIds()).toEqual([id1]);

    // 全 unsave
    await store.writeSavedIds([]);
    expect(await store.readSavedIds()).toEqual([]);
  }, 40000);

  it("userNotes: append-only insert(private/self_memo/self) + 非破壊 + 往復（E-6A）", async () => {
    const stamp = Date.now();
    const { client, uid } = await signUpUser(`ps-note-${stamp}@example.com`);
    const store = new SupabaseTravelPersonalStore(client);

    await store.writeUserNotes([note(`A-${stamp}`), note(`B-${stamp}`)]);
    let read = await store.readUserNotes();
    expect(read.map((n) => n.title).sort()).toEqual([`A-${stamp}`, `B-${stamp}`].sort());

    // 行属性を直接確認（private/self_memo/self/photo null）
    const { data: rows } = await client.from("location_notes").select("status,source_type,contributor_type,photo_id").eq("user_id", uid);
    for (const r of rows as { status: string; source_type: string; contributor_type: string; photo_id: string | null }[]) {
      expect(r.status).toBe("private");
      expect(r.source_type).toBe("self_memo");
      expect(r.contributor_type).toBe("self");
      expect(r.photo_id).toBeNull();
    }

    // E-6A: 非破壊。[A] のみ再 write → B は消えない・A は dedup（重複しない）
    await store.writeUserNotes([note(`A-${stamp}`)]);
    read = await store.readUserNotes();
    expect(read.map((n) => n.title).sort()).toEqual([`A-${stamp}`, `B-${stamp}`].sort());

    // append-only: 新規 C を追加 → A/B は保持されたまま C が増える
    await store.writeUserNotes([note(`C-${stamp}`)]);
    read = await store.readUserNotes();
    expect(read.map((n) => n.title).sort()).toEqual([`A-${stamp}`, `B-${stamp}`, `C-${stamp}`].sort());
  }, 40000);

  it("userNotes E-6A: own published(firsthand) は readUserNotes に出ず・writeUserNotes で delete/変換されない", async () => {
    const stamp = Date.now();
    const { client, uid } = await signUpUser(`ps-note-pub-${stamp}@example.com`);
    const store = new SupabaseTravelPersonalStore(client);

    // own published(firsthand) note を直接 seed（id を後で不変検証）
    const { data: pub } = await client
      .from("location_notes")
      .insert({ user_id: uid, kind: "spot", prefecture: "京都府", title: `PUB-${stamp}`, status: "published", moderation_status: "approved", contributor_type: "local", source_type: "firsthand" })
      .select("id")
      .single();
    const pubId = (pub as { id: string }).id;

    // readUserNotes は self_memo のみ＝published は含まれない（round-trip 源を断つ）
    expect((await store.readUserNotes()).map((n) => n.title)).not.toContain(`PUB-${stamp}`);

    // user note 作成 + DB-read published を混ぜて writeUserNotes（UI round-trip 模擬）
    await store.writeUserNotes([note(`mine-${stamp}`), { id: pubId, kind: "spot", prefecture: "京都府", title: `PUB-${stamp}`, classification: "standard", rating: 0, ratingCount: 0, photo: null } as never]);

    // published は delete も変換もされず・id 不変・1 件のまま（重複なし）
    const { data: pubRows } = await client
      .from("location_notes")
      .select("id,status,source_type")
      .eq("user_id", uid)
      .eq("title", `PUB-${stamp}`);
    expect((pubRows ?? []).length).toBe(1);
    expect((pubRows as { id: string; status: string; source_type: string }[])[0].id).toBe(pubId); // id churn なし
    expect((pubRows as { id: string; status: string; source_type: string }[])[0].status).toBe("published"); // self_memo 化なし
    expect((pubRows as { id: string; status: string; source_type: string }[])[0].source_type).toBe("firsthand");

    // 新規 self_memo は作られている
    expect((await store.readUserNotes()).map((n) => n.title)).toContain(`mine-${stamp}`);
  }, 40000);

  it("RLS negative: userB は userA の saves / userNotes を read 不可", async () => {
    const stamp = Date.now();
    const { client: a, uid: uidA } = await signUpUser(`ps-a-${stamp}@example.com`);
    const storeA = new SupabaseTravelPersonalStore(a);
    // A: published note + save + private user note
    const { data: pub } = await a
      .from("location_notes")
      .insert({ user_id: uidA, kind: "spot", prefecture: "京都府", title: `pub-${stamp}`, status: "published", moderation_status: "approved", contributor_type: "local", source_type: "firsthand" })
      .select()
      .single();
    await storeA.writeSavedIds([(pub as { id: string }).id]);
    await storeA.writeUserNotes([note(`priv-${stamp}`)]);

    const { client: b } = await signUpUser(`ps-b-${stamp}@example.com`);
    const storeB = new SupabaseTravelPersonalStore(b);
    expect(await storeB.readSavedIds()).toEqual([]); // A の save は見えない
    expect(await storeB.readUserNotes()).toEqual([]); // A の private note は見えない
  }, 40000);

  // ── E-3B-1: saves INSERT policy hardening の RLS 検証 ──
  it("save-insert RLS: 他人は public(published+approved+未削除)のみ save 可・他は不可／自分は private も可", async () => {
    const stamp = Date.now();
    const { client: a, uid: uidA } = await signUpUser(`ps-rls-a-${stamp}@example.com`);

    // userA が各 status の note を作成
    const mk = (title: string, status: string, mod: string, extra: Record<string, unknown> = {}) =>
      ({ user_id: uidA, kind: "spot", prefecture: "京都府", title: `${title}-${stamp}`, status, moderation_status: mod, contributor_type: "local", source_type: "firsthand", ...extra });
    const { data: rows } = await a
      .from("location_notes")
      .insert([
        mk("pub-approved", "published", "approved"),
        mk("pub-pending", "published", "pending"),
        mk("priv", "private", "none"),
        mk("draft", "draft", "none"),
        mk("reported", "reported", "approved"),
        mk("pub-approved-deleted", "published", "approved", { deleted_at: new Date(stamp).toISOString() }),
        { ...mk("selfmemo-priv", "private", "none"), source_type: "self_memo", contributor_type: "self" },
      ])
      .select();
    const byTitle = new Map((rows as { id: string; title: string }[]).map((r) => [r.title, r.id]));
    const id = (t: string) => byTitle.get(`${t}-${stamp}`)!;

    // userB（他人）の save 可否
    const { client: b, uid: uidB } = await signUpUser(`ps-rls-b-${stamp}@example.com`);
    const bTry = async (noteId: string) => {
      const { error } = await b.from("location_note_saves").insert({ user_id: uidB, location_note_id: noteId });
      if (!error) await b.from("location_note_saves").delete().eq("location_note_id", noteId); // cleanup
      return error;
    };
    expect(await bTry(id("pub-approved"))).toBeNull(); // ✅ public は save 可
    expect(await bTry(id("pub-pending"))).not.toBeNull(); // ❌ 未approved
    expect(await bTry(id("priv"))).not.toBeNull(); // ❌ 他人の private
    expect(await bTry(id("draft"))).not.toBeNull(); // ❌ draft
    expect(await bTry(id("reported"))).not.toBeNull(); // ❌ reported
    expect(await bTry(id("pub-approved-deleted"))).not.toBeNull(); // ❌ deleted
    expect(await bTry(id("selfmemo-priv"))).not.toBeNull(); // ❌ 他人の self_memo private

    // userA（owner）は自分の private を save 可
    const { error: aErr } = await a.from("location_note_saves").insert({ user_id: uidA, location_note_id: id("priv") });
    expect(aErr).toBeNull();
  }, 60000);
});

// ── E-3C-3: 旅程追加 write（travel_itinerary_items + location_note_to_itinerary）──
function addedEntry(sourceId: string, dayId: string | undefined): StoredAddedEntry {
  const e: StoredAddedEntry = {
    sourceId,
    item: { id: `added-${sourceId}`, startTime: "", name: "追加スポット", subtitle: "東山", categories: ["寺社"], photo: null },
  };
  if (dayId) e.dayId = dayId;
  return e;
}

d("SupabaseTravelPersonalStore.writeAddedEntries — local DB itinerary write", () => {
  async function seedTripDay(client: SupabaseClient, uid: string, stamp: number) {
    const { data: trip } = await client
      .from("travel_trips")
      .insert({ user_id: uid, title: `trip-${stamp}`, start_date: "2026-06-24", end_date: "2026-06-26", status: "active" })
      .select()
      .single();
    const { data: day } = await client
      .from("travel_days")
      .insert({ user_id: uid, trip_id: (trip as { id: string }).id, date: "2026-06-24", day_index: 1 })
      .select()
      .single();
    return { tripId: (trip as { id: string }).id, dayId: (day as { id: string }).id };
  }
  async function ownNote(client: SupabaseClient, uid: string, title: string, status = "published", mod = "approved", extra: Record<string, unknown> = {}) {
    const { data } = await client
      .from("location_notes")
      .insert({ user_id: uid, kind: "spot", prefecture: "京都府", title, status, moderation_status: mod, contributor_type: "local", source_type: "firsthand", ...extra })
      .select()
      .single();
    return (data as { id: string }).id;
  }

  it("自分の day に own note を追加→items + link 両方作成・duplicate は no-op", async () => {
    const stamp = Date.now();
    const { client, uid } = await signUpUser(`itin-a-${stamp}@example.com`);
    const { dayId } = await seedTripDay(client, uid, stamp);
    const noteId = await ownNote(client, uid, `pub-${stamp}`);

    const store = new SupabaseTravelPersonalStore(client);
    await store.writeAddedEntries([addedEntry(noteId, dayId)]);

    const { data: items } = await client.from("travel_itinerary_items").select("*").eq("day_id", dayId).eq("source_location_note_id", noteId);
    expect(items).toHaveLength(1);
    expect((items as { source_kind: string }[])[0].source_kind).toBe("user_added");
    const { data: links } = await client.from("location_note_to_itinerary").select("*").eq("day_id", dayId).eq("location_note_id", noteId);
    expect(links).toHaveLength(1);

    // duplicate → no-op（依然 1 件）
    await store.writeAddedEntries([addedEntry(noteId, dayId)]);
    const { data: items2 } = await client.from("travel_itinerary_items").select("id").eq("day_id", dayId).eq("source_location_note_id", noteId);
    expect(items2).toHaveLength(1);

    // readAddedEntries は [] （getTripDay 側が source・二重表示回避）
    expect(await store.readAddedEntries()).toEqual([]);
  }, 60000);

  it("context 不足 / 非 uuid sourceId は skip（捏造保存しない）", async () => {
    const stamp = Date.now();
    const { client, uid } = await signUpUser(`itin-skip-${stamp}@example.com`);
    const { dayId } = await seedTripDay(client, uid, stamp);
    const store = new SupabaseTravelPersonalStore(client);

    await store.writeAddedEntries([
      addedEntry(`kyoto-fixture-${stamp}`, dayId), // 非 uuid sourceId → skip
      addedEntry("00000000-0000-4000-8000-000000000999", undefined), // dayId 無し → skip
    ]);
    const { data: items } = await client.from("travel_itinerary_items").select("id").eq("day_id", dayId);
    expect(items).toHaveLength(0);
  }, 60000);

  it("RLS: userB は userA の day に追加できない / userA private note を link できない", async () => {
    const stamp = Date.now();
    const { client: a, uid: uidA } = await signUpUser(`itin-rlsa-${stamp}@example.com`);
    const { dayId: dayA } = await seedTripDay(a, uidA, stamp);
    const privNoteA = await ownNote(a, uidA, `secret-${stamp}`, "private", "none", { contributor_type: "self", source_type: "self_memo" });

    // userB: 自分の note + 自分の day を持つが、A の day に書こうとする
    const { client: b, uid: uidB } = await signUpUser(`itin-rlsb-${stamp}@example.com`);
    const bNote = await ownNote(b, uidB, `b-pub-${stamp}`);
    const storeB = new SupabaseTravelPersonalStore(b);

    // B が A の day に追加 → app guard（day 所有 select 0件）で skip＝書かれない
    await storeB.writeAddedEntries([addedEntry(bNote, dayA)]);
    const { data: onADay } = await a.from("travel_itinerary_items").select("id").eq("day_id", dayA);
    expect(onADay ?? []).toHaveLength(0); // A の day に B の item は無い

    // B が A の private note を直接 link しようとする → hardened policy で拒否
    const { dayId: dayB } = await seedTripDay(b, uidB, stamp + 1);
    const { error: linkErr } = await b.from("location_note_to_itinerary").insert({ user_id: uidB, location_note_id: privNoteA, day_id: dayB });
    expect(linkErr).not.toBeNull(); // ❌ 他人の private note を link 不可

    // B が A の day_id を指す item を直接 insert しようとする → hardened policy で拒否
    const { error: itemErr } = await b.from("travel_itinerary_items").insert({ user_id: uidB, day_id: dayA, name: "x", source_kind: "user_added" });
    expect(itemErr).not.toBeNull(); // ❌ 他人の day へ書込不可
  }, 60000);
});
