/**
 * 特定 session_id の coalter_messages metadata を展開して表示。
 * 実行: npx tsx scripts/coalter-session-inspect.ts <sessionId>
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(url, key);

async function main() {
  const sessionId = process.argv[2];
  if (!sessionId) {
    console.error("usage: npx tsx scripts/coalter-session-inspect.ts <sessionId>");
    process.exit(1);
  }

  const { data: msgs } = await supabase
    .from("coalter_messages")
    .select("id, created_at, role, metadata")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  console.log(`\n=== session ${sessionId} ===\n`);
  if (!msgs || msgs.length === 0) {
    console.log("(no coalter_messages)");
    return;
  }
  for (const m of msgs) {
    console.log(`\n--- [${m.created_at}] role=${m.role} id=${m.id} ---`);
    const meta = (m.metadata ?? {}) as any;
    const rt = meta.routerTrace;
    const card = meta.card;
    if (rt) {
      console.log(`routerTrace.selectedMode = ${rt.selectedMode}`);
      console.log(`routerTrace.reason       = ${rt.reason}`);
      console.log(`routerTrace.triggered    = ${JSON.stringify(rt.triggeredSignals)}`);
      console.log(`routerTrace.previousMode = ${rt.previousMode ?? "null"}`);
    }
    if (card) {
      console.log(`card.mode = ${card.mode}`);
      if (card.mode === "decision") {
        console.log(`card.theme = ${card.theme}`);
        console.log(`card.candidates.length = ${(card.candidates ?? []).length}`);
        console.log(`card.summary = ${(card.summary ?? "").slice(0, 200)}`);
        if (card.candidates) {
          for (const c of card.candidates) {
            console.log(`  - title: ${c.title}`);
            console.log(`    url:   ${c.url ?? "null"}`);
            console.log(`    desc:  ${(c.description ?? "").slice(0, 120)}`);
          }
        }
        if (card.validation) {
          console.log(`card.validation = ${JSON.stringify(card.validation)}`);
        }
        if (card.missingConstraints) {
          console.log(`card.missingConstraints = ${JSON.stringify(card.missingConstraints)}`);
        }
      } else if (card.mode === "clarify") {
        console.log(`card.pointList = ${JSON.stringify(card.pointList)}`);
        console.log(`card.neutralTranslation = ${JSON.stringify(card.neutralTranslation)}`);
        console.log(`card.question = ${card.question}`);
      } else if (card.mode === "negotiate") {
        console.log(`card.interests = ${JSON.stringify(card.interests)}`);
        console.log(`card.proposals.length = ${(card.proposals ?? []).length}`);
      }
    }
    if (meta.executorFallbackReason) {
      console.log(`executorFallbackReason = ${meta.executorFallbackReason}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
