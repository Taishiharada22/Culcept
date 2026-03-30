"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

type AneurasyncStyleHubProps = {
    active: boolean;
    defaultBodyType?: string | null;
    defaultSeason?: string | null;
    defaultDiagnosisScore?: number | null;
    defaultDiagnosisInsight?: string | null;
};

type OutfitEntry = {
    name?: string;
    category?: string;
    emoji?: string;
    reason?: string;
    image?: string;
};

type CalendarDay = {
    date: string;
    dayOfWeek?: string;
    weather?: { temp?: number; icon?: string; humidity?: number };
    event?: string;
    outfit?: OutfitEntry[];
};

type CalendarFeed = {
    month?: string;
    days?: CalendarDay[];
};

type RecommendationView = {
    href: string;
    name: string;
    brand: string;
    price: string;
    tag: string;
    score: number;
    why: string;
    image?: string;
};

type CommunityTribe = {
    id: string;
    name: string;
    icon?: string;
    members: number;
    description?: string;
    featured_items?: Array<{ id: string; image_url?: string | null }>;
};

type TribesFeed = {
    tribes?: CommunityTribe[];
    myTribes?: string[];
};

type QuickAccessLink = {
    href: string;
    icon: string;
    title: string;
    body: string;
    accent: string;
    emphasis?: boolean;
};

type ExploreLink = {
    href: string;
    icon: string;
    name: string;
    desc: string;
    tag: string;
    accent: string;
};

const DEFAULT_AVATAR = {
    pct: 0,
    insight: "体型・カラー・アバター生成の状態を1画面で確認",
};

const DEFAULT_CALENDAR = {
    temp: 18,
    icon: "🌧",
    hi: 20,
    lo: 10,
    hum: 36,
    tip: "撥水素材 & 暗色が安心",
};

const FALLBACK_OUTFIT: { cat: string; name: string; emoji: string; reason: string; image?: string }[] = [
    { cat: "OUTER", name: "撥水マウンテンパーカー", emoji: "🧥", reason: "気温差と雨に対応" },
    { cat: "TOP", name: "ボーダーカットソー", emoji: "👕", reason: "顔周りを軽く見せる" },
    { cat: "BOTTOM", name: "テーパードパンツ", emoji: "👖", reason: "重心を整えて動きやすい" },
    { cat: "SHOES", name: "防水ブーツ", emoji: "👢", reason: "足元を崩さず実用性を確保" },
    { cat: "ACC", name: "折りたたみ傘", emoji: "☂️", reason: "急な雨に備える" },
];

const FALLBACK_RECOMMENDATIONS: RecommendationView[] = [
    { href: "/drops", name: "オーバーサイズ MA-1", brand: "URBAN CRAFT", price: "¥14,800", tag: "TREND", score: 94, why: "好みとの一致率 94%" },
    { href: "/drops", name: "ワイドカーゴパンツ", brand: "NOID", price: "¥9,800", tag: "HOT", score: 91, why: "体型フィットスコア 91" },
    { href: "/drops", name: "シアーニットベスト", brand: "LAYERED", price: "¥7,200", tag: "NEW", score: 88, why: "スタイルレーン一致 88%" },
    { href: "/drops", name: "プラットフォームローファー", brand: "SOLE THEORY", price: "¥18,500", tag: "PICK", score: 86, why: "トレンドスコア上位 86" },
];

const QUICK_ACCESS_LINKS: QuickAccessLink[] = [
    {
        href: "/start",
        icon: "🧠",
        title: "AIスタイリストに相談",
        body: "気分と条件から、その場で方向性を組み立てる",
        accent: "#111827",
        emphasis: true,
    },
    {
        href: "/shops",
        icon: "🛍",
        title: "ショップ",
        body: "気になる店や古着の入口を横断で見る",
        accent: "#0891b2",
    },
    {
        href: "/ranking",
        icon: "📊",
        title: "ランキング",
        body: "いま強い流れと人気軸をまとめて確認",
        accent: "#f59e0b",
    },
    {
        href: "/explore",
        icon: "🧭",
        title: "探索",
        body: "Aneurasync 全体の発見導線へ戻る",
        accent: "#8b5cf6",
    },
    {
        href: "/my-page",
        icon: "◎",
        title: "マイページ",
        body: "今後の整理対象として /my もここにまとめます",
        accent: "#64748b",
    },
];

const EXPLORE_LINKS: ExploreLink[] = [
    { href: "/match", icon: "✨", name: "AIマッチ", desc: "スタイルが合う人を発見", tag: "MATCH", accent: "#ec4899" },
    { href: "/avatar-fitting", icon: "👗", name: "フィッティング診断", desc: "分身が相性を判定", tag: "NEW", accent: "#06b6d4" },
    { href: "/battle", icon: "⚔️", name: "コーデバトル", desc: "スタイリング対決", tag: "HOT", accent: "#f59e0b" },
    { href: "/ranking", icon: "🔥", name: "Pulse+", desc: "トレンドを追う", tag: "TREND", accent: "#ef4444" },
    { href: "/shops", icon: "🛍", name: "ショップ&古着", desc: "横断発見", tag: "SHOP", accent: "#0891b2" },
    { href: "/tribes#create", icon: "💬", name: "コミュニティ", desc: "作る / 参加する", tag: "NEW", accent: "#8b5cf6" },
];

function DisabledPill({ label = "準備中" }: { label?: string }) {
    return (
        <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-slate-500">
            {label}
        </span>
    );
}

function DisabledSurface({
    href,
    className,
    style,
    children,
}: {
    href?: string;
    className: string;
    style?: CSSProperties;
    children: ReactNode;
}) {
    return (
        <div aria-disabled="true" data-destination={href} className={className} style={{ ...style, cursor: "not-allowed" }}>
            {children}
        </div>
    );
}

function formatMoney(value: unknown): string | null {
    if (value == null) return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return String(value);
    return `¥${numeric.toLocaleString()}`;
}

function getPickTag(item: any, index: number): string {
    const tags = ["TREND", "HOT", "NEW", "PICK", "AI", "TASTE", "SWIPE", "SHOP"];
    const reason = String(item?.reason ?? item?.explain ?? "").toLowerCase();
    if (reason.includes("trend")) return "TREND";
    if (reason.includes("hot") || reason.includes("人気")) return "HOT";
    if (reason.includes("new") || reason.includes("新")) return "NEW";
    if (reason.includes("swipe")) return "SWIPE";
    return tags[index % tags.length];
}

function extractRecommendationView(item: any, index: number): RecommendationView | null {
    const payload = item?.payload ?? {};
    const targetType = String(item?.targetType ?? "");

    if (targetType === "drop") {
        return {
            href: item?.targetId ? `/drops/${item.targetId}` : "/drops",
            name: String(payload?.title ?? "おすすめアイテム"),
            brand: String(payload?.brand ?? payload?.shop_name_ja ?? payload?.shop_name_en ?? "DROP"),
            price: formatMoney(payload?.display_price ?? payload?.price) ?? "view",
            tag: getPickTag(item, index),
            score: Math.max(78, 96 - index * 3),
            why: String(item?.explain ?? payload?.shop_headline ?? "あなたの好みに近い候補です"),
            image: payload?.cover_image_url ? String(payload.cover_image_url) : undefined,
        };
    }

    if (targetType === "shop") {
        return {
            href: item?.targetId ? `/shops/${item.targetId}` : "/shops",
            name: String(payload?.name_ja ?? payload?.name_en ?? "おすすめショップ"),
            brand: String(payload?.headline ?? "SHOP"),
            price: payload?.drop_count ? `${payload.drop_count} drops` : "shop",
            tag: getPickTag(item, index),
            score: Math.max(76, 92 - index * 3),
            why: String(item?.explain ?? "今の好みに近いショップです"),
            image: payload?.avatar_url ? String(payload.avatar_url) : undefined,
        };
    }

    if (targetType === "insight" && payload?.kind === "swipe_card") {
        const tags = Array.isArray(payload?.tags) ? payload.tags.map(String) : [];
        return {
            href: "/start",
            name: String(payload?.title ?? payload?.card_id ?? "Swipe Card"),
            brand: tags.slice(0, 2).join(" / ") || "CURATED",
            price: payload?.price_band ? String(payload.price_band).toUpperCase() : "curated",
            tag: getPickTag(item, index),
            score: Math.max(75, 90 - index * 2),
            why: String(item?.explain ?? "スワイプ学習から抽出した候補"),
            image: payload?.image_url ? String(payload.image_url) : undefined,
        };
    }

    return null;
}

function resolveOutfitCategory(name: string, index: number) {
    const label = name.toLowerCase();
    if (/(coat|jacket|outer|parka|blazer|vest)/.test(label)) return "OUTER";
    if (/(pants|jeans|trousers|shorts|skirt|cargo)/.test(label)) return "BOTTOM";
    if (/(boots|sneakers|loafers|heels|shoes)/.test(label)) return "SHOES";
    if (/(bag|hat|scarf|watch|belt|umbrella|ring)/.test(label)) return "ACC";
    if (/(shirt|tee|tshirt|hoodie|sweater|knit|top|blouse|polo)/.test(label)) return "TOP";
    return ["OUTER", "TOP", "BOTTOM", "SHOES"][index] ?? "ITEM";
}

function UtilityCard({
    href,
    title,
    badge,
    headline,
    body,
    accent,
}: {
    href: string;
    title: string;
    badge: string;
    headline: string;
    body: string;
    accent: string;
}) {
    return (
        <DisabledSurface
            href={href}
            className="group rounded-2xl border bg-white/85 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            style={{ borderColor: `${accent}22` }}
        >
            <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-bold text-slate-900">{title}</div>
                <span className="rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide text-white" style={{ backgroundColor: accent }}>
                    {badge}
                </span>
            </div>
            <div className="mt-3 text-lg font-black leading-tight text-slate-950">{headline}</div>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{body}</p>
            <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-[12px] font-bold" style={{ color: accent }}>preview only</span>
                <DisabledPill />
            </div>
        </DisabledSurface>
    );
}

function EssentialCard({
    href,
    title,
    stat,
    sub,
    body,
    accent,
}: {
    href: string;
    title: string;
    stat: string;
    sub: string;
    body: string;
    accent: string;
}) {
    return (
        <DisabledSurface
            href={href}
            className="group rounded-2xl border bg-white/85 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            style={{ borderColor: `${accent}22` }}
        >
            <div className="flex items-center justify-between gap-3">
                <div className="text-[15px] font-bold text-slate-900">{title}</div>
                <span className="rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide text-white" style={{ backgroundColor: accent }}>
                    {stat}
                </span>
            </div>
            <div className="mt-2 text-[12px] text-slate-500">{sub}</div>
            <p className="mt-3 text-[13px] leading-relaxed text-slate-600">{body}</p>
            <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-[12px] font-bold" style={{ color: accent }}>
                    planned
                </span>
                <DisabledPill />
            </div>
        </DisabledSurface>
    );
}

function QuickAccessCard({ href, icon, title, body, accent, emphasis }: QuickAccessLink) {
    return (
        <DisabledSurface
            href={href}
            className="group rounded-[24px] border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            style={{
                borderColor: emphasis ? "rgba(15,23,42,0.12)" : `${accent}22`,
                background: emphasis
                    ? "linear-gradient(160deg, rgba(15,23,42,0.98), rgba(30,41,59,0.96))"
                    : `linear-gradient(160deg, rgba(255,255,255,0.95), ${accent}0d)`,
            }}
        >
            <div className="flex items-start justify-between gap-3">
                <div
                    className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl shadow-sm"
                    style={{
                        background: emphasis ? "rgba(255,255,255,0.12)" : `${accent}12`,
                        color: emphasis ? "#fff" : accent,
                    }}
                >
                    {icon}
                </div>
                <span
                    className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
                    style={{
                        backgroundColor: emphasis ? "rgba(255,255,255,0.12)" : `${accent}12`,
                        color: emphasis ? "#fff" : accent,
                    }}
                >
                    quick
                </span>
            </div>
            <div className="mt-4 text-[15px] font-black tracking-tight" style={{ color: emphasis ? "#fff" : "#0f172a" }}>
                {title}
            </div>
            <p className="mt-2 text-[13px] leading-relaxed" style={{ color: emphasis ? "rgba(255,255,255,0.72)" : "#64748b" }}>
                {body}
            </p>
            <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-[12px] font-bold" style={{ color: emphasis ? "#fff" : accent }}>
                    hidden for now
                </span>
                <DisabledPill />
            </div>
        </DisabledSurface>
    );
}

function RecommendationCard({ href, name, brand, price, tag, score, why, image }: RecommendationView) {
    return (
        <DisabledSurface href={href} className="group overflow-hidden rounded-[24px] border border-white/80 bg-white/88 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
            <div
                className="relative h-32 border-b border-slate-100"
                style={{
                    background: image
                        ? `linear-gradient(160deg, rgba(255,255,255,0.02), rgba(15,23,42,0.08)), url(${image}) center / contain no-repeat, linear-gradient(135deg, rgba(248,250,252,1), rgba(226,232,240,0.9))`
                        : "linear-gradient(145deg, rgba(250,245,255,1), rgba(241,245,249,0.95))",
                }}
            >
                {!image ? <div className="flex h-full items-center justify-center text-4xl opacity-20">👕</div> : null}
                <div className="absolute left-3 top-3 rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-white">
                    {tag}
                </div>
                <div className="absolute bottom-3 right-3 rounded-full bg-white/88 px-2.5 py-1 text-[11px] font-black text-slate-900 shadow-sm">
                    {score}
                </div>
            </div>
            <div className="p-4">
                <div className="text-[14px] font-black leading-tight text-slate-950">{name}</div>
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{brand}</div>
                <p className="mt-3 text-[12px] leading-relaxed text-slate-600">{why}</p>
                <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600">AI厳選</span>
                    <div className="flex items-center gap-2">
                        <span className="text-[14px] font-black text-slate-900">{price}</span>
                        <DisabledPill />
                    </div>
                </div>
            </div>
        </DisabledSurface>
    );
}

function CommunityCard({ tribe, rank }: { tribe: CommunityTribe; rank: number }) {
    return (
        <DisabledSurface href={`/tribes/${tribe.id}`} className="group rounded-[24px] border border-white/80 bg-white/88 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-xl text-violet-600 shadow-sm">
                        {tribe.icon ?? "💬"}
                    </div>
                    <div>
                        <div className="text-[14px] font-black text-slate-950">{tribe.name}</div>
                        <div className="text-[11px] text-slate-500">{tribe.members.toLocaleString()} members</div>
                    </div>
                </div>
                <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-violet-700">
                    #{rank}
                </span>
            </div>
            <p className="mt-3 min-h-[40px] text-[12px] leading-relaxed text-slate-600">
                {tribe.description ?? "観測結果やコーデを共有できるコミュニティです。"}
            </p>
            <div className="mt-4 flex gap-2">
                {(tribe.featured_items ?? []).slice(0, 3).map((item) => (
                    <div
                        key={item.id}
                        className="h-10 w-10 rounded-xl border border-slate-100 bg-slate-100"
                        style={item.image_url ? { background: `url(${item.image_url}) center / cover no-repeat` } : undefined}
                    />
                ))}
                {(tribe.featured_items ?? []).length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-[11px] font-medium text-slate-400">
                        featured items
                    </div>
                ) : null}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-[12px] font-bold text-violet-700">community preview</span>
                <DisabledPill />
            </div>
        </DisabledSurface>
    );
}

function ExploreCard({ href, icon, name, desc, tag, accent }: ExploreLink) {
    return (
        <DisabledSurface
            href={href}
            className="group rounded-[24px] border border-white/80 bg-white/86 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            style={{ boxShadow: `0 12px 32px ${accent}0f` }}
        >
            <div className="flex items-start justify-between gap-3">
                <div
                    className="flex h-10 w-10 items-center justify-center rounded-2xl text-lg"
                    style={{ backgroundColor: `${accent}12`, color: accent }}
                >
                    {icon}
                </div>
                <span
                    className="rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.16em]"
                    style={{ backgroundColor: `${accent}12`, color: accent }}
                >
                    {tag}
                </span>
            </div>
            <div className="mt-4 text-[14px] font-black text-slate-950">{name}</div>
            <div className="mt-1 text-[12px] leading-relaxed text-slate-600">{desc}</div>
            <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-[12px] font-bold" style={{ color: accent }}>planned route</span>
                <DisabledPill />
            </div>
        </DisabledSurface>
    );
}

export default function AneurasyncStyleHub({
    active,
    defaultBodyType,
    defaultSeason,
    defaultDiagnosisScore,
    defaultDiagnosisInsight,
}: AneurasyncStyleHubProps) {
    const [avatar, setAvatar] = useState(DEFAULT_AVATAR);
    const [diagnosis, setDiagnosis] = useState({
        score: defaultDiagnosisScore ?? 0,
        bodyType: defaultBodyType ?? "体型",
        season: defaultSeason ?? "カラー",
        insight: defaultDiagnosisInsight ?? "骨格とパーソナルカラーを確認できます",
    });
    const [calendar, setCalendar] = useState(DEFAULT_CALENDAR);
    const [calendarFeed, setCalendarFeed] = useState<CalendarFeed | null>(null);
    const [community, setCommunity] = useState({
        count: 0,
        joined: 0,
        topName: "コミュニティ",
        items: [] as CommunityTribe[],
    });
    const [recommendations, setRecommendations] = useState<RecommendationView[]>([]);

    useEffect(() => {
        if (!active) return;
        let cancelled = false;

        Promise.all([
            fetch("/api/eye-profile", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
            fetch("/api/body-color/profile", { credentials: "include", cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
            fetch("/api/aneurasync/face-phenotype", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]).then(([eyeProfile, bodyColor, facePhenotype]) => {
            if (cancelled) return;
            const eyeType = eyeProfile?.eye_profile?.eye_type;
            const eyeColor = eyeProfile?.eye_profile?.eye_color;
            const hasSkin = !!bodyColor?.color_profile?.cpv?.undertone;
            const hasBody = !!bodyColor?.body_profile?.cfv;
            const face = facePhenotype?.face_phenotype?.phenotype;
            const hasFace = !!(face?.face_shape?.primary || face?.nose_impression || face?.face_impression);
            const filled = [eyeType, eyeColor, hasSkin, hasBody, hasFace].filter(Boolean).length;
            const pct = Math.round((filled / 5) * 100);

            let insight = "分析を開始しましょう";
            if (pct >= 80) insight = "分析が高精度に到達しています";
            else if (pct >= 40) insight = "骨格・カラー分析の精度が安定しています";
            else if (pct > 0) insight = "データ蓄積中 — 追加分析で精度が向上します";

            setAvatar({ pct, insight });
            setDiagnosis({
                score: defaultDiagnosisScore ?? pct,
                bodyType: bodyColor?.body_profile?.cfv?.body_type_label ?? defaultBodyType ?? "体型",
                season: bodyColor?.color_profile?.labels?.season ?? defaultSeason ?? "カラー",
                insight:
                    bodyColor?.body_profile?.cfv
                        ? `${bodyColor.body_profile.cfv.body_type_label ?? "体型"} × ${bodyColor?.color_profile?.labels?.season ?? defaultSeason ?? "カラー"} の組み合わせで提案精度が上がります`
                        : defaultDiagnosisInsight ?? insight,
            });
        });

        fetch("/api/calendar/month", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .then((data: CalendarFeed | null) => {
                if (cancelled || !data?.days?.length) return;
                const first = data.days[0];
                if (!first?.weather) return;
                setCalendarFeed(data);
                setCalendar({
                    temp: Math.round(first.weather.temp ?? DEFAULT_CALENDAR.temp),
                    icon: first.weather.icon ?? DEFAULT_CALENDAR.icon,
                    hi: Math.round(first.weather.temp ?? DEFAULT_CALENDAR.temp) + 2,
                    lo: Math.round(first.weather.temp ?? DEFAULT_CALENDAR.temp) - 2,
                    hum: Math.round(first.weather.humidity ?? DEFAULT_CALENDAR.hum),
                    tip:
                        first.event
                            ? `${first.event}に合わせて ${first.outfit?.[0]?.reason ?? "軽く整えた提案"}`
                            : first.outfit?.[0]?.reason ?? DEFAULT_CALENDAR.tip,
                });
            })
            .catch(() => {});

        fetch("/api/recommendations?limit=4", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (cancelled || !Array.isArray(data?.items)) return;
                const next = data.items
                    .map((item: any, index: number) => extractRecommendationView(item, index))
                    .filter(Boolean) as RecommendationView[];
                setRecommendations(next.slice(0, 4));
            })
            .catch(() => {});

        fetch("/api/tribes?limit=6", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .then((data: TribesFeed | null) => {
                if (cancelled || !data) return;
                const tribes = Array.isArray(data.tribes) ? data.tribes : [];
                const sorted = tribes.slice().sort((a, b) => b.members - a.members);
                setCommunity({
                    count: tribes.length,
                    joined: data.myTribes?.length ?? 0,
                    topName: sorted[0]?.name ?? "コミュニティ",
                    items: sorted.slice(0, 3),
                });
            })
            .catch(() => {});

        return () => {
            cancelled = true;
        };
    }, [active, defaultBodyType, defaultSeason, defaultDiagnosisScore, defaultDiagnosisInsight]);

    if (!active) return null;

    const homeOutfitDay = calendarFeed?.days?.[0];
    const weatherSummary = homeOutfitDay?.weather
        ? {
              temp: Math.round(homeOutfitDay.weather.temp ?? calendar.temp),
              icon: homeOutfitDay.weather.icon ?? calendar.icon,
              hi: Math.round(homeOutfitDay.weather.temp ?? calendar.temp) + 2,
              lo: Math.round(homeOutfitDay.weather.temp ?? calendar.temp) - 2,
              hum: Math.round(homeOutfitDay.weather.humidity ?? calendar.hum),
          }
        : calendar;

    const outfitDisplay = homeOutfitDay?.outfit?.length
        ? homeOutfitDay.outfit.slice(0, 5).map((item, index) => ({
              cat: resolveOutfitCategory(item.name ?? "", index),
              name: item.name ?? "アイテム",
              emoji: item.emoji ?? FALLBACK_OUTFIT[index]?.emoji ?? "👕",
              reason: item.reason ?? calendar.tip,
              image: item.image,
          }))
        : FALLBACK_OUTFIT;

    const recommendationDisplay = recommendations.length ? recommendations : FALLBACK_RECOMMENDATIONS;

    const syncUtilities = [
        {
            href: "/body-color/avatar",
            title: "Avatar",
            badge: `${avatar.pct}%`,
            headline: "総合診断を画面内表示",
            body: avatar.insight,
            accent: "#ec4899",
        },
        {
            href: "/style-profile?source=aneurasync&mode=sync&tab=analysis",
            title: "Diagnosis",
            badge: `${diagnosis.score}`,
            headline: `${diagnosis.bodyType} × ${diagnosis.season}`,
            body: diagnosis.insight,
            accent: "#3b82f6",
        },
        {
            href: "/drops",
            title: "Products",
            badge: "RESTORED",
            headline: "Match 300",
            body: "商品詳細で Style / Color / Fit の相性を部位別に確認できます",
            accent: "#f59e0b",
        },
    ];

    const restoredEssentials = [
        {
            href: "/body-color/avatar",
            title: "Avatar総合診断",
            stat: `${diagnosis.score} score`,
            sub: "画面遷移なしで診断要点を確認",
            body: diagnosis.insight,
            accent: "#ec4899",
        },
        {
            href: "/calendar",
            title: "コーデカレンダー",
            stat: `${calendar.temp}° / ${calendar.icon}`,
            sub: "天気と予定に合わせて日次確認",
            body: `今日の提案は ${calendar.tip}。カレンダー側で全週を確認できます。`,
            accent: "#3b82f6",
        },
        {
            href: "/drops",
            title: "Match 300",
            stat: "style + color + fit",
            sub: "商品詳細でStyle/Color/Fitを可視化",
            body: "部位別バーと理由付きで、相性の良い商品を先に絞れます。",
            accent: "#f59e0b",
        },
        {
            href: "/collab?source=aneurasync",
            title: "Collab Drops",
            stat: "Hub + Live",
            sub: "相性が出やすい企画を先に見る",
            body: "Aneurasync の観測結果を使って、いま相性が出やすいコラボ企画と Live を先に出します。",
            accent: "#8b5cf6",
        },
    ];

    return (
        <div className="mb-6 space-y-5">
            <div className="rounded-[28px] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(249,245,255,0.92)_45%,rgba(239,246,255,0.92))] p-6 shadow-xl shadow-slate-900/5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.22em] text-fuchsia-500">Expansion Deck</div>
                        <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">拡張予定</h2>
                        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                            HOME の Hero より下にあった実用ブロックをここへ寄せています。現状は検討用の棚で、ここにある項目はユーザー向けには公開していません。
                        </p>
                    </div>
                    <DisabledPill label="現在は非公開" />
                </div>
            </div>

            <section className="rounded-[28px] border border-white/70 bg-white/82 p-6 shadow-lg shadow-slate-900/5 backdrop-blur">
                <div className="mb-4">
                    <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">QUICK ACCESS</div>
                    <p className="mt-2 text-sm text-slate-600">まず触るべき導線を、上段だけで完結するようにまとめています。</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {QUICK_ACCESS_LINKS.map((item) => <QuickAccessCard key={item.title} {...item} />)}
                </div>
            </section>

            <section className="overflow-hidden rounded-[30px] border border-emerald-100 bg-[linear-gradient(145deg,rgba(236,253,245,0.98),rgba(255,255,255,0.94)_50%,rgba(240,249,255,0.98))] p-5 shadow-lg shadow-emerald-500/10">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-600">OUTFIT ASSIST</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-slate-900">
                            <span className="text-2xl">{weatherSummary.icon}</span>
                            <span className="text-2xl font-black">{weatherSummary.temp}°</span>
                            <span className="text-[12px] text-slate-500">{weatherSummary.hi}° / {weatherSummary.lo}° 湿度 {weatherSummary.hum}%</span>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <span className="rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-[11px] font-bold text-emerald-700">アバターが先に試着済み</span>
                        <span className="rounded-full border border-sky-200 bg-white/80 px-3 py-1 text-[11px] font-bold text-sky-700">AI×天気</span>
                    </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {outfitDisplay.map((item) => (
                        <div key={`${item.cat}-${item.name}`} className="rounded-[22px] border border-white/80 bg-white/80 p-3 shadow-sm">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-bold tracking-[0.18em] text-slate-400">{item.cat}</span>
                                <span className="text-[10px] font-bold text-emerald-600">AI</span>
                            </div>
                            <div
                                className="mt-3 flex h-16 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50"
                                style={item.image ? { background: `url(${item.image}) center / contain no-repeat` } : undefined}
                            >
                                {!item.image ? <span className="text-2xl">{item.emoji}</span> : null}
                            </div>
                            <div className="mt-3 text-[13px] font-bold leading-tight text-slate-950">{item.name}</div>
                            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{item.reason}</p>
                        </div>
                    ))}
                </div>

                <div className="mt-4 rounded-[24px] border border-emerald-100 bg-white/78 p-4">
                    <div className="text-[12px] font-bold text-slate-900">
                        今日のおすすめ <span className="font-medium text-slate-500">{homeOutfitDay?.event ?? "デイリープラン"}</span>
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-emerald-700">💡 {calendar.tip}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <span className="rounded-full bg-emerald-600 px-4 py-2 text-[12px] font-bold text-white shadow">
                            カレンダーへ
                        </span>
                        <span className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-[12px] font-bold text-emerald-700">
                            AI再提案
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[12px] font-bold text-slate-700">
                            商品を見る
                        </span>
                        <DisabledPill />
                    </div>
                </div>
            </section>

            <section className="rounded-[28px] border border-white/70 bg-white/82 p-6 shadow-lg shadow-slate-900/5 backdrop-blur">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.24em] text-rose-400">RECOMMENDATIONS</div>
                        <p className="mt-2 text-sm text-slate-600">HOME にあった「あなたへのレコメンド」をここへ集約しました。</p>
                    </div>
                    <DisabledPill />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                    {recommendationDisplay.map((item) => <RecommendationCard key={`${item.href}-${item.name}`} {...item} />)}
                </div>
            </section>

            <section className="rounded-[28px] border border-white/70 bg-white/82 p-6 shadow-lg shadow-slate-900/5 backdrop-blur">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.24em] text-violet-500">COMMUNITY MOVEMENT</div>
                        <p className="mt-2 text-sm text-slate-600">
                            {community.count
                                ? `${community.topName} を先頭に、いま動いている tribe をここから見に行けます。`
                                : "コミュニティ導線をここに集約しています。"}
                        </p>
                    </div>
                    <div className="rounded-full bg-violet-50 px-3 py-1.5 text-[11px] font-bold text-violet-700">
                        {community.count ? `${community.count} tribes / ${community.joined} joined` : "tribes / rooms"}
                    </div>
                </div>
                {community.items.length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-3">
                        {community.items.map((tribe, index) => <CommunityCard key={tribe.id} tribe={tribe} rank={index + 1} />)}
                    </div>
                ) : (
                    <div className="block rounded-[24px] border border-dashed border-violet-200 bg-violet-50/60 p-5 text-center text-sm font-medium text-violet-700">
                        コミュニティを開く / 新しく作る
                    </div>
                )}
            </section>

            <section className="rounded-[28px] border border-white/70 bg-white/82 p-6 shadow-lg shadow-slate-900/5 backdrop-blur">
                <div className="mb-4">
                    <div className="text-[11px] font-black uppercase tracking-[0.24em] text-amber-500">EXPLORE ALL</div>
                    <p className="mt-2 text-sm text-slate-600">HOME の「探索する」をそのまま切り出して、ここで一覧できるようにしています。</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {EXPLORE_LINKS.map((item) => <ExploreCard key={item.name} {...item} />)}
                </div>
            </section>

            <section className="rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-lg shadow-slate-900/5 backdrop-blur">
                <div className="mb-4">
                    <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">SYNC UTILITIES</div>
                    <p className="mt-2 text-sm text-slate-600">消えていた実用導線をAneurasyncに戻しています。</p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                    {syncUtilities.map((item) => <UtilityCard key={item.title} {...item} />)}
                </div>
            </section>

            <section className="rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-lg shadow-slate-900/5 backdrop-blur">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">RESTORED ESSENTIALS</div>
                        <p className="mt-2 text-sm text-slate-600">Style Profile の基礎ツールは下段に残しています。</p>
                    </div>
                    <DisabledPill />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                    {restoredEssentials.map((item) => <EssentialCard key={item.title} {...item} />)}
                </div>
            </section>
        </div>
    );
}
