// app/coordinate/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import {
    LightBackground,
    GlassNavbar,
    GlassCard,
    GlassButton,
    GlassBadge,
} from "@/components/ui/glassmorphism-design";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "AIコーディネート提案",
    description: "シーンに合わせた完璧なコーデを自動提案",
};

// シーン別コーディネートルール
const SCENE_COORDINATE_RULES: Record<string, {
    name: string;
    emoji: string;
    requiredCategories: string[];
    preferredTags: string[];
    colorScheme: string[];
    advice: string;
}> = {
    date: {
        name: "デート",
        emoji: "💕",
        requiredCategories: ["jacket", "shirt", "pants", "shoes"],
        preferredTags: ["smart", "clean", "casual", "romantic"],
        colorScheme: ["navy", "white", "beige", "black"],
        advice: "清潔感を大切に、程よくおしゃれに。香りにも気を使いましょう。",
    },
    office: {
        name: "オフィス",
        emoji: "💼",
        requiredCategories: ["blazer", "shirt", "pants", "shoes"],
        preferredTags: ["formal", "smart", "blazer", "oxford", "chinos"],
        colorScheme: ["navy", "gray", "white", "black"],
        advice: "ジャケットは必須。清潔感と信頼感のある装いを。",
    },
    casual: {
        name: "カジュアル",
        emoji: "☕",
        requiredCategories: ["tops", "pants", "shoes"],
        preferredTags: ["casual", "relaxed", "comfortable", "tshirt"],
        colorScheme: ["white", "blue", "gray", "beige"],
        advice: "リラックス感を大切に、でも手抜き感は出さないように。",
    },
    party: {
        name: "パーティ",
        emoji: "🎉",
        requiredCategories: ["jacket", "shirt", "pants", "shoes", "accessories"],
        preferredTags: ["formal", "elegant", "dress", "blazer"],
        colorScheme: ["black", "navy", "white"],
        advice: "少し華やかに。小物でアクセントを加えましょう。",
    },
    travel: {
        name: "旅行",
        emoji: "✈️",
        requiredCategories: ["outerwear", "tops", "pants", "shoes"],
        preferredTags: ["casual", "comfortable", "layers", "sneakers"],
        colorScheme: ["gray", "navy", "khaki", "white"],
        advice: "動きやすさ重視。レイヤリングで温度調節できるように。",
    },
    weekend: {
        name: "週末",
        emoji: "🌴",
        requiredCategories: ["tops", "pants", "shoes"],
        preferredTags: ["casual", "relaxed", "street", "minimal"],
        colorScheme: ["white", "black", "gray", "beige"],
        advice: "自分らしさを大切に、気負わないスタイルで。",
    },
};

// アイテムカテゴリの相性マップ
const COORDINATE_RULES: Record<string, { matches: string[]; reason: string }> = {
    jacket: {
        matches: ["shirt", "tshirt", "pants", "jeans", "sneakers", "boots"],
        reason: "アウターに合わせやすいインナーとボトムス",
    },
    blazer: {
        matches: ["shirt", "chinos", "dress_pants", "loafers", "oxford"],
        reason: "きれいめスタイルにぴったり",
    },
    hoodie: {
        matches: ["tshirt", "jeans", "joggers", "sneakers", "cap"],
        reason: "カジュアルでリラックスしたスタイル",
    },
    shirt: {
        matches: ["jacket", "blazer", "chinos", "jeans", "loafers"],
        reason: "シャツに合わせやすいアイテム",
    },
    jeans: {
        matches: ["jacket", "hoodie", "shirt", "tshirt", "sneakers", "boots"],
        reason: "デニムに合う万能アイテム",
    },
    sneakers: {
        matches: ["jeans", "joggers", "shorts", "hoodie", "tshirt"],
        reason: "スニーカーに合うカジュアルアイテム",
    },
    boots: {
        matches: ["jeans", "jacket", "coat", "chinos"],
        reason: "ブーツに合うしっかりめアイテム",
    },
    coat: {
        matches: ["sweater", "shirt", "pants", "boots", "scarf"],
        reason: "コートに合う秋冬アイテム",
    },
    sweater: {
        matches: ["shirt", "pants", "jeans", "boots", "sneakers"],
        reason: "ニットに合わせやすいアイテム",
    },
};

// カテゴリキーワードマッピング
const CATEGORY_KEYWORDS: Record<string, string[]> = {
    jacket: ["jacket", "blouson", "bomber"],
    blazer: ["blazer", "tailored"],
    coat: ["coat", "trench", "overcoat", "parka"],
    shirt: ["shirt", "oxford", "dress_shirt"],
    tshirt: ["tshirt", "t-shirt", "tee"],
    sweater: ["sweater", "knit", "cardigan", "pullover"],
    hoodie: ["hoodie", "sweatshirt"],
    pants: ["pants", "trousers", "slacks"],
    chinos: ["chinos", "chino"],
    jeans: ["jeans", "denim"],
    shorts: ["shorts"],
    sneakers: ["sneakers", "trainers"],
    boots: ["boots", "chelsea", "desert"],
    loafers: ["loafers", "penny", "moccasin"],
    oxford: ["oxford", "dress_shoes"],
    accessories: ["bag", "belt", "watch", "scarf", "hat", "cap"],
};

interface LikedCard {
    card_id: string;
    image_url: string;
    tags: string[];
    price?: number;
}

interface CoordinateSuggestion {
    base_card: LikedCard;
    suggestions: {
        card_id: string;
        image_url: string;
        tags: string[];
        reason: string;
        category?: string | null;
        price?: number;
    }[];
}

interface SceneCoordinate {
    scene: string;
    sceneInfo: typeof SCENE_COORDINATE_RULES[string];
    items: {
        card_id: string;
        image_url: string;
        tags: string[];
        category: string;
        reason: string;
        price?: number;
    }[];
    totalPrice: number;
}

function normalizeImageUrl(raw: string): string {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    if (s.startsWith("data:") || s.startsWith("blob:")) return s;
    const cleaned = s.replace(/\\/g, "/").replace(/^public\//, "");
    if (cleaned.startsWith("/")) return cleaned;
    return `/${cleaned}`;
}

function normalizeTags(tags: string[]): string[] {
    return (tags ?? []).map((t) => String(t).toLowerCase().trim()).filter(Boolean);
}

function detectCategory(tags: string[]): string | null {
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        if (tags.some((t) => keywords.some((kw) => t.toLowerCase().includes(kw)))) {
            return category;
        }
    }
    return null;
}

export default async function CoordinatePage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
        redirect("/login?next=/coordinate");
    }

    // ユーザーのいいねしたカードを取得
    const { data: actions } = await supabase
        .from("recommendation_actions")
        .select("impression_id, meta")
        .eq("user_id", auth.user.id)
        .eq("action", "save")
        .order("created_at", { ascending: false })
        .limit(50);

    if (!actions || actions.length === 0) {
        return (
            <LightBackground>
                <div className="min-h-screen flex items-center justify-center px-4 py-12">
                    <GlassCard className="max-w-md w-full text-center p-10">
                        <div className="text-6xl mb-4">👔</div>
                        <h1 className="text-2xl font-bold text-slate-900 mb-3">
                            AIコーディネート提案
                        </h1>
                        <p className="text-slate-500 mb-8">
                            まずアイテムをいくつかいいねしてください
                        </p>
                        <GlassButton href="/start" variant="gradient" size="lg" className="w-full justify-center">
                            スワイプを始める
                        </GlassButton>
                    </GlassCard>
                </div>
            </LightBackground>
        );
    }

    // インプレッション情報を取得
    const impressionIds = actions
        .map((a) => a.impression_id)
        .filter((id) => !!id);
    const { data: impressions } = await supabase
        .from("recommendation_impressions")
        .select("target_id, payload")
        .in("id", impressionIds.length > 0 ? impressionIds : ["__none__"]);

    const likedMap = new Map<string, LikedCard>();
    for (const imp of impressions ?? []) {
        const cardId = String(imp.target_id ?? "").trim();
        if (!cardId) continue;
        likedMap.set(cardId, {
            card_id: cardId,
            image_url: normalizeImageUrl(imp.payload?.image_url || `/cards/${cardId}.png`),
            tags: normalizeTags(imp.payload?.tags || []),
            price: imp.payload?.price,
        });
    }

    for (const action of actions ?? []) {
        const meta = action?.meta || {};
        const cardId = String(meta?.card_id ?? "").trim();
        if (!cardId || likedMap.has(cardId)) continue;
        const tags = normalizeTags(meta?.tags || []);
        const imageUrl = normalizeImageUrl(meta?.image_url || `/cards/${cardId}.png`);
        likedMap.set(cardId, {
            card_id: cardId,
            image_url: imageUrl,
            tags,
            price: meta?.price,
        });
    }

    const likedCards = Array.from(likedMap.values());

    // 全カードを取得
    const { data: allCards } = await supabase
        .from("curated_cards")
        .select("card_id, image_url, tags, price")
        .eq("is_active", true);

    const likedCardIds = new Set(likedCards.map((c) => c.card_id));
    const allCardsNormalized =
        allCards?.map((card) => ({
            ...card,
            image_url: normalizeImageUrl(card.image_url || `/cards/${card.card_id}.png`),
            tags: normalizeTags(card.tags || []),
        })) || [];

    // シーン別コーディネート生成
    const sceneCoordinates: SceneCoordinate[] = [];

    for (const [sceneKey, sceneInfo] of Object.entries(SCENE_COORDINATE_RULES)) {
        const items: SceneCoordinate["items"] = [];
        const usedCategories = new Set<string>();

        // 各必須カテゴリについてアイテムを選択
        for (const requiredCategory of sceneInfo.requiredCategories) {
            // まずいいねしたアイテムから探す
            let selectedCard = likedCards.find((card) => {
                const cardCategory = detectCategory(card.tags);
                if (!cardCategory || usedCategories.has(cardCategory)) return false;

                // カテゴリがマッチするか、関連カテゴリか
                const categoryKeywords = CATEGORY_KEYWORDS[requiredCategory] || [requiredCategory];
                return card.tags.some((t) =>
                    categoryKeywords.some((kw) => t.toLowerCase().includes(kw))
                );
            });

            // いいねしたアイテムがなければ全カードから探す
            if (!selectedCard) {
                const matchingCard = allCardsNormalized.find((card) => {
                    if (likedCardIds.has(card.card_id)) return false;
                    const cardTags = card.tags;
                    const cardCategory = detectCategory(cardTags);
                    if (!cardCategory || usedCategories.has(cardCategory)) return false;

                    const categoryKeywords = CATEGORY_KEYWORDS[requiredCategory] || [requiredCategory];
                    const hasCategory = cardTags.some((t) =>
                        categoryKeywords.some((kw) => t.includes(kw))
                    );
                    const hasPreferredTag = cardTags.some((t) =>
                        sceneInfo.preferredTags.includes(t)
                    );

                    return hasCategory && hasPreferredTag;
                });

                if (matchingCard) {
                    selectedCard = {
                        card_id: matchingCard.card_id,
                        image_url: matchingCard.image_url,
                        tags: matchingCard.tags,
                        price: matchingCard.price,
                    };
                } else {
                    const fallback = allCardsNormalized.find((card) => {
                        if (likedCardIds.has(card.card_id)) return false;
                        const cardCategory = detectCategory(card.tags);
                        if (!cardCategory || usedCategories.has(cardCategory)) return false;
                        const categoryKeywords = CATEGORY_KEYWORDS[requiredCategory] || [requiredCategory];
                        return card.tags.some((t) => categoryKeywords.some((kw) => t.includes(kw)));
                    });

                    if (fallback) {
                        selectedCard = {
                            card_id: fallback.card_id,
                            image_url: fallback.image_url,
                            tags: fallback.tags,
                            price: fallback.price,
                        };
                    }
                }
            }

            if (selectedCard) {
                const category = detectCategory(selectedCard.tags) || requiredCategory;
                usedCategories.add(category);
                items.push({
                    card_id: selectedCard.card_id,
                    image_url: selectedCard.image_url,
                    tags: selectedCard.tags,
                    category,
                    reason: getCategoryReason(category, sceneKey),
                    price: selectedCard.price,
                });
            }
        }

        if (items.length >= 3) {
            const totalPrice = items.reduce((sum, item) => sum + (item.price || 0), 0);
            sceneCoordinates.push({
                scene: sceneKey,
                sceneInfo,
                items,
                totalPrice,
            });
        }
    }

    // 従来のコーディネート提案も生成
    const coordinateSuggestions: CoordinateSuggestion[] = [];

    for (const baseCard of likedCards.slice(0, 5)) {
        let baseCategory: string | null = detectCategory(baseCard.tags);
        if (baseCategory && !COORDINATE_RULES[baseCategory]) {
            baseCategory = null;
        }
        if (!baseCategory) {
            for (const tag of baseCard.tags) {
                if (COORDINATE_RULES[tag]) {
                    baseCategory = tag;
                    break;
                }
            }
        }

        if (!baseCategory) continue;

        const rule = COORDINATE_RULES[baseCategory];
        const matchingTags = rule.matches;

        const matchingCards =
            allCardsNormalized
                ?.filter((card) => {
                    if (likedCardIds.has(card.card_id)) return false;
                    return card.tags.some((t) => matchingTags.includes(t));
                })
                .slice(0, 4)
                .map((card) => ({
                    ...card,
                    reason: rule.reason,
                    category: detectCategory(card.tags),
                })) || [];

        if (matchingCards.length > 0) {
            coordinateSuggestions.push({
                base_card: baseCard,
                suggestions: matchingCards,
            });
        }
    }

    const headingStyle = { fontFamily: "'Cormorant Garamond', serif" };

    return (
        <LightBackground>
            <GlassNavbar>
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/my"
                            className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-slate-500 hover:bg-white/80 hover:text-slate-800 transition-all duration-300 shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-slate-900" style={headingStyle}>
                                AIコーディネート提案
                            </h1>
                            <p className="text-xs text-slate-400">
                                シーンに合わせた完璧なコーデを自動でセレクト
                            </p>
                        </div>
                    </div>
                    <GlassButton href="/stylist" variant="secondary" size="sm">
                        AI Stylist
                    </GlassButton>
                </div>
            </GlassNavbar>

            <div className="h-20" />

            <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 pb-24 space-y-10">
                {sceneCoordinates.length > 0 && (
                    <section className="space-y-4">
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2" style={headingStyle}>
                            <span>📍</span>
                            シーン別コーデ
                        </h2>
                        <div className="space-y-6">
                            {sceneCoordinates.map((coord) => (
                                <GlassCard key={coord.scene} padding="none" className="overflow-hidden">
                                    <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-4">
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-3">
                                                <span className="text-3xl">{coord.sceneInfo.emoji}</span>
                                                <div>
                                                    <h3 className="text-xl font-bold">{coord.sceneInfo.name}コーデ</h3>
                                                    <p className="text-sm opacity-90">{coord.sceneInfo.advice}</p>
                                                </div>
                                            </div>
                                            {coord.totalPrice > 0 && (
                                                <div className="text-right">
                                                    <div className="text-sm opacity-80">合計</div>
                                                    <div className="text-xl font-bold">
                                                        ¥{coord.totalPrice.toLocaleString()}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="p-6">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            {coord.items.map((item, index) => (
                                                <div key={item.card_id} className="group">
                                                    <div className="rounded-2xl bg-white/70 border border-white/60 shadow-sm overflow-hidden">
                                                        <div className="relative aspect-square">
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img
                                                                src={item.image_url}
                                                                alt={item.card_id}
                                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                                            />
                                                            <span className="absolute top-2 left-2 px-2 py-1 bg-black/60 text-white text-xs rounded-full capitalize">
                                                                {item.category}
                                                            </span>
                                                            <span className="absolute top-2 right-2 w-6 h-6 bg-purple-500 text-white text-xs rounded-full flex items-center justify-center">
                                                                {index + 1}
                                                            </span>
                                                        </div>
                                                        <div className="p-3">
                                                            <p className="text-xs text-slate-600 line-clamp-2">
                                                                {item.reason}
                                                            </p>
                                                            {item.price && (
                                                                <p className="text-sm font-bold text-purple-600 mt-1">
                                                                    ¥{item.price.toLocaleString()}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </GlassCard>
                            ))}
                        </div>
                    </section>
                )}

                {coordinateSuggestions.length > 0 && (
                    <section className="space-y-4">
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2" style={headingStyle}>
                            <span>✨</span>
                            いいねアイテムからの提案
                        </h2>
                        <div className="space-y-8">
                            {coordinateSuggestions.map((coord) => (
                                <GlassCard key={coord.base_card.card_id} className="p-6">
                                    <div className="flex flex-col md:flex-row gap-6">
                                        <div className="md:w-1/4">
                                            <p className="text-sm text-slate-500 mb-2">いいねしたアイテム</p>
                                            <div className="relative">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={coord.base_card.image_url}
                                                    alt={coord.base_card.card_id}
                                                    className="w-full aspect-square object-cover rounded-2xl"
                                                />
                                                <div className="absolute top-2 right-2">
                                                    <GlassBadge variant="gradient" size="sm">
                                                        ❤️
                                                    </GlassBadge>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="hidden md:flex items-center text-4xl text-slate-300">
                                            →
                                        </div>

                                        <div className="flex-1">
                                            <p className="text-sm text-slate-500 mb-2">
                                                💡 {coord.suggestions[0]?.reason}
                                            </p>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                {coord.suggestions.map((suggestion) => (
                                                    <div
                                                        key={suggestion.card_id}
                                                        className="group rounded-2xl bg-white/70 border border-white/60 overflow-hidden hover:shadow-md transition-shadow"
                                                    >
                                                        <div className="aspect-square relative">
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img
                                                                src={suggestion.image_url}
                                                                alt={suggestion.card_id}
                                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                                            />
                                                            {suggestion.category && (
                                                                <span className="absolute top-2 left-2 text-xs px-2 py-0.5 bg-black/60 text-white rounded-full capitalize">
                                                                    {suggestion.category}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="p-2">
                                                            {suggestion.price && (
                                                                <p className="text-xs font-bold text-purple-600">
                                                                    ¥{suggestion.price.toLocaleString()}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </GlassCard>
                            ))}
                        </div>
                    </section>
                )}

                {sceneCoordinates.length === 0 && coordinateSuggestions.length === 0 && (
                    <GlassCard className="p-12 text-center">
                        <div className="text-6xl mb-4">🤔</div>
                        <p className="text-slate-500 mb-6">コーディネートを生成できませんでした</p>
                        <GlassButton href="/start" variant="gradient" size="lg">
                            もっとスワイプする
                        </GlassButton>
                    </GlassCard>
                )}

                <GlassCard variant="gradient" className="p-6">
                    <Link href="/stylist" className="block">
                        <div className="flex items-center gap-4 text-white">
                            <div className="text-4xl">🤖</div>
                            <div className="flex-1">
                                <h3 className="font-bold text-lg">AIスタイリストに相談</h3>
                                <p className="text-sm opacity-90">
                                    チャットでもっと詳しいコーデ提案を受けられます
                                </p>
                            </div>
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </div>
                    </Link>
                </GlassCard>

                <GlassCard className="p-6">
                    <h3 className="font-semibold mb-4 flex items-center gap-2 text-slate-900">
                        <span>💡</span> コーデのコツ
                    </h3>
                    <div className="grid md:grid-cols-3 gap-4">
                        <div className="rounded-2xl bg-white/70 border border-white/60 p-4">
                            <h4 className="font-medium mb-2">🎨 色は3色以内</h4>
                            <p className="text-sm text-slate-600">
                                色数を抑えるとまとまりが出ます。ベース・アソート・アクセントの3色を意識して。
                            </p>
                        </div>
                        <div className="rounded-2xl bg-white/70 border border-white/60 p-4">
                            <h4 className="font-medium mb-2">📐 シルエットでメリハリ</h4>
                            <p className="text-sm text-slate-600">
                                トップスとボトムスのバランスを意識。上がゆったりなら下はすっきり。
                            </p>
                        </div>
                        <div className="rounded-2xl bg-white/70 border border-white/60 p-4">
                            <h4 className="font-medium mb-2">👟 足元で印象チェンジ</h4>
                            <p className="text-sm text-slate-600">
                                同じコーデでも靴を変えるだけで印象がガラッと変わります。
                            </p>
                        </div>
                    </div>
                </GlassCard>
            </main>
        </LightBackground>
    );
}

function getCategoryReason(category: string, scene: string): string {
    const reasons: Record<string, Record<string, string>> = {
        date: {
            jacket: "デートの好印象アウター",
            blazer: "きちんと感のあるジャケット",
            shirt: "清潔感のあるシャツ",
            tshirt: "程よくカジュアルなトップス",
            pants: "すっきりシルエットのボトムス",
            chinos: "きれいめカジュアルなチノ",
            jeans: "定番のデニム",
            shoes: "足元で好印象を",
            sneakers: "おしゃれスニーカー",
            loafers: "大人っぽいローファー",
            accessories: "さりげないアクセント",
        },
        office: {
            jacket: "ビジネスの定番アウター",
            blazer: "オフィスの必需品",
            shirt: "きちんとしたシャツ",
            pants: "ビジネス向けパンツ",
            chinos: "オフィスカジュアルに最適",
            shoes: "ビジネスシューズ",
            loafers: "上品なローファー",
            oxford: "フォーマルな革靴",
            accessories: "ビジネスアクセサリー",
        },
        casual: {
            jacket: "カジュアルアウター",
            tshirt: "リラックスTシャツ",
            sweater: "ゆったりニット",
            hoodie: "定番パーカー",
            pants: "動きやすいパンツ",
            jeans: "定番デニム",
            sneakers: "歩きやすいスニーカー",
            accessories: "カジュアル小物",
        },
        party: {
            jacket: "パーティ向けジャケット",
            blazer: "華やかなブレザー",
            shirt: "ドレッシーなシャツ",
            pants: "エレガントなパンツ",
            shoes: "フォーマルシューズ",
            accessories: "華やかな小物",
        },
        travel: {
            jacket: "旅行に便利なアウター",
            coat: "温度調節できるコート",
            tshirt: "着回しやすいトップス",
            sweater: "レイヤリングに最適",
            pants: "動きやすいパンツ",
            jeans: "旅行の定番デニム",
            sneakers: "歩きやすい靴",
            accessories: "旅行小物",
        },
        weekend: {
            jacket: "週末のお気に入り",
            tshirt: "リラックストップス",
            hoodie: "休日のパーカー",
            pants: "リラックスパンツ",
            jeans: "カジュアルデニム",
            sneakers: "お気に入りスニーカー",
            accessories: "おしゃれ小物",
        },
    };

    return reasons[scene]?.[category] || `${scene}に合う${category}`;
}
