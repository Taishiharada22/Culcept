import { NextResponse } from "next/server";

import { assembleGenomeForUser } from "@/lib/genome/assembleForUser";
import { buildMyStyleDiagnosis, type MyStyleDiagnosis } from "@/lib/my-style/diagnosisEngine";
import { loadMyStyleSourceData } from "@/lib/my-style/diagnosisStore";
import { deriveObservationGaps } from "@/lib/origin/v7/observationGaps";
import { isDraftStarted, inferStepFromDraft } from "@/lib/origin/v7/persistence";
import { getExplorationStage } from "@/lib/origin/v7/retention";
import { loadOriginClientState } from "@/lib/origin/v7/server";
import { STEP_ORDER } from "@/lib/origin/v7/types";
import { TRAIT_AXES } from "@/lib/stargazer/traitAxes";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IdentityItem = {
  pct: number;
  insight: string;
};

type StyleActionKind = "like" | "dislike" | "neutral" | "skip" | "other";

const ORIGIN_STEP_LABELS: Record<string, string> = {
  period_selection: "時代を選択中",
  atmosphere: "空気感を記録中",
  perspective: "他者視点を記録中",
  comparison: "今との比較を記録中",
  triggers: "記憶トリガーを収集中",
  ai_recovery: "記憶の再構成中",
  correction: "記憶を補正中",
  save: "保存直前です",
};

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values: number[]): number {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function getStyleActionKind(action: Record<string, unknown>): StyleActionKind {
  const meta = action.meta as Record<string, unknown> | null | undefined;
  const original = String(meta?.original_action ?? "").toLowerCase();
  if (original === "like" || original === "dislike" || original === "neutral" || original === "skip") {
    return original as StyleActionKind;
  }

  const kind = String(action.action ?? "").toLowerCase();
  if (kind === "save") return "like";
  if (kind === "skip") return "dislike";
  if (kind === "neutral") return "neutral";
  return "other";
}

async function loadGenomeItem(supabase: Awaited<ReturnType<typeof supabaseServer>>, userId: string): Promise<IdentityItem> {
  const { genome } = await assembleGenomeForUser(supabase, userId);
  const pct = clampPercent(genome.completeness * 100);
  const layers = genome.layerCompleteness;
  const completedLayers = Object.values(layers).filter((v) => v >= 0.5).length;
  const totalLayers = Object.keys(layers).length;
  const insight = completedLayers > 0
    ? `${completedLayers}/${totalLayers} レイヤー接続済み`
    : "データ接続を始めましょう";

  return { pct, insight };
}

async function loadOriginItem(supabase: Awaited<ReturnType<typeof supabaseServer>>, userId: string): Promise<IdentityItem> {
  const state = await loadOriginClientState(supabase, userId);
  const { save } = state;
  const chapterCount = save.chapters.length;
  const stage = getExplorationStage(chapterCount);
  const coverage = deriveObservationGaps(save).overallCoverage;
  const draftProgress = isDraftStarted(save.draft)
    ? ((STEP_ORDER.indexOf(inferStepFromDraft(save.draft)) + 1) / STEP_ORDER.length) * (1 / 30)
    : 0;
  const pct = clampPercent((coverage + draftProgress) * 100);

  let insight = "まだ記憶の断片はありません";
  if (chapterCount > 0) {
    insight = `${chapterCount}章を記録済み · ${stage.name}`;
  } else if (isDraftStarted(save.draft)) {
    const step = inferStepFromDraft(save.draft);
    insight = ORIGIN_STEP_LABELS[step] ?? "最初の記憶を記録中です";
  } else if (save.currentPosition) {
    insight = "現在地の整理を記録済みです";
  }

  return { pct, insight };
}

async function loadPresenceItem(supabase: Awaited<ReturnType<typeof supabaseServer>>, userId: string): Promise<IdentityItem> {
  const [observationCountResult, axisSnapshotsResult] = await Promise.all([
    supabase
      .from("stargazer_observations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("stargazer_axis_snapshots")
      .select("axis_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const observationCount = observationCountResult.count ?? 0;
  const axesCovered = new Set(
    (axisSnapshotsResult.data ?? [])
      .map((row) => String(row.axis_id ?? ""))
      .filter(Boolean),
  ).size;

  const ratios: number[] = [];
  if (observationCount > 0) ratios.push(Math.min(observationCount / 100, 1));
  if (axesCovered > 0) ratios.push(axesCovered / TRAIT_AXES.length);

  const pct = clampPercent(average(ratios) * 100);

  let insight = "印象データの蓄積が必要です";
  if (observationCount > 0 && axesCovered > 0) {
    insight = `${observationCount}回観測 · ${axesCovered}/${TRAIT_AXES.length}軸を観測`;
  } else if (observationCount > 0) {
    insight = `${observationCount}回観測済みです`;
  }

  return { pct, insight };
}

async function loadStyleItem(supabase: Awaited<ReturnType<typeof supabaseServer>>, userId: string): Promise<IdentityItem> {
  const [source, actionsResult] = await Promise.all([
    loadMyStyleSourceData(supabase, userId),
    supabase
      .from("recommendation_actions")
      .select("action, meta, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(800),
  ]);

  const storedDiagnosis = (source.quizResult.myStyleDiagnosis ?? null) as MyStyleDiagnosis | null;
  const diagnosis = source.bodyProfile || source.colorProfile
    ? buildMyStyleDiagnosis({
        userId,
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

  const styleActionCount = (actionsResult.data ?? []).reduce((count, action) => {
    const kind = getStyleActionKind(action as Record<string, unknown>);
    return kind === "like" || kind === "dislike" || kind === "neutral"
      ? count + 1
      : count;
  }, 0);

  const ratios: number[] = [];
  if (diagnosis?.quality_score != null) ratios.push(Number(diagnosis.quality_score) / 100);
  if (styleActionCount > 0) ratios.push(Math.min(styleActionCount / 30, 1));

  const pct = clampPercent(average(ratios) * 100);

  let insight = "好みデータを蓄積しましょう";
  if (diagnosis && styleActionCount > 0) {
    insight = `${styleActionCount}件の好み学習 · ${diagnosis.summary.headline}`;
  } else if (diagnosis?.summary.headline) {
    insight = diagnosis.summary.headline;
  } else if (styleActionCount > 0) {
    insight = `${styleActionCount}件の好み学習が蓄積されています`;
  }

  return { pct, insight };
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

    const [genome, origin, presence, style] = await Promise.allSettled([
      loadGenomeItem(supabase, user.id),
      loadOriginItem(supabase, user.id),
      loadPresenceItem(supabase, user.id),
      loadStyleItem(supabase, user.id),
    ]);

    return NextResponse.json({
      ok: true,
      items: {
        genome: genome.status === "fulfilled" ? genome.value : null,
        origin: origin.status === "fulfilled" ? origin.value : null,
        presence: presence.status === "fulfilled" ? presence.value : null,
        style: style.status === "fulfilled" ? style.value : null,
      },
    });
  } catch (error) {
    console.error("[aneurasync/home-identity-progress]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
