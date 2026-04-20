/**
 * CoAlter 診断 CLI — talk_messages density probe（恒久設置）
 *
 * 用途:
 *   - 新しい pair / sample 期間で、tail N session の turn 密度が β の前提
 *     （caringIntensity / conversationArc 算出に十分）を満たすかを即座に判定する
 *   - agreement 変動の原因切り分け時の第 1 チェックポイント
 *
 * [CEO 2026-04-20 M0-6C close] 使い捨てではなく保持する診断。
 *   M0-7 以降も "sample が単調で agreement が下がっていないか" を
 *   確認するため再利用する想定。raw body は出さない（集約値のみ）。
 */
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadDotenv({ path: ".env.local" });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const pairMapPath = process.env.HOME + "/.coalter/pair-map.json";
  const fs = await import("node:fs");
  const map = JSON.parse(fs.readFileSync(pairMapPath, "utf8"));
  const userA = map.pairs[0].userIdA;
  const userB = map.pairs[0].userIdB;

  const sb = createClient(url, key, { auth: { persistSession: false } });

  // find pair
  const { data: pairRow } = await sb
    .from("coalter_pair_states")
    .select("id, thread_id, user_a, user_b")
    .or(`and(user_a.eq.${userA},user_b.eq.${userB}),and(user_a.eq.${userB},user_b.eq.${userA})`)
    .eq("state", "enabled")
    .limit(1);
  if (!pairRow?.[0]) {
    console.log("no pair row");
    return;
  }
  const pair = pairRow[0];
  const threadId = pair.thread_id;

  // sessions tail 50
  const { data: sess } = await sb
    .from("coalter_sessions")
    .select("id, created_at")
    .eq("pair_state_id", pair.id)
    .order("created_at", { ascending: true });
  if (!sess) return;
  const tail = sess.slice(-50);
  console.log(`tail sessions: n=${tail.length}, first=${tail[0]?.created_at}, last=${tail[tail.length - 1]?.created_at}`);

  // tail の期間にまたがる message を取得
  const earliest = tail[0]?.created_at;
  const latest = tail[tail.length - 1]?.created_at;
  if (!earliest || !latest) return;

  const { data: msgs, error } = await sb
    .from("talk_messages")
    .select("id, thread_id, sender_id, created_at, body")
    .eq("thread_id", threadId)
    .gte("created_at", earliest)
    .order("created_at", { ascending: true });
  if (error) {
    console.log("messages fetch error:", error.message);
    return;
  }
  const all = msgs ?? [];
  console.log(`messages in thread since tail start: ${all.length}`);

  // per-session turn count (session window = [session.created_at, next.created_at])
  const perSessionTurns: number[] = [];
  const perSessionRatios: number[] = []; // A fraction
  const perSessionQuestionsA: number[] = [];
  const perSessionQuestionsB: number[] = [];
  const perSessionCharLenA: number[] = [];
  const perSessionCharLenB: number[] = [];
  const allSess = sess; // use full to find next boundary

  for (let i = 0; i < tail.length; i++) {
    const s = tail[i];
    // next session boundary across ALL sessions
    const idxAll = allSess.findIndex((x) => x.id === s.id);
    const next = allSess[idxAll + 1];
    const windowEnd = next ? next.created_at : new Date().toISOString();
    const inWindow = all.filter((m) => m.created_at >= s.created_at && m.created_at < windowEnd);
    perSessionTurns.push(inWindow.length);
    if (inWindow.length === 0) continue;
    const aTurns = inWindow.filter((m) => m.sender_id === userA);
    const bTurns = inWindow.filter((m) => m.sender_id === userB);
    const aFrac = inWindow.length > 0 ? aTurns.length / inWindow.length : 0;
    perSessionRatios.push(aFrac);

    const qA = aTurns.filter((m) => /[?？]/.test(m.body)).length;
    const qB = bTurns.filter((m) => /[?？]/.test(m.body)).length;
    perSessionQuestionsA.push(aTurns.length > 0 ? qA / aTurns.length : 0);
    perSessionQuestionsB.push(bTurns.length > 0 ? qB / bTurns.length : 0);

    const lenA = aTurns.reduce((s, m) => s + (m.body?.length ?? 0), 0);
    const lenB = bTurns.reduce((s, m) => s + (m.body?.length ?? 0), 0);
    perSessionCharLenA.push(aTurns.length > 0 ? lenA / aTurns.length : 0);
    perSessionCharLenB.push(bTurns.length > 0 ? lenB / bTurns.length : 0);
  }

  const summarize = (arr: number[], label: string) => {
    if (arr.length === 0) {
      console.log(`  ${label}: n=0`);
      return;
    }
    const sorted = [...arr].sort((a, b) => a - b);
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const p50 = sorted[Math.floor(sorted.length / 2)];
    console.log(`  ${label.padEnd(30)}: n=${arr.length} min=${sorted[0].toFixed(3)} p50=${p50.toFixed(3)} mean=${mean.toFixed(3)} max=${sorted[sorted.length - 1].toFixed(3)}`);
  };

  console.log("");
  console.log("── per-session stats ──");
  summarize(perSessionTurns, "turns per session");
  const nonEmpty = perSessionTurns.filter((n) => n > 0).length;
  console.log(`  sessions with >=1 turn: ${nonEmpty}/${tail.length}`);
  summarize(perSessionRatios, "A turn fraction");
  summarize(perSessionQuestionsA, "A question rate");
  summarize(perSessionQuestionsB, "B question rate");
  summarize(perSessionCharLenA, "A avg body len");
  summarize(perSessionCharLenB, "B avg body len");

  // Caring token probe on all messages (aggregate)
  const CARING = /(大丈夫|無理しない|休んで|疲れてない|心配|気をつけて|ありがとう|助か|お疲れ|無理しないで|寝て|ゆっくり)/;
  let caringA = 0;
  let caringB = 0;
  for (const m of all) {
    if (!m.body) continue;
    if (CARING.test(m.body)) {
      if (m.sender_id === userA) caringA += 1;
      else if (m.sender_id === userB) caringB += 1;
    }
  }
  console.log("");
  console.log(`── caring-token hits (aggregate across tail window) ──`);
  console.log(`  A: ${caringA}`);
  console.log(`  B: ${caringB}`);
}

main().catch((e) => {
  console.error("probe failed:", (e as Error).message);
  process.exit(1);
});
