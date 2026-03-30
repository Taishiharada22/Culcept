// app/api/sns/presence/pulse/route.ts
// Presence Pulse — 今の自分の鼓動データ

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export interface PulseState {
  selfAlignment: number;   // -1 to +1
  interpersonalEnergy: number;
  emotionalTemp: number;
  boundarySense: number;
  date: string;
}

export interface PulseResponse {
  ok: boolean;
  hasData: boolean;
  current: PulseState | null;
  history7d: PulseState[];
  observationCount: number;
  dataQuality: "low" | "medium" | "high";
}

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // daily states (最新7日分)
    const { data: dailyStates } = await supabase
      .from("stargazer_daily_states")
      .select("self_alignment, interpersonal_energy, emotional_temp, boundary_sense, date")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(7);

    // 観測数
    const { count: obsCount } = await supabase
      .from("stargazer_observations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    const totalObservations = obsCount ?? 0;
    const dataQuality: PulseResponse["dataQuality"] =
      totalObservations >= 30 ? "high" : totalObservations >= 10 ? "medium" : "low";

    if (!dailyStates || dailyStates.length === 0) {
      return NextResponse.json({
        ok: true,
        hasData: false,
        current: null,
        history7d: [],
        observationCount: totalObservations,
        dataQuality,
      } satisfies PulseResponse);
    }

    const toPulseState = (row: typeof dailyStates[0]): PulseState => ({
      selfAlignment: Number(row.self_alignment) || 0,
      interpersonalEnergy: Number(row.interpersonal_energy) || 0,
      emotionalTemp: Number(row.emotional_temp) || 0,
      boundarySense: Number(row.boundary_sense) || 0,
      date: row.date,
    });

    const history7d = dailyStates.map(toPulseState);
    const current = history7d[0] ?? null;

    return NextResponse.json({
      ok: true,
      hasData: true,
      current,
      history7d,
      observationCount: totalObservations,
      dataQuality,
    } satisfies PulseResponse);
  } catch (error) {
    console.error("Pulse API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
