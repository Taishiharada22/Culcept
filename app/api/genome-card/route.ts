// GET /api/genome-card — 自分の Genome Card データ取得
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { assembleGenomeForUser } from "@/lib/genome/assembleForUser";
import { filterGenomeByVisibility } from "@/lib/genome/filterByVisibility";
import { generateTalkSuggestion } from "@/lib/genome/generateTalkSuggestion";

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { genome, visualization, cardExtras } = await assembleGenomeForUser(supabase, user.id);

    // 自分のカードは常に Lv3（全詳細）
    const card = filterGenomeByVisibility(
      user.id,
      user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? null,
      user.user_metadata?.avatar_url ?? null,
      genome,
      visualization,
      3,
      cardExtras,
    );

    // Generate talk suggestion based on archetype
    let talkSuggestion: string | null = null;
    try {
      const g = genome as any;
      const archetypeCode = g?.archetypeCode ?? g?.archetype_code ?? null;
      if (archetypeCode) {
        talkSuggestion = await generateTalkSuggestion({
          viewerArchetype: null, // No viewer context for self-view
          targetArchetype: archetypeCode,
          targetCoreValue: g?.coreValue ?? null,
          targetDilemma: g?.dilemma ?? null,
        });
      }
    } catch (e) {
      console.warn("[genome-card] talk suggestion generation failed:", e);
    }

    return NextResponse.json({ ok: true, card, talkSuggestion });
  } catch (error) {
    console.error("genome-card error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
