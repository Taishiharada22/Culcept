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

  it("userNotes: insert(private/self_memo/self) + bulk-replace + 往復", async () => {
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

    // bulk-replace: [A] のみ → B は消える・重複しない
    await store.writeUserNotes([note(`A-${stamp}`)]);
    read = await store.readUserNotes();
    expect(read.map((n) => n.title)).toEqual([`A-${stamp}`]);
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
