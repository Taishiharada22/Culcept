// app/api/origin/life-profile/route.ts
// #3 Supabase永続化 + #4 Rendezvous接続
// GET: ユーザーのlife profile全取得
// POST: エントリの追加/更新/削除 + Rendezvousシグナル再生成

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [entries, meta] = await Promise.all([
    supabase
      .from("life_profile_entries")
      .select("*")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("life_profile_meta")
      .select("*")
      .eq("user_id", auth.user.id)
      .single(),
  ]);

  return NextResponse.json({
    entries: entries.data ?? [],
    meta: meta.data ?? null,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { action } = body as {
    action: "upsert_entry" | "delete_entry" | "set_consent" | "sync_all";
  };

  const userId = auth.user.id;

  // ── upsert_entry: 1件の追加/更新 ──
  if (action === "upsert_entry") {
    const { entry } = body;
    const { error } = await supabase.from("life_profile_entries").upsert({
      id: entry.id,
      user_id: userId,
      category: entry.category,
      title: entry.title,
      note: entry.note,
      thumbnail: entry.thumbnail,
      voice_transcript: entry.voiceTranscript,
      location: entry.location,
      depth_responses: entry.depthResponses,
      active: entry.active,
      since: entry.since,
      until: entry.until,
      impact: entry.impact,
      created_at: entry.createdAt,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Rendezvousシグナル再生成
    await regenerateRendezvousSignals(supabase, userId);
    return NextResponse.json({ ok: true });
  }

  // ── delete_entry ──
  if (action === "delete_entry") {
    const { entryId } = body;
    await supabase
      .from("life_profile_entries")
      .delete()
      .eq("id", entryId)
      .eq("user_id", userId);

    await regenerateRendezvousSignals(supabase, userId);
    return NextResponse.json({ ok: true });
  }

  // ── set_consent: Rendezvous同意 ──
  if (action === "set_consent") {
    await supabase.from("life_profile_meta").upsert({
      user_id: userId,
      rendezvous_consent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true });
  }

  // ── sync_all: localStorageからの一括同期 ──
  if (action === "sync_all") {
    const { entries, rendezvousConsentAt } = body;

    if (Array.isArray(entries) && entries.length > 0) {
      const rows = entries.map((e: Record<string, unknown>) => ({
        id: e.id,
        user_id: userId,
        category: e.category,
        title: e.title,
        note: e.note,
        thumbnail: e.thumbnail,
        voice_transcript: e.voiceTranscript,
        location: e.location,
        depth_responses: e.depthResponses,
        active: e.active,
        since: e.since,
        until: e.until,
        impact: e.impact,
        created_at: e.createdAt,
        updated_at: e.updatedAt,
      }));

      await supabase.from("life_profile_entries").upsert(rows);
    }

    if (rendezvousConsentAt) {
      await supabase.from("life_profile_meta").upsert({
        user_id: userId,
        rendezvous_consent_at: rendezvousConsentAt,
        updated_at: new Date().toISOString(),
      });
    }

    await regenerateRendezvousSignals(supabase, userId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// ── #4 Rendezvousシグナル再生成 ──
// エントリが変更されるたびに呼ばれ、シグナルをキャッシュテーブルに保存
async function regenerateRendezvousSignals(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  userId: string,
) {
  // 同意チェック
  const { data: meta } = await supabase
    .from("life_profile_meta")
    .select("rendezvous_consent_at")
    .eq("user_id", userId)
    .single();

  if (!meta?.rendezvous_consent_at) return;

  // 全エントリ取得
  const { data: entries } = await supabase
    .from("life_profile_entries")
    .select("*")
    .eq("user_id", userId)
    .eq("active", true);

  if (!entries || entries.length === 0) return;

  // シグナル生成（サーバーサイドで簡易実装）
  const petEntries = entries.filter((e) => e.category === "pets");
  const familyEntries = entries.filter((e) => e.category === "family");
  const valueEntries = entries.filter((e) => e.category === "values");
  const careerEntries = entries.filter((e) => e.category === "career");
  const romanticEntries = entries.filter((e) => e.category === "romantic");
  const passionEntries = entries.filter((e) => e.category === "passions");
  const livingEntries = entries.filter((e) => e.category === "living");

  const signals = {
    petSignals: petEntries.map((e) => ({ type: e.title, importance: e.impact })),
    familySignals: familyEntries.map((e) => ({
      role: e.title,
      livingTogether: e.active && !e.until,
    })),
    coreValues: valueEntries.map((e) => e.title).slice(0, 10),
    careerTraits: careerEntries.map((e) => e.title).slice(0, 8),
    romanticTraits: romanticEntries.map((e) => e.title).slice(0, 8),
    passionSignals: passionEntries.map((e) => ({
      what: e.title,
      deepReason:
        Array.isArray(e.depth_responses) && e.depth_responses.length > 0
          ? (e.depth_responses[0] as { answer?: string }).answer ?? null
          : null,
    })),
    livingTraits: livingEntries.map((e) => e.title).slice(0, 6),
    selfUnderstandingDepth: Math.min(
      100,
      Math.round(
        (entries.length * 5 +
          entries.reduce(
            (sum, e) =>
              sum + (Array.isArray(e.depth_responses) ? e.depth_responses.length : 0) * 8,
            0,
          )) /
          2,
      ),
    ),
    generatedAt: new Date().toISOString(),
  };

  await supabase.from("rendezvous_origin_signals").upsert({
    user_id: userId,
    signals,
    generated_at: new Date().toISOString(),
  });
}
