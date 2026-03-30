import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { findNextSuggestion } from "@/lib/rendezvous/counselor/nextSuggestion";
import type {
  DisconnectAnalysisRow,
  CounselorSessionRow,
  TendencyInsight,
  CounselorSessionState,
  NextSuggestion,
} from "@/lib/rendezvous/counselor/types";

// ---------- POST: Start recovery flow ----------

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { analysisId } = (await req.json()) as { analysisId: string };
    if (!analysisId) {
      return NextResponse.json(
        { error: "analysisId is required" },
        { status: 400 },
      );
    }

    const userId = user.id;

    // Fetch disconnect analysis and verify user is the disconnected party
    const { data: analysis, error: fetchErr } = await supabaseAdmin
      .from("rendezvous_disconnect_analyses")
      .select("*")
      .eq("id", analysisId)
      .single<DisconnectAnalysisRow>();

    if (fetchErr || !analysis) {
      return NextResponse.json(
        { error: "Analysis not found" },
        { status: 404 },
      );
    }

    // Only the disconnected user (not the one who disconnected) can start recovery
    if (analysis.disconnected_user_id !== userId) {
      return NextResponse.json(
        { error: "Only the disconnected user can start recovery" },
        { status: 403 },
      );
    }

    // Create counselor session
    const { data: session, error: sessionErr } = await supabaseAdmin
      .from("rendezvous_counselor_sessions")
      .insert({
        user_id: userId,
        disconnect_analysis_id: analysisId,
        state: "showing_insight" as CounselorSessionState,
        session_data: {
          tendencyInsight: analysis.tendency_insight,
          nextSuggestion: null,
        },
      })
      .select("id")
      .single<{ id: string }>();

    if (sessionErr || !session) {
      console.error("[counselor/recovery] session create error:", sessionErr);
      return NextResponse.json(
        { error: "Failed to create session" },
        { status: 500 },
      );
    }

    // Trigger next suggestion search asynchronously (fire-and-forget)
    triggerNextSuggestionSearch(session.id, userId, analysis.tendency_insight as TendencyInsight).catch((err) => {
      console.error("[counselor/recovery] async suggestion search error:", err);
    });

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      tendencyInsight: analysis.tendency_insight as TendencyInsight,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[counselor/recovery] POST error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------- GET: Current session state ----------

export async function GET(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sessionId = req.nextUrl.searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId query param is required" },
        { status: 400 },
      );
    }

    const { data: session, error: fetchErr } = await supabaseAdmin
      .from("rendezvous_counselor_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single<CounselorSessionRow>();

    if (fetchErr || !session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 },
      );
    }

    const sessionData = session.session_data as {
      tendencyInsight?: TendencyInsight | null;
      nextSuggestion?: NextSuggestion | null;
    };

    return NextResponse.json({
      sessionId: session.id,
      state: session.state,
      tendencyInsight: sessionData.tendencyInsight ?? null,
      nextSuggestion: sessionData.nextSuggestion ?? null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[counselor/recovery] GET error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------- Internal helper ----------

async function triggerNextSuggestionSearch(
  sessionId: string,
  userId: string,
  tendencyInsight: TendencyInsight,
): Promise<void> {
  // Update session state to "searching"
  await supabaseAdmin
    .from("rendezvous_counselor_sessions")
    .update({
      state: "searching" as CounselorSessionState,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  // Find next suggestion
  const suggestion = await findNextSuggestion({ userId, tendencyInsight });

  // Update session with result
  const newState: CounselorSessionState = suggestion
    ? "suggesting"
    : "showing_insight";

  const { data: current } = await supabaseAdmin
    .from("rendezvous_counselor_sessions")
    .select("session_data")
    .eq("id", sessionId)
    .single<{ session_data: Record<string, unknown> }>();

  await supabaseAdmin
    .from("rendezvous_counselor_sessions")
    .update({
      state: newState,
      session_data: {
        ...(current?.session_data ?? {}),
        nextSuggestion: suggestion,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
}
