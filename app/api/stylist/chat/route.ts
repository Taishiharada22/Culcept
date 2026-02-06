// app/api/stylist/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { buildUserProfile } from "@/lib/recommendations/content-based";

export const runtime = "nodejs";

interface CardSuggestion {
    card_id: string;
    image_url: string;
    tags: string[];
    reason: string;
    price?: number;
    category?: string;
}

interface ConversationContext {
    scene?: string | null;
    budget?: { min: number; max: number } | null;
    weather?: string | null;
    season?: string | null;
    preferredColors?: string[];
    excludeTags?: string[];
    previousSuggestions?: string[];
}

// スタイルキーワードマッピング
const STYLE_KEYWORDS: Record<string, string[]> = {
    casual: ["casual", "tshirt", "jeans", "sneakers", "hoodie", "joggers"],
    formal: ["formal", "blazer", "dress", "oxford", "loafers", "trench"],
    street: ["street", "streetwear", "hoodie", "bomber", "sneakers", "graphic", "cargo"],
    minimal: ["minimal", "black", "white", "grey", "clean", "simple"],
    vintage: ["vintage", "retro", "classic", "leather", "denim", "boots"],
    sporty: ["sport", "joggers", "sneakers", "windbreaker", "athletic"],
    smart: ["smart", "chinos", "polo", "oxford", "loafers", "blazer"],
    romantic: ["romantic", "floral", "lace", "soft", "feminine", "pastel"],
    edgy: ["edgy", "leather", "black", "studs", "rock", "punk"],
};

// 日本語キーワードからスタイルを検出
const JP_STYLE_MAP: Record<string, string[]> = {
    カジュアル: ["casual"],
    フォーマル: ["formal"],
    ストリート: ["street"],
    ミニマル: ["minimal"],
    ヴィンテージ: ["vintage"],
    ビンテージ: ["vintage"],
    スポーティ: ["sporty"],
    スマート: ["smart"],
    シンプル: ["minimal"],
    きれいめ: ["smart", "formal"],
    モノトーン: ["minimal", "black", "white"],
    デニム: ["denim", "jeans"],
    レザー: ["leather"],
    アウター: ["jacket", "coat", "outerwear"],
    トップス: ["shirt", "tops", "sweater"],
    ボトムス: ["pants", "bottoms", "jeans"],
    ロマンチック: ["romantic"],
    エッジー: ["edgy"],
    かっこいい: ["edgy", "street"],
    かわいい: ["romantic", "casual"],
    大人っぽい: ["smart", "formal"],
};

// シーンキーワード（拡張版）
const SCENE_KEYWORDS: Record<string, { tags: string[]; advice: string[]; followUp: string }> = {
    デート: {
        tags: ["smart", "romantic", "clean", "casual", "date-worthy"],
        advice: [
            "第一印象が大切なデートには、清潔感のあるスタイルがおすすめ。程よくおしゃれで、自分らしさも出せるコーデを選びましょう。",
            "デートには清潔感が最重要！髪型や香りにも気を配ると◎",
            "初デートなら無難に、2回目以降は少し個性を出しても素敵です。",
        ],
        followUp: "どんな場所でのデートですか？（カフェ、レストラン、映画など）",
    },
    彼氏: {
        tags: ["smart", "romantic", "clean", "date-worthy"],
        advice: ["彼との時間を素敵に過ごすために、少し特別感のあるコーデがおすすめ。"],
        followUp: "どんなシチュエーションですか？",
    },
    彼女: {
        tags: ["smart", "romantic", "clean", "casual"],
        advice: ["彼女との時間には、清潔感と自分らしさのバランスが大切。"],
        followUp: "どんなデートプランですか？",
    },
    ディナー: {
        tags: ["smart", "formal", "elegant", "dressy"],
        advice: ["ディナーには少しドレッシーに。レストランの雰囲気に合わせましょう。"],
        followUp: "どんな雰囲気のレストランですか？",
    },
    映画: {
        tags: ["casual", "comfortable", "relaxed"],
        advice: ["映画館では長時間座るので、楽な服装がベスト。でもおしゃれ感も忘れずに。"],
        followUp: "映画の後の予定はありますか？",
    },
    記念日: {
        tags: ["formal", "elegant", "dressy", "romantic"],
        advice: ["特別な日にふさわしい、少し華やかなスタイルで。"],
        followUp: "どんな過ごし方を予定していますか？",
    },
    仕事: {
        tags: ["formal", "smart", "blazer", "oxford", "chinos", "professional"],
        advice: [
            "ビジネスシーンでは信頼感のある装いを。基本はジャケットスタイルで、業種に合わせて調整しましょう。",
            "第一印象で仕事の成果も変わる！清潔感と信頼感を意識して。",
        ],
        followUp: "どんな業種・シーンですか？（商談、プレゼン、日常業務など）",
    },
    オフィス: {
        tags: ["smart", "blazer", "shirt", "chinos", "loafers", "office"],
        advice: ["オフィスカジュアルなら、ジャケット＋シャツ＋チノの組み合わせが鉄板です。"],
        followUp: "会社のドレスコードは厳しめですか？",
    },
    面接: {
        tags: ["formal", "smart", "clean", "professional", "blazer"],
        advice: ["面接では第一印象が命。清潔感と誠実さを服装で表現しましょう。"],
        followUp: "どんな業界の面接ですか？",
    },
    プレゼン: {
        tags: ["formal", "smart", "professional", "confident"],
        advice: ["プレゼンでは自信を持って見えるスタイルを。ジャケットがあると説得力アップ。"],
        followUp: "どんな規模のプレゼンですか？",
    },
    カフェ: {
        tags: ["casual", "minimal", "relaxed", "sneakers", "cozy"],
        advice: ["カフェでのリラックスタイムには、ゆったりとしたシルエットがおすすめ。"],
        followUp: "一人時間？それとも誰かと一緒？",
    },
    飲み会: {
        tags: ["casual", "smart", "shirt", "jeans", "social"],
        advice: ["飲み会はカジュアルすぎず、キメすぎない絶妙なバランスを。動きやすさも考慮して。"],
        followUp: "会社の飲み会？友達との飲み会？",
    },
    合コン: {
        tags: ["smart", "casual", "clean", "stylish", "approachable"],
        advice: ["合コンでは清潔感＋親しみやすさがポイント。キメすぎず、話しやすい雰囲気を。"],
        followUp: "どんな雰囲気の場所ですか？",
    },
    パーティ: {
        tags: ["formal", "blazer", "dress", "elegant", "statement"],
        advice: ["パーティーでは少し華やかに。ジャケットは必須、アクセサリーで個性を出しましょう。"],
        followUp: "どんなタイプのパーティーですか？",
    },
    結婚式: {
        tags: ["formal", "elegant", "dressy", "classic"],
        advice: ["結婚式にはフォーマルで。白は避けて、華やかさも意識しましょう。"],
        followUp: "式場はホテル？レストラン？",
    },
    旅行: {
        tags: ["casual", "comfortable", "sneakers", "layers", "functional"],
        advice: ["旅行は動きやすさ重視。レイヤリングで温度調節できるようにするのがコツ。"],
        followUp: "どこへ行きますか？国内？海外？",
    },
    アウトドア: {
        tags: ["sporty", "outdoor", "functional", "sneakers", "active"],
        advice: ["アウトドアには機能性重視のアイテムを。天候の変化にも対応できる準備を。"],
        followUp: "キャンプ？ハイキング？BBQ？",
    },
    スポーツ: {
        tags: ["sporty", "athletic", "functional", "active", "comfortable"],
        advice: ["スポーツには動きやすさが最優先。でも見た目もカッコよく！"],
        followUp: "どんなスポーツですか？",
    },
    ジム: {
        tags: ["sporty", "athletic", "functional", "workout"],
        advice: ["ジムでは機能性重視。でも気分が上がるウェア選びも大切。"],
        followUp: "どんなトレーニングをしますか？",
    },
    ショッピング: {
        tags: ["casual", "comfortable", "sneakers", "tshirt", "relaxed"],
        advice: ["ショッピングは歩きやすさが大事。試着しやすい服装で行きましょう。"],
        followUp: "どんなお店を回りますか？",
    },
    初対面: {
        tags: ["smart", "clean", "minimal", "casual", "approachable"],
        advice: ["初対面の印象は7秒で決まると言われています。清潔感と親しみやすさのバランスを意識して。"],
        followUp: "どんな場面での初対面ですか？",
    },
    散歩: {
        tags: ["casual", "comfortable", "relaxed", "sneakers"],
        advice: ["散歩には動きやすくてリラックスできるスタイルを。"],
        followUp: "どんな場所を歩きますか？",
    },
    美術館: {
        tags: ["smart", "minimal", "clean", "quiet"],
        advice: ["美術館では落ち着いた色味で、作品を邪魔しないシンプルなスタイルがおすすめ。"],
        followUp: "デートで行きますか？一人で？",
    },
    ライブ: {
        tags: ["casual", "comfortable", "sporty", "active"],
        advice: ["ライブでは動きやすさと暑さ対策を。スニーカーは必須！"],
        followUp: "どんなジャンルのライブですか？",
    },
    フェス: {
        tags: ["casual", "outdoor", "comfortable", "layers", "functional"],
        advice: ["フェスには動きやすさ＋天候対策が必須。個性的なアイテムで楽しむのも◎"],
        followUp: "屋内？野外？",
    },
};

// 天気キーワード
const WEATHER_KEYWORDS: Record<string, { tags: string[]; advice: string }> = {
    晴れ: {
        tags: ["light", "bright", "sunglasses"],
        advice: "晴れの日は明るめのカラーが映えます。日差し対策も忘れずに。",
    },
    曇り: {
        tags: ["layers", "neutral"],
        advice: "曇りの日は落ち着いたトーンで。急な天気の変化に備えてレイヤリングを。",
    },
    雨: {
        tags: ["waterproof", "dark", "boots"],
        advice: "雨の日は撥水素材や暗めの色がベター。足元は防水のものを選んで。",
    },
    寒い: {
        tags: ["coat", "layers", "warm", "knit", "boots"],
        advice: "寒い日はしっかりレイヤリング。インナーで温度調整できるようにしましょう。",
    },
    暑い: {
        tags: ["light", "breathable", "shorts", "sandals", "tshirt"],
        advice: "暑い日は通気性の良い素材を。明るい色で涼しげな印象に。",
    },
};

// 予算キーワード検出
function detectBudget(message: string): { min: number; max: number } | null {
    // "1万円以内"、"〜5000円"、"3000-5000円"などのパターン
    const patterns = [
        /(\d+)万円?以内/,
        /(\d+)円以内/,
        /〜(\d+)円/,
        /(\d+)[-〜](\d+)円/,
        /予算(\d+)/,
        /(\d+)k/i,
    ];

    for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match) {
            if (match[2]) {
                // 範囲指定
                return { min: parseInt(match[1]), max: parseInt(match[2]) };
            } else {
                const value = parseInt(match[1]);
                // "万"が含まれていれば10000倍
                if (message.includes("万")) {
                    return { min: 0, max: value * 10000 };
                }
                // "k"が含まれていれば1000倍
                if (message.toLowerCase().includes("k")) {
                    return { min: 0, max: value * 1000 };
                }
                return { min: 0, max: value };
            }
        }
    }

    // 抽象的な表現
    if (message.includes("安め") || message.includes("プチプラ") || message.includes("安い")) {
        return { min: 0, max: 5000 };
    }
    if (message.includes("高め") || message.includes("ちょっと奮発") || message.includes("ご褒美")) {
        return { min: 10000, max: 50000 };
    }

    return null;
}

// シーン検出（強化版）
function detectScene(message: string): string | null {
    // 完全一致優先
    for (const [scene, _] of Object.entries(SCENE_KEYWORDS)) {
        if (message.includes(scene)) {
            return scene;
        }
    }

    // 類似ワード検出
    const sceneAliases: Record<string, string[]> = {
        デート: ["date", "恋人", "好きな人", "気になる人", "告白"],
        仕事: ["work", "ビジネス", "business", "出勤", "会社"],
        面接: ["就活", "転職", "採用"],
        パーティ: ["party", "パーティー", "お祝い", "祝賀会"],
        結婚式: ["ウェディング", "披露宴", "二次会"],
        旅行: ["travel", "trip", "観光", "帰省"],
        カフェ: ["cafe", "喫茶店", "お茶"],
        飲み会: ["飲み", "宴会", "居酒屋"],
    };

    for (const [scene, aliases] of Object.entries(sceneAliases)) {
        for (const alias of aliases) {
            if (message.toLowerCase().includes(alias.toLowerCase())) {
                return scene;
            }
        }
    }

    return null;
}

// 天気検出
function detectWeather(message: string): string | null {
    for (const [weather, _] of Object.entries(WEATHER_KEYWORDS)) {
        if (message.includes(weather)) {
            return weather;
        }
    }
    return null;
}

function detectStyles(message: string): string[] {
    const lowerMessage = message.toLowerCase();
    const detectedStyles: Set<string> = new Set();

    // 日本語キーワードチェック
    for (const [jp, styles] of Object.entries(JP_STYLE_MAP)) {
        if (message.includes(jp)) {
            styles.forEach((s) => detectedStyles.add(s));
        }
    }

    // 英語キーワードチェック
    for (const [style, keywords] of Object.entries(STYLE_KEYWORDS)) {
        for (const kw of keywords) {
            if (lowerMessage.includes(kw)) {
                detectedStyles.add(style);
                break;
            }
        }
    }

    return [...detectedStyles];
}

function generateResponse(
    styles: string[],
    suggestions: CardSuggestion[],
    userTags: string[],
    context: ConversationContext
): string {
    if (suggestions.length === 0) {
        return "申し訳ありません、ご希望に合うアイテムが見つかりませんでした。条件を変えてみるか、別のスタイルをお試しください！\n\n💡 例えば「カジュアルなデート服」「予算1万円以内でオフィスカジュアル」などと教えてください。";
    }

    const styleNames: Record<string, string> = {
        casual: "カジュアル",
        formal: "フォーマル",
        street: "ストリート",
        minimal: "ミニマル",
        vintage: "ヴィンテージ",
        sporty: "スポーティ",
        smart: "スマートカジュアル",
        romantic: "ロマンチック",
        edgy: "エッジー",
    };

    const detectedStyleText = styles
        .map((s) => styleNames[s] || s)
        .filter(Boolean)
        .join("・");

    let response = "";

    // シーンがある場合
    if (context.scene) {
        response += `📍 **${context.scene}**のコーデですね！\n\n`;
        const sceneInfo = SCENE_KEYWORDS[context.scene];
        if (sceneInfo) {
            response += `💡 ${sceneInfo.advice}\n\n`;
        }
    }

    // 天気がある場合
    if (context.weather) {
        const weatherInfo = WEATHER_KEYWORDS[context.weather];
        if (weatherInfo) {
            response += `🌤️ ${context.weather}の日のポイント: ${weatherInfo.advice}\n\n`;
        }
    }

    // 予算がある場合
    if (context.budget) {
        if (context.budget.max < 5000) {
            response += `💰 プチプラでもおしゃれに！予算内でベストなアイテムを選びました。\n\n`;
        } else if (context.budget.max > 20000) {
            response += `✨ 少し贅沢に、長く使える上質アイテムを中心にセレクトしました。\n\n`;
        }
    }

    if (detectedStyleText && !context.scene) {
        response += `${detectedStyleText}スタイルですね！✨\n\n`;
    }

    if (userTags.length > 0) {
        response += `あなたの好みの「${userTags.slice(0, 3).join("」「")}」も考慮して、`;
    }

    response += `${suggestions.length}点のおすすめを選びました👇\n\n`;

    // カテゴリ別のアドバイス
    const categories = new Set(suggestions.map((s) => s.category).filter(Boolean));
    if (categories.size > 1) {
        response += "これらのアイテムを組み合わせると素敵なコーデになりますよ！\n\n";
    }

    // スタイル別の詳細アドバイス
    response += "📝 **コーデのポイント**\n";

    if (styles.includes("minimal")) {
        response += "• 色数を2〜3色に抑えるとよりミニマルに\n";
        response += "• シルエットはすっきりとしたIラインを意識\n";
        response += "• 素材感で差をつけるのがコツ\n";
    } else if (styles.includes("street")) {
        response += "• オーバーサイズ感を意識してリラックス感を\n";
        response += "• スニーカーは主役になるハイテク系がおすすめ\n";
        response += "• キャップやバッグで個性をプラス\n";
    } else if (styles.includes("formal") || styles.includes("smart")) {
        response += "• サイズ感をジャストに合わせて清潔感を\n";
        response += "• 小物で個性を出すとおしゃれ度アップ\n";
        response += "• シワに注意して、アイロンがけを忘れずに\n";
    } else if (styles.includes("romantic")) {
        response += "• 柔らかい素材感を大切に\n";
        response += "• アクセサリーは控えめに、品よく\n";
        response += "• パステルカラーで優しい印象に\n";
    } else if (context.scene === "デート") {
        response += "• 清潔感が何より大切\n";
        response += "• 香りにも気を使うとなお良し\n";
        response += "• 自分らしさを忘れずに\n";
    } else {
        response += "• バランスよく組み合わせて、自分らしさを\n";
        response += "• 色味を統一するとまとまりが出ます\n";
        response += "• 足元で全体の印象が変わります\n";
    }

    // フォローアップ提案
    response += "\n\n💬 **他にも聞いてね**\n";
    response += "「もっとカジュアルに」「予算を抑えたい」「色違いも見たい」など、何でも言ってください！";

    return response;
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        const { message, conversationHistory } = await request.json();

        if (!message) {
            return NextResponse.json({ error: "Message required" }, { status: 400 });
        }

        // 会話全体から文脈を抽出
        const context: ConversationContext = {
            previousSuggestions: [],
        };

        // 現在のメッセージと過去の会話から文脈を抽出
        const allMessages = conversationHistory
            ? [...conversationHistory.map((h: { content: string }) => h.content), message].join(" ")
            : message;

        // 文脈抽出
        context.scene = detectScene(allMessages);
        context.weather = detectWeather(allMessages);
        context.budget = detectBudget(allMessages);

        // スタイル検出
        const detectedStyles = detectStyles(message);

        // シーンからもスタイルを追加
        if (context.scene && SCENE_KEYWORDS[context.scene]) {
            SCENE_KEYWORDS[context.scene].tags.forEach((tag) => {
                if (!detectedStyles.includes(tag)) {
                    detectedStyles.push(tag);
                }
            });
        }

        // 天気からもタグを追加
        if (context.weather && WEATHER_KEYWORDS[context.weather]) {
            WEATHER_KEYWORDS[context.weather].tags.forEach((tag) => {
                if (!detectedStyles.includes(tag)) {
                    detectedStyles.push(tag);
                }
            });
        }

        // ユーザープロファイル取得（ログイン時のみ）
        let userTags: string[] = [];
        if (auth?.user) {
            const profile = await buildUserProfile(auth.user.id);
            userTags = [...profile.tagPreferences.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([tag]) => tag);
        }

        // 検索するタグを決定
        const searchTags: string[] = [];

        // スタイルに基づくタグ
        detectedStyles.forEach((style) => {
            const keywords = STYLE_KEYWORDS[style];
            if (keywords) {
                searchTags.push(...keywords.slice(0, 3));
            } else {
                searchTags.push(style);
            }
        });

        // ユーザーの好みタグも追加
        if (userTags.length > 0) {
            searchTags.push(...userTags.slice(0, 2));
        }

        // タグがない場合はデフォルト
        if (searchTags.length === 0) {
            searchTags.push("casual", "jacket", "shirt");
        }

        // カードを検索（予算フィルタを適用）
        let query = supabase
            .from("curated_cards")
            .select("card_id, image_url, tags, price")
            .eq("is_active", true)
            .overlaps("tags", searchTags);

        // 予算フィルタ
        if (context.budget) {
            if (context.budget.min > 0) {
                query = query.gte("price", context.budget.min);
            }
            if (context.budget.max > 0) {
                query = query.lte("price", context.budget.max);
            }
        }

        const { data: cards } = await query.limit(100);

        // スコアリング
        const scoredCards =
            cards?.map((card) => {
                let score = 0;
                const matchedTags: string[] = [];

                card.tags?.forEach((tag: string) => {
                    if (searchTags.includes(tag)) {
                        score += 2;
                        matchedTags.push(tag);
                    }
                    if (userTags.includes(tag)) {
                        score += 1.5;
                    }
                });

                // カテゴリを特定
                const category = card.tags?.find((t: string) =>
                    ["jacket", "blazer", "coat", "shirt", "tshirt", "sweater", "hoodie", "pants", "jeans", "shorts", "shoes", "sneakers", "boots", "accessories", "bag"].includes(t)
                );

                return { ...card, score, matchedTags, category };
            }) || [];

        // トップを選択（カテゴリの多様性を確保）
        scoredCards.sort((a, b) => b.score - a.score);

        const selectedCards: typeof scoredCards = [];
        const usedCategories = new Set<string>();
        const categoryPriority = ["jacket", "shirt", "pants", "shoes"]; // コーデの基本

        // まずカテゴリ優先で選択
        for (const priorityCategory of categoryPriority) {
            const card = scoredCards.find(
                (c) => c.category === priorityCategory && !usedCategories.has(c.category || "")
            );
            if (card && selectedCards.length < 4) {
                selectedCards.push(card);
                if (card.category) usedCategories.add(card.category);
            }
        }

        // 残りを追加
        for (const card of scoredCards) {
            if (selectedCards.length >= 4) break;

            if (!card.category || !usedCategories.has(card.category)) {
                selectedCards.push(card);
                if (card.category) usedCategories.add(card.category);
            }
        }

        // 提案を作成
        const suggestions: CardSuggestion[] = selectedCards.map((card) => ({
            card_id: card.card_id,
            image_url: card.image_url,
            tags: card.tags || [],
            reason: generateItemReason(card.matchedTags, card.category, context),
            price: card.price,
            category: card.category,
        }));

        // レスポンス生成
        const responseMessage = generateResponse(detectedStyles, suggestions, userTags, context);

        return NextResponse.json({
            message: responseMessage,
            suggestions,
            detected_styles: detectedStyles,
            context: {
                scene: context.scene,
                weather: context.weather,
                budget: context.budget,
            },
        });
    } catch (error) {
        console.error("Stylist chat error:", error);
        return NextResponse.json(
            { error: "Internal error", message: "エラーが発生しました。" },
            { status: 500 }
        );
    }
}

function generateItemReason(
    matchedTags: string[],
    category: string | undefined,
    context: ConversationContext
): string {
    const reasons: string[] = [];

    // シーン別の理由
    if (context.scene) {
        const sceneReasons: Record<string, Record<string, string>> = {
            デート: {
                jacket: "デートにぴったりの好印象アウター",
                shirt: "清潔感のあるトップス",
                pants: "すっきりシルエットのボトムス",
                shoes: "足元で印象アップ",
            },
            仕事: {
                jacket: "ビジネスに最適な1着",
                shirt: "オフィスで映えるシャツ",
                pants: "きちんと感のあるボトムス",
                shoes: "信頼感のある足元に",
            },
        };

        if (sceneReasons[context.scene] && category && sceneReasons[context.scene][category]) {
            return sceneReasons[context.scene][category];
        }
    }

    // マッチしたタグからの理由
    if (matchedTags.length > 0) {
        return `${matchedTags.slice(0, 2).join(" × ")} のスタイルにマッチ`;
    }

    // カテゴリ別のデフォルト理由
    const categoryReasons: Record<string, string> = {
        jacket: "コーデの主役になるアウター",
        blazer: "きれいめスタイルの必需品",
        coat: "季節感のあるアウター",
        shirt: "合わせやすい万能トップス",
        tshirt: "カジュアルの基本アイテム",
        sweater: "季節感のあるニット",
        hoodie: "リラックス感のあるトップス",
        pants: "シルエットを決めるボトムス",
        jeans: "どんなトップスにも合うデニム",
        shorts: "季節感のあるボトムス",
        shoes: "足元を引き締めるシューズ",
        sneakers: "動きやすいフットウェア",
        boots: "季節感のあるフットウェア",
        accessories: "アクセントになる小物",
        bag: "実用性とおしゃれを兼ね備えて",
    };

    return categoryReasons[category || ""] || "おすすめアイテム";
}
