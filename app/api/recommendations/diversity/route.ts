import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function safeJson(value: any) {
    if (value == null) return null;
    if (typeof value === "object") return value;
    if (typeof value === "string") {
        const t = value.trim();
        if (!t) return null;
        try {
            return JSON.parse(t);
        } catch {
            return value;
        }
    }
    return value;
}

function normalizeTags(raw: any): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());
    if (typeof raw === "string") {
        const t = raw.trim();
        if (!t) return [];
        if (t.startsWith("[") && t.endsWith("]")) {
            try {
                const parsed = JSON.parse(t);
                if (Array.isArray(parsed)) return normalizeTags(parsed);
            } catch { }
        }
        return t.split(",").map((s) => s.trim()).filter(Boolean);
    }
    return [];
}

function extractTagsFromPayload(payload: any): string[] {
    const p = safeJson(payload);
    if (!p || typeof p !== "object") return [];
    return normalizeTags((p as any).tags) || normalizeTags((p as any).meta?.tags);
}

/**
 * 多様性スコア（Shannon Entropy）
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const userId = auth.user.id;
        const lookbackCount = 20;

        const res = await supabase
            .from("recommendation_impressions")
            .select("payload, created_at")
            .eq("user_id", userId)
            .eq("target_type", "insight")
            .order("created_at", { ascending: false })
            .limit(lookbackCount);

        if (res.error) throw res.error;

        const recentImpressions = res.data || [];

        if (recentImpressions.length < 5) {
            return NextResponse.json({
                ok: true,
                diversity_score: 1.0,
                tag_distribution: [],
                recommendation: "continue",
                message: "データが不足しています",
            });
        }

        const tagCounts: Record<string, number> = {};
        let totalTags = 0;

        recentImpressions.forEach((imp: any) => {
            const tags = extractTagsFromPayload(imp.payload);
            tags.forEach((tag) => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                totalTags++;
            });
        });

        if (totalTags === 0) {
            return NextResponse.json({
                ok: true,
                diversity_score: 1.0,
                tag_distribution: [],
                recommendation: "continue",
                message: "タグがありません",
            });
        }

        const uniqueTags = Object.keys(tagCounts).length;
        let entropy = 0;

        Object.values(tagCounts).forEach((count) => {
            const p = count / totalTags;
            entropy -= p * Math.log2(p);
        });

        const maxEntropy = uniqueTags > 0 ? Math.log2(uniqueTags) : 0;
        const diversityScore = maxEntropy > 0 ? entropy / maxEntropy : 0;

        const tagDistribution = Object.entries(tagCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([tag, count]) => ({
                tag,
                count,
                percentage: Math.round((count / totalTags) * 100),
            }));

        let recommendation: string;
        let action: "explore" | "continue" | "exploit";

        if (diversityScore < 0.4) {
            recommendation = "同じようなカードばかりです。ランダム要素を増やしましょう";
            action = "explore";
        } else if (diversityScore > 0.7) {
            recommendation = "多様なカードを見ています。バランスが良いです";
            action = "continue";
        } else {
            recommendation = "適度な多様性です";
            action = "continue";
        }

        const maxTag = tagDistribution[0];
        const isDominated = !!maxTag && maxTag.percentage > 50;

        return NextResponse.json({
            ok: true,
            diversity_score: Math.round(diversityScore * 100) / 100,
            tag_distribution: tagDistribution,
            total_tags: totalTags,
            unique_tags: uniqueTags,
            entropy: Math.round(entropy * 100) / 100,
            max_entropy: Math.round(maxEntropy * 100) / 100,
            recommendation,
            action,
            is_dominated: isDominated,
            dominant_tag: isDominated ? maxTag.tag : null,
            recent_count: recentImpressions.length,
        });
    } catch (err: any) {
        console.error("GET /api/recommendations/diversity error:", err);
        return NextResponse.json(
            { ok: false, error: err?.message || "Internal server error" },
            { status: 500 }
        );
    }
}
