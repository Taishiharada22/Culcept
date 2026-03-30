// app/api/calendar/day/route.ts
import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { apiOk, apiUnauthorized, apiBadRequest, apiNotFound, apiError, apiCatch } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return apiUnauthorized();
        }

        const url = new URL(req.url);
        const date = url.searchParams.get("date");

        if (!date) {
            return apiBadRequest("Date parameter is required");
        }

        // その日のコーディネートを取得
        const { data: outfit } = await supabase
            .from("calendar_outfits")
            .select("*")
            .eq("user_id", auth.user.id)
            .eq("date", date)
            .maybeSingle();

        // その日のイベントを取得
        const { data: events } = await supabase
            .from("calendar_events")
            .select("*")
            .eq("user_id", auth.user.id)
            .eq("date", date);

        return apiOk({
            date,
            outfit,
            events: events ?? [],
        });
    } catch (err) {
        return apiCatch(err, "GET /api/calendar/day");
    }
}

export async function PUT(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return apiUnauthorized();
        }

        const body = await req.json();
        const { date, weather_input, is_worn, worn_record } = body;

        if (!date) {
            return apiBadRequest("Date is required");
        }

        const updateData: any = { updated_at: new Date().toISOString() };
        if (weather_input !== undefined) updateData.weather_input = weather_input;
        if (is_worn !== undefined) updateData.is_worn = is_worn;

        // 着用記録フィールド
        if (worn_record) {
            if (worn_record.itemIds) updateData.worn_item_ids = worn_record.itemIds;
            if (worn_record.satisfaction) updateData.satisfaction = worn_record.satisfaction;
            if (worn_record.note !== undefined) updateData.worn_note = worn_record.note || null;
            if (worn_record.syncSnapshot) updateData.sync_snapshot = worn_record.syncSnapshot;
            updateData.is_worn = true;
        }

        // Upsert: 既存レコードがなければ作成
        const { data: existing } = await supabase
            .from("calendar_outfits")
            .select("id")
            .eq("user_id", auth.user.id)
            .eq("date", date)
            .maybeSingle();

        let updated;
        let error;

        if (existing) {
            const result = await supabase
                .from("calendar_outfits")
                .update(updateData)
                .eq("user_id", auth.user.id)
                .eq("date", date)
                .select()
                .single();
            updated = result.data;
            error = result.error;
        } else if (worn_record) {
            // 着用記録だけの場合、レコードを新規作成
            const result = await supabase
                .from("calendar_outfits")
                .insert({
                    user_id: auth.user.id,
                    date,
                    outfit_items: [],
                    ...updateData,
                })
                .select()
                .single();
            updated = result.data;
            error = result.error;
        } else {
            return apiNotFound("No existing outfit to update");
        }

        if (error) {
            console.error("Error updating outfit:", error);
            return apiError("Failed to update outfit", 500);
        }

        return apiOk({ success: true, outfit: updated });
    } catch (err) {
        return apiCatch(err, "PUT /api/calendar/day");
    }
}
