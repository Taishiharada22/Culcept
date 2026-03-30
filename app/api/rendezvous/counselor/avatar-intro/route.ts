import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getCounterpartId,
  verifyCandidateBelongsToUser,
} from "@/lib/rendezvous/helpers";
import { generateAvatarIntro } from "@/lib/rendezvous/counselor/avatarMediation";
import { generateBriefing } from "@/lib/rendezvous/counselor/briefingGenerator";
import type {
  AvatarIntroMode,
  AvatarIntroRow,
  PreBriefingRow,
  PreConnectionBriefing,
  AvatarIntroduction,
} from "@/lib/rendezvous/counselor/types";

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { candidateId, mode } = (await req.json()) as {
      candidateId: string;
      mode: AvatarIntroMode;
    };

    if (!candidateId || !mode) {
      return NextResponse.json(
        { error: "candidateId and mode are required" },
        { status: 400 },
      );
    }

    if (mode !== "avatar" && mode !== "direct") {
      return NextResponse.json(
        { error: "mode must be 'avatar' or 'direct'" },
        { status: 400 },
      );
    }

    const userId = user.id;

    // Verify candidate belongs to user
    const result = await verifyCandidateBelongsToUser(
      supabaseAdmin,
      candidateId,
      userId,
    );
    if (!result) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 },
      );
    }

    const { candidate } = result;
    const counterpartId = getCounterpartId(candidate, userId);

    let intro: AvatarIntroduction;

    if (mode === "avatar") {
      // Generate avatar introduction via AI
      intro = await generateAvatarIntro({
        candidateId,
        fromUserId: userId,
        toUserId: counterpartId,
      });
    } else {
      // Direct mode: create record without avatar message
      const { data: row, error: insertErr } = await supabaseAdmin
        .from("rendezvous_avatar_introductions")
        .insert({
          candidate_id: candidateId,
          from_user_id: userId,
          to_user_id: counterpartId,
          mode: "direct",
          avatar_message: null,
          suggested_topics: [],
        })
        .select("*")
        .single<AvatarIntroRow>();

      if (insertErr || !row) {
        console.error("[counselor/avatar-intro] insert error:", insertErr);
        return NextResponse.json(
          { error: "Failed to create intro record" },
          { status: 500 },
        );
      }

      intro = {
        id: row.id,
        candidateId: row.candidate_id,
        fromUserId: row.from_user_id,
        toUserId: row.to_user_id,
        mode: row.mode,
        avatarMessage: row.avatar_message,
        suggestedTopics: row.suggested_topics,
        createdAt: row.created_at,
      };
    }

    // Generate briefing for the user (or return cached)
    let briefing: PreConnectionBriefing;

    const { data: existingBriefing } = await supabaseAdmin
      .from("rendezvous_pre_briefings")
      .select("*")
      .eq("candidate_id", candidateId)
      .eq("user_id", userId)
      .single<PreBriefingRow>();

    if (existingBriefing) {
      briefing = existingBriefing.briefing_data as unknown as PreConnectionBriefing;
    } else {
      briefing = await generateBriefing({ candidateId, userId });

      await supabaseAdmin.from("rendezvous_pre_briefings").insert({
        candidate_id: candidateId,
        user_id: userId,
        briefing_data: briefing as unknown as Record<string, unknown>,
      });
    }

    return NextResponse.json({
      intro,
      briefing,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[counselor/avatar-intro] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
