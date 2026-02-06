import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
    GarmentColorProfile,
    GarmentFitProfile,
    UserBodyProfile,
    UserPersonalColorProfile,
    BodyMeasurements,
} from "@/types/body-color";
import { calcFitScore, calcColorScore } from "@/lib/match/fitColorScore";

export const runtime = "nodejs";

type FitColorRequest = {
    user_id?: string;
    product_id?: string;
    product_ids?: string[];
};

export async function POST(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const body: FitColorRequest = await request.json().catch(() => ({}));
        const userId = String(body.user_id ?? auth.user.id).trim();
        if (userId !== auth.user.id) {
            return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
        }

        const productIds = Array.from(
            new Set(
                (body.product_ids ?? (body.product_id ? [body.product_id] : []))
                    .map((p) => String(p || "").trim())
                    .filter(Boolean)
            )
        );

        if (productIds.length === 0) {
            return NextResponse.json({ ok: false, error: "product_id is required" }, { status: 400 });
        }

        const [
            bodyProfileRes,
            colorProfileRes,
            measurementRes,
            fitRes,
            colorRes,
        ] = await Promise.all([
            supabase.from("user_body_profiles").select("*").eq("user_id", userId).maybeSingle(),
            supabase.from("user_personal_color_profiles").select("*").eq("user_id", userId).maybeSingle(),
            supabase
                .from("user_body_measurements")
                .select("*")
                .eq("user_id", userId)
                .order("measured_at", { ascending: false })
                .limit(1),
            supabase.from("garment_fit_profiles").select("*").in("product_id", productIds),
            supabase.from("garment_color_profiles").select("*").in("product_id", productIds),
        ]);

        const bodyProfile = (bodyProfileRes.data ?? null) as UserBodyProfile | null;
        const colorProfile = (colorProfileRes.data ?? null) as UserPersonalColorProfile | null;

        const measurements = (measurementRes.data?.[0]?.measurements ?? null) as BodyMeasurements | null;

        const fitMap = new Map<string, GarmentFitProfile>();
        for (const row of fitRes.data ?? []) {
            if (!row?.product_id) continue;
            fitMap.set(String(row.product_id), row as GarmentFitProfile);
        }

        const colorMap = new Map<string, GarmentColorProfile>();
        for (const row of colorRes.data ?? []) {
            if (!row?.product_id) continue;
            colorMap.set(String(row.product_id), row as GarmentColorProfile);
        }

        const items = productIds.map((productId) => {
            const garmentFit = fitMap.get(productId) ?? null;
            const garmentColor = colorMap.get(productId) ?? null;

            const fit = calcFitScore({ bodyProfile, measurements, garment: garmentFit });
            const color = calcColorScore({ colorProfile, garment: garmentColor });

            return {
                product_id: productId,
                fit,
                color,
            };
        });

        return NextResponse.json({
            ok: true,
            user_id: userId,
            items,
        });
    } catch (error) {
        console.error("fit-color-score error:", error);
        return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
    }
}
