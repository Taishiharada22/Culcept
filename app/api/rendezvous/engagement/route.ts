import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  computeEngagementLoop,
  computeTimeGates,
  generateDailyMystery,
} from "@/lib/rendezvous/addictionArchitecture";

// ============================================================
// GET  /api/rendezvous/engagement — Full engagement loop state
// POST /api/rendezvous/engagement — Reveal today's daily mystery
// ============================================================

export async function GET(_request: NextRequest) {
  try {
    // Auth
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );

    const userId = auth.user.id;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // 1. Fetch recent login dates (last 60 days)
    const sixtyDaysAgo = new Date(
      now.getTime() - 60 * 86_400_000,
    ).toISOString();

    const { data: loginRows } = await supabaseAdmin
      .from("rendezvous_activity_log")
      .select("created_at")
      .eq("user_id", userId)
      .eq("action", "login")
      .gte("created_at", sixtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(60);

    const lastLoginDates = (loginRows ?? []).map((r) =>
      r.created_at.slice(0, 10),
    );

    // Ensure today is included (user is currently active)
    if (!lastLoginDates.includes(todayStr)) {
      lastLoginDates.unshift(todayStr);
      // Log today's login
      await supabaseAdmin.from("rendezvous_activity_log").insert({
        user_id: userId,
        action: "login",
        created_at: now.toISOString(),
      });
    }

    // 2. Count actions today
    const { count: actionsToday } = await supabaseAdmin
      .from("rendezvous_activity_log")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", `${todayStr}T00:00:00`)
      .lte("created_at", `${todayStr}T23:59:59`);

    // 3. Count pending encounters
    const { count: pendingEncounters } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("*", { count: "exact", head: true })
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .eq("state", "delivered")
      .not("delivered_at", "is", null);

    // 4. Check for pending sync
    const { data: pendingSyncs } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .eq("state", "mutual_liked")
      .limit(1);

    const hasPendingSync = (pendingSyncs?.length ?? 0) > 0;

    // 5. Fetch time gate data
    const { data: lastEncounter } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("delivered_at")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .not("delivered_at", "is", null)
      .order("delivered_at", { ascending: false })
      .limit(1)
      .single();

    const { data: lastMirror } = await supabaseAdmin
      .from("rendezvous_activity_log")
      .select("created_at")
      .eq("user_id", userId)
      .eq("action", "mirror_update")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const { data: lastSync } = await supabaseAdmin
      .from("rendezvous_activity_log")
      .select("created_at")
      .eq("user_id", userId)
      .eq("action", "sync_completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // 6. Check if mystery already revealed today
    const { data: revealedRow } = await supabaseAdmin
      .from("rendezvous_activity_log")
      .select("id")
      .eq("user_id", userId)
      .eq("action", "mystery_revealed")
      .gte("created_at", `${todayStr}T00:00:00`)
      .lte("created_at", `${todayStr}T23:59:59`)
      .limit(1)
      .single();

    // 7. Compute engagement loop
    const loop = computeEngagementLoop(
      userId,
      lastLoginDates,
      actionsToday ?? 0,
      pendingEncounters ?? 0,
      hasPendingSync,
    );

    // Override revealed flag if already revealed today
    if (revealedRow) {
      loop.dailyMystery.revealed = true;
    }

    // 8. Compute time gates
    const timeGates = computeTimeGates(
      lastEncounter?.delivered_at ?? null,
      lastMirror?.created_at ?? null,
      lastSync?.created_at ?? null,
    );

    return NextResponse.json({ ok: true, loop, timeGates });
  } catch (err) {
    console.error("[engagement] GET Error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ============================================================
// POST /api/rendezvous/engagement — Reveal daily mystery
// ============================================================

export async function POST(_request: NextRequest) {
  try {
    // Auth
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );

    const userId = auth.user.id;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Check if already revealed today
    const { data: existing } = await supabaseAdmin
      .from("rendezvous_activity_log")
      .select("id")
      .eq("user_id", userId)
      .eq("action", "mystery_revealed")
      .gte("created_at", `${todayStr}T00:00:00`)
      .lte("created_at", `${todayStr}T23:59:59`)
      .limit(1)
      .single();

    if (existing) {
      return NextResponse.json(
        { ok: false, error: "Already revealed today" },
        { status: 400 },
      );
    }

    // Count connections for mystery generation
    const { count: connectionCount } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("*", { count: "exact", head: true })
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .in("state", ["mutual_liked", "chat_opened"]);

    // Generate mystery
    const mystery = generateDailyMystery(userId, todayStr, connectionCount ?? 0);

    // Check if available yet
    const availableAt = new Date(mystery.availableAt).getTime();
    if (availableAt > Date.now()) {
      return NextResponse.json(
        { ok: false, error: "Mystery not yet available" },
        { status: 400 },
      );
    }

    // Mark as revealed
    mystery.revealed = true;

    // Log the reveal action
    await supabaseAdmin.from("rendezvous_activity_log").insert({
      user_id: userId,
      action: "mystery_revealed",
      payload: { type: mystery.type },
      created_at: now.toISOString(),
    });

    return NextResponse.json({ ok: true, mystery });
  } catch (err) {
    console.error("[engagement] POST Error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
