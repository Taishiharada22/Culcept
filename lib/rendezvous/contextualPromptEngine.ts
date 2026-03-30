/**
 * Contextual Prompt Engine
 * 会話停滞検出 + reasonCodes/cautionCodes ベースの文脈対応会話シード
 */

import type { ReasonCode, CautionCode, RendezvousCategory } from "./types";

export type ContextualPrompt = {
  text: string;
  subtext: string;
  tone: "light" | "exploratory" | "reflective";
};

type PromptContext = {
  category: RendezvousCategory;
  reasonCodes: ReasonCode[];
  cautionCodes: CautionCode[];
  messageCount: number;
  minutesSinceLastMessage: number;
};

// Caution-based prompts: address potential friction points gently
const CAUTION_PROMPTS: Partial<Record<CautionCode, ContextualPrompt>> = {
  silence_interpretation_gap: {
    text: "沈黙って、あなたにとってどんな意味がありますか？",
    subtext: "沈黙の捉え方が人それぞれ違うことを、軽く共有できるかも",
    tone: "exploratory",
  },
  distance_need_gap: {
    text: "一人の時間って、どのくらい大切ですか？",
    subtext: "距離感の好みを自然に知れるきっかけになります",
    tone: "light",
  },
  depth_progression_gap: {
    text: "最近ハマっていることはありますか？",
    subtext: "軽い話題から自然に深まっていけます",
    tone: "light",
  },
  initiative_gap: {
    text: "予定を立てるとき、あなたはどっち派？ 提案する方？乗る方？",
    subtext: "主導性のバランスを自然に探れます",
    tone: "light",
  },
  emotional_expression_gap: {
    text: "嬉しい時、どうやって表現しますか？",
    subtext: "感情表現のスタイルの違いを知るきっかけに",
    tone: "exploratory",
  },
  conflict_style_gap: {
    text: "意見が合わない時、あなたはどう向き合いますか？",
    subtext: "対話のスタイルを知ることで安心感が生まれます",
    tone: "reflective",
  },
  rhythm_gap: {
    text: "朝型？夜型？ 一日の中で一番エネルギーがある時間帯は？",
    subtext: "生活リズムを知ると、連絡のタイミングも自然になります",
    tone: "light",
  },
};

// Reason-based prompts: deepen existing connection points
const REASON_PROMPTS: Partial<Record<ReasonCode, ContextualPrompt>> = {
  conversation_pace_close: {
    text: "お互いの会話のリズム、心地いいですか？",
    subtext: "会話のペースが近いことをお互い確認できます",
    tone: "reflective",
  },
  complementary_roles: {
    text: "得意なことと苦手なこと、一つずつ教えてください",
    subtext: "補い合える部分を発見できるかもしれません",
    tone: "exploratory",
  },
  creative_role_fit: {
    text: "もし一緒に何かを作るなら、何を作ってみたいですか？",
    subtext: "共創の可能性を探る楽しい質問です",
    tone: "exploratory",
  },
  stable_connection_potential: {
    text: "安心できる関係って、あなたにとってどんなものですか？",
    subtext: "関係性の深い部分に自然に触れられます",
    tone: "reflective",
  },
  light_connection_potential: {
    text: "最近笑ったこと、何かありますか？",
    subtext: "軽やかな話題で自然体の時間を",
    tone: "light",
  },
};

// Generic category-based fallback prompts
const CATEGORY_FALLBACKS: Record<RendezvousCategory, ContextualPrompt[]> = {
  romantic: [
    { text: "最近、心が動いた瞬間はありましたか？", subtext: "感性を共有するきっかけに", tone: "exploratory" },
    { text: "理想の休日の過ごし方を教えてください", subtext: "ライフスタイルを知る第一歩", tone: "light" },
  ],
  friendship: [
    { text: "最近面白かったもの、なんでもいいので教えてください", subtext: "興味の重なりを発見できるかも", tone: "light" },
    { text: "友達との間で大切にしていることはありますか？", subtext: "価値観を自然に共有できます", tone: "reflective" },
  ],
  cocreation: [
    { text: "今一番興味があるプロジェクトや活動は？", subtext: "共創の種を見つけましょう", tone: "exploratory" },
    { text: "もし制約がなかったら、何に挑戦してみたいですか？", subtext: "ビジョンを共有するきっかけに", tone: "exploratory" },
  ],
  community: [
    { text: "最近参加して良かったイベントやコミュニティはありますか？", subtext: "共通の場所が見つかるかも", tone: "light" },
    { text: "どんな場所やコミュニティに居心地の良さを感じますか？", subtext: "価値観の重なりを探れます", tone: "reflective" },
  ],
  partner: [
    { text: "人生で一番大切にしていることは何ですか？", subtext: "価値観の根っこを共有するきっかけに", tone: "reflective" },
    { text: "理想の暮らしのかたちを教えてください", subtext: "将来のビジョンを自然に共有できます", tone: "exploratory" },
  ],
};

/**
 * 停滞検出: 初回交換後2h+無応答で表示
 */
export function shouldShowPrompt(ctx: PromptContext): boolean {
  return ctx.messageCount >= 2 && ctx.minutesSinceLastMessage >= 120;
}

/**
 * 文脈対応プロンプトを生成
 * 優先順: caution-based → reason-based → category fallback
 */
export function generateContextualPrompt(ctx: PromptContext): ContextualPrompt | null {
  if (!shouldShowPrompt(ctx)) return null;

  // 1. Caution-based (address potential friction)
  for (const code of ctx.cautionCodes) {
    const prompt = CAUTION_PROMPTS[code];
    if (prompt) return prompt;
  }

  // 2. Reason-based (deepen connection)
  for (const code of ctx.reasonCodes) {
    const prompt = REASON_PROMPTS[code];
    if (prompt) return prompt;
  }

  // 3. Category fallback
  const fallbacks = CATEGORY_FALLBACKS[ctx.category];
  const idx = ctx.messageCount % fallbacks.length;
  return fallbacks[idx];
}
