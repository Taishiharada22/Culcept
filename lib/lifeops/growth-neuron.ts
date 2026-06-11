/**
 * Life Ops — Growth Neuron Taxonomy（**pure 契約・no-DB・no-UI・no-外部・no-LLM分類**・barrel 非 export）
 *
 * 設計: docs/life-ops-growth-neuron-taxonomy-mini-design.md / category-model(growth 5) / candidate-types(HabitNeuronContext)
 *
 * 役割: growth 5 カテゴリの **neuron branch（dimension × closed vocabulary）** を定義し、
 *   「将来、構造化入力や観測から安全に入ってきた情報をどの枝に置けるか」の pure 契約（型・定数・validator）を提供する。
 *   上位カテゴリ＝行動の種類（habit が「いつ」を判定）/ dimension＝中身（何を・何のため・どうやる・どの量・障害・根拠）。
 *
 * 厳守:
 *   - **closed vocabulary**: 入力は valueId 参照のみ。taxonomy に無い dimension/value は sanitize で drop（fail-safe）。
 *     表示 label は定数からのみ引く＝**free text / PII / raw note は構造的に流入不可**。
 *   - pure・deterministic・横エンジン非 import・no-DB・no-UI・no-通知・実データ/LLM 分類なし・barrel 非 export。
 *   - habit 候補へ載せるのは 3 slot（approach/unit/evidence）のみ（詳細は将来 GrowthProfile 側・候補に載せない）。
 */

import type { GrowthCategoryId } from "./category-model";
import type { GrowthEvidenceKind, HabitNeuronContext } from "./candidate-types";

/** 語彙 1 値（id=契約キー・label=日本語表示。この 2 key のみ＝raw を持たない）。 */
export interface NeuronValueSpec {
  readonly id: string;
  readonly label: string;
}

/** 1 dimension（軸）と許される値の集合（closed vocabulary）。 */
export interface NeuronDimensionSpec {
  readonly id: string;
  readonly label: string;
  readonly values: readonly NeuronValueSpec[];
}

/** カテゴリ 1 つ分の neuron branch。 */
export interface GrowthNeuronBranch {
  readonly categoryId: GrowthCategoryId;
  readonly dimensions: readonly NeuronDimensionSpec[];
}

/** 将来入力の正規形（valueId 参照のみ・自由記述なし）。 */
export interface NeuronSelection {
  readonly dimension: string;
  readonly valueId: string;
}

const v = (id: string, label: string): NeuronValueSpec => ({ id, label });

/** 共通語彙: レベル（current/goal の両 dimension が共有）。 */
const LEVEL_VALUES: readonly NeuronValueSpec[] = [v("beginner", "入門"), v("intermediate", "中級"), v("advanced", "上級")];

/** 共通語彙: 根拠 evidence（id は GrowthEvidenceKind と一致）。 */
const EVIDENCE_VALUES: readonly NeuronValueSpec[] = [
  v("recent_success", "最近できた"),
  v("recent_struggle", "最近詰まった"),
  v("sustained_streak", "続けられている"),
  v("long_pause", "しばらく空いている"),
];
const EVIDENCE_DIMENSION: NeuronDimensionSpec = { id: "evidence", label: "最近の手応え", values: EVIDENCE_VALUES };

/** growth 5 カテゴリの branch taxonomy（正本）。label は文言合成可能な名詞形。 */
export const GROWTH_NEURON_TAXONOMY: Record<GrowthCategoryId, GrowthNeuronBranch> = {
  study: {
    categoryId: "study",
    dimensions: [
      { id: "domain", label: "何の勉強か", values: [v("english", "英語"), v("certification", "資格"), v("programming", "プログラミング"), v("work_knowledge", "仕事の知識"), v("exam_prep", "受験"), v("language", "語学"), v("specialty", "専門知識")] },
      { id: "purpose", label: "何のためか", values: [v("exam_pass", "試験合格"), v("practical_use", "実務で使う"), v("promotion", "昇進"), v("hobby", "趣味"), v("income", "収入"), v("health", "健康"), v("self_understanding", "自己理解")] },
      { id: "target", label: "どこまでやるか", values: [v("finish_material", "教材を終える"), v("pass_exam", "試験に合格する"), v("reach_score", "目標点に届く"), v("build_routine", "習慣として定着させる"), v("one_topic", "1テーマを理解する")] },
      { id: "current_level", label: "現在レベル", values: LEVEL_VALUES },
      { id: "goal_level", label: "目標レベル", values: LEVEL_VALUES },
      { id: "method", label: "学習法", values: [v("read", "読解"), v("solve", "演習"), v("memorize", "暗記"), v("write", "書き取り"), v("listen", "リスニング"), v("explain", "説明"), v("review", "復習")] },
      { id: "unit", label: "ひと区切り", values: [v("min5", "5分"), v("min15", "15分"), v("one_chapter", "1章"), v("problems10", "10問"), v("one_video", "動画1本"), v("one_page", "1ページ")] },
      { id: "friction", label: "障害", values: [v("fatigue", "疲労"), v("weakness", "苦手意識"), v("time_shortage", "時間不足"), v("focus_loss", "集中切れ"), v("unprepared", "準備不足")] },
      EVIDENCE_DIMENSION,
    ],
  },
  workout: {
    categoryId: "workout",
    dimensions: [
      { id: "goal", label: "目的", values: [v("strength", "筋力"), v("stamina", "体力"), v("weight_loss", "減量"), v("posture", "姿勢"), v("health_maintain", "健康維持"), v("mental_stability", "メンタル安定")] },
      { id: "mode", label: "やり方", values: [v("bodyweight", "自重"), v("gym", "ジム"), v("run", "ラン"), v("stretch", "ストレッチ"), v("core", "体幹")] },
      { id: "intensity", label: "強度", values: [v("very_light", "かなり軽め"), v("light", "軽め"), v("normal", "ふつう"), v("hard", "しっかり")] },
      { id: "body_state", label: "体の状態", values: [v("fatigued", "疲労気味"), v("sleep_deprived", "睡眠不足"), v("pain", "痛みあり"), v("energetic", "余力あり")] },
      { id: "unit", label: "ひと区切り", values: [v("min5", "5分"), v("min10", "10分"), v("one_set", "1セット"), v("km1", "1km")] },
      EVIDENCE_DIMENSION,
    ],
  },
  reading: {
    categoryId: "reading",
    dimensions: [
      { id: "purpose", label: "目的", values: [v("knowledge", "知識"), v("work", "仕事"), v("culture", "教養"), v("thinking", "思考整理"), v("entertainment", "娯楽")] },
      { id: "material_type", label: "読むもの", values: [v("book", "本"), v("article", "記事"), v("paper", "論文"), v("docs", "ドキュメント")] },
      { id: "mode", label: "読み方", values: [v("skim", "流し読み"), v("deep_read", "精読"), v("summarize", "要約"), v("apply", "実践")] },
      { id: "unit", label: "ひと区切り", values: [v("one_page", "1ページ"), v("min10", "10分"), v("one_chapter", "1章")] },
      EVIDENCE_DIMENSION,
    ],
  },
  weekly_review: {
    categoryId: "weekly_review",
    dimensions: [
      { id: "scope", label: "対象", values: [v("life", "生活"), v("work", "仕事"), v("learning", "学習"), v("money", "お金"), v("relationships", "人間関係"), v("health", "健康")] },
      { id: "output", label: "出すもの", values: [v("reflection", "振り返り"), v("next_week_policy", "来週の方針"), v("problem_sorting", "問題整理"), v("schedule_adjust", "予定調整")] },
      { id: "depth", label: "深さ", values: [v("quick", "さっと"), v("normal", "ふつう"), v("deep", "じっくり")] },
      EVIDENCE_DIMENSION,
    ],
  },
  skill_practice: {
    categoryId: "skill_practice",
    dimensions: [
      { id: "skill", label: "スキル", values: [v("design", "デザイン"), v("coding", "コーディング"), v("writing", "文章"), v("speaking", "スピーキング"), v("music", "音楽"), v("aviation", "操縦"), v("analysis", "分析")] },
      { id: "practice_type", label: "練習の型", values: [v("drill", "反復練習"), v("project", "制作"), v("review", "振り返り"), v("imitation", "模写"), v("output", "アウトプット")] },
      { id: "level", label: "レベル", values: LEVEL_VALUES },
      { id: "unit", label: "ひと区切り", values: [v("min10", "10分"), v("one_work", "1作品"), v("one_problem", "1問"), v("one_post", "1投稿")] },
      EVIDENCE_DIMENSION,
    ],
  },
};

/** categoryId → branch（growth 外/未知は undefined）。 */
export function getNeuronBranch(categoryId: string): GrowthNeuronBranch | undefined {
  return (GROWTH_NEURON_TAXONOMY as Record<string, GrowthNeuronBranch>)[categoryId];
}

/** selection が taxonomy 上 valid か（未知 category/dimension/value は false）。 */
export function isValidNeuronSelection(categoryId: string, selection: NeuronSelection): boolean {
  const dim = getNeuronBranch(categoryId)?.dimensions.find((d) => d.id === selection.dimension);
  return dim !== undefined && dim.values.some((x) => x.id === selection.valueId);
}

/** valid な selection だけ残す（free text/未知は drop＝fail-safe・流入遮断）。 */
export function sanitizeNeuronSelections(
  categoryId: string,
  selections: readonly NeuronSelection[]
): readonly NeuronSelection[] {
  return selections.filter((s) => isValidNeuronSelection(categoryId, s));
}

/** valueId → 表示 label（**定数からのみ**・無ければ null）。入力文字列は表示経路に乗らない。 */
export function neuronValueLabel(categoryId: string, dimension: string, valueId: string): string | null {
  const dim = getNeuronBranch(categoryId)?.dimensions.find((d) => d.id === dimension);
  return dim?.values.find((x) => x.id === valueId)?.label ?? null;
}

/** 候補文言の「どうやる」slot に使う dimension（カテゴリ別）。 */
const APPROACH_DIMENSION: Record<GrowthCategoryId, string> = {
  study: "method",
  workout: "mode",
  reading: "mode",
  weekly_review: "output",
  skill_practice: "practice_type",
};

const EVIDENCE_KINDS = new Set<string>(["recent_success", "recent_struggle", "sustained_streak", "long_pause"]);

/**
 * selections → habit 候補に載せる neuron 文脈（**3 slot のみ**・全て定数由来）。
 *   valid な selection が無ければ undefined（候補は従来のまま＝後方互換）。
 */
export function buildHabitNeuronContext(
  categoryId: string,
  selections: readonly NeuronSelection[]
): HabitNeuronContext | undefined {
  const valid = sanitizeNeuronSelections(categoryId, selections);
  if (valid.length === 0) return undefined;
  const approachDim = (APPROACH_DIMENSION as Record<string, string>)[categoryId];
  const pick = (dim: string | undefined) => (dim ? valid.find((s) => s.dimension === dim) : undefined);
  const a = pick(approachDim);
  const u = pick("unit");
  const e = pick("evidence");
  const approachLabel = a ? neuronValueLabel(categoryId, a.dimension, a.valueId) : null;
  const unitLabel = u ? neuronValueLabel(categoryId, "unit", u.valueId) : null;
  const evidenceKind = e && EVIDENCE_KINDS.has(e.valueId) ? (e.valueId as GrowthEvidenceKind) : null;
  if (approachLabel === null && unitLabel === null && evidenceKind === null) return undefined;
  return { approachLabel, unitLabel, evidenceKind };
}
