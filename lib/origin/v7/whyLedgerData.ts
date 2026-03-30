// Why Ledger — 理由カードデータ（始めた/続けた/やめた理由）

import type {
  WhyStartedReason,
  WhyContinuedReason,
  WhyStoppedReason,
} from "./workspaceTypes";

/* ─── 共通カード型 ─── */

export type WhyReasonCard<T extends string> = {
  id: T;
  label: string;
  icon: string;
};

/* ─── 始めた理由（10枚） ─── */

export const WHY_STARTED_CARDS: WhyReasonCard<WhyStartedReason>[] = [
  { id: "liked_it", label: "好きだった", icon: "❤️" },
  { id: "good_at_it", label: "得意だった", icon: "💪" },
  { id: "invited", label: "誘われた", icon: "🤝" },
  { id: "family_influence", label: "家庭の影響", icon: "👨‍👩‍👧" },
  { id: "wanted_belonging", label: "居場所がほしかった", icon: "🏠" },
  { id: "wanted_recognition", label: "認められたかった", icon: "🌟" },
  { id: "for_future", label: "将来のため", icon: "🎯" },
  { id: "wanted_escape", label: "逃げたかった", icon: "🚪" },
  { id: "wanted_change", label: "変わりたかった", icon: "🔄" },
  { id: "neutral", label: "なんとなく", icon: "🍃" },
];

/* ─── 続けた理由（8枚） ─── */

export const WHY_CONTINUED_CARDS: WhyReasonCard<WhyContinuedReason>[] = [
  { id: "enjoyable", label: "楽しかった", icon: "😊" },
  { id: "got_results", label: "結果が出た", icon: "📈" },
  { id: "recognized", label: "認められた", icon: "🏆" },
  { id: "had_peers", label: "仲間がいた", icon: "👥" },
  { id: "hard_to_quit", label: "やめにくかった", icon: "🔗" },
  { id: "became_habit", label: "習慣になった", icon: "🔁" },
  { id: "core_self", label: "自分の核だった", icon: "💎" },
  { id: "nowhere_else", label: "他に行き場がなかった", icon: "🚫" },
];

/* ─── やめた理由（8枚） ─── */

export const WHY_STOPPED_CARDS: WhyReasonCard<WhyStoppedReason>[] = [
  { id: "lost_interest", label: "飽きた", icon: "😶" },
  { id: "environment_changed", label: "環境が変わった", icon: "🌊" },
  { id: "tired", label: "疲れた", icon: "😩" },
  { id: "hurt", label: "傷ついた", icon: "💔" },
  { id: "job_done", label: "やりきった", icon: "✅" },
  { id: "found_alternative", label: "別の道を見つけた", icon: "🛤️" },
  { id: "didnt_fit", label: "合わなかった", icon: "🧩" },
  { id: "couldnt_continue", label: "続けられなくなった", icon: "🚧" },
];

/* ─── ラベル取得ヘルパー ─── */

export function getWhyStartedLabel(id: WhyStartedReason): string {
  return WHY_STARTED_CARDS.find((c) => c.id === id)?.label ?? id;
}

export function getWhyContinuedLabel(id: WhyContinuedReason): string {
  return WHY_CONTINUED_CARDS.find((c) => c.id === id)?.label ?? id;
}

export function getWhyStoppedLabel(id: WhyStoppedReason): string {
  return WHY_STOPPED_CARDS.find((c) => c.id === id)?.label ?? id;
}
