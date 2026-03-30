import { NextRequest, NextResponse } from "next/server";

import { supabaseServer } from "@/lib/supabase/server";
import { buildMyStyleDiagnosis } from "@/lib/my-style/diagnosisEngine";
import {
  loadMyStyleSourceData,
  readDiagnosisFeedback,
  upsertDiagnosisSnapshot,
  upsertStyleVectorFromDiagnosis,
} from "@/lib/my-style/diagnosisStore";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const source = await loadMyStyleSourceData(supabase, auth.user.id);
    const storedDiagnosis = source.quizResult.myStyleDiagnosis ?? null;
    const diagnosis =
      source.bodyProfile || source.colorProfile
        ? buildMyStyleDiagnosis({
            userId: auth.user.id,
            bodyProfile: source.bodyProfile,
            colorProfile: source.colorProfile,
            measurements: source.measurement,
            bodyUpdatedAt: source.bodyProfile?.updated_at ?? null,
            colorUpdatedAt: source.colorProfile?.updated_at ?? null,
            facePhenotype: source.facePhenotype,
            hairPhenotype: source.hairPhenotype,
            faceType: source.faceType,
          })
        : storedDiagnosis;

    return NextResponse.json({
      ok: true,
      diagnosis,
      body_profile: source.bodyProfile,
      color_profile: source.colorProfile,
      feedback: readDiagnosisFeedback(source.quizResult),
    });
  } catch (error) {
    console.error("my-style diagnosis GET error", error);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({}));
    if (payload?.regenerate === false) {
      return NextResponse.json({ ok: false, error: "unsupported request" }, { status: 400 });
    }

    const source = await loadMyStyleSourceData(supabase, auth.user.id);
    if (!source.bodyProfile && !source.colorProfile) {
      return NextResponse.json({ ok: true, diagnosis: null });
    }

    const diagnosis = buildMyStyleDiagnosis({
      userId: auth.user.id,
      bodyProfile: source.bodyProfile,
      colorProfile: source.colorProfile,
      measurements: source.measurement,
      bodyUpdatedAt: source.bodyProfile?.updated_at ?? null,
      colorUpdatedAt: source.colorProfile?.updated_at ?? null,
      facePhenotype: source.facePhenotype,
      hairPhenotype: source.hairPhenotype,
      faceType: source.faceType,
    });

    await upsertStyleVectorFromDiagnosis({
      supabase,
      userId: auth.user.id,
      diagnosis,
      existingVector: source.styleVector,
    });
    await upsertDiagnosisSnapshot({
      supabase,
      userId: auth.user.id,
      diagnosis,
      quizResult: source.quizResult,
    });

    return NextResponse.json({ ok: true, diagnosis });
  } catch (error: any) {
    console.error("my-style diagnosis POST error", error);
    return NextResponse.json({ ok: false, error: String(error?.message ?? "Internal error") }, { status: 500 });
  }
}

