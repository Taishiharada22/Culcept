// app/api/sns/presence/relations/route.ts
// 関係性データ — Orbiter 引力パターン、時代変遷、摩擦トリガー、実存ダイジェスト

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  generateAllCategoryNarratives,
  type RelationshipCategoryView,
} from "@/lib/stargazer/relationshipNarratives";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

/* ---------- era type → Japanese label ---------- */
const ERA_LABELS: Record<string, string> = {
  exploration: "探索期",
  focus: "集中期",
  wandering: "模索期",
  deepening: "深化期",
  crystallization: "結晶期",
};

const ERA_DEFAULT_CHAR: Record<string, string> = {
  exploration: "新しい可能性を広く探っている時期",
  focus: "特定の方向に集中して取り組んでいる時期",
  wandering: "方向性を模索しながら揺れ動いている時期",
  deepening: "既知の領域をさらに深く掘り下げている時期",
  crystallization: "自分の軸が明確に結晶化している時期",
};

/* ---------- response type ---------- */
export interface RelationsResponse {
  ok: boolean;
  hasOrbiterData: boolean;
  attractionLayers: {
    layer: string;
    topAxes: string[];
    pattern: string;
    sampleCount: number;
    confidence: number;
  }[];
  eras: {
    type: string;
    label: string;
    startDate: string;
    decisionCount: number;
    characterization: string;
  }[];
  currentEra: { type: string; label: string } | null;
  frictionTriggers: {
    cautionCode: string;
    sensitivity: number;
    outcome: string;
    sampleCount: number;
  }[];
  existentialEssence: string | null;
  existentialSections: { title: string; content: string }[];
  relationalPrism: RelationshipCategoryView[] | null;
}

/* ---------- helpers ---------- */

function deriveCharacterization(
  eraType: string,
  metrics: Record<string, unknown> | null,
): string {
  if (metrics && typeof metrics === "object") {
    const parts: string[] = [];
    if (typeof metrics.dominant_theme === "string") parts.push(metrics.dominant_theme);
    if (typeof metrics.summary === "string") parts.push(metrics.summary);
    if (parts.length > 0) return parts.join(" - ");
  }
  return ERA_DEFAULT_CHAR[eraType] ?? "時期の特徴を分析中";
}

/* ---------- GET handler ---------- */

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parallel queries
    const [attractionRes, eraRes, breakpointRes, digestRes, resolvedTypeRes] = await Promise.all([
      supabase
        .from("orbiter_attraction_patterns")
        .select("layer, top_axes, pattern, sample_count, confidence")
        .eq("user_id", user.id)
        .order("confidence", { ascending: false }),

      supabase
        .from("orbiter_era_snapshots")
        .select("era_type, start_date, decision_count, metrics, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),

      supabase
        .from("orbiter_breakpoint_triggers")
        .select("caution_code, sensitivity, historical_outcome, sample_count")
        .eq("user_id", user.id)
        .order("sensitivity", { ascending: false }),

      supabase
        .from("orbiter_existential_digests")
        .select("sections, essence")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Stargazer axis scores for RelationalPrism
      supabase
        .from("stargazer_resolved_types")
        .select("axis_scores")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const attractions = attractionRes.data ?? [];
    const eras = eraRes.data ?? [];
    const breakpoints = breakpointRes.data ?? [];
    const digest = digestRes.data;

    // Check if any orbiter data exists
    const hasOrbiterData =
      attractions.length > 0 ||
      eras.length > 0 ||
      breakpoints.length > 0 ||
      digest !== null;

    // ── RelationalPrism: 8カテゴリのナラティブ生成 ──
    const axisScores = (resolvedTypeRes.data?.axis_scores ?? {}) as Partial<Record<TraitAxisKey, number>>;
    let relationalPrism: RelationshipCategoryView[] | null = null;
    if (Object.keys(axisScores).length > 0) {
      try {
        relationalPrism = generateAllCategoryNarratives(axisScores);
      } catch {
        relationalPrism = null;
      }
    }

    const hasAnyData = hasOrbiterData || relationalPrism !== null;

    if (!hasAnyData) {
      const empty: RelationsResponse = {
        ok: true,
        hasOrbiterData: false,
        attractionLayers: [],
        eras: [],
        currentEra: null,
        frictionTriggers: [],
        existentialEssence: null,
        existentialSections: [],
        relationalPrism: null,
      };
      return NextResponse.json(empty);
    }

    // Map attraction patterns
    const attractionLayers = attractions.map((a) => ({
      layer: a.layer as string,
      topAxes: (a.top_axes as string[]) ?? [],
      pattern: (a.pattern as string) ?? "",
      sampleCount: (a.sample_count as number) ?? 0,
      confidence: (a.confidence as number) ?? 0,
    }));

    // Map eras with labels and characterization
    const mappedEras = eras.map((e) => {
      const eraType = e.era_type as string;
      return {
        type: eraType,
        label: ERA_LABELS[eraType] ?? eraType,
        startDate: e.start_date as string,
        decisionCount: (e.decision_count as number) ?? 0,
        characterization: deriveCharacterization(
          eraType,
          e.metrics as Record<string, unknown> | null,
        ),
      };
    });

    // Current era = last in chronological order
    const lastEra = mappedEras.length > 0 ? mappedEras[mappedEras.length - 1] : null;
    const currentEra = lastEra
      ? { type: lastEra.type, label: lastEra.label }
      : null;

    // Map friction triggers
    const frictionTriggers = breakpoints.map((b) => ({
      cautionCode: b.caution_code as string,
      sensitivity: (b.sensitivity as number) ?? 0,
      outcome: (b.historical_outcome as string) ?? "",
      sampleCount: (b.sample_count as number) ?? 0,
    }));

    // Existential digest
    const existentialEssence = (digest?.essence as string) ?? null;
    const rawSections = (digest?.sections as { title: string; content: string }[]) ?? [];
    const existentialSections = Array.isArray(rawSections)
      ? rawSections.map((s) => ({
          title: typeof s.title === "string" ? s.title : "",
          content: typeof s.content === "string" ? s.content : "",
        }))
      : [];

    const response: RelationsResponse = {
      ok: true,
      hasOrbiterData: hasOrbiterData,
      attractionLayers,
      eras: mappedEras,
      currentEra,
      frictionTriggers,
      existentialEssence,
      existentialSections,
      relationalPrism,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[presence/relations] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
