// app/api/tribes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * トライブ一覧取得
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        // カードを取得してサンプルデータに使用
        const { data: cards } = await supabase
            .from("curated_cards")
            .select("card_id, image_url, tags")
            .eq("is_active", true)
            .limit(30);

        const cardsByTag: Record<string, typeof cards> = {};
        (cards || []).forEach((card) => {
            card.tags?.forEach((tag: string) => {
                if (!cardsByTag[tag]) cardsByTag[tag] = [];
                cardsByTag[tag].push(card);
            });
        });

        // トライブデータ
        const tribesData = [
            {
                id: "street",
                name: "ストリートトライブ",
                description: "ストリートファッションを愛する人たちの集まり",
                icon: "🧢",
                members: 2450,
                posts: 1230,
            },
            {
                id: "minimal",
                name: "ミニマリスト",
                description: "シンプルで洗練されたスタイルを追求",
                icon: "⬜",
                members: 1890,
                posts: 890,
            },
            {
                id: "vintage",
                name: "ヴィンテージラバーズ",
                description: "レトロ・ヴィンテージスタイルの愛好家",
                icon: "🎸",
                members: 1560,
                posts: 720,
            },
            {
                id: "sporty",
                name: "アスレジャー部",
                description: "スポーティなスタイルをカジュアルに",
                icon: "🏃",
                members: 2100,
                posts: 980,
            },
            {
                id: "luxury",
                name: "ラグジュアリークラブ",
                description: "高級ブランドとハイファッション",
                icon: "💎",
                members: 890,
                posts: 450,
            },
            {
                id: "casual",
                name: "デイリーカジュアル",
                description: "毎日のおしゃれを楽しむ",
                icon: "👕",
                members: 3200,
                posts: 1560,
            },
        ];

        const tribes = tribesData.map((tribe) => {
            const relatedCards = cardsByTag[tribe.id] || cards?.slice(0, 5) || [];
            return {
                ...tribe,
                joined: false,
                featured_items: relatedCards.slice(0, 5).map((c) => ({
                    id: c.card_id,
                    image_url: c.image_url,
                })),
            };
        });

        return NextResponse.json({
            tribes,
            myTribes: auth?.user ? ["casual"] : [],
        });
    } catch (error) {
        console.error("Tribes error:", error);
        return NextResponse.json({ tribes: [], myTribes: [] });
    }
}
