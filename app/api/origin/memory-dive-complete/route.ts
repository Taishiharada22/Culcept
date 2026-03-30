import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { runAI } from "@/lib/ai";
import {
  buildCompletionPrompt,
  AI_COMPLETION_SYSTEM,
  type AICompletionResult,
} from "@/lib/origin/v7/memoryDiveAI";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { scene, senses, events, inner, ripple } = body;

    if (!scene || !senses || !events || !inner || !ripple) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const contextPrompt = buildCompletionPrompt(scene, senses, events, inner, ripple);

    const result = await runAI({
      taskType: "origin_memory_dive_completion",
      prompt: `以下のカード選択から記憶を言語化してください。ユーザーが既に記入したテキストはそのまま維持し、空欄のみを補完してください。\n\n${contextPrompt}`,
      systemPrompt: AI_COMPLETION_SYSTEM,
      requireJson: true,
      temperature: 0.7,
      maxOutputTokens: 800,
      timeoutMs: 15_000,
      userId: user.id,
    });

    if (!result.success) {
      console.warn("[memory-dive-complete] AI failed:", result.errorMessage);
      return NextResponse.json(
        { error: "AI completion failed", fallback: true },
        { status: 502 },
      );
    }

    let completion: AICompletionResult;
    try {
      const parsed = JSON.parse(result.text);
      completion = {
        narrative: parsed.narrative ?? "",
        pivotalMoment: parsed.pivotalMoment ?? "",
        thoughts: parsed.thoughts ?? "",
        unsaid: parsed.unsaid ?? "",
        impact: parsed.impact ?? "",
        counterfactual: parsed.counterfactual ?? "",
        patternStarted: parsed.patternStarted ?? "",
      };
    } catch {
      return NextResponse.json(
        { error: "AI response parse failed", fallback: true },
        { status: 502 },
      );
    }

    // Preserve user-written text (don't overwrite)
    if (events.narrative?.trim()) completion.narrative = events.narrative;
    if (events.pivotalMoment?.trim()) completion.pivotalMoment = events.pivotalMoment;
    if (inner.thoughts?.trim()) completion.thoughts = inner.thoughts;
    if (inner.unsaid?.trim()) completion.unsaid = inner.unsaid;
    if (ripple.impact?.trim()) completion.impact = ripple.impact;
    if (ripple.counterfactual?.trim()) completion.counterfactual = ripple.counterfactual;
    if (ripple.patternStarted?.trim()) completion.patternStarted = ripple.patternStarted;

    return NextResponse.json({
      ok: true,
      completion,
      model: result.model,
    });
  } catch (err) {
    console.error("[memory-dive-complete]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
