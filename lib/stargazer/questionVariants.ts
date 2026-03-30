// lib/stargazer/questionVariants.ts
// 継続観測用 — 同じ本質テーマを表現を変えて繰り返し観測する質問バリアント
// 8軸 × 3-5バリアント = 状態観測（state）+ 文脈紐づき（context_bound）+ 差分確認（delta）

import type { TraitAxisKey } from "./traitAxes";

export type ObservationLayer = "state" | "context_bound" | "delta" | "adaptive_q2";
export type ProbeContext =
  | "friends"
  | "romance"
  | "long_term"
  | "collab"
  | "cross_gender_friendship";

export interface QuestionVariant {
  id: string;
  axisId: TraitAxisKey;
  prompt: string;
  options: { id: string; label: string; score: number }[];
  layer: ObservationLayer;
  context?: ProbeContext;
}

// ═══ State Layer — 今日の状態を観測 ═══

const stateVariants: QuestionVariant[] = [
  // ── intimacy_pace ──
  {
    id: "intimacy_pace_state_v1",
    axisId: "intimacy_pace",
    prompt: "今日は人とどれくらい近くいたかった？",
    options: [
      { id: "a", label: "ほとんど一人でよかった", score: -0.8 },
      { id: "b", label: "少しだけ近くに", score: -0.3 },
      { id: "c", label: "ちょうどいい距離感だった", score: 0.0 },
      { id: "d", label: "もっと近くにいたかった", score: 0.6 },
    ],
    layer: "state",
  },
  {
    id: "intimacy_pace_state_v2",
    axisId: "intimacy_pace",
    prompt: "誰かに踏み込まれると、少し疲れそう？",
    options: [
      { id: "a", label: "かなり疲れそう", score: -0.7 },
      { id: "b", label: "少し気になるかも", score: -0.2 },
      { id: "c", label: "あまり気にならない", score: 0.3 },
      { id: "d", label: "むしろ嬉しい", score: 0.7 },
    ],
    layer: "state",
  },
  {
    id: "intimacy_pace_state_v3",
    axisId: "intimacy_pace",
    prompt: "今日は一人で整える方が自然だった？",
    options: [
      { id: "a", label: "完全にそう", score: -0.8 },
      { id: "b", label: "どちらかといえば", score: -0.3 },
      { id: "c", label: "人といても平気だった", score: 0.2 },
      { id: "d", label: "人といる方がよかった", score: 0.7 },
    ],
    layer: "state",
  },

  // ── boundary_awareness ──
  {
    id: "boundary_awareness_state_v1",
    axisId: "boundary_awareness",
    prompt: "今日、自分の空間を守りたい感覚はあった？",
    options: [
      { id: "a", label: "強くあった", score: 0.8 },
      { id: "b", label: "少しあった", score: 0.3 },
      { id: "c", label: "あまりなかった", score: -0.2 },
      { id: "d", label: "全く気にならなかった", score: -0.7 },
    ],
    layer: "state",
  },
  {
    id: "boundary_awareness_state_v2",
    axisId: "boundary_awareness",
    prompt: "人の頼みを断れそうだった？",
    options: [
      { id: "a", label: "はっきり断れた", score: 0.7 },
      { id: "b", label: "少し迷うけど断れた", score: 0.3 },
      { id: "c", label: "断りにくかった", score: -0.3 },
      { id: "d", label: "全然断れなかった", score: -0.7 },
    ],
    layer: "state",
  },
  {
    id: "boundary_awareness_state_v3",
    axisId: "boundary_awareness",
    prompt: "自分のペースを崩されそうな時、どう感じた？",
    options: [
      { id: "a", label: "すぐに違和感を感じた", score: 0.8 },
      { id: "b", label: "少し気になった", score: 0.3 },
      { id: "c", label: "特に気にならなかった", score: -0.3 },
      { id: "d", label: "合わせるのが自然だった", score: -0.7 },
    ],
    layer: "state",
  },

  // ── emotional_variability ──
  {
    id: "emotional_variability_state_v1",
    axisId: "emotional_variability",
    prompt: "今日の感情は安定していた？",
    options: [
      { id: "a", label: "とても安定", score: -0.7 },
      { id: "b", label: "まあまあ安定", score: -0.2 },
      { id: "c", label: "少し揺れがあった", score: 0.3 },
      { id: "d", label: "かなり揺れた", score: 0.8 },
    ],
    layer: "state",
  },
  {
    id: "emotional_variability_state_v2",
    axisId: "emotional_variability",
    prompt: "予想外のことに揺さぶられやすかった？",
    options: [
      { id: "a", label: "全然動じなかった", score: -0.7 },
      { id: "b", label: "少し反応した", score: -0.1 },
      { id: "c", label: "けっこう影響を受けた", score: 0.4 },
      { id: "d", label: "大きく揺さぶられた", score: 0.8 },
    ],
    layer: "state",
  },
  {
    id: "emotional_variability_state_v3",
    axisId: "emotional_variability",
    prompt: "ふとした瞬間に気分が変わることがあった？",
    options: [
      { id: "a", label: "ほとんどなかった", score: -0.6 },
      { id: "b", label: "一回くらい", score: 0.0 },
      { id: "c", label: "何度かあった", score: 0.5 },
      { id: "d", label: "頻繁にあった", score: 0.8 },
    ],
    layer: "state",
  },

  // ── stress_isolation_vs_social ──
  {
    id: "stress_social_state_v1",
    axisId: "stress_isolation_vs_social",
    prompt: "疲れた時、人に会いたいと思った？",
    options: [
      { id: "a", label: "一人がいい", score: -0.8 },
      { id: "b", label: "少し距離を置きたい", score: -0.3 },
      { id: "c", label: "話を聞いてほしい", score: 0.3 },
      { id: "d", label: "誰かと一緒にいたい", score: 0.8 },
    ],
    layer: "state",
  },
  {
    id: "stress_social_state_v2",
    axisId: "stress_isolation_vs_social",
    prompt: "一人になるのが一番の回復だった？",
    options: [
      { id: "a", label: "完全にそう", score: -0.8 },
      { id: "b", label: "どちらかといえば", score: -0.3 },
      { id: "c", label: "人といても回復できた", score: 0.3 },
      { id: "d", label: "人といる方が回復した", score: 0.7 },
    ],
    layer: "state",
  },
  {
    id: "stress_social_state_v3",
    axisId: "stress_isolation_vs_social",
    prompt: "気分転換に一番効きそうだったのは？",
    options: [
      { id: "a", label: "静かに一人で過ごすこと", score: -0.7 },
      { id: "b", label: "一人で好きなことをする", score: -0.3 },
      { id: "c", label: "気の合う人と話す", score: 0.4 },
      { id: "d", label: "賑やかな場にいく", score: 0.8 },
    ],
    layer: "state",
  },

  // ── reassurance_need ──
  {
    id: "reassurance_need_state_v1",
    axisId: "reassurance_need",
    prompt: "誰かからの確認がほしかった？",
    options: [
      { id: "a", label: "全くいらなかった", score: -0.7 },
      { id: "b", label: "あまり必要なかった", score: -0.2 },
      { id: "c", label: "少しほしかった", score: 0.3 },
      { id: "d", label: "強くほしかった", score: 0.8 },
    ],
    layer: "state",
  },
  {
    id: "reassurance_need_state_v2",
    axisId: "reassurance_need",
    prompt: "自分の判断だけで十分だと感じた？",
    options: [
      { id: "a", label: "完全に十分", score: -0.8 },
      { id: "b", label: "だいたい十分", score: -0.3 },
      { id: "c", label: "少し不安もあった", score: 0.3 },
      { id: "d", label: "誰かに確認したかった", score: 0.7 },
    ],
    layer: "state",
  },
  {
    id: "reassurance_need_state_v3",
    axisId: "reassurance_need",
    prompt: "「これで大丈夫かな」と思う瞬間はあった？",
    options: [
      { id: "a", label: "なかった", score: -0.7 },
      { id: "b", label: "少しだけ", score: -0.1 },
      { id: "c", label: "何度かあった", score: 0.4 },
      { id: "d", label: "ずっと気になっていた", score: 0.8 },
    ],
    layer: "state",
  },

  // ── independence_vs_harmony ──
  {
    id: "independence_harmony_state_v1",
    axisId: "independence_vs_harmony",
    prompt: "周囲に合わせるのが自然だった？",
    options: [
      { id: "a", label: "全く合わせなかった", score: -0.8 },
      { id: "b", label: "自分のペースが優先", score: -0.3 },
      { id: "c", label: "少し合わせた", score: 0.3 },
      { id: "d", label: "自然に合わせていた", score: 0.7 },
    ],
    layer: "state",
  },
  {
    id: "independence_harmony_state_v2",
    axisId: "independence_vs_harmony",
    prompt: "自分のペースを優先できた？",
    options: [
      { id: "a", label: "完全に優先できた", score: -0.8 },
      { id: "b", label: "ほぼ優先できた", score: -0.3 },
      { id: "c", label: "少し妥協した", score: 0.3 },
      { id: "d", label: "かなり合わせた", score: 0.7 },
    ],
    layer: "state",
  },

  // ── public_private_gap ──
  {
    id: "public_private_gap_state_v1",
    axisId: "public_private_gap",
    prompt: "今日の自分は、いつもの自分と同じだった？",
    options: [
      { id: "a", label: "完全に同じ", score: -0.7 },
      { id: "b", label: "ほぼ同じ", score: -0.2 },
      { id: "c", label: "少し違った", score: 0.3 },
      { id: "d", label: "かなり違った", score: 0.8 },
    ],
    layer: "state",
  },
  {
    id: "public_private_gap_state_v2",
    axisId: "public_private_gap",
    prompt: "表に出していない感情があった？",
    options: [
      { id: "a", label: "全くなかった", score: -0.7 },
      { id: "b", label: "少しだけ", score: -0.1 },
      { id: "c", label: "けっこうあった", score: 0.4 },
      { id: "d", label: "ほとんど隠していた", score: 0.8 },
    ],
    layer: "state",
  },
  {
    id: "public_private_gap_state_v3",
    axisId: "public_private_gap",
    prompt: "今日、「本当の自分」を出せていた？",
    options: [
      { id: "a", label: "完全に出せた", score: -0.8 },
      { id: "b", label: "ある程度は", score: -0.2 },
      { id: "c", label: "あまり出せなかった", score: 0.4 },
      { id: "d", label: "ほとんど出せなかった", score: 0.8 },
    ],
    layer: "state",
  },

  // ── emotional_regulation ──
  {
    id: "emotional_regulation_state_v1",
    axisId: "emotional_regulation",
    prompt: "感情をうまくコントロールできた？",
    options: [
      { id: "a", label: "完全にできた", score: -0.7 },
      { id: "b", label: "だいたいできた", score: -0.2 },
      { id: "c", label: "少し難しかった", score: 0.3 },
      { id: "d", label: "かなり難しかった", score: 0.8 },
    ],
    layer: "state",
  },
  {
    id: "emotional_regulation_state_v2",
    axisId: "emotional_regulation",
    prompt: "少しイライラが出てしまった？",
    options: [
      { id: "a", label: "全くなかった", score: -0.7 },
      { id: "b", label: "ほんの少し", score: -0.1 },
      { id: "c", label: "何度か出た", score: 0.4 },
      { id: "d", label: "かなり出てしまった", score: 0.8 },
    ],
    layer: "state",
  },
  {
    id: "emotional_regulation_state_v3",
    axisId: "emotional_regulation",
    prompt: "感情に振り回される感覚はあった？",
    options: [
      { id: "a", label: "全くなかった", score: -0.7 },
      { id: "b", label: "ほとんどなかった", score: -0.2 },
      { id: "c", label: "少しあった", score: 0.3 },
      { id: "d", label: "かなりあった", score: 0.8 },
    ],
    layer: "state",
  },
];

// ═══ Context-Bound Layer — 文脈紐づき観測 ═══

const contextVariants: QuestionVariant[] = [
  // ── intimacy_pace × friends ──
  {
    id: "intimacy_pace_friends_v1",
    axisId: "intimacy_pace",
    prompt: "友達相手なら、どれくらい距離を詰められる？",
    options: [
      { id: "a", label: "かなりゆっくり", score: -0.7 },
      { id: "b", label: "様子を見ながら", score: -0.2 },
      { id: "c", label: "自然に近づける", score: 0.3 },
      { id: "d", label: "すぐに打ち解ける", score: 0.7 },
    ],
    layer: "context_bound",
    context: "friends",
  },
  // ── intimacy_pace × romance ──
  {
    id: "intimacy_pace_romance_v1",
    axisId: "intimacy_pace",
    prompt: "恋愛相手なら、距離の詰め方はどう変わる？",
    options: [
      { id: "a", label: "もっと慎重になる", score: -0.7 },
      { id: "b", label: "少しゆっくりめ", score: -0.2 },
      { id: "c", label: "友達と同じくらい", score: 0.2 },
      { id: "d", label: "もっと積極的になる", score: 0.7 },
    ],
    layer: "context_bound",
    context: "romance",
  },
  // ── boundary_awareness × collab ──
  {
    id: "boundary_awareness_collab_v1",
    axisId: "boundary_awareness",
    prompt: "仕事や共同作業の相手に、境界線を引ける？",
    options: [
      { id: "a", label: "はっきり引ける", score: 0.8 },
      { id: "b", label: "状況による", score: 0.2 },
      { id: "c", label: "引きにくい", score: -0.3 },
      { id: "d", label: "ほとんど引けない", score: -0.7 },
    ],
    layer: "context_bound",
    context: "collab",
  },
  // ── stress_isolation_vs_social × romance ──
  {
    id: "stress_social_romance_v1",
    axisId: "stress_isolation_vs_social",
    prompt: "恋人がいる時、疲れた日の回復方法は変わる？",
    options: [
      { id: "a", label: "それでも一人がいい", score: -0.7 },
      { id: "b", label: "そっとそばにいてほしい", score: 0.0 },
      { id: "c", label: "話を聞いてほしい", score: 0.4 },
      { id: "d", label: "一緒にいると回復する", score: 0.7 },
    ],
    layer: "context_bound",
    context: "romance",
  },
  // ── reassurance_need × long_term ──
  {
    id: "reassurance_need_longterm_v1",
    axisId: "reassurance_need",
    prompt: "長期的な関係で、相手からの確認はどれくらい必要？",
    options: [
      { id: "a", label: "ほとんどいらない", score: -0.7 },
      { id: "b", label: "たまにあれば十分", score: -0.2 },
      { id: "c", label: "定期的にほしい", score: 0.3 },
      { id: "d", label: "頻繁にほしい", score: 0.7 },
    ],
    layer: "context_bound",
    context: "long_term",
  },
  // ── independence_vs_harmony × friends ──
  {
    id: "independence_harmony_friends_v1",
    axisId: "independence_vs_harmony",
    prompt: "友達グループでは、自分のペースを優先する？",
    options: [
      { id: "a", label: "完全に自分のペース", score: -0.8 },
      { id: "b", label: "基本は自分ペース", score: -0.3 },
      { id: "c", label: "グループに合わせがち", score: 0.3 },
      { id: "d", label: "みんなに合わせる", score: 0.7 },
    ],
    layer: "context_bound",
    context: "friends",
  },
  // ── public_private_gap × cross_gender_friendship ──
  {
    id: "public_private_cross_gender_v1",
    axisId: "public_private_gap",
    prompt: "異性の友人の前では、普段と違う自分になる？",
    options: [
      { id: "a", label: "全く変わらない", score: -0.7 },
      { id: "b", label: "ほぼ同じ", score: -0.2 },
      { id: "c", label: "少し変わる", score: 0.3 },
      { id: "d", label: "かなり変わる", score: 0.8 },
    ],
    layer: "context_bound",
    context: "cross_gender_friendship",
  },
  // ── emotional_regulation × collab ──
  {
    id: "emotional_regulation_collab_v1",
    axisId: "emotional_regulation",
    prompt: "仕事の場面で、感情を抑えるのは得意？",
    options: [
      { id: "a", label: "とても得意", score: -0.7 },
      { id: "b", label: "だいたいできる", score: -0.2 },
      { id: "c", label: "少し苦手", score: 0.3 },
      { id: "d", label: "かなり苦手", score: 0.8 },
    ],
    layer: "context_bound",
    context: "collab",
  },
];

// ═══ All variants merged ═══

export const ALL_QUESTION_VARIANTS: QuestionVariant[] = [
  ...stateVariants,
  ...contextVariants,
];

/** 指定レイヤーのバリアントを取得 */
export function getVariantsByLayer(layer: ObservationLayer): QuestionVariant[] {
  return ALL_QUESTION_VARIANTS.filter((v) => v.layer === layer);
}

/** 指定軸のバリアントを取得 */
export function getVariantsByAxis(axisId: TraitAxisKey): QuestionVariant[] {
  return ALL_QUESTION_VARIANTS.filter((v) => v.axisId === axisId);
}

/** State層のバリアントIDリスト（軸→ID[]） */
export function getStateVariantIdsByAxis(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const v of stateVariants) {
    if (!map[v.axisId]) map[v.axisId] = [];
    map[v.axisId].push(v.id);
  }
  return map;
}

/** 対象軸一覧 (継続観測で使用する軸) */
export const CONTINUOUS_OBSERVATION_AXES: TraitAxisKey[] = [
  "intimacy_pace",
  "boundary_awareness",
  "emotional_variability",
  "stress_isolation_vs_social",
  "reassurance_need",
  "independence_vs_harmony",
  "public_private_gap",
  "emotional_regulation",
];
