import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminEmail } from "@/lib/auth/isAdmin";
import { createEncounterIfEligible } from "@/lib/rendezvous/createEncounter";

/**
 * POST /api/admin/rendezvous/seed
 * 管理者が手動でencounterイベントを作成（ブートストラップ用）
 *
 * Body: { userIdA: string, userIdB: string } | { userIds: string[] }
 * userIds指定時は全ペアのencounterを生成
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user || !isAdminEmail(auth.user.email)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    let pairs: [string, string][] = [];

    if (body.userIdA && body.userIdB) {
      pairs = [[body.userIdA, body.userIdB]];
    } else if (Array.isArray(body.userIds) && body.userIds.length >= 2) {
      // Generate all pairs from the list
      const ids: string[] = body.userIds;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          pairs.push([ids[i], ids[j]]);
        }
      }
    } else {
      return NextResponse.json(
        { ok: false, error: "userIdA+userIdB or userIds[] required" },
        { status: 400 },
      );
    }

    let created = 0;
    let skipped = 0;
    const results: { pair: string; result: string }[] = [];

    for (const [a, b] of pairs) {
      const result = await createEncounterIfEligible(
        supabaseAdmin,
        a,
        b,
        "manual_seed",
        { coarseContext: `管理者シード by ${auth.user.id}` },
      );

      results.push({
        pair: `${a.slice(0, 8)}...↔${b.slice(0, 8)}...`,
        result: result.created ? "created" : result.reason ?? "unknown",
      });

      if (result.created) created++;
      else skipped++;
    }

    return NextResponse.json({ ok: true, created, skipped, results });
  } catch (err: any) {
    console.error("[admin/rendezvous/seed] error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
