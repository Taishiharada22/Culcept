import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { runAI } from "@/lib/ai";
import { buildRecoveryPrompt } from "@/lib/origin/v7/promptBuilder";
import { generateTemplateRecovery } from "@/lib/origin/v7/templateRecovery";

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
    const { period, atmosphere, perspective, comparison, triggers } = body;

    if (!period || !atmosphere || !perspective || !comparison || !triggers?.length) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const input = { period, atmosphere, perspective, comparison, triggers };

    // ── Try AI first (fast timeout — fail fast) ──
    const aiResult = await tryAIRecovery(input, user.id);
    if (aiResult) {
      return NextResponse.json({
        ok: true,
        ...aiResult,
        source: "ai",
      });
    }

    // ── Fallback: template-based recovery (never fails) ──
    console.info("[origin/recover] AI unavailable, using template fallback");
    const template = generateTemplateRecovery(input);
    return NextResponse.json({
      ok: true,
      narrative: template.narrative,
      title: template.title,
      echoes: template.echoes,
      layers: template.layers,
      model: template.model,
      source: "template",
    });
  } catch (err) {
    console.error("[origin/recover]", err);
    // Even on unexpected error, try template fallback
    try {
      const body = await request.clone().json().catch(() => null);
      if (body?.period) {
        const template = generateTemplateRecovery(body);
        return NextResponse.json({
          ok: true,
          narrative: template.narrative,
          title: template.title,
          echoes: template.echoes,
          layers: template.layers,
          model: template.model,
          source: "template",
        });
      }
    } catch {
      // template fallback also failed
    }
    return NextResponse.json(
      { error: "記憶の復元処理に失敗しました" },
      { status: 500 },
    );
  }
}

/** Try AI recovery with short timeout. Returns null on any failure. */
async function tryAIRecovery(
  input: { period: string; atmosphere: string; perspective: string; comparison: string; triggers: string[] },
  userId: string,
): Promise<{ narrative: string; title: string; echoes: string[]; layers?: Record<string, unknown>; model: string } | null> {
  try {
    const { prompt, systemPrompt } = buildRecoveryPrompt(input);

    const result = await runAI({
      taskType: "origin_memory_recovery",
      prompt,
      systemPrompt,
      requireJson: true,
      temperature: 0.7,
      maxOutputTokens: 600,
      timeoutMs: 10_000,
      userId,
    });

    if (!result.success) {
      console.warn("[origin/recover] AI failed:", result.errorMessage);
      return null;
    }

    // Parse JSON response
    let narrative = result.text;
    let title = "";
    let echoes: string[] = [];
    let layers: Record<string, unknown> | undefined;
    try {
      const parsed = JSON.parse(result.text);
      narrative = parsed.narrative ?? result.text;
      title = parsed.title ?? "";
      echoes = Array.isArray(parsed.echoes) ? parsed.echoes : [];
      if (parsed.layers && typeof parsed.layers === "object") {
        layers = parsed.layers;
      }
    } catch {
      // Non-JSON; use raw text
    }

    if (!narrative.trim()) return null;

    return { narrative, title, echoes, layers, model: result.model };
  } catch (err) {
    console.warn("[origin/recover] AI error:", err);
    return null;
  }
}
