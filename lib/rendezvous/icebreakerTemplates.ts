/**
 * アイスブレイカーテンプレート
 * カテゴリ×理由コード別の会話トピック候補
 */

import type { RendezvousCategory, ReasonCode } from "./types";

type IceBreakerSet = string[];

// ── カテゴリ共通 ──

const GENERAL_STARTERS: IceBreakerSet = [
  "最近、何かに夢中になっていることはありますか？",
  "普段の一日はどんな感じで過ごしていますか？",
  "もし明日が休みだったら、何をしますか？",
];

// ── 理由コード別 ──

const REASON_STARTERS: Partial<Record<ReasonCode, IceBreakerSet>> = {
  conversation_pace_close: [
    "会話のテンポが合いそうと感じたんですが、普段はどんな話し方が心地いいですか？",
    "ゆっくり話すのと、テンポよく話すの、どっちが好きですか？",
  ],
  distance_preference_aligned: [
    "一人の時間と誰かといる時間、どんなバランスが理想ですか？",
    "お互いの距離感って大事だと思うんですが、どう感じていますか？",
  ],
  depth_speed_aligned: [
    "人と仲良くなるとき、どんなペースが心地いいですか？",
    "深い話をするのは好きですか？それとも徐々に？",
  ],
  emotional_temperature_close: [
    "嬉しいことがあった時、誰かに話したい派ですか？",
    "感情って、どんな形で表現することが多いですか？",
  ],
  complementary_roles: [
    "チームで何かする時、どんな役割が自然ですか？",
    "リーダータイプですか？サポートタイプですか？",
  ],
  stable_connection_potential: [
    "長く続いている関係って、どんな特徴がありますか？",
    "安心できる関係って、どんなものだと思いますか？",
  ],
  light_connection_potential: [
    "気軽に会える友達って、どのくらいいますか？",
    "力を抜いて話せる人って、どんな人ですか？",
  ],
  creative_role_fit: [
    "最近、何か作ったものや取り組んでいることはありますか？",
    "もし一緒に何かを作るとしたら、何がいいですか？",
  ],
};

// ── カテゴリ別 ──

const CATEGORY_STARTERS: Record<RendezvousCategory, IceBreakerSet> = {
  romantic: [
    "どんな瞬間に人への好意を感じますか？",
    "理想のデートってどんな感じですか？",
    "一緒にいて心地いいと感じるのは、どんな時ですか？",
    "映画やドラマで好きなラブストーリーはありますか？",
    "休日、一緒に過ごすなら何をしたいですか？",
  ],
  friendship: [
    "新しい友達とどんな風に仲良くなりますか？",
    "一緒にいて楽しいと思うのはどんな人ですか？",
    "友達と過ごす時、何をしていることが多いですか？",
    "笑いのツボが合う人って、すぐ分かりますか？",
    "今度一緒に行きたい場所はありますか？",
  ],
  cocreation: [
    "今一番作りたいものは何ですか？",
    "得意なことと苦手なことを教えてください",
    "アイデアを考える時、どんなプロセスですか？",
    "過去に誰かと一緒に作って楽しかったものは？",
    "もし何でも実現できるとしたら、何を作りますか？",
  ],
  community: [
    "どんなコミュニティに属していますか？",
    "理想のコミュニティってどんなものですか？",
    "初めての人が多い場所、得意ですか？",
    "オンラインとオフライン、どっちの繋がりが多いですか？",
  ],
  partner: [
    "人生で一番大切にしている価値観は何ですか？",
    "将来の暮らしについて、どんなイメージを持っていますか？",
    "パートナーとの関係で、一番大事にしたいことは？",
    "お金や仕事について、どんな考え方をしていますか？",
    "安心できる関係って、どんなものだと思いますか？",
  ],
};

// ── Public API ──

export function generateIceBreakers(
  category: RendezvousCategory,
  reasonCodes: ReasonCode[],
  count: number = 3,
): string[] {
  const pool: string[] = [];

  // Add reason-specific starters first (highest relevance)
  for (const code of reasonCodes) {
    const starters = REASON_STARTERS[code];
    if (starters) pool.push(...starters);
  }

  // Add category-specific
  pool.push(...CATEGORY_STARTERS[category]);

  // Add general fallbacks
  pool.push(...GENERAL_STARTERS);

  // Shuffle and pick
  const shuffled = pool.sort(() => Math.random() - 0.5);

  // Deduplicate and take first N
  const unique = [...new Set(shuffled)];
  return unique.slice(0, count);
}
