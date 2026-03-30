import { NextRequest, NextResponse } from "next/server";

import { supabaseServer } from "@/lib/supabase/server";
import {
  BODY_AXIS_DEFS,
  BODY_FIELD_DEFS,
  buildMyStyleDiagnosis,
  isRecord,
  normalizeBirthDateInput,
  normalizeBodyAxes,
  normalizeBodyMeasurements,
  readFiniteNumber,
} from "@/lib/my-style/diagnosisEngine";
import {
  loadMyStyleSourceData,
  upsertDiagnosisSnapshot,
  upsertStyleVectorFromDiagnosis,
} from "@/lib/my-style/diagnosisStore";
import { resolveShoeWidthCodeServer } from "@/lib/shoeWidthServer";

export const runtime = "nodejs";

function normalizeConfidence(input: unknown) {
  const source = isRecord(input) ? input : {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(source)) {
    const numeric = readFiniteNumber(value);
    if (numeric == null) continue;
    out[key] = numeric;
  }
  return out;
}

function normalizeDisplayLabels(input: unknown) {
  const source = isRecord(input) ? input : {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === null || value === undefined || value === "") continue;
    out[key] = value;
  }
  return out;
}

function hasContent(record: Record<string, unknown>) {
  return Object.keys(record).length > 0;
}

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const source = await loadMyStyleSourceData(supabase, auth.user.id);
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
        : null;

    return NextResponse.json({
      ok: true,
      body_profile: source.bodyProfile,
      color_profile: source.colorProfile,
      measurement: source.measurement,
      measured_at: source.measuredAt,
      diagnosis,
    });
  } catch (error) {
    console.error("my-style body-profile GET error", error);
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
    const source = await loadMyStyleSourceData(supabase, auth.user.id);

    const payloadBodyProfile = isRecord(payload.body_profile) ? payload.body_profile : {};
    const payloadDisplayLabels = normalizeDisplayLabels(payloadBodyProfile.display_labels);
    const payloadConfidence = normalizeConfidence(payloadBodyProfile.confidence);

    const nextAxes = {
      ...normalizeBodyAxes(source.bodyProfile?.cfv),
      ...normalizeBodyAxes(payload.axes ?? payloadBodyProfile.cfv),
    };

    const nextMeasurements = {
      ...normalizeBodyMeasurements(source.measurement),
      ...normalizeBodyMeasurements(payload.measurements),
    };

    const currentDisplayLabels = normalizeDisplayLabels(source.bodyProfile?.display_labels);
    const currentConfidence = normalizeConfidence(source.bodyProfile?.confidence);

    const birthDate = normalizeBirthDateInput(payloadDisplayLabels.birth_date ?? payload.birth_date);
    const weightKg = readFiniteNumber(payloadDisplayLabels.weight_kg ?? payload.weight_kg);
    const contextType = String(payloadDisplayLabels.context_type ?? payload.context_type ?? "").trim();
    const streamId = String(payloadDisplayLabels.stream_id ?? payload.stream_id ?? "").trim();
    const overrideJp3 = String(payloadDisplayLabels.jp_3type_override ?? payload.jp_3type_override ?? "").trim().toLowerCase();
    const overrideJp7 = String(payloadDisplayLabels.jp_7type_override ?? payload.jp_7type_override ?? "").trim().toLowerCase();

    let derivedWidthSize = String(
      payloadDisplayLabels.derived_width_size ??
        currentDisplayLabels.derived_width_size ??
        "",
    ).trim();
    let derivedWidthAudience = String(
      payloadDisplayLabels.derived_width_audience ??
        currentDisplayLabels.derived_width_audience ??
        "women",
    ).trim();

    if (nextMeasurements.foot_length_cm && nextMeasurements.foot_girth_cm) {
      const derivedWidth = await resolveShoeWidthCodeServer({
        audience: derivedWidthAudience === "men" ? "men" : "women",
        footLengthCm: nextMeasurements.foot_length_cm,
        footGirthCm: nextMeasurements.foot_girth_cm,
      }).catch(() => null);

      if (derivedWidth?.widthCode) {
        derivedWidthSize = derivedWidth.widthCode;
        derivedWidthAudience = derivedWidth.audience;
      }
    }

    const provisionalBodyProfile = {
      cfv: nextAxes,
      display_labels: {
        ...currentDisplayLabels,
        ...payloadDisplayLabels,
        ...(birthDate ? { birth_date: birthDate } : {}),
        ...(weightKg != null ? { weight_kg: weightKg } : {}),
        ...(contextType ? { context_type: contextType } : {}),
        ...(streamId ? { stream_id: streamId } : {}),
        ...(overrideJp3 ? { jp_3type_override: overrideJp3 } : {}),
        ...(overrideJp7 ? { jp_7type_override: overrideJp7 } : {}),
        ...(derivedWidthSize ? { derived_width_size: derivedWidthSize } : {}),
        ...(derivedWidthAudience ? { derived_width_audience: derivedWidthAudience } : {}),
      },
      confidence: {
        ...currentConfidence,
        ...payloadConfidence,
      },
    };

    const diagnosis = buildMyStyleDiagnosis({
      userId: auth.user.id,
      bodyProfile: provisionalBodyProfile,
      colorProfile: source.colorProfile,
      measurements: nextMeasurements,
      bodyUpdatedAt: source.bodyProfile?.updated_at ?? null,
      colorUpdatedAt: source.colorProfile?.updated_at ?? null,
      facePhenotype: source.facePhenotype,
      hairPhenotype: source.hairPhenotype,
      faceType: source.faceType,
    });

    const inputCompletion = Number((Object.keys(nextMeasurements).length / BODY_FIELD_DEFS.length).toFixed(3));
    const cfvCompletion = Number((Object.keys(nextAxes).length / BODY_AXIS_DEFS.length).toFixed(3));

    const nextDisplayLabels = {
      ...provisionalBodyProfile.display_labels,
      jp_3type: diagnosis.jp_3type,
      jp_7type: diagnosis.jp_7type,
      jp_3type_label: diagnosis.jp_3type_label,
      jp_7type_label: diagnosis.jp_7type_label,
      quality_score: diagnosis.quality_score,
      completion_score: Math.round(inputCompletion * 70 + cfvCompletion * 30),
    };

    const nextConfidence = {
      ...provisionalBodyProfile.confidence,
      overall: diagnosis.label_confidence,
      input_completion: inputCompletion,
      cfv_completion: cfvCompletion,
    };

    if (!hasContent(nextAxes) && !hasContent(nextMeasurements) && !hasContent(nextDisplayLabels)) {
      return NextResponse.json({ ok: false, error: "No data to save" }, { status: 400 });
    }

    const bodyProfileWrite = await supabase
      .from("user_body_profiles")
      .upsert(
        {
          user_id: auth.user.id,
          cfv: nextAxes,
          display_labels: nextDisplayLabels,
          confidence: nextConfidence,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("*")
      .maybeSingle();

    if (bodyProfileWrite.error) {
      return NextResponse.json({ ok: false, error: bodyProfileWrite.error.message }, { status: 400 });
    }

    if (hasContent(nextMeasurements)) {
      const measurementWrite = await supabase.from("user_body_measurements").insert({
        user_id: auth.user.id,
        measurements: nextMeasurements,
      });

      if (measurementWrite.error) {
        return NextResponse.json({ ok: false, error: measurementWrite.error.message }, { status: 400 });
      }
    }

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

    return NextResponse.json({
      ok: true,
      body_profile: bodyProfileWrite.data ?? {
        user_id: auth.user.id,
        cfv: nextAxes,
        display_labels: nextDisplayLabels,
        confidence: nextConfidence,
      },
      measurement: nextMeasurements,
      diagnosis,
    });
  } catch (error: any) {
    console.error("my-style body-profile POST error", error);
    return NextResponse.json({ ok: false, error: String(error?.message ?? "Internal error") }, { status: 500 });
  }
}
