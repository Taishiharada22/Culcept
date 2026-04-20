/**
 * CoAlter Phase 2: sanity #1 (misread→clarify) 診断スクリプト
 *
 * 目的:
 *   特定 thread の直近 coalter メッセージ (routerTrace / card.mode) と
 *   直近 talk_messages を取得して、misread detector が発火したか判定する。
 *
 * 実行: npx tsx scripts/coalter-sanity-diagnose.ts <threadId>
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { detectMisread, detectContradiction, detectStall } from "@/lib/coalter/conversationParser";
import type { ConversationTurn } from "@/lib/coalter/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !key) {
  console.error("Missing SUPABASE env");
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  const threadId = process.argv[2];
  if (!threadId) {
    console.error("usage: npx tsx scripts/coalter-sanity-diagnose.ts <threadId>");
    process.exit(1);
  }

  console.log(`\n=== thread_id: ${threadId} ===\n`);

  // ── 1. 直近 coalter_sessions (最新 3 件) ──
  const { data: sessions, error: sErr } = await supabase
    .from("coalter_sessions")
    .select("id, created_at, ended_at, state, pair_state_id")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(3);

  if (sErr) {
    console.error("sessions fetch error", sErr);
    process.exit(1);
  }
  if (!sessions || sessions.length === 0) {
    console.log("No coalter_sessions found for this thread");
    process.exit(0);
  }

  console.log("── 直近 coalter_sessions ──");
  for (const s of sessions) {
    console.log(`  ${s.created_at} | id=${s.id} | state=${s.state} | ended=${s.ended_at ?? "-"}`);
  }

  // ── 2. 最新 session の coalter role message の metadata ──
  const latestSessionId = sessions[0].id;
  const { data: msgs } = await supabase
    .from("coalter_messages")
    .select("id, created_at, role, metadata")
    .eq("session_id", latestSessionId)
    .order("created_at", { ascending: true });

  console.log(`\n── coalter_messages (session=${latestSessionId}) ──`);
  if (!msgs || msgs.length === 0) {
    console.log("  (none)");
  } else {
    for (const m of msgs) {
      console.log(`\n[${m.created_at}] role=${m.role} id=${m.id}`);
      const meta = (m.metadata ?? {}) as Record<string, any>;
      const rt = meta.routerTrace as any;
      const card = meta.card as any;
      if (rt) {
        console.log(`  routerTrace.selectedMode   = ${rt.selectedMode}`);
        console.log(`  routerTrace.reason         = ${rt.reason}`);
        console.log(`  routerTrace.triggered      = ${JSON.stringify(rt.triggeredSignals)}`);
        console.log(`  routerTrace.suppressed     = ${JSON.stringify(rt.suppressedSignals)}`);
        console.log(`  routerTrace.previousMode   = ${rt.previousMode ?? "null"}`);
        console.log(`  routerTrace.questionBudget = ${rt.questionBudget}`);
      } else {
        console.log("  (no routerTrace)");
      }
      if (card) {
        console.log(`  card.mode                  = ${card.mode}`);
        if (card.mode === "clarify") {
          console.log(`  card.pointList.length      = ${(card.pointList ?? []).length}`);
          console.log(`  card.neutralTranslation?   = ${card.neutralTranslation ? "yes" : "no"}`);
          console.log(`  card.question?             = ${card.question ?? "null"}`);
        } else if (card.mode === "negotiate") {
          console.log(`  card.proposals.length      = ${(card.proposals ?? []).length}`);
          console.log(`  card.interests?            = ${card.interests ? "yes" : "no"}`);
        } else if (card.mode === "decision") {
          console.log(`  card.proposals.length      = ${(card.proposals ?? []).length}`);
        }
      }
      if (meta.executorFallbackReason) {
        console.log(`  executorFallbackReason     = ${meta.executorFallbackReason}`);
      }
    }
  }

  // ── 3. 同 thread の talk_messages 直近 10 件 ──
  const { data: talks } = await supabase
    .from("talk_messages")
    .select("id, created_at, sender_id, body")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(10);

  console.log(`\n── talk_messages (直近 10 件, 時系列降順) ──`);
  if (talks) {
    for (const t of talks) {
      const preview = (t.body ?? "").slice(0, 80).replace(/\n/g, " ");
      console.log(`  [${t.created_at}] ${t.sender_id.slice(0, 8)} | ${preview}`);
    }
  }

  // ── 4. detector を実データで再現実行 ──
  if (talks && talks.length >= 2) {
    const turns: ConversationTurn[] = (talks as any[])
      .reverse()
      .map((t) => ({
        id: t.id,
        senderId: t.sender_id,
        body: t.body,
        createdAt: t.created_at,
      }));

    // sender_id のユニーク 2 つを A/B に割り当て (invoke 時と同じロジック想定)
    const senders = Array.from(new Set(turns.map((t) => t.senderId)));
    if (senders.length >= 2) {
      const [userAId, userBId] = senders;
      console.log(`\n── detector re-run (userA=${userAId.slice(0, 8)}, userB=${userBId.slice(0, 8)}) ──`);
      const misread = detectMisread(turns, userAId, userBId);
      const contradiction = detectContradiction(turns, userAId, userBId);
      const stall = detectStall(turns);
      console.log(`  misread       = ${JSON.stringify(misread)}`);
      console.log(`  contradiction = detected=${contradiction.detected} axes=${JSON.stringify(contradiction.axes)}`);
      console.log(`  stall         = detected=${stall.detected} consecutive=${stall.consecutiveTurns}`);

      // 逆方向でも試す
      const misreadR = detectMisread(turns, userBId, userAId);
      console.log(`  misread (A/B swap) = ${JSON.stringify(misreadR)}`);
    }
  }

  console.log("\n=== done ===\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
