import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  selectTensionPrompt,
  analyzeTensionResponse,
  getTensionPromptById,
} from "@/lib/rendezvous/tensionArchitecture";
import type {
  TensionResponse,
} from "@/lib/rendezvous/tensionArchitecture";
import type { RendezvousCategory } from "@/lib/rendezvous/types";

// ============================================================
// GET /api/rendezvous/tension?candidateId=xxx
// 次のテンションプロンプトを取得する
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = auth.user.id;
    const url = new URL(request.url);
    const candidateId = url.searchParams.get("candidateId");

    if (!candidateId) {
      return NextResponse.json(
        { ok: false, error: "candidateId is required" },
        { status: 400 },
      );
    }

    // 候補の情報を取得（カテゴリとメッセージ数）
    const { data: candidate, error: candErr } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, category, state")
      .eq("id", candidateId)
      .single();

    if (candErr || !candidate) {
      return NextResponse.json(
        { ok: false, error: "Candidate not found" },
        { status: 404 },
      );
    }

    // このユーザーがこの候補に関わっているか確認
    const { data: userState } = await supabaseAdmin
      .from("rendezvous_user_states")
      .select("id")
      .eq("candidate_id", candidateId)
      .eq("user_id", userId)
      .single();

    if (!userState) {
      return NextResponse.json(
        { ok: false, error: "Not authorized for this candidate" },
        { status: 403 },
      );
    }

    // メッセージ数を取得（スレッドからカウント）
    const { count: messageCount } = await supabaseAdmin
      .from("rendezvous_messages")
      .select("id", { count: "exact", head: true })
      .eq("candidate_id", candidateId);

    // 過去に出したプロンプトIDを取得
    const { data: previousResponses } = await supabaseAdmin
      .from("rendezvous_tension_responses")
      .select("prompt_id")
      .eq("user_id", userId)
      .eq("candidate_id", candidateId);

    const previousPromptIds = (previousResponses ?? []).map((r) => r.prompt_id);

    // 現在の季節を取得
    const month = new Date().getMonth(); // 0-indexed
    const season =
      month >= 2 && month <= 4
        ? "spring"
        : month >= 5 && month <= 7
          ? "summer"
          : month >= 8 && month <= 10
            ? "autumn"
            : "winter";

    // プロンプトを選択
    const prompt = selectTensionPrompt(
      candidate.category as RendezvousCategory,
      messageCount ?? 0,
      previousPromptIds,
      season,
    );

    if (!prompt) {
      return NextResponse.json({
        ok: true,
        prompt: null,
        reason: "not_ready",
      });
    }

    return NextResponse.json({
      ok: true,
      prompt,
    });
  } catch (err) {
    console.error("[tension GET]", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

// ============================================================
// POST /api/rendezvous/tension
// テンション応答を送信し、洞察を返す
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = auth.user.id;
    const body = await request.json();

    const {
      candidateId,
      promptId,
      response: responseType,
      reflection,
    } = body as {
      candidateId: string;
      promptId: string;
      response: TensionResponse["response"];
      reflection?: string;
    };

    if (!candidateId || !promptId || !responseType) {
      return NextResponse.json(
        { ok: false, error: "candidateId, promptId, response are required" },
        { status: 400 },
      );
    }

    // Validate response type
    if (!["faced", "deferred", "reflected"].includes(responseType)) {
      return NextResponse.json(
        { ok: false, error: "Invalid response type" },
        { status: 400 },
      );
    }

    // プロンプトの存在確認
    const prompt = getTensionPromptById(promptId);
    if (!prompt) {
      return NextResponse.json(
        { ok: false, error: "Invalid prompt ID" },
        { status: 400 },
      );
    }

    // ユーザーがこの候補に関わっているか確認
    const { data: userState } = await supabaseAdmin
      .from("rendezvous_user_states")
      .select("id")
      .eq("candidate_id", candidateId)
      .eq("user_id", userId)
      .single();

    if (!userState) {
      return NextResponse.json(
        { ok: false, error: "Not authorized for this candidate" },
        { status: 403 },
      );
    }

    // 応答を作成
    const tensionResponse: TensionResponse = {
      promptId,
      response: responseType,
      reflection: responseType === "reflected" ? reflection : undefined,
      respondedAt: new Date().toISOString(),
    };

    // 洞察を生成
    const insight = analyzeTensionResponse(prompt, tensionResponse);

    // DBに保存
    const { error: insertErr } = await supabaseAdmin
      .from("rendezvous_tension_responses")
      .insert({
        user_id: userId,
        candidate_id: candidateId,
        prompt_id: promptId,
        response: responseType,
        reflection: tensionResponse.reflection ?? null,
        insight: insight,
      });

    if (insertErr) {
      console.error("[tension POST] insert error:", insertErr);
      return NextResponse.json(
        { ok: false, error: "Failed to save response" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      insight,
    });
  } catch (err) {
    console.error("[tension POST]", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
