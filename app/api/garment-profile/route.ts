import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { resolveShoeWidthCodeServer } from "@/lib/shoeWidthServer";
import { normalizeShoeWidthAudience } from "@/lib/shoeWidth";
import { apiOk, apiUnauthorized, apiBadRequest, apiError, apiCatch } from "@/lib/api/response";

export const runtime = "nodejs";

function toNum(v: any): number | null {
    const n = typeof v === "number" ? v : Number(String(v ?? ""));
    return Number.isFinite(n) ? n : null;
}

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function cleanObject(obj: Record<string, any>) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj ?? {})) {
        if (v === undefined || v === null || v === "") continue;
        out[k] = v;
    }
    return out;
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
            return apiUnauthorized();
        }

        const body = await request.json().catch(() => ({}));
        const productId = String(body?.product_id ?? "").trim();
        if (!productId) {
            return apiBadRequest("product_id is required");
        }

        const { data: product } = await supabase
            .from("drops")
            .select("id,user_id")
            .eq("id", productId)
            .maybeSingle();

        if (!product || product.user_id !== auth.user.id) {
            return apiError("Forbidden", 403);
        }

        const fitProfile = body?.fit_profile ?? null;
        const colorProfile = body?.color_profile ?? null;

        // Supabaseのクエリビルダーは thenable だが Promise 型ではないため、
        // Promise.resolve(...) で本物の Promise に変換して tasks に積む。
        const tasks: Promise<any>[] = [];

        if (fitProfile) {
            const patternRaw = cleanObject(fitProfile.pattern ?? {});
            const fabricRaw = cleanObject(fitProfile.fabric ?? {});

            const pattern: Record<string, string | number> = {};
            for (const [k, v] of Object.entries(patternRaw)) {
                const n = toNum(v);
                pattern[k] = n == null ? String(v) : n;
            }

            const fabric: Record<string, string | number> = {};
            for (const [k, v] of Object.entries(fabricRaw)) {
                const n = toNum(v);
                fabric[k] = n == null ? String(v) : clamp(n, 0, 2);
            }

            const recommendedFootLength = toNum(pattern.recommended_foot_length_cm);
            const recommendedFootGirth = toNum(pattern.recommended_foot_girth_cm);
            if (recommendedFootLength != null && recommendedFootGirth != null) {
                const widthResult = await resolveShoeWidthCodeServer({
                    audience: normalizeShoeWidthAudience(pattern.shoe_width_audience),
                    footLengthCm: recommendedFootLength,
                    footGirthCm: recommendedFootGirth,
                    subcategoryId: String(pattern.subcategory_id ?? "").trim() || null,
                }).catch(() => null);

                if (widthResult?.widthCode) {
                    pattern.recommended_width = widthResult.widthCode;
                    pattern.recommended_width_size = widthResult.widthCode;
                    pattern.shoe_width_audience = widthResult.audience;
                }
            }

            tasks.push(
                Promise.resolve(
                    supabase.from("garment_fit_profiles").upsert(
                        {
                            product_id: productId,
                            category: fitProfile.category || null,
                            intended_fit: fitProfile.intended_fit || null,
                            pattern,
                            fabric,
                            updated_at: new Date().toISOString(),
                        },
                        { onConflict: "product_id" }
                    )
                )
            );
        }

        if (colorProfile) {
            const colors = Array.isArray(colorProfile.dominant_colors) ? colorProfile.dominant_colors : [];
            const normalized = colors
                .map((c: any) => {
                    const coverage = toNum(c.coverage);
                    const lab = c.lab ?? {};
                    const lch = c.lch ?? {};

                    const L = toNum(lab.L);
                    const a = toNum(lab.a);
                    const b = toNum(lab.b);

                    const C = toNum(lch.C);
                    const h = toNum(lch.h);
                    const lchL = toNum(lch.L);

                    return {
                        rgb: c.rgb || undefined,
                        lab: L != null && a != null && b != null ? { L, a, b } : undefined,
                        lch: lchL != null && C != null && h != null ? { L: lchL, C, h } : undefined,
                        coverage: coverage != null ? clamp(coverage, 0, 1) : undefined,
                    };
                })
                .filter((c: any) => c.lab || c.lch || c.rgb);

            tasks.push(
                Promise.resolve(
                    supabase.from("garment_color_profiles").upsert(
                        {
                            product_id: productId,
                            dominant_colors: normalized,
                            updated_at: new Date().toISOString(),
                        },
                        { onConflict: "product_id" }
                    )
                )
            );
        }

        if (tasks.length === 0) {
            return apiBadRequest("No data to save");
        }

        const results = await Promise.all(tasks);
        const err = results.find((r) => r?.error)?.error;
        if (err) {
            return apiBadRequest(String(err.message ?? err));
        }

        return apiOk({ saved: true });
    } catch (error) {
        return apiCatch(error, "POST /api/garment-profile");
    }
}
