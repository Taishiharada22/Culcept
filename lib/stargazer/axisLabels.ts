/**
 * 軸名（英語snake_case）→ 日本語ラベル マッピング
 * 全コンポーネントで共有。新しい軸を追加したらここに追加する。
 */
export const AXIS_LABELS: Record<string, string> = {
  // ── 既存15軸 ──
  introvert_vs_extrovert: "内向的 ⇔ 外向的",
  individual_vs_social: "個で深める ⇔ 集団で広げる",
  cautious_vs_bold: "慎重 ⇔ 大胆",
  analytical_vs_intuitive: "分析的 ⇔ 直感的",
  change_embrace_vs_resist: "変化を受容 ⇔ 安定を求める",
  plan_vs_spontaneous: "計画的 ⇔ 即興的",
  tradition_vs_novelty: "伝統志向 ⇔ 新規志向",
  independence_vs_harmony: "独立 ⇔ 調和",
  direct_vs_diplomatic: "率直 ⇔ 外交的",
  stress_isolation_vs_social: "孤独回復 ⇔ 社交回復",
  function_vs_expression: "機能重視 ⇔ 表現重視",
  minimal_vs_maximal: "シンプル ⇔ 華やか",
  perfectionist_vs_pragmatic: "完璧主義 ⇔ 実用主義",
  quality_vs_quantity: "質重視 ⇔ 量重視",
  classic_vs_trendy: "定番派 ⇔ 流行派",

  // ── Stage 1 追加軸 ──
  intimacy_pace: "距離感のペース",
  reassurance_need: "安心欲求",
  emotional_variability: "感情の振れ幅",
  social_initiative: "社交の能動性",
  boundary_awareness: "心の距離感",
  relationship_mode_split: "関係モードの切り替え",

  // ── Stage 2 追加軸 ──
  boundary_respect: "相手への配慮",
  consent_maturity: "合意の成熟度",
  pressure_risk: "圧力リスク",
  escalation_risk: "激化リスク",
  friend_mode_fit: "友人適性",
  intent_stability: "意図の安定性",
  rejection_response_maturity: "拒絶への成熟度",
  control_tendency: "支配欲傾向",
  exclusivity_pressure: "独占圧",
  long_term_shift_risk: "長期変動リスク",
  public_private_gap: "表裏の差",
  emotional_regulation: "感情制御力",

  // ── Stage 3 深層心理軸 ──
  attachment_style: "安定型 ⇔ 不安型",
  locus_of_control: "内的統制 ⇔ 外的統制",
  growth_mindset: "成長志向 ⇔ 固定志向",
  shame_vs_guilt: "罪悪型 ⇔ 恥型",
  rumination_tendency: "手放す ⇔ 反芻する",
  fairness_sensitivity: "寛容 ⇔ 公正敏感",

  // ── Cognitive Fit 軸 ──
  abstract_structuring: "具体から積む ⇔ 抽象で掴む",
  decomposition: "全体を一気に ⇔ 分解して順に",
  cognitive_updating: "判断を保持 ⇔ 柔軟に更新",
  decision_tempo: "即断型 ⇔ 熟考型",
  social_modeling: "行動から読む ⇔ 意図から読む",
  exploration_closure: "広く探索 ⇔ 素早く絞る",

  // ── Legacy Big5 ──
  openness: "開放性",
  conscientiousness: "誠実性",
  extraversion: "外向性",
  agreeableness: "協調性",
  neuroticism: "情緒安定性",
};

/** カテゴリ名の日本語化 */
export const CATEGORY_LABELS: Record<string, string> = {
  core: "基本性格",
  emotional: "感情・情緒",
  social: "対人・社交",
  cognitive: "認知・思考",
  style: "スタイル・表現",
  relationship: "関係性",
  safety: "安全性",
  deep_psychology: "深層心理",
};

/** 英語軸キーを日本語ラベルに変換。未登録キーはスネークケースをスペース区切りに */
export function axisLabel(key: string): string {
  return AXIS_LABELS[key] ?? key.replace(/_/g, " ");
}

/** 英語カテゴリキーを日本語ラベルに変換 */
export function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key;
}
