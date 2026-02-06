import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

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
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const productId = String(body?.product_id ?? "").trim();
        if (!productId) {
            return NextResponse.json({ ok: false, error: "product_id is required" }, { status: 400 });
        }

        const { data: product } = await supabase
            .from("drops")
            .select("id,user_id")
            .eq("id", productId)
            .maybeSingle();

        if (!product || product.user_id !== auth.user.id) {
            return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
        }

        const fitProfile = body?.fit_profile ?? null;
        const colorProfile = body?.color_profile ?? null;
        const tasks: Promise<any>[] = [];

        if (fitProfile) {
            const patternRaw = cleanObject(fitProfile.pattern ?? {});
            const fabricRaw = cleanObject(fitProfile.fabric ?? {});

            const pattern: Record<string, number> = {};
            for (const [k, v] of Object.entries(patternRaw)) {
                const n = toNum(v);
                if (n == null) continue;
                pattern[k] = n;
            }

            const fabric: Record<string, number> = {};
            for (const [k, v] of Object.entries(fabricRaw)) {
                const n = toNum(v);
                if (n == null) continue;
                fabric[k] = clamp(n, 0, 2);
            }

            tasks.push(
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
                    return {
                        rgb: c.rgb || undefined,
                        lab: L != null && a != null && b != null ? { L, a, b } : undefined,
                        lch: C != null && h != null && toNum(lch.L) != null ? { L: toNum(lch.L), C, h } : undefined,
                        coverage: coverage != null ? clamp(coverage, 0, 1) : undefined,
                    };
                })
                .filter((c: any) => c.lab || c.lch || c.rgb);

            tasks.push(
                supabase.from("garment_color_profiles").upsert(
                    {
                        product_id: productId,
                        dominant_colors: normalized,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "product_id" }
                )
            );
        }

        if (tasks.length === 0) {
            return NextResponse.json({ ok: false, error: "No data to save" }, { status: 400 });
        }

        const results = await Promise.all(tasks);
        const err = results.find((r) => r?.error)?.error;
        if (err) {
            return NextResponse.json({ ok: false, error: String(err.message ?? err) }, { status: 400 });
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("garment-profile error:", error);
        return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
    }
}
