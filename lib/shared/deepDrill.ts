// lib/shared/deepDrill.ts
// 深掘りテンプレートエンジン — 回答後に「なぜ？」を掘る汎用エンジン
// HOMEロボ + Stargazer ObserveTab 両方で使える

import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

/* ═══════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════ */

export type DrillStep = "reason" | "cause" | "specific" | "desire";

export interface DrillOption {
  id: string;
  text: string;
  /** Stargazer 軸への微調整ヒント (任意) */
  axisHint?: { axis: TraitAxisKey; delta: number };
}

export interface DrillQuestion {
  step: DrillStep;
  prompt: string;
  options: DrillOption[];
}

export interface DrillAnswer {
  step: DrillStep;
  selectedId: string;
  text: string;
}

export interface DrillResult {
  originalAnswer: string;
  category: string;
  drillAnswers: DrillAnswer[];
}

/* ═══════════════════════════════════════════════
   Drill Step Labels (UI用)
   ═══════════════════════════════════════════════ */

export const DRILL_STEP_LABELS: Record<DrillStep, string> = {
  reason: "なぜ？",
  cause: "きっかけ",
  specific: "具体的に",
  desire: "本音",
};

/* ═══════════════════════════════════════════════
   Answer Tendency
   ═══════════════════════════════════════════════ */

export type AnswerTendency = "positive" | "neutral" | "negative";

export function classifyTendency(value: number): AnswerTendency {
  if (value >= 4) return "positive";
  if (value <= 2) return "negative";
  return "neutral";
}

/**
 * 回答傾向からドリル深度を決定
 * - positive → 2段 (reason + desire: 再現条件探索)
 * - negative → 4段 (reason + cause + specific + desire: 原因深掘り)
 * - neutral → 2段 (reason + specific: 角度変更)
 */
export function determineDrillDepth(tendency: AnswerTendency): number {
  switch (tendency) {
    case "positive": return 2;
    case "negative": return 4;
    case "neutral": return 2;
  }
}

/**
 * 傾向別のドリルステップ順序
 * positive: reason → desire (再現条件)
 * negative: reason → cause → specific → desire (原因深掘り)
 * neutral: reason → specific (角度変更)
 */
export function getDrillStepsForTendency(tendency: AnswerTendency): DrillStep[] {
  switch (tendency) {
    case "positive": return ["reason", "desire"];
    case "negative": return ["reason", "cause", "specific", "desire"];
    case "neutral": return ["reason", "specific"];
  }
}

/**
 * 傾向別のドリルプロンプト (通常とは異なる文脈を提供)
 */
const BRANCH_PROMPTS: Record<AnswerTendency, Record<DrillStep, string>> = {
  positive: {
    reason: "何がうまくいった？",
    cause: "きっかけは何だった？",
    specific: "どんな場面で特にそう感じた？",
    desire: "この感覚を再現するには？",
  },
  negative: {
    reason: "何が一番引っかかった？",
    cause: "そのきっかけは何だった？",
    specific: "具体的にはどの瞬間？",
    desire: "本当はどうしたかった？",
  },
  neutral: {
    reason: "どうしてそう思った？",
    cause: "何かきっかけはあった？",
    specific: "もう少し具体的に言うと？",
    desire: "理想の状態はどんな感じ？",
  },
};

/* ═══════════════════════════════════════════════
   Drill Templates — カテゴリ×傾向別
   ═══════════════════════════════════════════════ */

interface DrillTemplate {
  reason: DrillOption[];
  cause: DrillOption[];
  specific: DrillOption[];
  desire: DrillOption[];
}

// ── 対人カテゴリ (partner) ──

const PARTNER_POSITIVE: DrillTemplate = {
  reason: [
    { id: "pr_pp_1", text: "相手のペースが心地よかった" },
    { id: "pr_pp_2", text: "自分の考えをちゃんと伝えられた" },
    { id: "pr_pp_3", text: "適度な距離感が保てた" },
    { id: "pr_pp_4", text: "なんとなく安心感があった" },
  ],
  cause: [
    { id: "pc_pp_1", text: "相手が話を聞いてくれた" },
    { id: "pc_pp_2", text: "自分から話題を出せた" },
    { id: "pc_pp_3", text: "沈黙が苦にならなかった" },
    { id: "pc_pp_4", text: "共通の話題があった" },
  ],
  specific: [
    { id: "ps_pp_1", text: "食事や移動中の会話で" },
    { id: "ps_pp_2", text: "仕事や作業の中で" },
    { id: "ps_pp_3", text: "LINEやメッセージで" },
    { id: "ps_pp_4", text: "ただ一緒にいる時間で" },
  ],
  desire: [
    { id: "pd_pp_1", text: "もっと会う頻度を増やしたい" },
    { id: "pd_pp_2", text: "今のペースがちょうどいい" },
    { id: "pd_pp_3", text: "もう少し深い話がしたい" },
    { id: "pd_pp_4", text: "この関係を大切にしたい" },
  ],
};

const PARTNER_NEGATIVE: DrillTemplate = {
  reason: [
    { id: "pr_pn_1", text: "距離感が合わなかった", axisHint: { axis: "boundary_awareness", delta: -0.1 } },
    { id: "pr_pn_2", text: "言いたいことが言えなかった", axisHint: { axis: "direct_vs_diplomatic", delta: 0.1 } },
    { id: "pr_pn_3", text: "相手のペースに巻き込まれた", axisHint: { axis: "independence_vs_harmony", delta: 0.1 } },
    { id: "pr_pn_4", text: "気を遣いすぎて疲れた", axisHint: { axis: "reassurance_need", delta: 0.1 } },
  ],
  cause: [
    { id: "pc_pn_1", text: "価値観のズレを感じた" },
    { id: "pc_pn_2", text: "コミュニケーションのタイミングが合わなかった" },
    { id: "pc_pn_3", text: "期待と現実のギャップ" },
    { id: "pc_pn_4", text: "自分のコンディションが悪かった" },
  ],
  specific: [
    { id: "ps_pn_1", text: "会話の中で" },
    { id: "ps_pn_2", text: "約束や予定について" },
    { id: "ps_pn_3", text: "態度や反応を見て" },
    { id: "ps_pn_4", text: "後から振り返って" },
  ],
  desire: [
    { id: "pd_pn_1", text: "少し距離を置きたい" },
    { id: "pd_pn_2", text: "正直に伝えたい" },
    { id: "pd_pn_3", text: "自分のペースを守りたい" },
    { id: "pd_pn_4", text: "様子を見たい" },
  ],
};

const PARTNER_NEUTRAL: DrillTemplate = {
  reason: [
    { id: "pr_pm_1", text: "特に印象に残ることがなかった" },
    { id: "pr_pm_2", text: "いつも通りだった" },
    { id: "pr_pm_3", text: "良くも悪くもなかった" },
    { id: "pr_pm_4", text: "あまり考えなかった" },
  ],
  cause: [
    { id: "pc_pm_1", text: "日常的なやり取りだった" },
    { id: "pc_pm_2", text: "短い接触だった" },
    { id: "pc_pm_3", text: "他のことに意識が向いていた" },
    { id: "pc_pm_4", text: "特にきっかけはない" },
  ],
  specific: [
    { id: "ps_pm_1", text: "挨拶程度の会話で" },
    { id: "ps_pm_2", text: "仕事上の連絡で" },
    { id: "ps_pm_3", text: "一緒に移動している時に" },
    { id: "ps_pm_4", text: "すれ違い程度で" },
  ],
  desire: [
    { id: "pd_pm_1", text: "もう少し関わりたい" },
    { id: "pd_pm_2", text: "現状維持でいい" },
    { id: "pd_pm_3", text: "関係を見直したい" },
    { id: "pd_pm_4", text: "まだわからない" },
  ],
};

// ── コーデカテゴリ (outfit) ──

const OUTFIT_POSITIVE: DrillTemplate = {
  reason: [
    { id: "or_pp_1", text: "自分らしさが出ていた", axisHint: { axis: "function_vs_expression", delta: 0.1 } },
    { id: "or_pp_2", text: "場の雰囲気に合っていた" },
    { id: "or_pp_3", text: "着心地が良かった", axisHint: { axis: "function_vs_expression", delta: -0.1 } },
    { id: "or_pp_4", text: "誰かに褒められた" },
  ],
  cause: [
    { id: "oc_pp_1", text: "事前に考えて選んだ" },
    { id: "oc_pp_2", text: "直感で選んだ" },
    { id: "oc_pp_3", text: "天気や予定に合わせた" },
    { id: "oc_pp_4", text: "お気に入りのアイテムを使った" },
  ],
  specific: [
    { id: "os_pp_1", text: "色の組合せが良かった" },
    { id: "os_pp_2", text: "シルエットが決まった" },
    { id: "os_pp_3", text: "アクセサリーがポイントになった" },
    { id: "os_pp_4", text: "全体のバランスが良かった" },
  ],
  desire: [
    { id: "od_pp_1", text: "この方向性を続けたい" },
    { id: "od_pp_2", text: "もう少し冒険したい" },
    { id: "od_pp_3", text: "似たコーデのバリエーションを増やしたい" },
    { id: "od_pp_4", text: "この成功パターンを記録したい" },
  ],
};

const OUTFIT_NEGATIVE: DrillTemplate = {
  reason: [
    { id: "or_pn_1", text: "自分らしくなかった" },
    { id: "or_pn_2", text: "場の雰囲気と合わなかった" },
    { id: "or_pn_3", text: "着心地が悪かった" },
    { id: "or_pn_4", text: "なんとなく落ち着かなかった" },
  ],
  cause: [
    { id: "oc_pn_1", text: "急いで選んだ" },
    { id: "oc_pn_2", text: "着たいものがなかった" },
    { id: "oc_pn_3", text: "天気を読み間違えた" },
    { id: "oc_pn_4", text: "最近マンネリ気味" },
  ],
  specific: [
    { id: "os_pn_1", text: "色が暗すぎた/派手すぎた" },
    { id: "os_pn_2", text: "サイズ感が合わなかった" },
    { id: "os_pn_3", text: "素材が季節に合わなかった" },
    { id: "os_pn_4", text: "全体のまとまりがなかった" },
  ],
  desire: [
    { id: "od_pn_1", text: "新しいアイテムが欲しい" },
    { id: "od_pn_2", text: "コーデの引き出しを増やしたい" },
    { id: "od_pn_3", text: "自分のスタイルを見直したい" },
    { id: "od_pn_4", text: "楽なコーデに逃げたい" },
  ],
};

const OUTFIT_NEUTRAL: DrillTemplate = {
  reason: [
    { id: "or_pm_1", text: "可もなく不可もなく" },
    { id: "or_pm_2", text: "いつも通りだった" },
    { id: "or_pm_3", text: "あまり意識しなかった" },
    { id: "or_pm_4", text: "他のことに頭が向いていた" },
  ],
  cause: [
    { id: "oc_pm_1", text: "ルーティンで選んだ" },
    { id: "oc_pm_2", text: "考える余裕がなかった" },
    { id: "oc_pm_3", text: "無難なものを選んだ" },
    { id: "oc_pm_4", text: "特にこだわりがなかった" },
  ],
  specific: [
    { id: "os_pm_1", text: "仕事着だったから" },
    { id: "os_pm_2", text: "人に会わなかったから" },
    { id: "os_pm_3", text: "家にいたから" },
    { id: "os_pm_4", text: "楽さ優先だったから" },
  ],
  desire: [
    { id: "od_pm_1", text: "たまには気合を入れたい" },
    { id: "od_pm_2", text: "楽でいたい" },
    { id: "od_pm_3", text: "誰かにコーデを提案してほしい" },
    { id: "od_pm_4", text: "特になし" },
  ],
};

// ── 印象/自己表現カテゴリ (impression) ──

const IMPRESSION_POSITIVE: DrillTemplate = {
  reason: [
    { id: "ir_pp_1", text: "自分の考えを表現できた", axisHint: { axis: "public_private_gap", delta: -0.1 } },
    { id: "ir_pp_2", text: "周りの反応が良かった" },
    { id: "ir_pp_3", text: "自然体でいられた", axisHint: { axis: "emotional_regulation", delta: 0.05 } },
    { id: "ir_pp_4", text: "新しい一面を見せられた" },
  ],
  cause: [
    { id: "ic_pp_1", text: "自信がある状態だった" },
    { id: "ic_pp_2", text: "安心できる場だった" },
    { id: "ic_pp_3", text: "準備ができていた" },
    { id: "ic_pp_4", text: "相手との相性が良かった" },
  ],
  specific: [
    { id: "is_pp_1", text: "発言や態度で" },
    { id: "is_pp_2", text: "外見・見た目で" },
    { id: "is_pp_3", text: "仕事のパフォーマンスで" },
    { id: "is_pp_4", text: "SNSやメッセージで" },
  ],
  desire: [
    { id: "id_pp_1", text: "この調子を維持したい" },
    { id: "id_pp_2", text: "もっと挑戦したい" },
    { id: "id_pp_3", text: "この自分を覚えておきたい" },
    { id: "id_pp_4", text: "特に何もしなくていい" },
  ],
};

const IMPRESSION_NEGATIVE: DrillTemplate = {
  reason: [
    { id: "ir_pn_1", text: "本当の自分と違う印象を与えた", axisHint: { axis: "public_private_gap", delta: 0.15 } },
    { id: "ir_pn_2", text: "うまく自分を出せなかった" },
    { id: "ir_pn_3", text: "周りの反応が気になった", axisHint: { axis: "reassurance_need", delta: 0.1 } },
    { id: "ir_pn_4", text: "無理をしていた" },
  ],
  cause: [
    { id: "ic_pn_1", text: "緊張していた" },
    { id: "ic_pn_2", text: "場の空気に合わせすぎた" },
    { id: "ic_pn_3", text: "自信がない状態だった" },
    { id: "ic_pn_4", text: "比較して落ち込んだ" },
  ],
  specific: [
    { id: "is_pn_1", text: "会話の中で" },
    { id: "is_pn_2", text: "見た目や服装で" },
    { id: "is_pn_3", text: "仕事の場面で" },
    { id: "is_pn_4", text: "写真や動画を見て" },
  ],
  desire: [
    { id: "id_pn_1", text: "もっと自然体でいたい" },
    { id: "id_pn_2", text: "気にしすぎないようにしたい" },
    { id: "id_pn_3", text: "自分を変えたい" },
    { id: "id_pn_4", text: "しばらく静かにしたい" },
  ],
};

const IMPRESSION_NEUTRAL: DrillTemplate = {
  reason: [
    { id: "ir_pm_1", text: "特に印象的なことがなかった" },
    { id: "ir_pm_2", text: "いつも通りだった" },
    { id: "ir_pm_3", text: "自分の印象を意識しなかった" },
    { id: "ir_pm_4", text: "人と接する機会が少なかった" },
  ],
  cause: [
    { id: "ic_pm_1", text: "淡々とした一日だった" },
    { id: "ic_pm_2", text: "自分のことより他のことに集中" },
    { id: "ic_pm_3", text: "ルーティンの一日" },
    { id: "ic_pm_4", text: "特にきっかけなし" },
  ],
  specific: [
    { id: "is_pm_1", text: "家で過ごしていた" },
    { id: "is_pm_2", text: "移動中" },
    { id: "is_pm_3", text: "作業に集中していた" },
    { id: "is_pm_4", text: "特になし" },
  ],
  desire: [
    { id: "id_pm_1", text: "もう少し意識してみたい" },
    { id: "id_pm_2", text: "このままでいい" },
    { id: "id_pm_3", text: "自分の印象を知りたい" },
    { id: "id_pm_4", text: "特になし" },
  ],
};

// ── 対人カテゴリ・ソロ日 (partner_solo) ──

const PARTNER_SOLO_POSITIVE: DrillTemplate = {
  reason: [
    { id: "psr_pp_1", text: "特定の人のことを考えていた" },
    { id: "psr_pp_2", text: "良い思い出が浮かんだ" },
    { id: "psr_pp_3", text: "つながりを感じた" },
    { id: "psr_pp_4", text: "会いたい気持ちがあった" },
  ],
  cause: [
    { id: "psc_pp_1", text: "SNSで相手の投稿を見た" },
    { id: "psc_pp_2", text: "共通の話題を思い出した" },
    { id: "psc_pp_3", text: "場所や音楽がきっかけだった" },
    { id: "psc_pp_4", text: "なんとなく浮かんだ" },
  ],
  specific: [
    { id: "pss_pp_1", text: "移動中にふと思い出した" },
    { id: "pss_pp_2", text: "何かを共有したいと感じた" },
    { id: "pss_pp_3", text: "一人でいるのに相手を感じた" },
    { id: "pss_pp_4", text: "懐かしさが湧いた" },
  ],
  desire: [
    { id: "psd_pp_1", text: "連絡してみたい" },
    { id: "psd_pp_2", text: "今はこの気持ちを味わっていたい" },
    { id: "psd_pp_3", text: "次に会う時に伝えたい" },
    { id: "psd_pp_4", text: "特に何もしなくていい" },
  ],
};

const PARTNER_SOLO_NEGATIVE: DrillTemplate = {
  reason: [
    { id: "psr_pn_1", text: "人との関わりが必要なかった" },
    { id: "psr_pn_2", text: "一人でいることが自然だった" },
    { id: "psr_pn_3", text: "特に理由はない" },
    { id: "psr_pn_4", text: "人のことを考える余裕がなかった" },
  ],
  cause: [
    { id: "psc_pn_1", text: "自分のことに集中していた" },
    { id: "psc_pn_2", text: "疲れていて外を向く気力がなかった" },
    { id: "psc_pn_3", text: "一人の時間が心地よかった" },
    { id: "psc_pn_4", text: "特にきっかけもなかった" },
  ],
  specific: [
    { id: "pss_pn_1", text: "ずっと自分のペースで過ごせた" },
    { id: "pss_pn_2", text: "人の存在を意識しない一日だった" },
    { id: "pss_pn_3", text: "やるべきことに没頭していた" },
    { id: "pss_pn_4", text: "静かに過ごしていた" },
  ],
  desire: [
    { id: "psd_pn_1", text: "このままでいい" },
    { id: "psd_pn_2", text: "一人の時間をもっと充実させたい" },
    { id: "psd_pn_3", text: "明日は誰かと話してもいいかも" },
    { id: "psd_pn_4", text: "特に何も思わない" },
  ],
};

const PARTNER_SOLO_NEUTRAL: DrillTemplate = {
  reason: [
    { id: "psr_pm_1", text: "ぼんやり過ごしていた" },
    { id: "psr_pm_2", text: "別のことに集中していた" },
    { id: "psr_pm_3", text: "特に意識していなかった" },
    { id: "psr_pm_4", text: "人のことを考える場面がなかった" },
  ],
  cause: [
    { id: "psc_pm_1", text: "ルーティンの一日だった" },
    { id: "psc_pm_2", text: "家にいたから外の世界が遠かった" },
    { id: "psc_pm_3", text: "情報量が少ない一日だった" },
    { id: "psc_pm_4", text: "特にきっかけがなかった" },
  ],
  specific: [
    { id: "pss_pm_1", text: "淡々と過ごしていた" },
    { id: "pss_pm_2", text: "何か作業をしていた" },
    { id: "pss_pm_3", text: "リラックスしていた" },
    { id: "pss_pm_4", text: "あまり記憶がない" },
  ],
  desire: [
    { id: "psd_pm_1", text: "もう少し人と関わってもいいかも" },
    { id: "psd_pm_2", text: "この静けさを続けたい" },
    { id: "psd_pm_3", text: "どちらでもいい" },
    { id: "psd_pm_4", text: "まだわからない" },
  ],
};

// ── ケア (care) / 準備 (preparation) — 深掘りは軽め ──

const CARE_GENERIC: DrillTemplate = {
  reason: [
    { id: "cr_1", text: "汚れや匂いが気になった" },
    { id: "cr_2", text: "定期的にやるべきだった" },
    { id: "cr_3", text: "天気が良かったから" },
    { id: "cr_4", text: "着る服がなくなりそう" },
  ],
  cause: [
    { id: "cc_1", text: "前回から時間が空いた" },
    { id: "cc_2", text: "予定があるから準備" },
    { id: "cc_3", text: "気になるアイテムがあった" },
    { id: "cc_4", text: "なんとなく" },
  ],
  specific: [
    { id: "cs_1", text: "デリケート素材の手入れ" },
    { id: "cs_2", text: "普段着のまとめ洗い" },
    { id: "cs_3", text: "アウター/コートの手入れ" },
    { id: "cs_4", text: "靴やバッグの手入れ" },
  ],
  desire: [
    { id: "cd_1", text: "もっとこまめにケアしたい" },
    { id: "cd_2", text: "効率的にやりたい" },
    { id: "cd_3", text: "今のペースでいい" },
    { id: "cd_4", text: "誰かに任せたい" },
  ],
};

const PREPARATION_GENERIC: DrillTemplate = {
  reason: [
    { id: "xr_1", text: "大事な予定がある" },
    { id: "xr_2", text: "初めての場所/人に会う" },
    { id: "xr_3", text: "いつもと違う場面" },
    { id: "xr_4", text: "なんとなく気合を入れたい" },
  ],
  cause: [
    { id: "xc_1", text: "カレンダーを見て気づいた" },
    { id: "xc_2", text: "誰かに誘われた" },
    { id: "xc_3", text: "天気予報を見て" },
    { id: "xc_4", text: "前日の夜に急に思い出した" },
  ],
  specific: [
    { id: "xs_1", text: "仕事の打ち合わせ" },
    { id: "xs_2", text: "友達との食事" },
    { id: "xs_3", text: "デートや特別な予定" },
    { id: "xs_4", text: "日常の外出" },
  ],
  desire: [
    { id: "xd_1", text: "しっかり準備したい" },
    { id: "xd_2", text: "楽に済ませたい" },
    { id: "xd_3", text: "新しい組合せを試したい" },
    { id: "xd_4", text: "安定のコーデでいきたい" },
  ],
};

/* ═══════════════════════════════════════════════
   Template Registry
   ═══════════════════════════════════════════════ */

type CategoryKey = "partner" | "partner_solo" | "outfit" | "impression" | "care" | "preparation";

const DRILL_TEMPLATES: Record<`${CategoryKey}_${AnswerTendency}`, DrillTemplate> = {
  partner_positive: PARTNER_POSITIVE,
  partner_neutral: PARTNER_NEUTRAL,
  partner_negative: PARTNER_NEGATIVE,
  partner_solo_positive: PARTNER_SOLO_POSITIVE,
  partner_solo_neutral: PARTNER_SOLO_NEUTRAL,
  partner_solo_negative: PARTNER_SOLO_NEGATIVE,
  outfit_positive: OUTFIT_POSITIVE,
  outfit_neutral: OUTFIT_NEUTRAL,
  outfit_negative: OUTFIT_NEGATIVE,
  impression_positive: IMPRESSION_POSITIVE,
  impression_neutral: IMPRESSION_NEUTRAL,
  impression_negative: IMPRESSION_NEGATIVE,
  // care/preparation は傾向問わず同じテンプレート
  care_positive: CARE_GENERIC,
  care_neutral: CARE_GENERIC,
  care_negative: CARE_GENERIC,
  preparation_positive: PREPARATION_GENERIC,
  preparation_neutral: PREPARATION_GENERIC,
  preparation_negative: PREPARATION_GENERIC,
};

/* ═══════════════════════════════════════════════
   Public API
   ═══════════════════════════════════════════════ */

/**
 * カテゴリと回答傾向から深掘り質問を取得
 * @param maxSteps 出す深掘りステップ数 (default 1 = reason のみ)
 * @param useBranchPrompts 傾向別プロンプトを使用するか (default false)
 */
/** カテゴリ別の「角度変更」プロンプト — 何についての角度変更かを明示 */
const CATEGORY_SPECIFIC_PROMPTS: Record<string, Partial<Record<DrillStep, string>>> = {
  partner: {
    reason: "その人との時間、何が大きかった？",
    specific: "その人との関係を、別の視点から見ると？",
  },
  partner_solo: {
    reason: "一人の時間、なぜそう感じた？",
    specific: "一人の時間を、別の角度から見ると？",
  },
  outfit: { specific: "見た目以外の角度から振り返ると？" },
  impression: { specific: "他の人の視点から見ると、どうだった？" },
  care: { specific: "日常の中で、別の角度で気づいたことは？" },
  preparation: { specific: "準備について、違う切り口で考えると？" },
};

export function getDrillQuestions(
  category: string,
  answerTendency: AnswerTendency,
  maxSteps: number = 1,
  useBranchPrompts: boolean = false,
): DrillQuestion[] {
  const key = `${category}_${answerTendency}` as keyof typeof DRILL_TEMPLATES;
  const template = DRILL_TEMPLATES[key];
  if (!template) return [];

  const basePrompts = useBranchPrompts
    ? BRANCH_PROMPTS[answerTendency]
    : {
        reason: "なぜそう感じた？",
        cause: "きっかけは？",
        specific: "具体的にどんな場面で？",
        desire: "本当はどうしたい？",
      };

  // カテゴリ固有のプロンプトで上書き（「違う角度から見ると？」が文脈付きになる）
  const categoryOverrides = CATEGORY_SPECIFIC_PROMPTS[category] ?? {};
  const prompts = { ...basePrompts, ...categoryOverrides };

  // 傾向別ステップ順序を使用
  const steps = useBranchPrompts
    ? getDrillStepsForTendency(answerTendency).slice(0, maxSteps)
    : (["reason", "cause", "specific", "desire"] as DrillStep[]).slice(0, maxSteps);

  return steps.map((step) => ({
    step,
    prompt: prompts[step],
    options: template[step],
  }));
}

/**
 * 深掘り結果をまとめる
 */
export function compileDrillResult(
  originalAnswer: string,
  category: string,
  drillAnswers: { step: DrillStep; selectedId: string }[]
): DrillResult {
  const result: DrillResult = {
    originalAnswer,
    category,
    drillAnswers: drillAnswers.map((a) => {
      // テンプレートからテキストを逆引き
      const templates = Object.values(DRILL_TEMPLATES);
      let text = "";
      for (const tmpl of templates) {
        const stepOptions = tmpl[a.step];
        const found = stepOptions.find((o) => o.id === a.selectedId);
        if (found) { text = found.text; break; }
      }
      return { ...a, text };
    }),
  };
  return result;
}

/**
 * 深掘り結果から軸ヒントを抽出
 */
export function extractAxisHints(
  drillAnswers: { step: DrillStep; selectedId: string }[]
): { axis: TraitAxisKey; delta: number }[] {
  const hints: { axis: TraitAxisKey; delta: number }[] = [];
  const allTemplates = Object.values(DRILL_TEMPLATES);

  for (const answer of drillAnswers) {
    for (const tmpl of allTemplates) {
      const stepOptions = tmpl[answer.step];
      const found = stepOptions.find((o) => o.id === answer.selectedId);
      if (found?.axisHint) {
        hints.push(found.axisHint);
        break;
      }
    }
  }

  return hints;
}
