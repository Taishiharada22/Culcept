// lib/aneurasync/personaGenome.ts
// 統合ペルソナ基盤 — PersonaGenome
// 4つの柱: 統合診断 / Mirror Mode / 時系列進化 / Genome UI
// 自己完結型 — 外部 lib/aneurasync/* に依存しない

import type { CFV } from "@/types/body-color";
import type { FacePhenotypeData, NoseImpression, MouthImpression, FaceImpressionScores } from "@/types/face-phenotype";

// ============================================================================
// Internal type definitions (self-contained)
// ============================================================================

/** 15 personality dimension definition */
interface DimensionDef {
  id: string;
  labelLeft: string;
  labelRight: string;
}

const PERSONALITY_DIMENSIONS: DimensionDef[] = [
  // ─── 15 Core Dimensions ───
  { id: "quality_vs_quantity", labelLeft: "品質重視", labelRight: "コスパ重視" },
  { id: "tradition_vs_novelty", labelLeft: "定番・伝統", labelRight: "新しいもの好き" },
  { id: "individual_vs_social", labelLeft: "自分軸", labelRight: "周りに合わせる" },
  { id: "plan_vs_spontaneous", labelLeft: "計画的", labelRight: "直感・その場" },
  { id: "cautious_vs_bold", labelLeft: "慎重", labelRight: "大胆" },
  { id: "analytical_vs_intuitive", labelLeft: "分析的", labelRight: "直感的" },
  { id: "introvert_vs_extrovert", labelLeft: "内向的", labelRight: "外向的" },
  { id: "independence_vs_harmony", labelLeft: "独立志向", labelRight: "協調志向" },
  { id: "direct_vs_diplomatic", labelLeft: "直接的", labelRight: "配慮型" },
  { id: "minimal_vs_maximal", labelLeft: "シンプル", labelRight: "華やか" },
  { id: "function_vs_expression", labelLeft: "機能重視", labelRight: "表現重視" },
  { id: "classic_vs_trendy", labelLeft: "定番派", labelRight: "流行派" },
  { id: "emotional_stable_vs_volatile", labelLeft: "感情安定", labelRight: "感情変動" },
  { id: "change_embrace_vs_resist", labelLeft: "変化を好む", labelRight: "安定を好む" },
  { id: "stress_external_vs_internal", labelLeft: "外部表出", labelRight: "内部蓄積" },
  // ─── Stage 1: Relational Axes (6) ───
  { id: "intimacy_pace", labelLeft: "距離はゆっくり", labelRight: "距離を早く縮める" },
  { id: "reassurance_need", labelLeft: "安心確認を求めない", labelRight: "安心確認を求める" },
  { id: "emotional_variability", labelLeft: "感情が安定的", labelRight: "感情が状況で変わる" },
  { id: "social_initiative", labelLeft: "受動的に待つ", labelRight: "自分から距離を縮める" },
  { id: "boundary_awareness", labelLeft: "境界を柔軟に", labelRight: "境界を明確に意識" },
  { id: "relationship_mode_split", labelLeft: "関係モード一貫", labelRight: "文脈で変化" },
  // ─── Stage 2: Safety & Relational Axes (12) ───
  { id: "boundary_respect", labelLeft: "境界尊重が弱い", labelRight: "境界尊重が強い" },
  { id: "consent_maturity", labelLeft: "同意意識が低い", labelRight: "同意意識が高い" },
  { id: "pressure_risk", labelLeft: "圧力リスク低い", labelRight: "圧力リスク高い" },
  { id: "escalation_risk", labelLeft: "エスカレーション低い", labelRight: "エスカレーション高い" },
  { id: "friend_mode_fit", labelLeft: "友人モード低い", labelRight: "友人モード高い" },
  { id: "intent_stability", labelLeft: "意図が変わりやすい", labelRight: "意図が安定" },
  { id: "rejection_response_maturity", labelLeft: "拒絶への反応が未熟", labelRight: "拒絶を受容できる" },
  { id: "control_tendency", labelLeft: "コントロール傾向低い", labelRight: "コントロール傾向高い" },
  { id: "exclusivity_pressure", labelLeft: "独占圧力低い", labelRight: "独占圧力高い" },
  { id: "long_term_shift_risk", labelLeft: "長期変化リスク低い", labelRight: "長期変化リスク高い" },
  { id: "public_private_gap", labelLeft: "公私一貫", labelRight: "公私にギャップ" },
  { id: "emotional_regulation", labelLeft: "感情調整が弱い", labelRight: "感情調整が強い" },
  // ─── Additional observed axes ───
  { id: "stress_isolation_vs_social", labelLeft: "ストレス時に孤立", labelRight: "ストレス時に社交" },
  { id: "perfectionist_vs_pragmatic", labelLeft: "完璧主義", labelRight: "現実主義" },
  { id: "self_disclosure", labelLeft: "自己開示しない", labelRight: "自己開示する" },
  { id: "conflict_avoidance", labelLeft: "対立を避ける", labelRight: "対立に向き合う" },
  { id: "attachment_security", labelLeft: "愛着不安定", labelRight: "愛着安定" },
];

/** Dimension score from DB */
export interface DimensionScore {
  dimension: string;
  category: string;
  score: number;       // -1.0 to +1.0
  confidence: number;  // 0.0 to 1.0
  evidenceCount: number;
}

/** Personality insight from DB */
export interface PersonalityInsight {
  id: string;
  insightType: string;
  content: string;
  source: string;
  dimension?: string;
  confidence: number;
  extractedAt: string;
}

/** Sync level from DB */
export interface SyncLevel {
  overallSync: number;
  fashionSync: number;
  valuesSync: number;
  socialSync: number;
  decisionSync: number;
  emotionalSync: number;
  totalAnswers: number;
  totalInsights: number;
  streakCurrent: number;
  streakBest: number;
  lastSessionAt: string | null;
}

/** Orbit snapshot from DB (stargazer_orbit_snapshots) */
export interface OrbitSnapshotRow {
  id: string;
  user_id: string;
  captured_at: string;
  archetype_code: string;
  archetype_label: string;
  drift_index: number;
  summary: string | null;
  core_traits_snapshot: Record<string, number> | null;
}

// ============================================================================
// Pillar 1: PersonaGenome — 4-Layer Unified Structure
// ============================================================================

/** Physical Layer: 身体 + カラー + 姿勢 */
export interface PhysicalLayer {
  bodyBase: string | null;
  bodySubtype: string | null;
  bodyAxes: Record<string, number> | null;
  bodyConfidence: number;
  cfv: Partial<CFV> | null;
  pcSeason4: string | null;
  pcSeason16: string | null;
  pcAxes: { warm: number; light: number; clear: number; contrast: number } | null;
  pcConfidence: number;
  faceShape: string | null;
  eyeShape: string | null;
  browShape: string | null;
  noseImpression: NoseImpression | null;
  mouthImpression: MouthImpression | null;
  faceImpression: FaceImpressionScores | null;
  hasFace: boolean;
  hasBody: boolean;
  hasPosture: boolean;
  hasPC: boolean;
}

/** Personality Layer: dimensions + archetype */
export interface PersonalityLayer {
  dimensions: DimensionScore[];
  insights: PersonalityInsight[];
  syncLevel: SyncLevel | null;
  archetypeCode: string | null;
  archetypeLabel: string | null;
  typeKey: string | null;
  confidence: number | null;
  topDimensions: Array<{ id: string; label: string; score: number; confidence: number }>;
  observationCount: number;
  hasPersonality: boolean;
  hasDimensions: boolean;
  hasArchetype: boolean;
}

export interface TasteSnapshot {
  laneTop3: string[];
  colorAxis: string;
  silhouetteAxis: string;
}

/** Behavioral Layer: テイスト + 行動パターン */
export interface BehavioralLayer {
  taste7d: TasteSnapshot | null;
  taste30d: TasteSnapshot | null;
  taste180d: TasteSnapshot | null;
  topStyleTags: string[];
  silhouettePreference: Record<string, number>;
  materialPreference: Record<string, number>;
  dominantColorAxis: string;
  dominantSilhouetteAxis: string;
  totalSwipeCount: number;
  likeRate: number;
  saveRate: number;
  purchaseIntentRate: number;
  hasTaste: boolean;
  hasSwipeHistory: boolean;
}

/** Social Layer: 他者からの見え方 */
export interface SocialLayer {
  avgPeopleFitScore: number | null;
  matchCount: number;
  feedbackSaveRate: number;
  feedbackSkipRate: number;
  hasSocial: boolean;
}

/** 統合 PersonaGenome */
export interface PersonaGenome {
  userId: string;
  assembledAt: string;
  physical: PhysicalLayer;
  personality: PersonalityLayer;
  behavioral: BehavioralLayer;
  social: SocialLayer;
  completeness: number;
  layerCompleteness: {
    physical: number;
    personality: number;
    behavioral: number;
    social: number;
  };
}

// ============================================================================
// Pillar 2: Mirror Mode
// ============================================================================

export interface MirrorPerceptionVector {
  expressiveness: number;
  boldness: number;
  socialOrientation: number;
  aestheticIntensity: number;
  warmth: number;
  practicality: number;
  consistency: number;
}

export interface MirrorGap {
  dimension: string;
  dimensionLabel: string;
  selfScore: number;
  othersScore: number;
  gap: number;
  gapLabel: string;
  significance: "high" | "medium" | "low";
}

export interface MirrorModeResult {
  selfPerception: MirrorPerceptionVector;
  othersPerception: MirrorPerceptionVector;
  gaps: MirrorGap[];
  summary: string;
  gapScore: number;
  hasEnoughData: boolean;
}

// ============================================================================
// Pillar 3: Personality Temporal Evolution
// ============================================================================

export interface EvolutionSnapshot {
  capturedAt: string;
  archetypeCode: string | null;
  archetypeLabel: string | null;
  traits: Record<string, number>;
  driftIndex: number;
}

export interface EvolutionCard {
  period: string;
  periodLabel: string;
  fromSnapshot: EvolutionSnapshot;
  toSnapshot: EvolutionSnapshot;
  driftIndex: number;
  changedDimensions: Array<{
    dimension: string;
    label: string;
    direction: "increased" | "decreased";
    delta: number;
  }>;
  archetypeChanged: boolean;
  typeChanged: boolean;
  summary: string;
}

export interface EvolutionTimeline {
  snapshots: EvolutionSnapshot[];
  cards: EvolutionCard[];
  overallDrift: number;
  stability: number;
  currentStreak: number;
}

// ============================================================================
// Pillar 4: Genome UI Data Model
// ============================================================================

export interface GenomeStrand {
  id: "physical" | "personality" | "behavioral" | "social";
  label: string;
  color: string;
  basePairs: GenomeBasePair[];
}

export interface GenomeBasePair {
  id: string;
  label: string;
  category: string;
  value: number;
  confidence: number;
  leftLabel: string;
  rightLabel: string;
}

export interface GenomeVisualizationData {
  strands: GenomeStrand[];
  dominantTraits: GenomeBasePair[];
  weakTraits: GenomeBasePair[];
  overallLabel: string;
  overallDescription: string;
}

// ============================================================================
// Assembly input
// ============================================================================

export interface GenomeAssemblyInput {
  userId: string;
  bodyProfile?: { jp_3type?: string; jp_7type?: string; cfv?: Partial<CFV>; quality_score?: number } | null;
  styleVector?: { pc_season?: string; pc_base?: string; jp_3type?: string; jp_7type?: string } | null;
  dimensions?: DimensionScore[];
  insights?: PersonalityInsight[];
  syncLevel?: SyncLevel | null;
  archetypeCode?: string | null;
  archetypeLabel?: string | null;
  tasteLayers?: { layer_7d?: unknown; layer_30d?: unknown; layer_180d?: unknown } | null;
  prefProfile?: { silhouette?: Record<string, number>; material?: Record<string, number> } | null;
  swipeStats?: { total: number; likes: number; saves: number; purchaseIntents: number } | null;
  topStyleTags?: string[];
  matchScoresAsTarget?: Array<{ people_fit_to_me: number }>;
  feedbackStats?: { saveCount: number; skipCount: number; totalEvents: number } | null;
  orbitSnapshots?: OrbitSnapshotRow[];
  facePhenotype?: FacePhenotypeData | null;
}

// ============================================================================
// Utility
// ============================================================================

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function norm01(v: number, lo: number, hi: number): number {
  if (hi <= lo) return 0.5;
  return clamp((v - lo) / (hi - lo), 0, 1);
}

function dimScore(dims: DimensionScore[], id: string): number {
  const d = dims.find((x) => x.dimension === id);
  return d ? (d.score + 1) / 2 : 0.5; // -1..+1 → 0..1
}

function parseTasteSnapshot(raw: unknown): TasteSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const lanes = Array.isArray(r.lane_top3) ? (r.lane_top3 as string[]).slice(0, 3) : [];
  const ca = r.color_axis as Record<string, number> | undefined;
  const sa = r.silhouette_axis as Record<string, number> | undefined;
  let colorAxis = "neutral";
  let silhouetteAxis = "neutral";
  if (ca) {
    const entries = Object.entries(ca).sort((a, b) => b[1] - a[1]);
    if (entries.length > 0 && entries[0][1] > 0) colorAxis = entries[0][0];
  }
  if (sa) {
    const entries = Object.entries(sa).sort((a, b) => b[1] - a[1]);
    if (entries.length > 0 && entries[0][1] > 0) silhouetteAxis = entries[0][0];
  }
  return { laneTop3: lanes, colorAxis, silhouetteAxis };
}

// ============================================================================
// assemblePersonaGenome
// ============================================================================

export function assemblePersonaGenome(input: GenomeAssemblyInput): PersonaGenome {
  // ─── Physical Layer ───
  const bp = input.bodyProfile;
  const sv = input.styleVector;
  const hasBody = !!(bp?.jp_3type || sv?.jp_3type);
  const hasCfv = !!(bp?.cfv && Object.keys(bp.cfv).length > 0);
  const hasPC = !!(sv?.pc_season);

  const fp = input.facePhenotype;
  const hasFace = !!(fp?.face_shape?.primary || fp?.eye_shape?.primary);

  const physical: PhysicalLayer = {
    bodyBase: bp?.jp_3type ?? sv?.jp_3type ?? null,
    bodySubtype: bp?.jp_7type ?? sv?.jp_7type ?? null,
    bodyAxes: bp?.cfv ? Object.fromEntries(
      Object.entries(bp.cfv).filter(([, v]) => typeof v === "number")
    ) : null,
    bodyConfidence: bp?.quality_score ? bp.quality_score / 100 : 0,
    cfv: bp?.cfv ?? null,
    pcSeason4: sv?.pc_season ?? null,
    pcSeason16: null,
    pcAxes: null,
    pcConfidence: sv?.pc_season ? 0.7 : 0,
    faceShape: fp?.face_shape?.primary ?? null,
    eyeShape: fp?.eye_shape?.primary ?? null,
    browShape: fp?.brow_shape?.primary ?? null,
    noseImpression: fp?.nose_impression ?? null,
    mouthImpression: fp?.mouth_impression ?? null,
    faceImpression: fp?.face_impression ?? null,
    hasFace,
    hasBody,
    hasPosture: hasCfv,
    hasPC,
  };

  // ─── Personality Layer ───
  const dims = input.dimensions ?? [];
  const hasDimensions = dims.length > 0;

  const topDimensions = [...dims]
    .filter((d) => d.confidence >= 0.15)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5)
    .map((d) => {
      const def = PERSONALITY_DIMENSIONS.find((pd) => pd.id === d.dimension);
      return {
        id: d.dimension,
        label: def ? `${def.labelLeft}↔${def.labelRight}` : humanizeDimensionId(d.dimension),
        score: d.score,
        confidence: d.confidence,
      };
    });

  // Derive a typeKey from archetype + top dimension
  const archCode = input.archetypeCode ?? null;
  const archLabel = input.archetypeLabel ?? null;
  const derivedTypeKey = archCode
    ? `${archCode}${topDimensions[0] ? `_${topDimensions[0].id}` : ""}`
    : topDimensions[0]?.id ?? null;

  // Confidence from avg dimension confidence
  const avgDimConf = dims.length > 0
    ? dims.reduce((s, d) => s + d.confidence, 0) / dims.length
    : 0;

  const personality: PersonalityLayer = {
    dimensions: dims,
    insights: input.insights ?? [],
    syncLevel: input.syncLevel ?? null,
    archetypeCode: archCode,
    archetypeLabel: archLabel,
    typeKey: derivedTypeKey,
    confidence: avgDimConf > 0 ? Math.round(avgDimConf * 100) / 100 : null,
    topDimensions,
    observationCount: input.syncLevel?.totalAnswers ?? 0,
    hasPersonality: hasDimensions || !!archCode,
    hasDimensions,
    hasArchetype: !!archCode,
  };

  // ─── Behavioral Layer ───
  const tl = input.tasteLayers;
  const hasTaste = !!(tl && (tl.layer_7d || tl.layer_30d || tl.layer_180d));
  const ss = input.swipeStats;
  const hasSwipe = !!(ss && ss.total > 0);
  const taste30d = parseTasteSnapshot(tl?.layer_30d);

  const behavioral: BehavioralLayer = {
    taste7d: parseTasteSnapshot(tl?.layer_7d),
    taste30d,
    taste180d: parseTasteSnapshot(tl?.layer_180d),
    topStyleTags: input.topStyleTags ?? [],
    silhouettePreference: input.prefProfile?.silhouette ?? {},
    materialPreference: input.prefProfile?.material ?? {},
    dominantColorAxis: taste30d?.colorAxis ?? "neutral",
    dominantSilhouetteAxis: taste30d?.silhouetteAxis ?? "neutral",
    totalSwipeCount: ss?.total ?? 0,
    likeRate: ss && ss.total > 0 ? ss.likes / ss.total : 0,
    saveRate: ss && ss.total > 0 ? ss.saves / ss.total : 0,
    purchaseIntentRate: ss && ss.total > 0 ? ss.purchaseIntents / ss.total : 0,
    hasTaste,
    hasSwipeHistory: hasSwipe,
  };

  // ─── Social Layer ───
  const mst = input.matchScoresAsTarget ?? [];
  const matchCount = mst.length;
  const hasSocial = matchCount >= 3;
  let avgFit: number | null = null;
  if (matchCount > 0) {
    avgFit = Math.round(mst.reduce((s, m) => s + m.people_fit_to_me, 0) / matchCount);
  }
  const fs = input.feedbackStats;
  const fbTotal = fs?.totalEvents ?? 0;

  const social: SocialLayer = {
    avgPeopleFitScore: avgFit,
    matchCount,
    feedbackSaveRate: fbTotal > 0 ? (fs!.saveCount / fbTotal) : 0,
    feedbackSkipRate: fbTotal > 0 ? (fs!.skipCount / fbTotal) : 0,
    hasSocial,
  };

  // ─── Completeness ───
  const physComp = [hasBody, hasCfv, hasPC, hasFace].filter(Boolean).length / 4 * 100;
  const persComp = [hasDimensions, !!archCode].filter(Boolean).length / 2 * 100;
  const behavComp = [hasTaste, hasSwipe].filter(Boolean).length / 2 * 100;
  const socComp = hasSocial ? 100 : matchCount > 0 ? 33 : 0;
  const completeness = Math.round(physComp * 0.3 + persComp * 0.3 + behavComp * 0.2 + socComp * 0.2);

  return {
    userId: input.userId,
    assembledAt: new Date().toISOString(),
    physical,
    personality,
    behavioral,
    social,
    completeness,
    layerCompleteness: {
      physical: Math.round(physComp),
      personality: Math.round(persComp),
      behavioral: Math.round(behavComp),
      social: Math.round(socComp),
    },
  };
}

// ============================================================================
// Pillar 2: Mirror Mode
// ============================================================================

export function buildSelfPerception(genome: PersonaGenome): MirrorPerceptionVector {
  const dims = genome.personality.dimensions;
  return {
    expressiveness: clamp(
      dimScore(dims, "function_vs_expression") * 0.7 +
      (genome.behavioral.dominantColorAxis === "high_sat" ? 0.3 : 0.1), 0, 1),
    boldness: clamp(dimScore(dims, "cautious_vs_bold") * 0.8 + 0.1, 0, 1),
    socialOrientation: clamp(dimScore(dims, "introvert_vs_extrovert") * 0.8 + 0.1, 0, 1),
    aestheticIntensity: clamp(dimScore(dims, "minimal_vs_maximal") * 0.8 + 0.1, 0, 1),
    warmth: clamp(
      dimScore(dims, "independence_vs_harmony") * 0.5 +
      dimScore(dims, "direct_vs_diplomatic") * 0.3 + 0.1, 0, 1),
    practicality: clamp(
      (1 - dimScore(dims, "quality_vs_quantity")) * 0.5 +
      (genome.behavioral.purchaseIntentRate > 0.1 ? 0.3 : 0.1) + 0.1, 0, 1),
    consistency: clamp(
      dimScore(dims, "change_embrace_vs_resist") * 0.8 + 0.1, 0, 1),
  };
}

export function buildOthersPerception(genome: PersonaGenome): MirrorPerceptionVector {
  if (!genome.social.hasSocial) {
    return {
      expressiveness: 0.5, boldness: 0.5, socialOrientation: 0.5,
      aestheticIntensity: 0.5, warmth: 0.5, practicality: 0.5, consistency: 0.5,
    };
  }

  const fitNorm = genome.social.avgPeopleFitScore != null
    ? genome.social.avgPeopleFitScore / 100 : 0.5;
  const saveRate = genome.social.feedbackSaveRate;
  const skipRate = genome.social.feedbackSkipRate;

  return {
    expressiveness: clamp(0.5 + saveRate * 0.3, 0, 1),
    boldness: clamp(0.5 + (fitNorm - 0.5) * 0.4, 0, 1),
    socialOrientation: clamp(fitNorm * 0.4 + 0.3, 0, 1),
    aestheticIntensity: clamp(0.5 + saveRate * 0.5, 0, 1),
    warmth: clamp(fitNorm * 0.6 + 0.2, 0, 1),
    practicality: clamp(0.5 + (1 - skipRate) * 0.3, 0, 1),
    consistency: clamp(0.5 + (0.5 - skipRate) * 0.4, 0, 1),
  };
}

const MIRROR_DIM_LABELS: Record<string, [string, string, string]> = {
  expressiveness: ["表現性", "自分が思うより控えめに見えている", "実は表現豊かだと思われている"],
  boldness: ["大胆さ", "慎重に見られている", "思い切りが良いと見られている"],
  socialOrientation: ["社交性", "一人が好きだと思われている", "社交的だと見られている"],
  aestheticIntensity: ["審美感度", "シンプル志向に見えている", "こだわりが強いと見られている"],
  warmth: ["温かさ", "クールに見られている", "温かい人だと思われている"],
  practicality: ["実用性", "理想主義に見えている", "現実的だと思われている"],
  consistency: ["一貫性", "変化が多いと見られている", "ブレない人だと見られている"],
};

export function computeMirrorGaps(
  self: MirrorPerceptionVector,
  others: MirrorPerceptionVector,
  hasSocialData: boolean,
): MirrorModeResult {
  const dims = Object.keys(self) as Array<keyof MirrorPerceptionVector>;
  const gaps: MirrorGap[] = [];

  for (const dim of dims) {
    const gap = others[dim] - self[dim];
    const absGap = Math.abs(gap);
    const sig: MirrorGap["significance"] = absGap > 0.3 ? "high" : absGap > 0.15 ? "medium" : "low";
    const labels = MIRROR_DIM_LABELS[dim] ?? [dim, "", ""];
    const gapLabel = gap < -0.1 ? labels[1] : gap > 0.1 ? labels[2] : "ほぼ一致";

    gaps.push({
      dimension: dim,
      dimensionLabel: labels[0],
      selfScore: Math.round(self[dim] * 100) / 100,
      othersScore: Math.round(others[dim] * 100) / 100,
      gap: Math.round(gap * 100) / 100,
      gapLabel,
      significance: sig,
    });
  }

  gaps.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  const avgAbsGap = gaps.reduce((s, g) => s + Math.abs(g.gap), 0) / gaps.length;
  const gapScore = Math.round(clamp(100 - avgAbsGap * 200, 0, 100));

  const topGap = gaps[0];
  const summary = hasSocialData
    ? topGap && topGap.significance !== "low"
      ? `最大のギャップは「${topGap.dimensionLabel}」— ${topGap.gapLabel}`
      : "自己認識と他者からの印象はよく一致しています"
    : "マッチデータが3件以上蓄積されるとミラーモードが有効になります";

  return { selfPerception: self, othersPerception: others, gaps, summary, gapScore, hasEnoughData: hasSocialData };
}

// ============================================================================
// Pillar 3: Evolution Timeline
// ============================================================================

function weekLabel(date: Date): { period: string; periodLabel: string } {
  const m = date.getMonth() + 1;
  const weekNum = Math.ceil(date.getDate() / 7);
  return {
    period: `${date.getFullYear()}-${String(m).padStart(2, "0")}-W${weekNum}`,
    periodLabel: `${m}月第${weekNum}週`,
  };
}

function buildSingleEvolutionCard(from: EvolutionSnapshot, to: EvolutionSnapshot): EvolutionCard {
  const allKeys = new Set([...Object.keys(from.traits), ...Object.keys(to.traits)]);
  const changed: EvolutionCard["changedDimensions"] = [];

  for (const key of allKeys) {
    const prev = from.traits[key] ?? 0;
    const curr = to.traits[key] ?? 0;
    const delta = curr - prev;
    if (Math.abs(delta) >= 0.05) {
      const def = PERSONALITY_DIMENSIONS.find((d) => d.id === key);
      changed.push({
        dimension: key,
        label: def ? def.labelLeft : humanizeDimensionId(key),
        direction: delta > 0 ? "increased" : "decreased",
        delta: Math.round(delta * 100) / 100,
      });
    }
  }
  changed.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const archChanged = from.archetypeCode !== to.archetypeCode;
  const toDate = new Date(to.capturedAt);
  const { period, periodLabel } = weekLabel(toDate);

  let summary: string;
  if (archChanged) {
    const fromLabel = from.archetypeLabel ?? "?";
    const toLabel = to.archetypeLabel ?? "?";
    summary = `タイプが ${fromLabel} → ${toLabel} に変化`;
  } else if (changed.length > 0) {
    const top = changed.slice(0, 2);
    summary = top.map((c) =>
      `${c.label}が${c.direction === "increased" ? "上昇" : "低下"}`
    ).join("、");
  } else {
    summary = "安定した時期です";
  }

  return {
    period, periodLabel, fromSnapshot: from, toSnapshot: to,
    driftIndex: to.driftIndex, changedDimensions: changed.slice(0, 5),
    archetypeChanged: archChanged, typeChanged: archChanged, summary,
  };
}

export function buildEvolutionTimeline(rawSnapshots: OrbitSnapshotRow[]): EvolutionTimeline {
  const snapshots: EvolutionSnapshot[] = rawSnapshots.map((s) => ({
    capturedAt: s.captured_at,
    archetypeCode: s.archetype_code,
    archetypeLabel: s.archetype_label,
    traits: s.core_traits_snapshot ?? {},
    driftIndex: s.drift_index,
  }));

  const cards: EvolutionCard[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    cards.push(buildSingleEvolutionCard(snapshots[i - 1], snapshots[i]));
  }

  const drifts = snapshots.map((s) => s.driftIndex);
  const overallDrift = drifts.length > 0
    ? Math.round(drifts.reduce((s, d) => s + d, 0) * 100) / 100
    : 0;
  const avgDrift = drifts.length > 0 ? overallDrift / drifts.length : 0;
  const stability = Math.round(clamp(1 - avgDrift / 10, 0, 1) * 100) / 100;

  let currentStreak = 1;
  if (snapshots.length >= 2) {
    const last = snapshots[snapshots.length - 1];
    for (let i = snapshots.length - 2; i >= 0; i--) {
      if (snapshots[i].archetypeCode === last.archetypeCode) currentStreak++;
      else break;
    }
  }

  return { snapshots, cards, overallDrift, stability, currentStreak };
}

// ============================================================================
// Pillar 4: Genome Visualization
// ============================================================================

const BODY_AXIS_LABELS: Record<string, [string, string]> = {
  vertical_line: ["直線的", "曲線的"],
  shoulder_width: ["狭い肩", "広い肩"],
  shoulder_slope: ["なで肩", "いかり肩"],
  ribcage_width: ["細い胸郭", "広い胸郭"],
  torso_depth: ["薄い", "厚い"],
  pelvis_width: ["狭い骨盤", "広い骨盤"],
  joint_size: ["小さい関節", "大きい関節"],
  bone_sharpness: ["丸い骨", "鋭い骨"],
  leg_ratio: ["短い脚", "長い脚"],
  arm_ratio: ["短い腕", "長い腕"],
  waist_position: ["低いウエスト", "高いウエスト"],
  posture_round_shoulders: ["良い姿勢", "巻き肩"],
  pelvic_tilt: ["後傾", "前傾"],
  mobility_upper: ["硬い", "柔らかい"],
};

export function buildGenomeVisualizationData(genome: PersonaGenome): GenomeVisualizationData {
  const strands: GenomeStrand[] = [];

  // ─── Physical Strand ───
  const physicalPairs: GenomeBasePair[] = [];
  if (genome.physical.bodyAxes) {
    for (const [key, val] of Object.entries(genome.physical.bodyAxes)) {
      if (typeof val !== "number") continue;
      const labels = BODY_AXIS_LABELS[key];
      physicalPairs.push({
        id: `phys.${key}`,
        label: labels ? `${labels[0]}↔${labels[1]}` : key,
        category: "身体",
        value: norm01(val, 0, 100),
        confidence: genome.physical.bodyConfidence,
        leftLabel: labels?.[0] ?? "",
        rightLabel: labels?.[1] ?? "",
      });
    }
  }
  strands.push({ id: "physical", label: "フィジカル", color: "#6366f1", basePairs: physicalPairs });

  // ─── Personality Strand ───
  const personalityPairs: GenomeBasePair[] = [];
  for (const dim of genome.personality.dimensions) {
    const def = PERSONALITY_DIMENSIONS.find((d) => d.id === dim.dimension);
    personalityPairs.push({
      id: `pers.dim.${dim.dimension}`,
      label: def ? `${def.labelLeft}↔${def.labelRight}` : humanizeDimensionId(dim.dimension),
      category: "次元",
      value: (dim.score + 1) / 2,
      confidence: dim.confidence,
      leftLabel: def?.labelLeft ?? humanizeDimensionId(dim.dimension),
      rightLabel: def?.labelRight ?? humanizeDimensionId(dim.dimension),
    });
  }
  strands.push({ id: "personality", label: "パーソナリティ", color: "#8b5cf6", basePairs: personalityPairs });

  // ─── Behavioral Strand ───
  const behavioralPairs: GenomeBasePair[] = [];
  const colorAxisMap: Record<string, number> = { dark: 0.2, low_sat: 0.4, neutral: 0.5, light: 0.7, high_sat: 0.9 };
  const silAxisMap: Record<string, number> = { tight: 0.2, neutral: 0.5, relaxed: 0.7, oversize: 0.9 };

  behavioralPairs.push({
    id: "behav.color_axis", label: "カラー傾向", category: "テイスト",
    value: colorAxisMap[genome.behavioral.dominantColorAxis] ?? 0.5,
    confidence: genome.behavioral.hasTaste ? 0.7 : 0,
    leftLabel: "ダーク", rightLabel: "ビビッド",
  });
  behavioralPairs.push({
    id: "behav.sil_axis", label: "シルエット傾向", category: "テイスト",
    value: silAxisMap[genome.behavioral.dominantSilhouetteAxis] ?? 0.5,
    confidence: genome.behavioral.hasTaste ? 0.7 : 0,
    leftLabel: "タイト", rightLabel: "オーバーサイズ",
  });
  behavioralPairs.push({
    id: "behav.like_rate", label: "いいね率", category: "行動",
    value: clamp(genome.behavioral.likeRate, 0, 1),
    confidence: genome.behavioral.hasSwipeHistory ? 0.8 : 0,
    leftLabel: "選択的", rightLabel: "積極的",
  });
  behavioralPairs.push({
    id: "behav.save_rate", label: "保存率", category: "行動",
    value: clamp(genome.behavioral.saveRate * 5, 0, 1),
    confidence: genome.behavioral.hasSwipeHistory ? 0.8 : 0,
    leftLabel: "低い", rightLabel: "高い",
  });

  strands.push({ id: "behavioral", label: "ビヘイビア", color: "#ec4899", basePairs: behavioralPairs });

  // ─── Social Strand ───
  const socialPairs: GenomeBasePair[] = [];
  const socialConf = genome.social.hasSocial ? 0.7 : 0;

  socialPairs.push({
    id: "soc.fit_score", label: "マッチ適合度", category: "マッチ",
    value: genome.social.avgPeopleFitScore != null ? genome.social.avgPeopleFitScore / 100 : 0.5,
    confidence: socialConf, leftLabel: "低い", rightLabel: "高い",
  });
  socialPairs.push({
    id: "soc.save_rate", label: "他者からの保存率", category: "フィードバック",
    value: clamp(genome.social.feedbackSaveRate * 5, 0, 1),
    confidence: socialConf, leftLabel: "低い", rightLabel: "高い",
  });
  socialPairs.push({
    id: "soc.match_volume", label: "マッチ量", category: "マッチ",
    value: clamp(genome.social.matchCount / 20, 0, 1),
    confidence: socialConf, leftLabel: "少ない", rightLabel: "多い",
  });

  strands.push({ id: "social", label: "ソーシャル", color: "#14b8a6", basePairs: socialPairs });

  // ─── Dominant & Weak Traits ───
  const allPairs = strands.flatMap((s) => s.basePairs);
  const sortedByStrength = [...allPairs]
    .filter((p) => p.confidence > 0.1)
    .sort((a, b) => (b.value * b.confidence) - (a.value * a.confidence));
  const dominantTraits = sortedByStrength.slice(0, 5);

  const sortedByWeakness = [...allPairs]
    .filter((p) => p.confidence > 0)
    .sort((a, b) => a.confidence - b.confidence);
  const weakTraits = sortedByWeakness.slice(0, 5);

  // Overall label
  const archLabel = genome.personality.archetypeLabel;
  const overallLabel = archLabel
    ? `${archLabel}`
    : genome.physical.bodyBase
      ? `${genome.physical.bodyBase} タイプ`
      : "データ収集中";

  const overallDescription = [
    genome.physical.pcSeason4 ? `${genome.physical.pcSeason4}シーズン` : null,
    genome.physical.bodyBase ? `${genome.physical.bodyBase}体型` : null,
    archLabel ?? null,
    genome.behavioral.taste30d?.laneTop3[0] ? `${genome.behavioral.taste30d.laneTop3[0]}スタイル` : null,
  ].filter(Boolean).join(" / ") || "診断データを追加してゲノムを完成させましょう";

  return { strands, dominantTraits, weakTraits, overallLabel, overallDescription };
}

/**
 * Convert an English dimension ID to a human-readable Japanese label.
 * Used as a fallback when no explicit definition exists in PERSONALITY_DIMENSIONS.
 */
function humanizeDimensionId(id: string): string {
  // snake_case → readable Japanese (common patterns)
  const KNOWN: Record<string, string> = {
    intimacy_pace: "親密さのペース",
    reassurance_need: "安心確認の必要度",
    emotional_variability: "感情の変動性",
    social_initiative: "社交の主体性",
    boundary_awareness: "境界の意識",
    relationship_mode_split: "関係モードの分裂",
    boundary_respect: "境界の尊重",
    consent_maturity: "同意の成熟度",
    pressure_risk: "圧力リスク",
    escalation_risk: "エスカレーション傾向",
    friend_mode_fit: "友人モード適性",
    intent_stability: "意図の安定性",
    rejection_response_maturity: "拒絶への成熟度",
    control_tendency: "コントロール傾向",
    exclusivity_pressure: "独占圧力",
    long_term_shift_risk: "長期変化リスク",
    public_private_gap: "公私のギャップ",
    emotional_regulation: "感情調整力",
    stress_isolation_vs_social: "ストレス時の孤立vs社交",
    perfectionist_vs_pragmatic: "完璧主義vs現実主義",
    self_disclosure: "自己開示",
    conflict_avoidance: "対立回避",
    attachment_security: "愛着安定性",
    独立志向: "独立志向",
  };
  if (KNOWN[id]) return KNOWN[id];
  // Generic fallback: replace underscores with spaces, remove "vs"
  return id.replace(/_/g, " ").replace(/\bvs\b/g, "↔");
}
