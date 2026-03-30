import "server-only";

import type { MyStyleDiagnosis } from "@/lib/my-style/diagnosisEngine";

type QuizResultRecord = Record<string, unknown>;

function asRecord(value: unknown): QuizResultRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as QuizResultRecord) : {};
}

export async function loadMyStyleSourceData(supabase: any, userId: string) {
  const [bodyRes, colorRes, measurementRes, summaryRes, styleVectorRes, facePhenotypeRes, hairPhenotypeRes, faceTypeRes] = await Promise.all([
    supabase.from("user_body_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("user_personal_color_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("user_body_measurements")
      .select("measurements,measured_at")
      .eq("user_id", userId)
      .order("measured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("user_style_summary").select("quiz_result").eq("user_id", userId).maybeSingle(),
    supabase.from("user_style_vector").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("face_phenotype").select("phenotype, completed_categories").eq("user_id", userId).maybeSingle(),
    supabase.from("hair_phenotype").select("length, bangs, silhouette, texture, color, color_hex").eq("user_id", userId).maybeSingle(),
    supabase.from("face_type_classifications").select("primary_type, secondary_type, structure_score, impression_score, warmth_score, confidence").eq("user_id", userId).maybeSingle(),
  ]);

  return {
    bodyProfile: bodyRes.data ?? null,
    colorProfile: colorRes.data ?? null,
    measurement: measurementRes.data?.measurements ?? null,
    measuredAt: measurementRes.data?.measured_at ?? null,
    quizResult: asRecord(summaryRes.data?.quiz_result),
    styleVector: styleVectorRes.data ?? null,
    facePhenotype: facePhenotypeRes.data ?? null,
    hairPhenotype: hairPhenotypeRes.data ?? null,
    faceType: faceTypeRes.data ?? null,
  };
}

export async function upsertDiagnosisSnapshot(args: {
  supabase: any;
  userId: string;
  diagnosis: MyStyleDiagnosis | null;
  quizResult?: QuizResultRecord | null;
}) {
  const currentQuizResult = asRecord(args.quizResult);
  const nextQuizResult = {
    ...currentQuizResult,
    myStyleDiagnosis: args.diagnosis,
    myStyleDiagnosisUpdatedAt: new Date().toISOString(),
  };

  const { error } = await args.supabase.from("user_style_summary").upsert(
    {
      user_id: args.userId,
      quiz_result: nextQuizResult,
    },
    { onConflict: "user_id" },
  );

  if (error) throw error;
  return nextQuizResult;
}

export async function upsertStyleVectorFromDiagnosis(args: {
  supabase: any;
  userId: string;
  diagnosis: MyStyleDiagnosis;
  existingVector?: Record<string, unknown> | null;
}) {
  const existing = asRecord(args.existingVector);
  const payload = {
    ...existing,
    user_id: args.userId,
    jp_3type: args.diagnosis.jp_3type,
    jp_7type: args.diagnosis.jp_7type,
    pc_season: args.diagnosis.pc_season,
    pc_base: args.diagnosis.pc_base,
    label_confidence: args.diagnosis.label_confidence,
    face_type_primary: args.diagnosis.face_aware_rules?.face_shape ?? null,
    hair_length: args.diagnosis.hair_aware_rules?.hair_length ?? null,
    hair_texture: null, // TODO: will be populated when hair texture is tracked
    updated_at: new Date().toISOString(),
  };

  const { error } = await args.supabase.from("user_style_vector").upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
}

export function readDiagnosisFeedback(quizResult: unknown) {
  const root = asRecord(quizResult);
  const historyRaw = Array.isArray(root.myStyleDiagnosisFeedbackHistory)
    ? root.myStyleDiagnosisFeedbackHistory
    : root.myStyleDiagnosisFeedback
      ? [root.myStyleDiagnosisFeedback]
      : [];

  const history = historyRaw
    .map((entry) => asRecord(entry))
    .filter((entry) => Object.keys(entry).length > 0);

  const ratings = history
    .map((entry) => Number(entry.rating))
    .filter((value) => Number.isFinite(value));

  return {
    latest: history[0] ?? null,
    history,
    count: ratings.length,
    avg_rating:
      ratings.length > 0
        ? Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 10) / 10
        : null,
  };
}

export async function appendDiagnosisFeedback(args: {
  supabase: any;
  userId: string;
  diagnosticProfileId?: string | null;
  rating: number;
  accurate: boolean;
  notes: string;
}) {
  const summaryRes = await args.supabase
    .from("user_style_summary")
    .select("quiz_result")
    .eq("user_id", args.userId)
    .maybeSingle();

  if (summaryRes.error) throw summaryRes.error;

  const quizResult = asRecord(summaryRes.data?.quiz_result);
  const existingHistory = Array.isArray(quizResult.myStyleDiagnosisFeedbackHistory)
    ? quizResult.myStyleDiagnosisFeedbackHistory.map((entry) => asRecord(entry))
    : [];

  const nextEntry = {
    diagnostic_profile_id: args.diagnosticProfileId ?? null,
    rating: args.rating,
    accurate: args.accurate,
    notes: args.notes,
    created_at: new Date().toISOString(),
  };

  const nextQuizResult = {
    ...quizResult,
    myStyleDiagnosisFeedback: nextEntry,
    myStyleDiagnosisFeedbackHistory: [nextEntry, ...existingHistory].slice(0, 12),
  };

  const { error } = await args.supabase.from("user_style_summary").upsert(
    {
      user_id: args.userId,
      quiz_result: nextQuizResult,
    },
    { onConflict: "user_id" },
  );

  if (error) throw error;
  return nextEntry;
}
