import { NextRequest, NextResponse } from "next/server";
import { runAI } from "@/lib/ai";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `あなたはファッションスタイリストであり、ユーザーの深層的なスタイル傾向を読み取る専門家です。

与えられたスタイルデータを分析し、以下の3つの観点でインサイトを生成してください：

1. **核心の読み取り** (coreReading): ユーザーのスタイル傾向から見える「本質的な自分らしさ」を1-2文で。表面的な傾向ではなく、「なぜその選択をするのか」の深層に触れる。
2. **気づいていない可能性** (hiddenPotential): データから見える未開拓の方向性。ユーザーが意識していないかもしれない新しいスタイル可能性を1-2文で提案。
3. **次の一手** (nextMove): 具体的で実行可能なアドバイスを1文で。曖昧な提案ではなく「○○を試してみて」レベルの具体性。

すべて日本語で、語りかけるトーンで。上から目線ではなく、一緒に発見する姿勢で。`;

const JSON_SCHEMA = {
    type: "object",
    properties: {
        coreReading: { type: "string", description: "核心の読み取り（1-2文）" },
        hiddenPotential: { type: "string", description: "気づいていない可能性（1-2文）" },
        nextMove: { type: "string", description: "次の一手（1文）" },
        mood: { type: "string", enum: ["encouraging", "curious", "affirming", "challenging"], description: "トーン" },
    },
    required: ["coreReading", "hiddenPotential", "nextMove", "mood"],
};

function buildPrompt(data: Record<string, unknown>): string {
    const sections: string[] = [];

    if (Array.isArray(data.coreLanes) && data.coreLanes.length > 0) {
        sections.push(`コアスタイルレーン: ${data.coreLanes.join(", ")}`);
    }
    if (Array.isArray(data.rareLanes) && data.rareLanes.length > 0) {
        sections.push(`レアスタイルレーン: ${data.rareLanes.join(", ")}`);
    }
    if (Array.isArray(data.secretLanes) && data.secretLanes.length > 0) {
        sections.push(`シークレットレーン: ${data.secretLanes.join(", ")}`);
    }
    if (Array.isArray(data.dominantColors) && data.dominantColors.length > 0) {
        sections.push(`ワードローブの主要カラー: ${data.dominantColors.join(", ")}`);
    }
    if (Array.isArray(data.dominantImpressions) && data.dominantImpressions.length > 0) {
        sections.push(`望む印象: ${data.dominantImpressions.join(", ")}`);
    }
    if (Array.isArray(data.wardrobeCategories) && data.wardrobeCategories.length > 0) {
        sections.push(`ワードローブ構成: ${data.wardrobeCategories.join(", ")}`);
    }
    if (typeof data.wardrobeCount === "number") {
        sections.push(`アイテム数: ${data.wardrobeCount}`);
    }
    if (typeof data.setupCount === "number") {
        sections.push(`セットアップ数: ${data.setupCount}`);
    }
    if (typeof data.currentContour === "string" && data.currentContour) {
        sections.push(`現在の輪郭: ${data.currentContour}`);
    }
    if (Array.isArray(data.discoveries) && data.discoveries.length > 0) {
        sections.push(`発見: ${data.discoveries.join("; ")}`);
    }
    if (typeof data.pcSeason === "string" && data.pcSeason) {
        sections.push(`パーソナルカラー: ${data.pcSeason}`);
    }
    if (typeof data.bodyType === "string" && data.bodyType) {
        sections.push(`骨格タイプ: ${data.bodyType}`);
    }
    const archCode = data.archetypeCode;
    if (typeof archCode === "string" && archCode) {
        sections.push(`Stargazerアーキタイプ: ${archCode}`);
    }
    if (Array.isArray(data.styleRules) && data.styleRules.length > 0) {
        sections.push(`発見されたスタイルルール: ${data.styleRules.join("; ")}`);
    }

    if (sections.length === 0) {
        return "まだスタイルデータが少ないですが、現在の状態を元にインサイトを生成してください。「まだ始まったばかりだけど、ここから見えること」という視点で。";
    }

    return `以下のスタイルデータからインサイトを生成してください:\n\n${sections.join("\n")}`;
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
            return NextResponse.json({ error: "Invalid body" }, { status: 400 });
        }

        const prompt = buildPrompt(body as Record<string, unknown>);

        const result = await runAI({
            taskType: "detailed_analysis",
            prompt,
            systemPrompt: SYSTEM_PROMPT,
            requireJson: true,
            jsonSchema: JSON_SCHEMA,
            temperature: 0.8,
            maxOutputTokens: 512,
            timeoutMs: 20_000,
            userId: auth.user.id,
            metadata: { source: "my-style-ai-insight" },
        });

        if (!result.success || !result.structured) {
            return NextResponse.json({
                ok: true,
                insight: {
                    coreReading: "スタイルデータが育つほど、ここに深い読み取りが現れます。",
                    hiddenPotential: "もう少しデータが溜まると、あなたの無意識の傾向が見えてきます。",
                    nextMove: "気になるアイテムやセットアップを追加して、輪郭を育ててみてください。",
                    mood: "encouraging" as const,
                },
                fallback: true,
            });
        }

        return NextResponse.json({
            ok: true,
            insight: result.structured,
            fallback: false,
            provider: result.provider,
        });
    } catch (error) {
        console.error("my-style ai-insight error:", error);
        return NextResponse.json({ error: "AI insight generation failed" }, { status: 500 });
    }
}
