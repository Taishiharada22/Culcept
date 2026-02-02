// app/api/visual-search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import type { VisualSearchResult } from "@/types/visual-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/visual-search - 画像から類似商品を検索
 * 
 * NOTE: これは簡易実装です。本番環境では以下を推奨：
 * - Cloud Vision API / AWS Rekognition でタグ抽出
 * - OpenAI CLIP / Vertex AI でベクトル埋め込み
 * - Pinecone / Weaviate でベクトル検索
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json(
                { ok: false, error: "Not authenticated" },
                { status: 401 }
            );
        }

        const body = await req.json();
        const { image } = body; // base64 encoded image

        if (!image) {
            return NextResponse.json(
                { ok: false, error: "Missing image" },
                { status: 400 }
            );
        }

        // 簡易実装: ランダムに商品を返す（デモ用）
        // 本番環境では画像解析 + ベクトル検索を実装
        const { data: products, error } = await supabase
            .from("drops")
            .select("id,title,brand,price,cover_image_url,tags")
            .eq("status", "published")
            .not("cover_image_url", "is", null)
            .limit(20);

        if (error) {
            throw error;
        }

        // 簡易スコアリング（デモ用）
        const results: VisualSearchResult[] = (products || []).map((product: any) => {
            // ランダムな類似度（実際は画像解析結果から計算）
            const similarity_score = Math.floor(Math.random() * 30) + 70; // 70-100%

            // 簡易マッチ特徴（実際は画像解析から抽出）
            const match_features: string[] = [];
            if (product.brand) match_features.push(`Brand: ${product.brand}`);
            if (Array.isArray(product.tags) && product.tags.length > 0) {
                match_features.push(...product.tags.slice(0, 2));
            }
            match_features.push("Similar style");

            return {
                product_id: product.id,
                title: product.title,
                brand: product.brand,
                price: product.price,
                cover_image_url: product.cover_image_url,
                similarity_score,
                match_features,
            };
        });

        // スコアでソート
        results.sort((a, b) => b.similarity_score - a.similarity_score);

        return NextResponse.json({
            ok: true,
            results: results.slice(0, 12),
            note: "This is a simplified implementation. For production, integrate with Cloud Vision API or similar service.",
        });
    } catch (err: any) {
        console.error("POST /api/visual-search error:", err);
        return NextResponse.json(
            { ok: false, error: err.message || "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * 本番実装の参考実装例（コメントアウト）
 * 
 * async function analyzeImageWithCloudVision(base64Image: string) {
 *     const vision = require('@google-cloud/vision');
 *     const client = new vision.ImageAnnotatorClient();
 *     
 *     const [result] = await client.labelDetection({
 *         image: { content: base64Image }
 *     });
 *     
 *     const labels = result.labelAnnotations.map(l => l.description);
 *     const colors = result.imagePropertiesAnnotation.dominantColors.colors;
 *     
 *     return { labels, colors };
 * }
 * 
 * async function findSimilarWithEmbeddings(embedding: number[]) {
 *     // Pinecone / Weaviate などでベクトル検索
 *     const pinecone = new Pinecone();
 *     const results = await pinecone.query({
 *         vector: embedding,
 *         topK: 20,
 *     });
 *     
 *     return results.matches;
 * }
 */
