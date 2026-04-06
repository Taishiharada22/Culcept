/**
 * Axis Registry — 全軸のメタデータ・テンプレートの単一定義源
 *
 * ルール本体は持たない（ポインタ+テンプレのみ）。
 * contradictionRules, insightRules等はそれぞれの既存ファイルに残す。
 *
 * @see docs/design/stargazer-alter-axis-architecture.md §4-A
 */

import {
  type TraitAxisKey,
  type AxisCategory,
  TRAIT_AXES,
  TRAIT_AXIS_KEYS,
} from "./traitAxes";

// ─── Version ───────────────────────────────────────────────
// メジャー: 軸の統合/削除、マイナー: 新軸追加、パッチ: テンプレート変更
export const AXIS_REGISTRY_VERSION = "1.0.0";

// ─── Types ─────────────────────────────────────────────────

export type AxisDomain =
  | "judgment"    // 判断プロセス・意思決定
  | "relational"  // 対人関係・社会性
  | "boundary"    // 境界・安全性
  | "emotional"   // 感情・ストレス
  | "cognitive"   // 認知スタイル・思考
  | "energy"      // エネルギー・回復
  | "identity"    // アイデンティティ・自己認識
  | "aesthetic";  // 美的感覚・表現

export interface AxisRegistryEntry {
  /** 軸ID（TraitAxisKeyと一致） */
  id: TraitAxisKey;
  /** 日本語ラベル: 左極 */
  labelLeft: string;
  /** 日本語ラベル: 右極 */
  labelRight: string;
  /** 既存カテゴリ（traitAxes.tsと一致、後方互換） */
  category: AxisCategory;
  /** 軸ステータス: core=通常, expansion=拡張, frozen=凍結 */
  tier: "core" | "expansion" | "frozen";
  /** 意味ドメイン */
  domain: AxisDomain;
  /** Expansion軸の場合の親軸 */
  parentAxes?: TraitAxisKey[];
  /** 心理学的検証キー */
  validationKey?: string;

  // ── frozen軸用フィールド（tier === "frozen" の場合のみ） ──
  /** 凍結軸の統合先axis_id */
  forwardTo?: TraitAxisKey;
  /** 凍結日（ISO 8601） */
  frozenAt?: string;
  /** 凍結理由 */
  frozenReason?: string;

  // ── AUTO層テンプレート ──
  /** スコアが左寄り(< 0.4)の時のfallback洞察文 */
  fallbackInsightLeft: string;
  /** スコアが右寄り(> 0.6)の時のfallback洞察文 */
  fallbackInsightRight: string;
  /** ContextReelテンプレート。{score}をスコアで置換 */
  contextReelTemplate: string;
  /** LLMに渡す時のこの軸の説明（日本語1文） */
  llmDescription: string;
  /** 因果的に関連する軸のリスト（最低2軸） */
  causalAffinity: TraitAxisKey[];

  // ── subScore構造（該当する軸のみ） ──
  subScores?: Record<string, {
    weight: number;
    externalLabel: string;
    weightBasis: "theory" | "data" | "hybrid";
    lastUpdated: string;
    updatePolicy: string;
  }>;
}

/**
 * frozen軸の型ガード
 */
export function isFrozenAxis(
  entry: AxisRegistryEntry,
): entry is AxisRegistryEntry & {
  tier: "frozen";
  forwardTo: TraitAxisKey;
  frozenAt: string;
  frozenReason: string;
} {
  return entry.tier === "frozen" && entry.forwardTo !== undefined;
}

// ─── Registry Data ─────────────────────────────────────────

const REGISTRY_ENTRIES: AxisRegistryEntry[] = [
  // ═══════════════════════════════════════════════════════════
  // DOMAIN: judgment（判断プロセス・意思決定）
  // ═══════════════════════════════════════════════════════════
  {
    id: "cautious_vs_bold",
    labelLeft: "慎重",
    labelRight: "大胆",
    category: "core",
    tier: "core",
    domain: "judgment",
    fallbackInsightLeft: "リスクを事前に見積もる力がある反面、「動けなさ」が判断を遅らせることがある",
    fallbackInsightRight: "決断が速く推進力がある反面、見落としに気づくのが遅れやすい",
    contextReelTemplate: "判断スタイル: 慎重←→大胆のバランス（{score}）",
    llmDescription: "リスク判断の際に慎重に見積もるか、大胆に踏み出すかの傾向",
    causalAffinity: ["locus_of_control", "decision_tempo", "decision_regret"],
  },
  {
    id: "analytical_vs_intuitive",
    labelLeft: "分析的",
    labelRight: "直感的",
    category: "core",
    tier: "core",
    domain: "judgment",
    fallbackInsightLeft: "データや根拠を求めて判断する — 直感を無視して遠回りすることがある",
    fallbackInsightRight: "感覚で本質を掴む力がある — 根拠を問われると説明に詰まることがある",
    contextReelTemplate: "思考スタイル: 分析←→直感（{score}）",
    llmDescription: "判断時にデータ・論理を重視するか直感・感覚を優先するかの傾向",
    causalAffinity: ["decision_tempo", "abstract_structuring", "cognitive_updating"],
  },
  {
    id: "plan_vs_spontaneous",
    labelLeft: "計画的",
    labelRight: "即興的",
    category: "core",
    tier: "core",
    domain: "judgment",
    fallbackInsightLeft: "段取りを踏まないと不安になる — 予定外の事態に弱い面がある",
    fallbackInsightRight: "その場の状況に柔軟に対応できる — 同じ失敗を繰り返しやすい面がある",
    contextReelTemplate: "行動スタイル: 計画←→即興（{score}）",
    llmDescription: "行動を事前に計画するか、その場で判断して動くかの傾向",
    causalAffinity: ["cautious_vs_bold", "emotional_variability", "decision_tempo"],
  },
  {
    id: "rational_vs_emotional_decision",
    labelLeft: "理性的判断",
    labelRight: "感情的判断",
    category: "core",
    tier: "core",
    domain: "judgment",
    fallbackInsightLeft: "論理的に正しい選択をするが、感情を無視した判断が人間関係を損なうことがある",
    fallbackInsightRight: "感情に正直な判断ができるが、後で「冷静に考えれば違った」と思うことがある",
    contextReelTemplate: "判断の軸: 理性←→感情（{score}）",
    llmDescription: "重要な判断で理性と感情のどちらを優先する傾向があるか",
    causalAffinity: ["analytical_vs_intuitive", "emotional_regulation", "rumination_tendency"],
  },
  {
    id: "efficiency_vs_process",
    labelLeft: "効率重視",
    labelRight: "過程重視",
    category: "core",
    tier: "core",
    domain: "judgment",
    fallbackInsightLeft: "最短距離で結果を出す力がある — 途中の気づきや寄り道を切り捨てがち",
    fallbackInsightRight: "プロセスから学ぶ姿勢がある — 結果が出るまでに時間がかかりすぎることがある",
    contextReelTemplate: "価値基準: 効率←→過程（{score}）",
    llmDescription: "目標達成において効率・結果を優先するか過程・学びを重視するか",
    causalAffinity: ["perfectionist_vs_pragmatic", "quality_vs_quantity", "plan_vs_spontaneous"],
  },
  {
    id: "decision_tempo",
    labelLeft: "熟慮型",
    labelRight: "即断型",
    category: "cognitive",
    tier: "expansion",
    domain: "judgment",
    parentAxes: ["cautious_vs_bold", "analytical_vs_intuitive"],
    fallbackInsightLeft: "じっくり考えてから動く — 機会を逃しやすいが後悔は少ない",
    fallbackInsightRight: "素早く決めて動く — 勢いがあるが「もう少し考えればよかった」が出やすい",
    contextReelTemplate: "判断速度: 熟慮←→即断（{score}）",
    llmDescription: "判断に要する時間の傾向。熟慮して決めるか即座に決断するか",
    causalAffinity: ["analytical_vs_intuitive", "cautious_vs_bold", "plan_vs_spontaneous"],
  },
  {
    id: "decision_regret",
    labelLeft: "決断後さっぱり",
    labelRight: "決断後引きずる",
    category: "expansion",
    tier: "expansion",
    domain: "judgment",
    parentAxes: ["cautious_vs_bold", "rumination_tendency"],
    fallbackInsightLeft: "決めたら振り返らない — 同じ判断ミスに気づきにくい",
    fallbackInsightRight: "決断後に「あっちが正しかったかも」と考え続ける — 次の判断が鈍る",
    contextReelTemplate: "判断後: さっぱり←→引きずる（{score}）",
    llmDescription: "決断後に後悔や反芻をどの程度行うかの傾向",
    causalAffinity: ["rumination_tendency", "cautious_vs_bold", "locus_of_control"],
  },
  {
    id: "fairness_sensitivity",
    labelLeft: "公平さに寛容",
    labelRight: "公平さに敏感",
    category: "depth",
    tier: "core",
    domain: "judgment",
    fallbackInsightLeft: "不公平に寛容 — 自分が損をしていても気づきにくい",
    fallbackInsightRight: "不公平に敏感 — 些細な不平等でも強い反応が出やすい",
    contextReelTemplate: "公平感度: 寛容←→敏感（{score}）",
    llmDescription: "対人関係や社会的場面での公平さへの感度の高さ",
    causalAffinity: ["control_tendency", "emotional_regulation", "independence_vs_harmony"],
  },

  // ═══════════════════════════════════════════════════════════
  // DOMAIN: relational（対人関係・社会性）
  // ═══════════════════════════════════════════════════════════
  {
    id: "individual_vs_social",
    labelLeft: "個で深める",
    labelRight: "集団で広げる",
    category: "core",
    tier: "core",
    domain: "relational",
    fallbackInsightLeft: "一人で深く集中する力がある — 協力を求めるタイミングを逃しやすい",
    fallbackInsightRight: "人を巻き込む力がある — 一人で深く考える時間を確保しにくい",
    contextReelTemplate: "活動スタイル: 個←→集団（{score}）",
    llmDescription: "課題に取り組む際に一人で深めるか集団で広げるかの傾向",
    causalAffinity: ["introvert_vs_extrovert", "independence_vs_harmony", "social_initiative"],
  },
  {
    id: "direct_vs_diplomatic",
    labelLeft: "率直",
    labelRight: "婉曲",
    category: "core",
    tier: "core",
    domain: "relational",
    fallbackInsightLeft: "本音をストレートに伝える — 相手が受け取る準備ができていない場面で衝突しやすい",
    fallbackInsightRight: "相手に配慮した伝え方をする — 本当に言いたいことが伝わりきらないことがある",
    contextReelTemplate: "伝え方: 率直←→婉曲（{score}）",
    llmDescription: "コミュニケーションで直接的に伝えるか間接的・婉曲的に伝えるか",
    causalAffinity: ["public_private_gap", "conflict_style", "boundary_awareness"],
  },
  {
    id: "independence_vs_harmony",
    labelLeft: "独立重視",
    labelRight: "調和重視",
    category: "core",
    tier: "core",
    domain: "relational",
    fallbackInsightLeft: "自分の判断で動ける — 周囲との歩調を合わせることが苦手なことがある",
    fallbackInsightRight: "周囲と合わせる力がある — 自分の本音を後回しにしやすい",
    contextReelTemplate: "対人姿勢: 独立←→調和（{score}）",
    llmDescription: "対人場面で自分の独立性を保つか周囲との調和を優先するか",
    causalAffinity: ["individual_vs_social", "conflict_style", "boundary_awareness"],
  },
  {
    id: "stress_isolation_vs_social",
    labelLeft: "ストレス時に孤立",
    labelRight: "ストレス時に人を求める",
    category: "relational",
    tier: "core",
    domain: "relational",
    fallbackInsightLeft: "辛いときは一人で抱える — 孤立が長引くと回復が遅れる",
    fallbackInsightRight: "辛いときは人に頼る — 相手を選べないと逆に消耗することがある",
    contextReelTemplate: "ストレス対処: 孤立←→人を求める（{score}）",
    llmDescription: "ストレス下で一人になりたいか人と一緒にいたいかの傾向",
    causalAffinity: ["introvert_vs_extrovert", "emotional_regulation", "energy_rhythm"],
  },
  {
    id: "intimacy_pace",
    labelLeft: "距離を慎重に縮める",
    labelRight: "距離を早く縮める",
    category: "relational",
    tier: "core",
    domain: "relational",
    fallbackInsightLeft: "関係構築に慎重 — 相手には「壁がある」と映りやすい",
    fallbackInsightRight: "すぐに距離を縮められる — 相手のペースを超えてしまうことがある",
    contextReelTemplate: "距離感: 慎重←→積極的（{score}）",
    llmDescription: "他者との心理的距離を縮めるペースの傾向",
    causalAffinity: ["attachment_style", "self_disclosure_depth", "boundary_awareness"],
  },
  {
    id: "reassurance_need",
    labelLeft: "安心確認を求めない",
    labelRight: "安心確認を求める",
    category: "relational",
    tier: "core",
    domain: "relational",
    fallbackInsightLeft: "安心確認を求めない — そのぶん相手には「気にしてないのかな」と映りやすい",
    fallbackInsightRight: "安心を確かめたくなりやすい — 相手にとっては「また確認？」になっている可能性がある",
    contextReelTemplate: "安心確認: 不要←→必要（{score}）",
    llmDescription: "対人関係において相手からの安心確認をどの程度求めるか",
    causalAffinity: ["attachment_style", "emotional_variability", "independence_vs_harmony"],
  },
  {
    id: "social_initiative",
    labelLeft: "受け身",
    labelRight: "自分から動く",
    category: "relational",
    tier: "core",
    domain: "relational",
    fallbackInsightLeft: "待つ姿勢が基本 — チャンスを逃していることに気づきにくい",
    fallbackInsightRight: "自分から距離を縮められる — 相手の準備を待てないことがある",
    contextReelTemplate: "社会的主導: 受け身←→主導（{score}）",
    llmDescription: "対人関係で自分から動くか相手に任せるかの傾向",
    causalAffinity: ["introvert_vs_extrovert", "cautious_vs_bold", "intimacy_pace"],
  },
  {
    id: "relationship_mode_split",
    labelLeft: "一貫した関わり方",
    labelRight: "相手で切り替わる",
    category: "relational",
    tier: "core",
    domain: "relational",
    fallbackInsightLeft: "誰に対しても同じスタンス — 相手に合わせた柔軟さが足りないことがある",
    fallbackInsightRight: "相手によって自分のモードが切り替わる — 「本当の自分はどれ？」と迷うことがある",
    contextReelTemplate: "関係モード: 一貫←→切替（{score}）",
    llmDescription: "関わる相手によってコミュニケーションモードが変わる程度",
    causalAffinity: ["public_private_gap", "intent_stability", "direct_vs_diplomatic"],
  },
  {
    id: "friend_mode_fit",
    labelLeft: "浅く広い交友",
    labelRight: "深く狭い交友",
    category: "safety",
    tier: "core",
    domain: "relational",
    fallbackInsightLeft: "多くの人と付き合える — 「本当に頼れる人がいない」と感じやすい",
    fallbackInsightRight: "少数と深い関係を築く — 新しい人間関係に踏み出しにくい",
    contextReelTemplate: "交友スタイル: 広い←→深い（{score}）",
    llmDescription: "友人関係が広く浅い傾向か狭く深い傾向か",
    causalAffinity: ["intimacy_pace", "introvert_vs_extrovert", "self_disclosure_depth"],
  },
  {
    id: "intent_stability",
    labelLeft: "意図が変わりやすい",
    labelRight: "意図が一貫",
    category: "relational_deep",
    tier: "core",
    domain: "relational",
    fallbackInsightLeft: "状況に応じて目的が変わる — 周囲からは「何がしたいかわからない」と見えることがある",
    fallbackInsightRight: "一度決めた方向にブレない — 状況が変わっても修正できない面がある",
    contextReelTemplate: "意図の安定性: 流動←→一貫（{score}）",
    llmDescription: "対人関係における目的や意図がどの程度一貫しているか",
    causalAffinity: ["relationship_mode_split", "plan_vs_spontaneous", "locus_of_control"],
  },
  {
    id: "rejection_response_maturity",
    labelLeft: "拒否に過剰反応",
    labelRight: "拒否を受容できる",
    category: "relational_deep",
    tier: "core",
    domain: "relational",
    fallbackInsightLeft: "断られると強いダメージを受ける — 拒否を避けるために本音を隠すことがある",
    fallbackInsightRight: "断られても切り替えが早い — 相手の断りの重さを軽く見積もることがある",
    contextReelTemplate: "拒否耐性: 過剰反応←→受容（{score}）",
    llmDescription: "対人関係で拒否・断りを受けた際の反応の成熟度",
    causalAffinity: ["control_tendency", "emotional_regulation", "attachment_style"],
  },
  {
    id: "conflict_style",
    labelLeft: "対立回避",
    labelRight: "対立に向き合う",
    category: "expansion",
    tier: "expansion",
    domain: "relational",
    parentAxes: ["direct_vs_diplomatic", "emotional_regulation"],
    fallbackInsightLeft: "争いを避ける — 問題を先送りして蓄積させるリスクがある",
    fallbackInsightRight: "正面から向き合える — 対立を引き起こしすぎることがある",
    contextReelTemplate: "対立スタイル: 回避←→対峙（{score}）",
    llmDescription: "意見の衝突時に回避するか正面から向き合うかの傾向",
    causalAffinity: ["direct_vs_diplomatic", "emotional_regulation", "boundary_awareness"],
  },
  {
    id: "self_disclosure_depth",
    labelLeft: "自己開示が浅い",
    labelRight: "自己開示が深い",
    category: "expansion",
    tier: "expansion",
    domain: "relational",
    parentAxes: ["intimacy_pace", "introvert_vs_extrovert"],
    fallbackInsightLeft: "自分のことをあまり話さない — 信頼構築に時間がかかる面がある",
    fallbackInsightRight: "自分のことを深く話せる — 相手が準備できていない場面で話しすぎることがある",
    contextReelTemplate: "自己開示: 浅い←→深い（{score}）",
    llmDescription: "他者に自分の内面をどの程度開示するかの傾向",
    causalAffinity: ["intimacy_pace", "introvert_vs_extrovert", "boundary_awareness"],
  },
  {
    id: "relational_investment",
    labelLeft: "関係にドライ",
    labelRight: "関係に全力投球",
    category: "expansion",
    tier: "expansion",
    domain: "relational",
    parentAxes: ["reassurance_need", "attachment_style"],
    fallbackInsightLeft: "人間関係にあっさりしている — 大事な関係の手入れを怠りやすい",
    fallbackInsightRight: "関係に全力を注ぐ — 見返りが得られないと消耗しやすい",
    contextReelTemplate: "関係投資: ドライ←→全力（{score}）",
    llmDescription: "人間関係に対してどの程度のエネルギーを投資するか",
    causalAffinity: ["reassurance_need", "attachment_style", "friend_mode_fit"],
  },

  // ═══════════════════════════════════════════════════════════
  // DOMAIN: boundary（境界・安全性）
  // ═══════════════════════════════════════════════════════════
  {
    id: "boundary_awareness",
    labelLeft: "境界を柔軟に扱う",
    labelRight: "境界を明確に意識",
    category: "relational",
    tier: "core",
    domain: "boundary",
    fallbackInsightLeft: "距離感に鈍い — 踏み込みすぎて相手が引いているのに気づきにくい",
    fallbackInsightRight: "距離感に敏感 — 相手が近づこうとしているのに壁を作ってしまうことがある",
    contextReelTemplate: "境界意識: 柔軟←→明確（{score}）",
    llmDescription: "対人関係における境界線の意識の鋭さ",
    causalAffinity: ["conflict_style", "attachment_style", "direct_vs_diplomatic"],
  },
  {
    id: "boundary_respect",
    labelLeft: "境界線を柔軟に扱う",
    labelRight: "境界線を明確に守る",
    category: "safety",
    tier: "frozen",
    domain: "boundary",
    forwardTo: "boundary_awareness",
    frozenAt: "2026-04-06",
    frozenReason: "boundary_awarenessと非独立。q43を共有、ラベル類似、概念的独立性の根拠なし。",
    fallbackInsightLeft: "",
    fallbackInsightRight: "",
    contextReelTemplate: "",
    llmDescription: "",
    causalAffinity: [],
  },
  {
    id: "consent_maturity",
    labelLeft: "合意に無頓着",
    labelRight: "合意を重視",
    category: "safety",
    tier: "core",
    domain: "boundary",
    fallbackInsightLeft: "暗黙の了解で進める — 相手が本当に同意しているか確認が不足しがち",
    fallbackInsightRight: "合意を明確にする力がある — 確認しすぎて関係がぎこちなくなることがある",
    contextReelTemplate: "合意意識: 無頓着←→重視（{score}）",
    llmDescription: "対人場面で相手の同意・合意をどの程度確認するか",
    causalAffinity: ["boundary_awareness", "social_initiative", "control_tendency"],
  },
  {
    id: "pressure_risk",
    labelLeft: "圧力をかけにくい",
    labelRight: "圧力をかけやすい",
    category: "safety",
    tier: "frozen",
    domain: "boundary",
    forwardTo: "control_tendency",
    frozenAt: "2026-04-06",
    frozenReason: "control_tendencyのサブスコア化。対人支配性の表出形態として親概念に吸収。外部ラベル'圧力傾向'はsubScores.externalLabelで維持。",
    fallbackInsightLeft: "",
    fallbackInsightRight: "",
    contextReelTemplate: "",
    llmDescription: "",
    causalAffinity: [],
  },
  {
    id: "escalation_risk",
    labelLeft: "エスカレーションしにくい",
    labelRight: "エスカレーションしやすい",
    category: "safety",
    tier: "core",
    domain: "boundary",
    fallbackInsightLeft: "衝突を大きくしない力がある — 問題の深刻さを過小評価することがある",
    fallbackInsightRight: "問題が大きくなりやすい — 小さな対立を拡大させてしまう傾向がある",
    contextReelTemplate: "エスカレーション: 抑制←→拡大（{score}）",
    llmDescription: "対人関係でのトラブルが拡大しやすいかどうかの傾向",
    causalAffinity: ["control_tendency", "emotional_regulation", "conflict_style"],
  },
  {
    id: "control_tendency",
    labelLeft: "主導権を委ねる",
    labelRight: "主導権を握る",
    category: "safety",
    tier: "core",
    domain: "boundary",
    fallbackInsightLeft: "主導権を手放しても気にならない — 必要なときに主張できなくなるリスクが見えにくい",
    fallbackInsightRight: "場を仕切りたくなりやすい — 周囲からは「余裕がないとき」にそれが強まるように見えているかもしれない",
    contextReelTemplate: "コントロール: 委ねる←→握る（{score}）",
    llmDescription: "対人場面で主導権を握りたがるかどうかの傾向",
    causalAffinity: ["rejection_response_maturity", "emotional_regulation", "escalation_risk"],
    subScores: {
      general_control: {
        weight: 0.5,
        externalLabel: "コントロール全般",
        weightBasis: "theory",
        lastUpdated: "2026-04-06",
        updatePolicy: "Phase 1: 理論ベース仮置き → Phase 2: safety発火率で補正(CEO承認必須)",
      },
      pressure_risk: {
        weight: 0.3,
        externalLabel: "圧力傾向",
        weightBasis: "theory",
        lastUpdated: "2026-04-06",
        updatePolicy: "Phase 1: 理論ベース仮置き → Phase 2: safety発火率で補正(CEO承認必須)",
      },
      exclusivity_pressure: {
        weight: 0.2,
        externalLabel: "排他的傾向",
        weightBasis: "theory",
        lastUpdated: "2026-04-06",
        updatePolicy: "Phase 1: 理論ベース仮置き → Phase 2: safety発火率で補正(CEO承認必須)",
      },
    },
  },
  {
    id: "exclusivity_pressure",
    labelLeft: "排他性が低い",
    labelRight: "排他的になりやすい",
    category: "safety",
    tier: "frozen",
    domain: "boundary",
    forwardTo: "control_tendency",
    frozenAt: "2026-04-06",
    frozenReason: "control_tendencyのサブスコア化。pressure_riskの特殊形態として親概念に吸収。外部ラベル'排他的傾向'はsubScores.externalLabelで維持。",
    fallbackInsightLeft: "",
    fallbackInsightRight: "",
    contextReelTemplate: "",
    llmDescription: "",
    causalAffinity: [],
  },
  {
    id: "long_term_shift_risk",
    labelLeft: "長期的に安定",
    labelRight: "長期的に変化しやすい",
    category: "safety",
    tier: "core",
    domain: "boundary",
    fallbackInsightLeft: "長期的に安定した関係を維持できる — 変化の兆候を見逃しやすい",
    fallbackInsightRight: "関係性が時間とともに変化しやすい — 安定を求める相手を不安にさせることがある",
    contextReelTemplate: "長期変化: 安定←→変化（{score}）",
    llmDescription: "長期的な関係性における態度や行動の変化しやすさ",
    causalAffinity: ["intent_stability", "attachment_style", "change_embrace_vs_resist"],
  },

  // ═══════════════════════════════════════════════════════════
  // DOMAIN: emotional（感情・ストレス）
  // ═══════════════════════════════════════════════════════════
  {
    id: "emotional_variability",
    labelLeft: "感情が安定",
    labelRight: "感情が変動しやすい",
    category: "emotional",
    tier: "core",
    domain: "emotional",
    fallbackInsightLeft: "感情が安定しているように見えるが、動じなさすぎて周囲に「冷たい」と映ることがある",
    fallbackInsightRight: "感情の振れ幅が大きい — エネルギッシュに見えるが消耗の波も激しい",
    contextReelTemplate: "感情変動: 安定←→変動（{score}）",
    llmDescription: "日常の感情がどの程度変動しやすいかの傾向",
    causalAffinity: ["emotional_regulation", "rumination_tendency", "stress_isolation_vs_social"],
  },
  {
    id: "emotional_regulation",
    labelLeft: "感情に流される",
    labelRight: "感情を制御できる",
    category: "emotional",
    tier: "core",
    domain: "emotional",
    fallbackInsightLeft: "感情がそのまま行動に出やすい — 自分でもコントロールできない瞬間がある",
    fallbackInsightRight: "感情を適切にコントロールできる — 「抑えること」を「処理すること」と混同していないか",
    contextReelTemplate: "感情制御: 流される←→制御（{score}）",
    llmDescription: "感情の波を自覚して制御する力の程度",
    causalAffinity: ["rumination_tendency", "conflict_style", "stress_isolation_vs_social"],
  },
  {
    id: "attachment_style",
    labelLeft: "回避型愛着",
    labelRight: "安定型愛着",
    category: "emotional",
    tier: "core",
    domain: "emotional",
    fallbackInsightLeft: "親密さを避ける傾向がある — 本当は求めているのに自分から遠ざけてしまう",
    fallbackInsightRight: "安定した愛着を持てる — 相手も同じとは限らないことへの注意が必要",
    contextReelTemplate: "愛着パターン: 回避←→安定（{score}）",
    llmDescription: "親密な関係における愛着パターンの傾向",
    causalAffinity: ["intimacy_pace", "boundary_awareness", "reassurance_need"],
  },
  {
    id: "shame_vs_guilt",
    labelLeft: "行為に罪悪感",
    labelRight: "自分自身に恥",
    category: "depth",
    tier: "core",
    domain: "emotional",
    fallbackInsightLeft: "失敗を「行為の問題」として切り分けられる — 反省が浅くなることがある",
    fallbackInsightRight: "失敗したとき「自分がダメだから」と感じやすい — 行動と人格を分けにくい",
    contextReelTemplate: "自責パターン: 罪悪感←→恥（{score}）",
    llmDescription: "失敗や問題に直面した際に行為を責めるか自分自身を責めるかの傾向",
    causalAffinity: ["locus_of_control", "rumination_tendency", "attachment_style"],
  },
  {
    id: "rumination_tendency",
    labelLeft: "切り替えが早い",
    labelRight: "反芻しやすい",
    category: "depth",
    tier: "core",
    domain: "emotional",
    fallbackInsightLeft: "切り替えが早いぶん、振り返りが浅くなることがある — 同じ失敗を繰り返していないか",
    fallbackInsightRight: "一度考え始めると止まりにくい — 深く掘る力はあるが外から見えない消耗が蓄積する",
    contextReelTemplate: "反芻傾向: 切替←→反芻（{score}）",
    llmDescription: "ネガティブな出来事や判断を繰り返し考え続ける傾向の強さ",
    causalAffinity: ["emotional_regulation", "shame_vs_guilt", "energy_rhythm"],
  },

  // ═══════════════════════════════════════════════════════════
  // DOMAIN: cognitive（認知スタイル・思考）
  // ═══════════════════════════════════════════════════════════
  {
    id: "abstract_structuring",
    labelLeft: "具体的に捉える",
    labelRight: "抽象的に構造化する",
    category: "cognitive",
    tier: "expansion",
    domain: "cognitive",
    parentAxes: ["analytical_vs_intuitive"],
    fallbackInsightLeft: "具体例ベースで考える — 全体構造を見失いやすい",
    fallbackInsightRight: "抽象化して構造を掴む — 具体的な行動に落とし込むのが苦手なことがある",
    contextReelTemplate: "思考抽象度: 具体←→抽象（{score}）",
    llmDescription: "情報を具体的に捉えるか抽象的に構造化するかの認知傾向",
    causalAffinity: ["analytical_vs_intuitive", "decomposition", "exploration_closure"],
  },
  {
    id: "decomposition",
    labelLeft: "全体で捉える",
    labelRight: "分解して捉える",
    category: "cognitive",
    tier: "expansion",
    domain: "cognitive",
    parentAxes: ["analytical_vs_intuitive"],
    fallbackInsightLeft: "全体像を直感的に把握する — 細部を見落としやすい",
    fallbackInsightRight: "問題を要素に分解する力がある — 全体のつながりを見失うことがある",
    contextReelTemplate: "認知方略: 全体把握←→要素分解（{score}）",
    llmDescription: "複雑な問題に対して全体で捉えるか要素に分解するかの傾向",
    causalAffinity: ["abstract_structuring", "analytical_vs_intuitive", "plan_vs_spontaneous"],
  },
  {
    id: "cognitive_updating",
    labelLeft: "信念を維持",
    labelRight: "信念を更新しやすい",
    category: "cognitive",
    tier: "expansion",
    domain: "cognitive",
    parentAxes: ["change_embrace_vs_resist", "growth_mindset"],
    fallbackInsightLeft: "一度形成した考えを貫く — 新情報があっても修正しにくい",
    fallbackInsightRight: "新しい情報で考えを更新できる — 軸がブレやすいと見られることがある",
    contextReelTemplate: "信念更新: 維持←→柔軟（{score}）",
    llmDescription: "新しい情報や経験に基づいて既存の信念を更新する柔軟さ",
    causalAffinity: ["change_embrace_vs_resist", "growth_mindset", "exploration_closure"],
  },
  {
    id: "social_modeling",
    labelLeft: "他者の心理を読まない",
    labelRight: "他者の心理を読む",
    category: "cognitive",
    tier: "expansion",
    domain: "cognitive",
    parentAxes: ["direct_vs_diplomatic", "relationship_mode_split"],
    fallbackInsightLeft: "他者の内面に注意を向けにくい — 相手の意図を誤読することがある",
    fallbackInsightRight: "他者の内面を推測する力がある — 読みすぎて疲弊したり先回りしすぎることがある",
    contextReelTemplate: "社会認知: 表面的←→深読み（{score}）",
    llmDescription: "他者の感情・意図・動機を推測する能力の程度",
    causalAffinity: ["direct_vs_diplomatic", "relationship_mode_split", "public_private_gap"],
  },
  {
    id: "exploration_closure",
    labelLeft: "探索を続ける",
    labelRight: "早く結論を出す",
    category: "cognitive",
    tier: "expansion",
    domain: "cognitive",
    parentAxes: ["analytical_vs_intuitive", "plan_vs_spontaneous"],
    fallbackInsightLeft: "可能性を広く探る — なかなか決められず停滞することがある",
    fallbackInsightRight: "素早く結論を出す — 別の可能性を十分に検討しないことがある",
    contextReelTemplate: "認知閉鎖: 探索←→結論（{score}）",
    llmDescription: "情報収集を続けるか早期に結論を求めるかの認知的傾向",
    causalAffinity: ["analytical_vs_intuitive", "tradition_vs_novelty", "decision_tempo"],
  },
  {
    id: "novelty_threshold",
    labelLeft: "新奇性を求めない",
    labelRight: "新奇性を強く求める",
    category: "expansion",
    tier: "expansion",
    domain: "cognitive",
    parentAxes: ["change_embrace_vs_resist", "tradition_vs_novelty"],
    fallbackInsightLeft: "馴染みのあるものを好む — 新しい体験を避けて世界が狭くなりやすい",
    fallbackInsightRight: "常に新しい刺激を求める — 飽きっぽく見られたり、安定を犠牲にすることがある",
    contextReelTemplate: "新奇性欲求: 低い←→高い（{score}）",
    llmDescription: "新しい体験や刺激をどの程度積極的に求めるかの傾向",
    causalAffinity: ["change_embrace_vs_resist", "tradition_vs_novelty", "exploration_closure"],
  },

  // ═══════════════════════════════════════════════════════════
  // DOMAIN: energy（エネルギー・回復）
  // ═══════════════════════════════════════════════════════════
  {
    id: "energy_rhythm",
    labelLeft: "エネルギーが安定",
    labelRight: "エネルギーに波がある",
    category: "expansion",
    tier: "expansion",
    domain: "energy",
    parentAxes: ["stress_isolation_vs_social", "emotional_variability"],
    fallbackInsightLeft: "一定のペースを保てる — 爆発的な集中力やインスピレーションが出にくい",
    fallbackInsightRight: "波がある分ハマった時の集中力は高い — 谷間では何もできなくなる",
    contextReelTemplate: "エネルギー: 安定←→波動（{score}）",
    llmDescription: "日常のエネルギーレベルが安定しているか波があるかの傾向",
    causalAffinity: ["stress_isolation_vs_social", "plan_vs_spontaneous", "rumination_tendency"],
  },

  // ═══════════════════════════════════════════════════════════
  // DOMAIN: identity（アイデンティティ・自己認識）
  // ═══════════════════════════════════════════════════════════
  {
    id: "introvert_vs_extrovert",
    labelLeft: "内向的",
    labelRight: "外向的",
    category: "core",
    tier: "core",
    domain: "identity",
    fallbackInsightLeft: "内側の世界が豊か — エネルギー回復に一人の時間が必要",
    fallbackInsightRight: "外の世界からエネルギーを得る — 一人でいると落ち着かなくなることがある",
    contextReelTemplate: "気質: 内向←→外向（{score}）",
    llmDescription: "エネルギーの源が内側にあるか外部との交流にあるかの基本気質",
    causalAffinity: ["social_initiative", "stress_isolation_vs_social", "energy_rhythm"],
  },
  {
    id: "change_embrace_vs_resist",
    labelLeft: "変化を歓迎",
    labelRight: "変化に抵抗",
    category: "core",
    tier: "core",
    domain: "identity",
    fallbackInsightLeft: "新しい状況に飛び込める — 安定を手放しすぎて足元が不安定になることがある",
    fallbackInsightRight: "安定した環境を好む — 必要な変化にも抵抗してしまうことがある",
    contextReelTemplate: "変化への姿勢: 歓迎←→抵抗（{score}）",
    llmDescription: "環境や状況の変化に対してオープンか抵抗的かの傾向",
    causalAffinity: ["growth_mindset", "tradition_vs_novelty", "cautious_vs_bold"],
  },
  {
    id: "tradition_vs_novelty",
    labelLeft: "伝統重視",
    labelRight: "革新重視",
    category: "core",
    tier: "core",
    domain: "identity",
    fallbackInsightLeft: "実績のあるやり方を尊重する — 新しい方法を試すことへの抵抗がある",
    fallbackInsightRight: "新しいやり方を好む — 既に機能しているものを壊してしまうリスクがある",
    contextReelTemplate: "志向: 伝統←→革新（{score}）",
    llmDescription: "既存の方法・伝統を重視するか新しいアプローチを好むかの傾向",
    causalAffinity: ["change_embrace_vs_resist", "novelty_threshold", "classic_vs_trendy"],
  },
  {
    id: "public_private_gap",
    labelLeft: "表裏が少ない",
    labelRight: "表裏がある",
    category: "relational_deep",
    tier: "core",
    domain: "identity",
    fallbackInsightLeft: "表裏が少ないぶん、隠したいことまで見えてしまいやすい",
    fallbackInsightRight: "外に見せる自分と内側にズレがある — 周囲はそのギャップに気づいている",
    contextReelTemplate: "表裏ギャップ: 少ない←→大きい（{score}）",
    llmDescription: "公的な自分と私的な自分の間にどの程度のギャップがあるか",
    causalAffinity: ["direct_vs_diplomatic", "relationship_mode_split", "self_disclosure_depth"],
  },
  {
    id: "locus_of_control",
    labelLeft: "外的統制",
    labelRight: "内的統制",
    category: "depth",
    tier: "core",
    domain: "identity",
    fallbackInsightLeft: "状況や運に左右されやすいと感じる — 自分の影響力を過小評価する傾向がある",
    fallbackInsightRight: "自分の行動で結果を変えられると信じる — コントロールできないことを受け入れにくい",
    contextReelTemplate: "統制感: 外的←→内的（{score}）",
    llmDescription: "人生の出来事を自分の行動の結果と捉えるか外的要因によると捉えるか",
    causalAffinity: ["cautious_vs_bold", "growth_mindset", "shame_vs_guilt"],
  },
  {
    id: "growth_mindset",
    labelLeft: "固定的マインドセット",
    labelRight: "成長マインドセット",
    category: "depth",
    tier: "core",
    domain: "identity",
    fallbackInsightLeft: "能力は変わりにくいと感じている — 挑戦を避ける傾向がある",
    fallbackInsightRight: "努力で成長できると信じている — 限界を認めることが難しい面がある",
    contextReelTemplate: "成長観: 固定←→成長（{score}）",
    llmDescription: "能力や性格が努力で変わり得ると信じるかどうかの傾向",
    causalAffinity: ["locus_of_control", "change_embrace_vs_resist", "independence_vs_harmony"],
  },

  // ═══════════════════════════════════════════════════════════
  // DOMAIN: aesthetic（美的感覚・表現）
  // ═══════════════════════════════════════════════════════════
  {
    id: "function_vs_expression",
    labelLeft: "機能重視",
    labelRight: "表現重視",
    category: "aesthetic",
    tier: "core",
    domain: "aesthetic",
    fallbackInsightLeft: "実用性を優先する — 見た目や雰囲気への配慮が不足しがち",
    fallbackInsightRight: "見た目や表現にこだわる — 実用性を犠牲にすることがある",
    contextReelTemplate: "価値軸: 機能←→表現（{score}）",
    llmDescription: "ものや行動において機能性を優先するか表現・美を優先するか",
    causalAffinity: ["minimal_vs_maximal", "quality_vs_quantity", "perfectionist_vs_pragmatic"],
  },
  {
    id: "minimal_vs_maximal",
    labelLeft: "ミニマル",
    labelRight: "マキシマル",
    category: "aesthetic",
    tier: "core",
    domain: "aesthetic",
    fallbackInsightLeft: "少ないもので満足できる — 必要以上に削りすぎて窮屈になることがある",
    fallbackInsightRight: "多さや豊かさを好む — 整理が追いつかず混乱することがある",
    contextReelTemplate: "量的志向: ミニマル←→マキシマル（{score}）",
    llmDescription: "所有物や選択肢を最小限にしたいか豊富にしたいかの美的傾向",
    causalAffinity: ["quality_vs_quantity", "function_vs_expression", "classic_vs_trendy"],
  },
  {
    id: "perfectionist_vs_pragmatic",
    labelLeft: "完璧主義",
    labelRight: "実用主義",
    category: "aesthetic",
    tier: "core",
    domain: "aesthetic",
    fallbackInsightLeft: "仕上がりへのこだわりが強い — 「十分」のラインが見えず完成しない",
    fallbackInsightRight: "実用を優先して前に進める — 「もう少しこだわれば良くなる」を見送りがち",
    contextReelTemplate: "仕上がり基準: 完璧←→実用（{score}）",
    llmDescription: "成果物の品質基準が完璧主義的か実用主義的かの傾向",
    causalAffinity: ["quality_vs_quantity", "plan_vs_spontaneous", "efficiency_vs_process"],
  },
  {
    id: "quality_vs_quantity",
    labelLeft: "質を深く追求",
    labelRight: "量・幅を広げる",
    category: "aesthetic",
    tier: "core",
    domain: "aesthetic",
    fallbackInsightLeft: "一つを深く掘り下げる — 広い視野を持ちにくい",
    fallbackInsightRight: "多くのことを試す — 一つを深めきれない",
    contextReelTemplate: "志向: 質の深掘り←→量の拡大（{score}）",
    llmDescription: "少数を深く追求するか多くを広く試すかの傾向",
    causalAffinity: ["perfectionist_vs_pragmatic", "minimal_vs_maximal", "efficiency_vs_process"],
  },
  {
    id: "classic_vs_trendy",
    labelLeft: "クラシック",
    labelRight: "トレンド",
    category: "aesthetic",
    tier: "core",
    domain: "aesthetic",
    fallbackInsightLeft: "定番を好む — 新鮮さや時代性を取り入れにくい",
    fallbackInsightRight: "流行に敏感 — 自分の軸が揺らぎやすい面がある",
    contextReelTemplate: "スタイル: クラシック←→トレンド（{score}）",
    llmDescription: "定番・伝統的なスタイルを好むか流行・トレンドを追うかの美的傾向",
    causalAffinity: ["tradition_vs_novelty", "change_embrace_vs_resist", "novelty_threshold"],
  },
];

// ─── Registry Map（高速lookup用） ──────────────────────────

export const AXIS_REGISTRY: ReadonlyMap<TraitAxisKey, AxisRegistryEntry> =
  new Map(REGISTRY_ENTRIES.map((e) => [e.id, e]));

/**
 * frozen軸のスコアを統合先に転送する解決関数
 */
export function resolveAxisScore(
  axisId: TraitAxisKey,
  scores: Partial<Record<TraitAxisKey, number>>,
): number {
  const entry = AXIS_REGISTRY.get(axisId);
  if (entry && isFrozenAxis(entry)) {
    return scores[entry.forwardTo] ?? 0;
  }
  return scores[axisId] ?? 0;
}

/**
 * 全非frozen軸のIDリスト
 */
export function getActiveAxisKeys(): TraitAxisKey[] {
  return REGISTRY_ENTRIES
    .filter((e) => e.tier !== "frozen")
    .map((e) => e.id);
}

/**
 * 指定domainに属する非frozen軸のリスト
 */
export function getAxesByDomain(domain: AxisDomain): AxisRegistryEntry[] {
  return REGISTRY_ENTRIES.filter((e) => e.domain === domain && e.tier !== "frozen");
}

// ─── Integrity Check ───────────────────────────────────────

/**
 * traitAxes.tsの全軸がRegistryに存在するか検証（ビルド時/テスト用）
 */
export function validateRegistryCompleteness(): {
  missing: TraitAxisKey[];
  extra: string[];
} {
  const registryIds = new Set(REGISTRY_ENTRIES.map((e) => e.id));
  const traitIds = new Set<string>(TRAIT_AXIS_KEYS);

  const missing = TRAIT_AXIS_KEYS.filter((k) => !registryIds.has(k));
  const extra = REGISTRY_ENTRIES.map((e) => e.id).filter((id) => !traitIds.has(id));

  return { missing, extra };
}
