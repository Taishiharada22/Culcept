/**
 * Phase E-3A — SupabaseLocationNotesRepository 実DB統合テスト（**opt-in / local-only / read-only**）
 *
 * 既定 skip。ローカル Supabase 起動中に:
 *   RUN_TRAVEL_DB_IT=1 npx vitest run tests/unit/plan/locationNotesRepositoryDb.it.test.ts
 *
 * 検証（RLS 可視性・read-only）:
 *   - userA は自分の note（private/draft/self_memo/published）を読める
 *   - userB は userA の private/draft/published-pending/deleted/reported を読めない
 *   - userB は userA の published+approved+not-deleted のみ読める
 *   - self_memo + published は check 制約で insert 不可（既存 RLS test と整合）
 *
 * write は本テストの seed のみ（adapter は read-only）。service_role 不使用。
 * URL/anon は local の公開デフォルト（localhost 専用）。
 */
import { describe, it, expect } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SupabaseLocationNotesRepository } from "@/app/(culcept)/calendar/_lib/travel/repository/supabaseLocationNotesRepository";

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

d("SupabaseLocationNotesRepository — local DB 可視性（read-only）", () => {
  it("userA は自分の全 status を読め、userB は published+approved+未削除のみ", async () => {
    const PREF = "京都府";
    const stamp = Date.now();
    const { client: a, uid: uidA } = await signUpUser(`ln-a-${stamp}@example.com`);

    const base = { user_id: uidA, kind: "spot", prefecture: PREF, contributor_type: "local", source_type: "firsthand" };
    const { error: insErr } = await a.from("location_notes").insert([
      { ...base, title: `A-private-${stamp}`, status: "private", moderation_status: "none" },
      { ...base, title: `A-draft-${stamp}`, status: "draft", moderation_status: "none" },
      { ...base, title: `A-selfmemo-${stamp}`, source_type: "self_memo", contributor_type: "self", status: "private", moderation_status: "none" },
      { ...base, title: `A-pub-approved-${stamp}`, status: "published", moderation_status: "approved" },
      { ...base, title: `A-pub-pending-${stamp}`, status: "published", moderation_status: "pending" },
      { ...base, title: `A-pub-deleted-${stamp}`, status: "published", moderation_status: "approved", deleted_at: new Date(stamp).toISOString() },
      { ...base, title: `A-reported-${stamp}`, status: "reported", moderation_status: "approved" },
    ]);
    expect(insErr).toBeNull();

    // userA: 自分の note（未削除の private/draft/selfmemo/pub-approved/pub-pending/reported = 6件。deleted は query で除外）
    const repoA = new SupabaseLocationNotesRepository(a);
    const dataA = await repoA.getLocationNotes(PREF);
    const titlesA = dataA.items.map((i) => i.title).filter((t) => t.endsWith(`-${stamp}`));
    expect(titlesA).toContain(`A-private-${stamp}`);
    expect(titlesA).toContain(`A-draft-${stamp}`);
    expect(titlesA).toContain(`A-selfmemo-${stamp}`);
    expect(titlesA).toContain(`A-pub-approved-${stamp}`);
    expect(titlesA).not.toContain(`A-pub-deleted-${stamp}`); // deleted_at 除外
    expect(titlesA.length).toBe(6);

    // userB: userA の published+approved+未削除のみ
    const { client: b } = await signUpUser(`ln-b-${stamp}@example.com`);
    const repoB = new SupabaseLocationNotesRepository(b);
    const dataB = await repoB.getLocationNotes(PREF);
    const titlesB = dataB.items.map((i) => i.title).filter((t) => t.endsWith(`-${stamp}`));
    expect(titlesB).toEqual([`A-pub-approved-${stamp}`]);
    // 不可視を個別確認
    for (const hidden of [`A-private-${stamp}`, `A-draft-${stamp}`, `A-selfmemo-${stamp}`, `A-pub-pending-${stamp}`, `A-pub-deleted-${stamp}`, `A-reported-${stamp}`]) {
      expect(titlesB).not.toContain(hidden);
    }
  }, 40000);

  it("self_memo + published は check 制約で insert 不可（既存 RLS test と整合）", async () => {
    const { client, uid } = await signUpUser(`ln-self-${Date.now()}@example.com`);
    const { error } = await client.from("location_notes").insert({
      user_id: uid,
      kind: "spot",
      prefecture: "京都府",
      title: "illegal self published",
      source_type: "self_memo",
      contributor_type: "self",
      status: "published",
      moderation_status: "approved",
    });
    expect(error).not.toBeNull(); // check_violation
  }, 20000);
});
