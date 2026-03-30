// lib/rendezvous/avatarMessages.ts
// 分身からのメッセージテンプレート — 状態ごとの定型文

export type AvatarState =
  | "exploring"
  | "contact_made"
  | "report_ready"
  | "mutual_match"
  | "idle";

export const AVATAR_MESSAGES: Record<AvatarState, string[]> = {
  exploring: [
    "今、いくつかの星を観察しています...",
    "面白い人を見つけた気がする。もう少し様子を見ます",
    "静かに探索中。焦らないで",
    "夜空を漂いながら、あなたに似た光を探しています",
    "遠くに気になる光があります。近づいてみます",
  ],
  contact_made: [
    "誰かの分身と目が合いました",
    "興味深い接触がありました。詳しくはもう少し待って",
    "相手の分身、なかなか面白い存在でした",
    "静かな会話が始まりました。見守っていてください",
    "お互いの波長を確かめています",
  ],
  report_ready: [
    "報告があります。確認してください",
    "接触結果が出ました",
    "あなたに伝えたいことがあります",
    "重要な発見がありました。見てほしい",
  ],
  mutual_match: [
    "お互いの分身が認め合いました！",
    "特別な共鳴が生まれました",
    "あなたとこの人の間に、強い共鳴を感じます",
    "二つの光が重なりました。素敵な出会いです",
  ],
  idle: [
    "少し休んでいます。また明日",
    "今日は静かな日でした",
    "エネルギーを充電中。明日また探索します",
    "星空を眺めながら、あなたのことを考えています",
  ],
};

/**
 * 状態に応じたランダムなメッセージを取得
 */
export function getRandomAvatarMessage(state: AvatarState): string {
  const messages = AVATAR_MESSAGES[state];
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * 接触数に応じた要約メッセージを生成
 */
export function getAvatarStatusSummary(activeConversations: number): string {
  if (activeConversations === 0) return "静かに探索中";
  if (activeConversations === 1) return "1人と接触中";
  return `${activeConversations}人と接触中`;
}
