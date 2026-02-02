// scripts/phase1-all.ts
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Phase 1: データ品質改善（完全統合版）
 * 
 * Step 1: タグ無し一括タグ付け
 * Step 2: is_active=false クリーンアップ
 * Step 3: card_id 命名統一
 * Step 4: seen判定リセット強化
 */

// ============================================================================
// Utils
// ============================================================================

function normalizeCardId(cardId: string): string {
    return cardId
        .toLowerCase()
        .replace(/-/g, "_")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
}

// タグ辞書（80+ワード）
const TAG_DICT: Record<string, string[]> = {
    // アウター
    jacket: ["jacket", "outerwear"],
    coat: ["coat", "outerwear"],
    blazer: ["blazer", "formal", "outerwear"],
    parka: ["parka", "casual", "outerwear"],
    hoodie: ["hoodie", "casual", "streetwear"],
    cardigan: ["cardigan", "casual"],
    bomber: ["bomber", "jacket", "streetwear"],
    windbreaker: ["windbreaker", "sports", "outerwear"],

    // トップス
    shirt: ["shirt", "tops"],
    tshirt: ["tshirt", "casual", "tops"],
    sweater: ["sweater", "tops"],
    sweatshirt: ["sweatshirt", "casual", "tops"],
    polo: ["polo", "casual", "tops"],
    tank: ["tank", "casual", "tops"],
    vest: ["vest", "tops"],

    // ボトムス
    pants: ["pants", "bottoms"],
    jeans: ["jeans", "denim", "bottoms"],
    denim: ["denim", "bottoms"],
    chinos: ["chinos", "casual", "bottoms"],
    shorts: ["shorts", "casual", "bottoms"],
    trousers: ["trousers", "formal", "bottoms"],
    joggers: ["joggers", "casual", "bottoms"],

    // スタイル
    vintage: ["vintage", "retro"],
    military: ["military", "workwear"],
    workwear: ["workwear", "utility"],
    streetwear: ["streetwear", "casual"],
    casual: ["casual"],
    formal: ["formal"],
    oversized: ["oversized", "relaxed"],
    minimalist: ["minimalist", "simple"],
    retro: ["retro", "vintage"],
    modern: ["modern"],

    // 素材
    leather: ["leather"],
    wool: ["wool"],
    cotton: ["cotton"],
    nylon: ["nylon", "synthetic"],
    canvas: ["canvas"],
    corduroy: ["corduroy"],
    fleece: ["fleece"],

    // カラー
    black: ["black"],
    blue: ["blue"],
    navy: ["navy", "blue"],
    olive: ["olive", "green"],
    beige: ["beige", "neutral"],
    grey: ["grey", "neutral"],
    gray: ["grey", "neutral"],
    white: ["white", "neutral"],
    brown: ["brown"],
    green: ["green"],
    red: ["red"],
    orange: ["orange"],
    yellow: ["yellow"],
    purple: ["purple"],

    // ディテール
    field: ["field", "utility"],
    zip: ["zip"],
    button: ["button"],
    pocket: ["pocket", "utility"],
    hood: ["hood"],
    collar: ["collar"],
};

function extractTagsFromFilename(filename: string): string[] {
    const base = path.basename(filename, path.extname(filename));
    const words = base
        .toLowerCase()
        .replace(/[^\w\s-]/g, " ")
        .split(/[_\s-]+/)
        .filter(Boolean);

    const tags = new Set<string>();

    words.forEach((word) => {
        if (TAG_DICT[word]) {
            TAG_DICT[word].forEach((tag) => tags.add(tag));
        }
    });

    return Array.from(tags).slice(0, 10);
}

// ============================================================================
// Step 1: タグ無し一括タグ付け
// ============================================================================

async function step1_autoTag(): Promise<void> {
    console.log("\n" + "=".repeat(60));
    console.log("🏷️  Step 1: タグ無し一括タグ付け");
    console.log("=".repeat(60) + "\n");

    // 事前確認
    const { data: beforeStats } = await supabase.rpc("phase1_tag_stats" as any);

    if (!beforeStats) {
        // Fallback: 手動カウント
        const { data: cards } = await supabase
            .from("curated_cards")
            .select("card_id, tags")
            .eq("is_active", true);

        const noTags = cards?.filter(c => !c.tags || c.tags.length === 0).length || 0;
        const hasTags = cards?.filter(c => c.tags && c.tags.length > 0).length || 0;

        console.log("📊 Before:");
        console.log(`   タグ無し: ${noTags}枚`);
        console.log(`   タグ有り: ${hasTags}枚`);
        console.log(`   合計: ${cards?.length || 0}枚`);
    }

    console.log("\n🤖 自動タグ付け実行中...\n");

    // 全カード取得
    const { data: cards, error } = await supabase
        .from("curated_cards")
        .select("card_id, image_url, tags, is_active")
        .eq("is_active", true);

    if (error) throw error;

    let processed = 0;
    let errors = 0;

    for (const card of cards || []) {
        try {
            // 既にタグがある場合はスキップ
            if (card.tags && card.tags.length > 0) {
                continue;
            }

            // ファイル名からタグ抽出
            const filename = card.image_url.split("/").pop() || card.card_id;
            const tags = extractTagsFromFilename(filename);

            if (tags.length === 0) {
                console.log(`⏭️  Skip: ${card.card_id} (no tags found)`);
                continue;
            }

            // DB更新
            const { error: updateError } = await supabase
                .from("curated_cards")
                .update({ tags })
                .eq("card_id", card.card_id);

            if (updateError) {
                console.error(`❌ ${card.card_id}: ${updateError.message}`);
                errors++;
            } else {
                console.log(`✅ ${card.card_id}: [${tags.join(", ")}]`);
                processed++;
            }
        } catch (err: any) {
            console.error(`❌ ${card.card_id}: ${err.message}`);
            errors++;
        }
    }

    // 事後確認
    const { data: afterCards } = await supabase
        .from("curated_cards")
        .select("card_id, tags")
        .eq("is_active", true);

    const noTags = afterCards?.filter(c => !c.tags || c.tags.length === 0).length || 0;
    const hasTags = afterCards?.filter(c => c.tags && c.tags.length > 0).length || 0;

    console.log("\n📊 After:");
    console.log(`   タグ無し: ${noTags}枚`);
    console.log(`   タグ有り: ${hasTags}枚`);
    console.log(`   合計: ${afterCards?.length || 0}枚`);

    console.log("\n📊 Summary:");
    console.log(`   Processed: ${processed}`);
    console.log(`   Errors: ${errors}`);

    console.log("\n✅ Step 1 完了！\n");
}

// ============================================================================
// Step 2: is_active=false クリーンアップ
// ============================================================================

async function step2_cleanupInactive(): Promise<void> {
    console.log("\n" + "=".repeat(60));
    console.log("🧹 Step 2: is_active=false クリーンアップ");
    console.log("=".repeat(60) + "\n");

    // 事前確認
    const { count: inactiveCount } = await supabase
        .from("curated_cards")
        .select("*", { count: "exact", head: true })
        .eq("is_active", false);

    console.log(`📊 削除対象: ${inactiveCount || 0}件\n`);

    if (!inactiveCount || inactiveCount === 0) {
        console.log("✅ 削除対象なし\n");
        return;
    }

    // 削除実行
    const { error: deleteError } = await supabase
        .from("curated_cards")
        .delete()
        .eq("is_active", false);

    if (deleteError) {
        throw deleteError;
    }

    console.log(`✅ 削除完了: ${inactiveCount}件\n`);

    // 事後確認
    const { count: remainingInactive } = await supabase
        .from("curated_cards")
        .select("*", { count: "exact", head: true })
        .eq("is_active", false);

    const { count: activeCount } = await supabase
        .from("curated_cards")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

    console.log("📊 After:");
    console.log(`   Active: ${activeCount || 0}件`);
    console.log(`   Inactive: ${remainingInactive || 0}件`);

    console.log("\n✅ Step 2 完了！\n");
}

// ============================================================================
// Step 3: card_id 命名統一
// ============================================================================

async function step3_normalizeCardIds(): Promise<void> {
    console.log("\n" + "=".repeat(60));
    console.log("🔧 Step 3: card_id 命名統一");
    console.log("=".repeat(60) + "\n");

    // 全カード取得
    const { data: cards, error } = await supabase
        .from("curated_cards")
        .select("card_id, image_url, tags, is_active")
        .eq("is_active", true);

    if (error) throw error;

    // 正規化が必要なカードを検出
    const needsNormalization: Array<{
        oldId: string;
        newId: string;
        imageUrl: string;
        tags: string[] | null;
    }> = [];

    const normalizedIds = new Set<string>();
    const conflicts: string[] = [];

    for (const card of cards || []) {
        const normalized = normalizeCardId(card.card_id);

        if (card.card_id !== normalized) {
            if (normalizedIds.has(normalized)) {
                conflicts.push(`${card.card_id} → ${normalized}`);
            } else {
                needsNormalization.push({
                    oldId: card.card_id,
                    newId: normalized,
                    imageUrl: card.image_url,
                    tags: card.tags,
                });
                normalizedIds.add(normalized);
            }
        } else {
            normalizedIds.add(normalized);
        }
    }

    console.log(`📊 正規化が必要: ${needsNormalization.length}件`);
    console.log(`⚠️  衝突検出: ${conflicts.length}件\n`);

    if (conflicts.length > 0) {
        console.log("⚠️  衝突リスト:");
        conflicts.forEach(c => console.log(`   ${c}`));
        console.log("\n⚠️  衝突があるため、Step 3 をスキップします\n");
        return;
    }

    if (needsNormalization.length === 0) {
        console.log("✅ 全てのcard_idは既に正規化されています\n");
        return;
    }

    // ファイルリネーム + DB更新
    let renamed = 0;
    let errors = 0;
    const cardsDir = "public/cards";

    for (const item of needsNormalization) {
        try {
            const oldFilename = item.imageUrl.split("/").pop() || "";
            const ext = path.extname(oldFilename);
            const newFilename = `${item.newId}${ext}`;

            const oldPath = path.join(cardsDir, oldFilename);
            const newPath = path.join(cardsDir, newFilename);

            // ファイルリネーム
            if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
                fs.renameSync(oldPath, newPath);
            }

            // DB更新
            const newImageUrl = `/cards/${newFilename}`;

            const { error: updateError } = await supabase
                .from("curated_cards")
                .update({
                    card_id: item.newId,
                    image_url: newImageUrl,
                })
                .eq("card_id", item.oldId);

            if (updateError) {
                console.error(`❌ ${item.oldId}: ${updateError.message}`);
                errors++;
            } else {
                console.log(`✅ ${item.oldId} → ${item.newId}`);
                renamed++;

                // impressions も更新
                await supabase
                    .from("recommendation_impressions")
                    .update({ target_key: item.newId })
                    .eq("target_key", item.oldId);
            }
        } catch (err: any) {
            console.error(`❌ ${item.oldId}: ${err.message}`);
            errors++;
        }
    }

    console.log("\n📊 Summary:");
    console.log(`   Renamed: ${renamed}`);
    console.log(`   Errors: ${errors}`);

    console.log("\n✅ Step 3 完了！\n");
}

// ============================================================================
// Step 4: seen判定リセット強化
// ============================================================================

async function step4_resetSeen(): Promise<void> {
    console.log("\n" + "=".repeat(60));
    console.log("🔄 Step 4: seen判定リセット強化");
    console.log("=".repeat(60) + "\n");

    // Active カードID取得
    const { data: activeCards } = await supabase
        .from("curated_cards")
        .select("card_id")
        .eq("is_active", true);

    const activeCardIds = new Set(
        (activeCards || []).map(c => normalizeCardId(c.card_id))
    );

    console.log(`📊 Active cards: ${activeCardIds.size}\n`);

    // 全 impressions 取得
    const { data: impressions } = await supabase
        .from("recommendation_impressions")
        .select("id, target_key, created_at")
        .eq("target_type", "insight");

    console.log(`📊 Total impressions: ${impressions?.length || 0}\n`);

    if (!impressions || impressions.length === 0) {
        console.log("✅ No impressions to process\n");
        return;
    }

    // 削除対象を特定
    const toDelete: string[] = [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const imp of impressions) {
        const normalizedKey = normalizeCardId(imp.target_key || "");
        const isInactive = !activeCardIds.has(normalizedKey);
        const isOld = new Date(imp.created_at) < thirtyDaysAgo;

        if (isInactive || isOld) {
            toDelete.push(imp.id);
        }
    }

    console.log(`🗑️  削除対象: ${toDelete.length}件\n`);

    if (toDelete.length === 0) {
        console.log("✅ 削除対象なし\n");
        return;
    }

    // バッチ削除
    let deleted = 0;
    const batchSize = 1000;

    for (let i = 0; i < toDelete.length; i += batchSize) {
        const batch = toDelete.slice(i, i + batchSize);

        const { error: deleteError } = await supabase
            .from("recommendation_impressions")
            .delete()
            .in("id", batch);

        if (deleteError) {
            console.error(`❌ Delete error: ${deleteError.message}`);
        } else {
            deleted += batch.length;
            console.log(`✅ Deleted: ${deleted} / ${toDelete.length}`);
        }
    }

    // 結果確認
    const { data: remaining } = await supabase
        .from("recommendation_impressions")
        .select("target_key")
        .eq("target_type", "insight");

    const uniqueRemaining = new Set(
        (remaining || []).map(r => normalizeCardId(r.target_key || ""))
    );

    console.log("\n📊 最終結果:");
    console.log(`   Active cards: ${activeCardIds.size}`);
    console.log(`   Seen cards: ${uniqueRemaining.size}`);
    console.log(`   Ratio: ${Math.round((uniqueRemaining.size / activeCardIds.size) * 100)}%`);

    if (uniqueRemaining.size > activeCardIds.size) {
        console.log("\n⚠️  Still seen > active. Manual review needed.");
    } else {
        console.log("\n✅ Seen判定が正常化しました！");
    }

    console.log("\n✅ Step 4 完了！\n");
}

// ============================================================================
// Main
// ============================================================================

async function main() {
    if (process.env.CULCEPT_PHASE1 !== "1") {
        console.error("⚠️  Refusing to run. Set env CULCEPT_PHASE1=1");
        process.exit(1);
    }

    console.log("\n" + "=".repeat(60));
    console.log("🚀 Phase 1: データ品質改善（完全版）");
    console.log("=".repeat(60));

    try {
        await step1_autoTag();
        await step2_cleanupInactive();
        await step3_normalizeCardIds();
        await step4_resetSeen();

        console.log("\n" + "=".repeat(60));
        console.log("🎉 Phase 1 完了！");
        console.log("=".repeat(60) + "\n");
    } catch (err: any) {
        console.error("\n❌ Error:", err.message);
        process.exit(1);
    }
}

main().catch(console.error);
