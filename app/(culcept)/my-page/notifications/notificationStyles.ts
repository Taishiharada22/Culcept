// 通知タイプごとのスタイル定義
// page.tsx (サーバー側) で type → style を解決してクライアントに渡す

interface NotificationStyle {
    icon: string;
    color: string;
    bg: string;
}

const STYLE_MAP: Record<string, NotificationStyle> = {
    // ── Rendezvous（実際のcron/dispatch由来のtype） ──
    rendezvous_match_reveal:     { icon: "💫", color: "text-purple-600",  bg: "bg-purple-100" },
    rendezvous_message_received: { icon: "💬", color: "text-blue-600",    bg: "bg-blue-100" },
    rendezvous_avatar_report:    { icon: "🪞", color: "text-indigo-600",  bg: "bg-indigo-100" },
    rendezvous_daily_resonance:  { icon: "✨", color: "text-purple-600",  bg: "bg-purple-100" },
    rendezvous_nudge:            { icon: "🔔", color: "text-amber-600",   bg: "bg-amber-100" },
    rendezvous_new_candidate:    { icon: "💜", color: "text-purple-600",  bg: "bg-purple-100" },
    rendezvous_mutual_like:      { icon: "💞", color: "text-pink-600",    bg: "bg-pink-100" },

    // ── Verification（本人確認 — 実際のtypeは verification_${action}） ──
    verification_approve:           { icon: "✅", color: "text-emerald-600", bg: "bg-emerald-100" },
    verification_reject:            { icon: "⚠️", color: "text-amber-600",   bg: "bg-amber-100" },
    verification_request_resubmit:  { icon: "📋", color: "text-amber-600",   bg: "bg-amber-100" },
    verification_freeze:            { icon: "🔒", color: "text-slate-500",   bg: "bg-slate-100" },
    verification_unfreeze:          { icon: "🔓", color: "text-emerald-600", bg: "bg-emerald-100" },

    // ── 運営通知（CEO broadcast） ──
    system_announcement:    { icon: "📢", color: "text-indigo-600",  bg: "bg-indigo-100" },
    account_notice:         { icon: "👤", color: "text-slate-600",   bg: "bg-slate-100" },
    policy_update:          { icon: "📜", color: "text-slate-600",   bg: "bg-slate-100" },
    maintenance_notice:     { icon: "🔧", color: "text-amber-600",   bg: "bg-amber-100" },
    safety_notice:          { icon: "🛡️", color: "text-blue-600",    bg: "bg-blue-100" },

    // ── System（レガシー） ──
    system:                 { icon: "ℹ️", color: "text-slate-600",   bg: "bg-slate-100" },
    weekly_digest:          { icon: "📋", color: "text-slate-600",   bg: "bg-slate-100" },
    recommendation:         { icon: "💡", color: "text-amber-600",   bg: "bg-amber-100" },
};

// カテゴリプレフィックスのデフォルトスタイル（完全一致しない rendezvous_* 等のフォールバック）
const CATEGORY_DEFAULTS: Record<string, NotificationStyle> = {
    rendezvous:    { icon: "💫", color: "text-purple-600",  bg: "bg-purple-100" },
    verification:  { icon: "🔒", color: "text-slate-600",   bg: "bg-slate-100" },
    stargazer:     { icon: "🔭", color: "text-indigo-600",  bg: "bg-indigo-100" },
    origin:        { icon: "📝", color: "text-teal-600",    bg: "bg-teal-100" },
};

const DEFAULT_STYLE: NotificationStyle = {
    icon: "📩",
    color: "text-slate-600",
    bg: "bg-slate-100",
};

export function getNotificationStyle(type: string): NotificationStyle {
    if (STYLE_MAP[type]) return STYLE_MAP[type];

    // カテゴリプレフィックスでフォールバック
    const prefix = type.split("_")[0];
    if (CATEGORY_DEFAULTS[prefix]) return CATEGORY_DEFAULTS[prefix];

    return DEFAULT_STYLE;
}
