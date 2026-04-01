import "server-only";

/**
 * Enriched Data Loader（実テーブル構造準拠版）
 *
 * 実在するテーブル:
 *   - stargazer_profiles (dimensions)
 *   - stargazer_core_star (core_traits)
 *   - stargazer_resolved_types (axis_scores, archetype_code)
 *   - stargazer_analytics (event="home_alter_judgment" → metadata に action_shape, force_balance 等)
 *   - stargazer_alter_growth (growth_state JSONB, trust_level, sessions_completed)
 *   - stargazer_alter_patterns (pattern_type, pattern_key, pattern_data JSONB)
 *   - stargazer_alter_person_map (role, last_sentiment, influence_score, mention_count)
 *   - origin_journal_entries (emotion_tags, ai_summary)
 *   - origin_entry_records (category, note)
 *
 * 存在しないテーブル（前回誤って参照していた）:
 *   ❌ stargazer_personality_profile
 *   ❌ life_profiles
 *   ❌ home_alter_judgments
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ============================================================
// Types
// ============================================================

export type AlterJudgmentPattern = {
  actionShapeDistribution: Record<string, number>;
  avgForceBalance: {
    expandPressure: number;
    protectPressure: number;
    regretIfSkip: number;
    regretIfDo: number;
  } | null;
  domainDistribution: Record<string, number>;
  topRegretDirection: string | null;
  totalJudgments: number;
};

export type AlterGrowthSummary = {
  trustLevel: number;
  sessionsCompleted: number;
  growthState: Record<string, unknown>;
};

export type ContradictionSummary = {
  dualAxes: Array<{
    axisId: string;
    poles: [number, number];
    strength: number;
  }>;
};

export type PersonMapEntry = {
  label: string;
  role: string;
  sentiment: string;
  influenceScore: number;
  mentionCount: number;
};

export type OriginSummary = {
  emotionTags: string[];
  categories: string[];
  entryCount: number;
};

export type UserFullProfile = {
  userId: string;
  axisScores: Record<string, number>;
  axisCount: number;
  /** パーソナリティ: Stargazer軸から主要な傾向を抽出 */
  personality: Record<string, number> | null;
  archetype: string | null;
  origin: OriginSummary | null;
  alterPatterns: AlterJudgmentPattern | null;
  alterGrowth: AlterGrowthSummary | null;
  contradictions: ContradictionSummary | null;
  personMap: PersonMapEntry[] | null;
};

// ============================================================
// ローダー
// ============================================================

export async function loadUserFullProfile(userId: string): Promise<UserFullProfile> {
  const [
    axisData,
    resolvedTypeRes,
    alterAnalyticsRes,
    alterGrowthRes,
    alterPatternsRes,
    personMapRes,
    originJournalRes,
    originRecordsRes,
  ] = await Promise.all([
    loadAxisScores(userId),
    supabaseAdmin
      .from("stargazer_resolved_types")
      .select("archetype_code")
      .eq("user_id", userId)
      .maybeSingle(),
    // Alter判断: stargazer_analytics の home_alter_judgment イベント（直近50件）
    supabaseAdmin
      .from("stargazer_analytics")
      .select("metadata")
      .eq("user_id", userId)
      .eq("event", "home_alter_judgment")
      .order("created_at", { ascending: false })
      .limit(50),
    // Alter成長状態
    supabaseAdmin
      .from("stargazer_alter_growth")
      .select("growth_state, trust_level, sessions_completed, core_wound_confidence")
      .eq("user_id", userId)
      .maybeSingle(),
    // Alterパターン（decision型のみ）
    supabaseAdmin
      .from("stargazer_alter_patterns")
      .select("pattern_type, pattern_key, pattern_data, confidence, observation_count")
      .eq("user_id", userId)
      .order("observation_count", { ascending: false })
      .limit(20),
    // 対人関係図
    supabaseAdmin
      .from("stargazer_alter_person_map")
      .select("label, role, last_sentiment, influence_score, mention_count")
      .eq("user_id", userId)
      .order("mention_count", { ascending: false })
      .limit(10),
    // Origin ジャーナル（直近30件の emotion_tags）
    supabaseAdmin
      .from("origin_journal_entries")
      .select("emotion_tags, ai_summary")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(30),
    // Origin エントリーレコード（カテゴリ分布）
    supabaseAdmin
      .from("origin_entry_records")
      .select("category")
      .eq("user_id", userId)
      .limit(50),
  ]);

  // パーソナリティ: Stargazer軸から主要傾向を抽出（テーブルが存在しないため）
  const personality = derivePersonalityFromAxes(axisData.scores);

  // Origin サマリー
  let origin: OriginSummary | null = null;
  const journals = originJournalRes.data;
  const records = originRecordsRes.data;
  if ((journals && journals.length > 0) || (records && records.length > 0)) {
    const emotionTags = new Set<string>();
    for (const j of journals ?? []) {
      if (Array.isArray(j.emotion_tags)) {
        for (const t of j.emotion_tags as string[]) emotionTags.add(t);
      }
    }
    const categories = new Set<string>();
    for (const r of records ?? []) {
      if (r.category) categories.add(r.category as string);
    }
    origin = {
      emotionTags: [...emotionTags].slice(0, 10),
      categories: [...categories],
      entryCount: (journals?.length ?? 0) + (records?.length ?? 0),
    };
  }

  // Alter判断パターン集約（stargazer_analytics から）
  let alterPatterns: AlterJudgmentPattern | null = null;
  const analytics = alterAnalyticsRes.data;
  if (analytics && analytics.length > 0) {
    const actionShapeDist: Record<string, number> = {};
    const domainDist: Record<string, number> = {};
    const regretDist: Record<string, number> = {};
    let fbSum = { expandPressure: 0, protectPressure: 0, regretIfSkip: 0, regretIfDo: 0 };
    let fbCount = 0;

    for (const row of analytics) {
      const meta = row.metadata as Record<string, unknown> | null;
      if (!meta) continue;

      // ActionShape
      if (meta.action_shape) {
        const shape = meta.action_shape as string;
        actionShapeDist[shape] = (actionShapeDist[shape] ?? 0) + 1;
      }
      // 骨格のActionShapeも参照
      const skeleton = meta.judgment_skeleton as Record<string, unknown> | undefined;
      if (skeleton?.action_shape && !meta.action_shape) {
        const shape = skeleton.action_shape as string;
        actionShapeDist[shape] = (actionShapeDist[shape] ?? 0) + 1;
      }

      // Domain
      if (meta.query_domain) {
        const d = meta.query_domain as string;
        domainDist[d] = (domainDist[d] ?? 0) + 1;
      }

      // Regret direction
      if (meta.regret_direction) {
        const rd = meta.regret_direction as string;
        regretDist[rd] = (regretDist[rd] ?? 0) + 1;
      }

      // ForceBalance（audit_trail内にある場合）
      const audit = meta.audit_trail as Record<string, unknown> | undefined;
      const fb = audit?.force_balance as Record<string, number> | undefined;
      if (fb) {
        fbSum.expandPressure += fb.expand_pressure ?? 0;
        fbSum.protectPressure += fb.protect_pressure ?? 0;
        fbSum.regretIfSkip += fb.regret_if_skip ?? 0;
        fbSum.regretIfDo += fb.regret_if_do ?? 0;
        fbCount++;
      }
    }

    // Top regret direction
    let topRegret: string | null = null;
    let maxRegret = 0;
    for (const [k, v] of Object.entries(regretDist)) {
      if (v > maxRegret) { maxRegret = v; topRegret = k; }
    }

    alterPatterns = {
      actionShapeDistribution: actionShapeDist,
      avgForceBalance: fbCount > 0
        ? {
            expandPressure: fbSum.expandPressure / fbCount,
            protectPressure: fbSum.protectPressure / fbCount,
            regretIfSkip: fbSum.regretIfSkip / fbCount,
            regretIfDo: fbSum.regretIfDo / fbCount,
          }
        : null,
      domainDistribution: domainDist,
      topRegretDirection: topRegret,
      totalJudgments: analytics.length,
    };
  }

  // Alter成長状態
  let alterGrowth: AlterGrowthSummary | null = null;
  if (alterGrowthRes.data) {
    const g = alterGrowthRes.data;
    alterGrowth = {
      trustLevel: (g.trust_level as number) ?? 0,
      sessionsCompleted: (g.sessions_completed as number) ?? 0,
      growthState: (g.growth_state as Record<string, unknown>) ?? {},
    };
  }

  // 矛盾（stargazer_alter_patterns の contradiction 型から）
  let contradictions: ContradictionSummary | null = null;
  const patterns = alterPatternsRes.data;
  if (patterns && patterns.length > 0) {
    const contradictionPatterns = patterns.filter(
      (p) => p.pattern_type === "contradiction" || (p.pattern_data as Record<string, unknown>)?.contradictions,
    );
    if (contradictionPatterns.length > 0) {
      const dualAxes: ContradictionSummary["dualAxes"] = [];
      for (const cp of contradictionPatterns) {
        const pd = cp.pattern_data as Record<string, unknown>;
        if (pd.axis_id && pd.poles && pd.strength) {
          dualAxes.push({
            axisId: pd.axis_id as string,
            poles: pd.poles as [number, number],
            strength: pd.strength as number,
          });
        }
      }
      if (dualAxes.length > 0) {
        contradictions = { dualAxes };
      }
    }
  }

  // 対人関係図
  let personMap: PersonMapEntry[] | null = null;
  if (personMapRes.data && personMapRes.data.length > 0) {
    personMap = personMapRes.data.map((p) => ({
      label: (p.label as string) ?? "",
      role: (p.role as string) ?? "unknown",
      sentiment: (p.last_sentiment as string) ?? "neutral",
      influenceScore: (p.influence_score as number) ?? 0,
      mentionCount: (p.mention_count as number) ?? 0,
    }));
  }

  return {
    userId,
    axisScores: axisData.scores,
    axisCount: axisData.count,
    personality,
    archetype: resolvedTypeRes.data?.archetype_code ?? null,
    origin,
    alterPatterns,
    alterGrowth,
    contradictions,
    personMap,
  };
}

// ============================================================
// Stargazer軸スコア集約（3テーブルマージ）
// ============================================================

async function loadAxisScores(userId: string): Promise<{ scores: Record<string, number>; count: number }> {
  const [profileRes, coreStarRes, resolvedTypeRes] = await Promise.all([
    supabaseAdmin.from("stargazer_profiles").select("dimensions").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("stargazer_core_star").select("core_traits").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("stargazer_resolved_types").select("axis_scores").eq("user_id", userId).maybeSingle(),
  ]);

  const scores: Record<string, number> = {};
  const merge = (data: Record<string, number> | null) => {
    if (!data) return;
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === "number" && !(k in scores)) scores[k] = v;
    }
  };

  merge(profileRes.data?.dimensions as Record<string, number> | null);
  merge(coreStarRes.data?.core_traits as Record<string, number> | null);
  merge(resolvedTypeRes.data?.axis_scores as Record<string, number> | null);

  return { scores, count: Object.keys(scores).length };
}

// ============================================================
// Stargazer軸からパーソナリティ傾向を導出
// （stargazer_personality_profile テーブルが存在しないため）
// ============================================================

function derivePersonalityFromAxes(scores: Record<string, number>): Record<string, number> | null {
  if (Object.keys(scores).length < 5) return null;

  const norm = (axis: string): number | undefined => {
    const v = scores[axis];
    return v !== undefined ? (v + 1) / 2 : undefined; // -1..1 → 0..1
  };

  const personality: Record<string, number> = {};

  // 軸マッピング（Stargazer軸 → パーソナリティ次元）
  const mappings: Record<string, string[]> = {
    "秩序性": ["plan_vs_spontaneous"],
    "探索性": ["change_embrace_vs_resist", "stimulation_need"],
    "安定志向": ["cautious_vs_bold"],
    "温かさ": ["emotional_openness"],
    "独立性": ["independence_vs_harmony"],
    "感情表出": ["emotional_variability"],
    "直感判断": ["analytical_vs_intuitive"],
    "調和志向": ["direct_vs_diplomatic"],
  };

  for (const [label, axes] of Object.entries(mappings)) {
    const values = axes.map(norm).filter((v): v is number => v !== undefined);
    if (values.length > 0) {
      personality[label] = values.reduce((a, b) => a + b, 0) / values.length;
    }
  }

  return Object.keys(personality).length >= 3 ? personality : null;
}
