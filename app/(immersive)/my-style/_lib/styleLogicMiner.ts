import type { SavedState, WardrobeItem, SavedSetup } from "./types";
import type { WornRecord } from "@/app/calendar/_lib/types";
import type { FormalityCode, SilhouetteCode } from "./taxonomy";

/* ── Types ── */

export type StyleRuleType =
    | "combo"
    | "rotation"
    | "weather"
    | "dayOfWeek"
    | "silhouette"
    | "color"
    | "formality"
    | "avoidance"
    | "season";

export type StyleRule = {
    id: string;
    type: StyleRuleType;
    confidence: number; // 0-1
    occurrences: number;
    description: string; // Japanese
    evidence: string; // Japanese, specific examples
    userConfirmed?: boolean | null; // null = not yet rated
};

export type DataQuality = "insufficient" | "emerging" | "reliable";

export type StyleLogicProfile = {
    rules: StyleRule[];
    totalOutfitsAnalyzed: number;
    dataQuality: DataQuality;
    generatedAt: string;
};

/* ── Helpers ── */

function makeId(type: StyleRuleType, key: string): string {
    return `${type}_${key.replace(/\s+/g, "_").slice(0, 40)}`;
}

function colorLabel(color: string): string {
    const map: Record<string, string> = {
        navy: "ネイビー",
        white: "ホワイト",
        black: "ブラック",
        gray: "グレー",
        grey: "グレー",
        beige: "ベージュ",
        brown: "ブラウン",
        camel: "キャメル",
        red: "レッド",
        blue: "ブルー",
        green: "グリーン",
        khaki: "カーキ",
        cream: "クリーム",
        ivory: "アイボリー",
        burgundy: "バーガンディ",
        olive: "オリーブ",
        charcoal: "チャコール",
        pink: "ピンク",
        yellow: "イエロー",
        orange: "オレンジ",
        purple: "パープル",
        mustard: "マスタード",
        ecru: "エクリュ",
        offwhite: "オフホワイト",
        "off-white": "オフホワイト",
    };
    const lower = color.toLowerCase();
    return map[lower] ?? color;
}

function formalityLabel(f: FormalityCode): string {
    const map: Record<FormalityCode, string> = {
        casual: "カジュアル",
        smart: "スマート",
        dress: "ドレス",
    };
    return map[f] ?? f;
}

function silhouetteLabel(s: SilhouetteCode): string {
    const map: Record<SilhouetteCode, string> = {
        slim: "スリム",
        regular: "レギュラー",
        loose: "ルーズ",
        oversized: "オーバーサイズ",
    };
    return map[s] ?? s;
}

function categoryLabel(cat: WardrobeItem["category"]): string {
    const map: Record<WardrobeItem["category"], string> = {
        tops: "トップス",
        bottoms: "ボトムス",
        outerwear: "アウター",
        shoes: "シューズ",
        accessories: "アクセサリー",
        hat: "帽子",
        other: "その他",
    };
    return map[cat] ?? cat;
}

/* ── Pattern miners ── */

/**
 * 1. Combo rules — item pairs/triples appearing together in many setups.
 */
function mineComboRules(
    wardrobe: WardrobeItem[],
    setups: SavedSetup[],
): StyleRule[] {
    if (setups.length < 2) return [];

    const itemMap = new Map(wardrobe.map((i) => [i.id, i]));
    const totalSetups = setups.length;

    // Build pair frequency map
    const pairCount: Map<string, { a: string; b: string; count: number }> = new Map();

    for (const setup of setups) {
        const ids = setup.itemIds.filter((id) => itemMap.has(id));
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const key = [ids[i], ids[j]].sort().join("|");
                const existing = pairCount.get(key);
                if (existing) {
                    existing.count++;
                } else {
                    pairCount.set(key, { a: ids[i], b: ids[j], count: 1 });
                }
            }
        }
    }

    const rules: StyleRule[] = [];

    for (const [, pair] of pairCount) {
        if (pair.count < 2) continue;
        const confidence = Math.min(pair.count / totalSetups, 1);
        if (confidence < 0.3 && pair.count < 3) continue;

        const itemA = itemMap.get(pair.a);
        const itemB = itemMap.get(pair.b);
        if (!itemA || !itemB) continue;

        const nameA = itemA.colorName ? `${colorLabel(itemA.colorName)}の${categoryLabel(itemA.category)}` : itemA.name;
        const nameB = itemB.colorName ? `${colorLabel(itemB.colorName)}の${categoryLabel(itemB.category)}` : itemB.name;

        const description = `「${nameA}」と「${nameB}」は、あなたの鉄板。安心感があるから自然と手が伸びる組み合わせ。`;
        const evidence = `${totalSetups}コーデ中${pair.count}回登場 — 偶然じゃなくて、選ばれてる`;

        rules.push({
            id: makeId("combo", `${pair.a}_${pair.b}`),
            type: "combo",
            confidence: Math.min(confidence * 1.5, 1), // boost for repeated combos
            occurrences: pair.count,
            description,
            evidence,
            userConfirmed: null,
        });
    }

    return rules;
}

/**
 * 2. Color rules — detect dominant color palette preferences.
 */
function mineColorRules(wardrobe: WardrobeItem[], setups: SavedSetup[]): StyleRule[] {
    if (wardrobe.length < 3) return [];

    const rules: StyleRule[] = [];

    // Count colors in wardrobe
    const colorCount: Map<string, number> = new Map();
    for (const item of wardrobe) {
        const color = item.colorName?.toLowerCase() ?? item.color?.toLowerCase();
        if (!color) continue;
        colorCount.set(color, (colorCount.get(color) ?? 0) + 1);
    }

    const sortedColors = Array.from(colorCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    if (sortedColors.length === 0) return [];

    const totalItems = wardrobe.length;
    const topColor = sortedColors[0];
    const topColorPct = topColor[1] / totalItems;

    if (topColorPct >= 0.25 && topColor[1] >= 2) {
        const label = colorLabel(topColor[0]);
        const pct = Math.round(topColorPct * 100);
        rules.push({
            id: makeId("color", `dominant_${topColor[0]}`),
            type: "color",
            confidence: Math.min(topColorPct * 2, 1),
            occurrences: topColor[1],
            description: `全体の${pct}%が${label}系。意識してないかもしれないけど、${label}があなたの「地の色」になってる。`,
            evidence: `${totalItems}着中${topColor[1]}着が${label} — クローゼットを開けると一番目に入る色`,
            userConfirmed: null,
        });
    }

    // Detect light vs dark palette dominance
    const darkColors = new Set(["black", "navy", "charcoal", "brown", "burgundy", "dark", "ブラック", "ネイビー", "チャコール"]);
    const lightColors = new Set(["white", "cream", "ivory", "beige", "offwhite", "ecru", "off-white", "ホワイト", "クリーム", "ベージュ", "アイボリー"]);

    let darkCount = 0;
    let lightCount = 0;
    for (const item of wardrobe) {
        const color = item.colorName?.toLowerCase() ?? item.color?.toLowerCase() ?? "";
        if ([...darkColors].some((d) => color.includes(d))) darkCount++;
        if ([...lightColors].some((l) => color.includes(l))) lightCount++;
    }

    const coloredItems = wardrobe.filter((i) => i.colorName ?? i.color).length;
    if (coloredItems > 0) {
        const darkRatio = darkCount / coloredItems;
        const lightRatio = lightCount / coloredItems;

        if (darkRatio >= 0.45 && darkCount >= 2) {
            rules.push({
                id: makeId("color", "dark_palette"),
                type: "color",
                confidence: Math.min(darkRatio + 0.1, 1),
                occurrences: darkCount,
                description: `ダーク系が${Math.round(darkRatio * 100)}%。気持ちを引き締めたいとき、無意識の鎧になってるのかもしれない。`,
                evidence: `ブラック・ネイビー・チャコールなど暗色系が${darkCount}着 — 落ち着きと強さの表現`,
                userConfirmed: null,
            });
        } else if (lightRatio >= 0.35 && lightCount >= 2) {
            rules.push({
                id: makeId("color", "light_palette"),
                type: "color",
                confidence: Math.min(lightRatio + 0.1, 1),
                occurrences: lightCount,
                description: `明るい色が${Math.round(lightRatio * 100)}%。外に向かうエネルギーが出てるサイン。軽やかさを纏いたい人。`,
                evidence: `ホワイト・ベージュ・クリームなど明色系が${lightCount}着 — 開放感を好む傾向`,
                userConfirmed: null,
            });
        }
    }

    // Detect monochrome / achromatic preference
    const achromaticColors = new Set(["black", "white", "gray", "grey", "charcoal", "ivory", "cream", "off-white", "offwhite"]);
    const achromaticCount = wardrobe.filter((i) => {
        const c = (i.colorName ?? i.color ?? "").toLowerCase();
        return [...achromaticColors].some((ac) => c.includes(ac));
    }).length;

    if (totalItems > 0) {
        const achRatio = achromaticCount / totalItems;
        if (achRatio >= 0.55 && achromaticCount >= 3) {
            rules.push({
                id: makeId("color", "achromatic"),
                type: "color",
                confidence: Math.min(achRatio, 1),
                occurrences: achromaticCount,
                description: `無彩色が${Math.round(achRatio * 100)}%。色で冒険しないのは、シルエットや素材で勝負してる証拠。`,
                evidence: `ブラック・ホワイト・グレー系が${achromaticCount}着 — 色以外で語るスタイル`,
                userConfirmed: null,
            });
        }
    }

    // Detect color variation within setups (color discipline)
    if (setups.length >= 3) {
        const itemMap = new Map(wardrobe.map((i) => [i.id, i]));
        let singleColorSetups = 0;
        let analyzedSetups = 0;

        for (const setup of setups) {
            const colors = setup.itemIds
                .map((id) => itemMap.get(id))
                .filter(Boolean)
                .map((i) => (i!.colorName ?? i!.color ?? "").toLowerCase())
                .filter(Boolean);

            if (colors.length < 2) continue;
            analyzedSetups++;
            const uniqueColors = new Set(colors);
            if (uniqueColors.size <= 2) singleColorSetups++;
        }

        if (analyzedSetups >= 2) {
            const ratio = singleColorSetups / analyzedSetups;
            if (ratio >= 0.5 && singleColorSetups >= 2) {
                rules.push({
                    id: makeId("color", "color_discipline"),
                    type: "color",
                    confidence: ratio,
                    occurrences: singleColorSetups,
                    description: `${Math.round(ratio * 100)}%のコーデが2色以内。色を絞れるのは、それだけで完成させられる自信の表れ。`,
                    evidence: `${analyzedSetups}コーデ中${singleColorSetups}コーデが1〜2色 — ミニマルな色使いの達人`,
                    userConfirmed: null,
                });
            }
        }
    }

    return rules;
}

/**
 * 3. Silhouette rules — detect top × bottom silhouette patterns.
 */
function mineSilhouetteRules(wardrobe: WardrobeItem[], setups: SavedSetup[]): StyleRule[] {
    if (setups.length < 3) return [];

    const itemMap = new Map(wardrobe.map((i) => [i.id, i]));
    const pairCount: Map<string, number> = new Map();
    let totalAnalyzed = 0;

    for (const setup of setups) {
        const items = setup.itemIds.map((id) => itemMap.get(id)).filter(Boolean) as WardrobeItem[];
        const tops = items.filter((i) => i.category === "tops" && i.silhouette);
        const bottoms = items.filter((i) => i.category === "bottoms" && i.silhouette);

        for (const top of tops) {
            for (const bottom of bottoms) {
                const key = `${top.silhouette!}_${bottom.silhouette!}`;
                pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
                totalAnalyzed++;
            }
        }
    }

    if (totalAnalyzed < 2) return [];

    const rules: StyleRule[] = [];

    for (const [key, count] of pairCount) {
        if (count < 2) continue;
        const [topSil, bottomSil] = key.split("_") as [SilhouetteCode, SilhouetteCode];
        const confidence = count / totalAnalyzed;
        if (confidence < 0.3) continue;

        const topLabel = silhouetteLabel(topSil);
        const bottomLabel = silhouetteLabel(bottomSil);

        let description = "";
        // Detect I-line vs A-line tendency
        const isILine = (topSil === "slim" || topSil === "regular") && (bottomSil === "slim" || bottomSil === "regular");
        const isALine = (topSil === "slim" || topSil === "regular") && (bottomSil === "loose" || bottomSil === "oversized");
        const isYLine = (topSil === "loose" || topSil === "oversized") && (bottomSil === "slim" || bottomSil === "regular");

        if (isILine) {
            description = `上半身${topLabel} × 下半身${bottomLabel}でIライン。すっきり見せたい意識が強い。体型じゃなくて、あなたが選んでる「見え方の型」。`;
        } else if (isALine) {
            description = `上半身コンパクト × 下半身ゆったりのAライン。下半身で広がりを出すバランス感覚が染みついてる。`;
        } else if (isYLine) {
            description = `上半身ボリューム × 下半身すっきりのYライン。肩まわりで存在感を出す、あなたの無意識の「見え方の型」。`;
        } else {
            description = `上半身${topLabel} × 下半身${bottomLabel}の組み合わせが定番化。体型じゃなくて、あなたが無意識に選んでる「見え方の型」。`;
        }

        rules.push({
            id: makeId("silhouette", key),
            type: "silhouette",
            confidence: Math.min(confidence + 0.1, 1),
            occurrences: count,
            description,
            evidence: `シルエットを記録しているコーデ${totalAnalyzed}件中${count}件がこのパターン`,
            userConfirmed: null,
        });
    }

    return rules;
}

/**
 * 4. Formality rules — detect formality consistency.
 */
function mineFormalityRules(wardrobe: WardrobeItem[], setups: SavedSetup[]): StyleRule[] {
    if (setups.length < 3) return [];

    const itemMap = new Map(wardrobe.map((i) => [i.id, i]));
    let consistentCount = 0;
    let mixedCount = 0;
    let totalAnalyzed = 0;
    const formalityGroupCount: Map<string, number> = new Map();

    for (const setup of setups) {
        const items = setup.itemIds.map((id) => itemMap.get(id)).filter(Boolean) as WardrobeItem[];
        const formalities = items.map((i) => i.formality).filter(Boolean) as FormalityCode[];
        if (formalities.length < 2) continue;

        totalAnalyzed++;
        const unique = new Set(formalities);
        if (unique.size === 1) {
            consistentCount++;
            const f = formalities[0];
            formalityGroupCount.set(f, (formalityGroupCount.get(f) ?? 0) + 1);
        } else {
            mixedCount++;
        }
    }

    if (totalAnalyzed < 2) return [];

    const rules: StyleRule[] = [];
    const consistencyRatio = consistentCount / totalAnalyzed;

    if (consistencyRatio >= 0.6 && consistentCount >= 2) {
        // Find dominant formality
        let dominantFormality = "casual" as FormalityCode;
        let maxCount = 0;
        for (const [f, cnt] of formalityGroupCount) {
            if (cnt > maxCount) {
                maxCount = cnt;
                dominantFormality = f as FormalityCode;
            }
        }

        const label = formalityLabel(dominantFormality);
        rules.push({
            id: makeId("formality", "consistent"),
            type: "formality",
            confidence: consistencyRatio,
            occurrences: consistentCount,
            description: `${label}寄りで揃える日が${Math.round(consistencyRatio * 100)}%。きちんと感はあなたの安全基地かもしれない。`,
            evidence: `${totalAnalyzed}コーデ中${consistentCount}コーデでTPOが統一 — ブレない軸がある`,
            userConfirmed: null,
        });
    } else if (mixedCount >= 2 && mixedCount / totalAnalyzed >= 0.5) {
        rules.push({
            id: makeId("formality", "mixed"),
            type: "formality",
            confidence: mixedCount / totalAnalyzed,
            occurrences: mixedCount,
            description: `カジュアルとフォーマルが混在する日が多い。「崩し」があなたの個性。計算されたミックスがサマになってる。`,
            evidence: `${totalAnalyzed}コーデ中${mixedCount}コーデでTPOをあえて混ぜてる`,
            userConfirmed: null,
        });
    }

    return rules;
}

/**
 * 5. Avoidance rules — detect items/combos never used together.
 */
function mineAvoidanceRules(wardrobe: WardrobeItem[], setups: SavedSetup[]): StyleRule[] {
    if (setups.length < 5 || wardrobe.length < 6) return [];

    const itemMap = new Map(wardrobe.map((i) => [i.id, i]));
    const rules: StyleRule[] = [];

    // Detect specific category combinations that never appear together
    const categoryPairUsed: Map<string, number> = new Map();

    for (const setup of setups) {
        const items = setup.itemIds.map((id) => itemMap.get(id)).filter(Boolean) as WardrobeItem[];
        const categories = items.map((i) => i.category);
        const unique = [...new Set(categories)];
        for (let i = 0; i < unique.length; i++) {
            for (let j = i + 1; j < unique.length; j++) {
                const key = [unique[i], unique[j]].sort().join("|");
                categoryPairUsed.set(key, (categoryPairUsed.get(key) ?? 0) + 1);
            }
        }
    }

    // Check shoes + bottoms combinations for avoidance
    const shoesItems = wardrobe.filter((i) => i.category === "shoes");
    const bottomsItems = wardrobe.filter((i) => i.category === "bottoms");

    if (shoesItems.length >= 2 && bottomsItems.length >= 2 && setups.length >= 4) {
        // Look for specific shoe × bottom combos that never appear
        const usedShoesBottomPairs = new Set<string>();

        for (const setup of setups) {
            const items = setup.itemIds.map((id) => itemMap.get(id)).filter(Boolean) as WardrobeItem[];
            const shoes = items.filter((i) => i.category === "shoes");
            const bottoms = items.filter((i) => i.category === "bottoms");
            for (const shoe of shoes) {
                for (const bottom of bottoms) {
                    usedShoesBottomPairs.add(`${shoe.id}|${bottom.id}`);
                }
            }
        }

        // If sneakers exist but never paired with dress-formality bottoms
        const sneakers = shoesItems.filter((i) =>
            i.subcategory?.includes("sneaker") ||
            i.name.toLowerCase().includes("sneaker") ||
            i.name.toLowerCase().includes("スニーカー"),
        );
        const dressPants = bottomsItems.filter((i) => i.formality === "dress");

        if (sneakers.length > 0 && dressPants.length > 0) {
            let neverPaired = true;
            for (const s of sneakers) {
                for (const d of dressPants) {
                    if (usedShoesBottomPairs.has(`${s.id}|${d.id}`)) {
                        neverPaired = false;
                        break;
                    }
                }
                if (!neverPaired) break;
            }

            if (neverPaired) {
                rules.push({
                    id: makeId("avoidance", "sneakers_dress_pants"),
                    type: "avoidance",
                    confidence: 0.75,
                    occurrences: setups.length,
                    description: "「スニーカー」と「ドレスパンツ」は持ってるのに一度も合わせてない。無意識のルールがある。試してみたら新発見があるかも。",
                    evidence: `${setups.length}コーデで一度も登場しない組み合わせ — あえて避けてる？`,
                    userConfirmed: null,
                });
            }
        }
    }

    // Detect formality avoidance (if someone never goes formal)
    const dressItems = wardrobe.filter((i) => i.formality === "dress");
    if (dressItems.length >= 1) {
        const dressUsedInSetups = setups.filter((s) =>
            s.itemIds.some((id) => {
                const item = itemMap.get(id);
                return item?.formality === "dress";
            }),
        ).length;

        if (dressUsedInSetups === 0 && setups.length >= 5) {
            rules.push({
                id: makeId("avoidance", "no_dress_in_setups"),
                type: "avoidance",
                confidence: 0.8,
                occurrences: dressItems.length,
                description: `ドレス系アイテムが${dressItems.length}着あるのに、まだコーデに登場してない。出番を待ってる服たち。`,
                evidence: `${setups.length}コーデで一度も使われていない — 着る機会を探してる？`,
                userConfirmed: null,
            });
        }
    }

    return rules;
}

/**
 * 6. Rotation rules — from wornHistory, detect rotation patterns.
 */
function mineRotationRules(wardrobe: WardrobeItem[], wornRecords: WornRecord[]): StyleRule[] {
    if (wornRecords.length < 5) return [];

    const rules: StyleRule[] = [];
    const itemMap = new Map(wardrobe.map((i) => [i.id, i]));

    // Detect consecutive-day repeat avoidance
    const sortedRecords = [...wornRecords].sort((a, b) => a.date.localeCompare(b.date));
    let consecutiveRepeatCount = 0;
    let consecutiveAvoidCount = 0;
    let analyzedPairs = 0;

    for (let i = 1; i < sortedRecords.length; i++) {
        const prev = sortedRecords[i - 1];
        const curr = sortedRecords[i];

        // Check if records are consecutive days
        const prevDate = new Date(prev.date);
        const currDate = new Date(curr.date);
        const diffDays = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays !== 1) continue;

        analyzedPairs++;
        const sharedItems = prev.itemIds.filter((id) => curr.itemIds.includes(id));
        if (sharedItems.length > 0) {
            consecutiveRepeatCount++;
        } else {
            consecutiveAvoidCount++;
        }
    }

    if (analyzedPairs >= 3) {
        const avoidRatio = consecutiveAvoidCount / analyzedPairs;
        if (avoidRatio >= 0.7 && consecutiveAvoidCount >= 3) {
            rules.push({
                id: makeId("rotation", "no_consecutive_repeat"),
                type: "rotation",
                confidence: avoidRatio,
                occurrences: consecutiveAvoidCount,
                description: "同じ服を連日着ない主義。ローテーション意識が高くて、毎日ちゃんと「今日の自分」を選んでる。",
                evidence: `連続${analyzedPairs}日間のうち${consecutiveAvoidCount}日でアイテムが被っていない`,
                userConfirmed: null,
            });
        }
    }

    // Detect item rotation frequency
    const itemDates: Map<string, string[]> = new Map();
    for (const record of wornRecords) {
        for (const id of record.itemIds) {
            const dates = itemDates.get(id) ?? [];
            dates.push(record.date);
            itemDates.set(id, dates);
        }
    }

    // Detect items worn frequently (loyalty items)
    const frequentItems = Array.from(itemDates.entries())
        .filter(([, dates]) => dates.length >= 4)
        .map(([id, dates]) => ({ id, count: dates.length, item: itemMap.get(id) }))
        .filter((x) => x.item);

    if (frequentItems.length >= 1) {
        const topItem = frequentItems.sort((a, b) => b.count - a.count)[0];
        const itemName = topItem.item!.colorName
            ? `${colorLabel(topItem.item!.colorName)}の${categoryLabel(topItem.item!.category)}`
            : topItem.item!.name;

        rules.push({
            id: makeId("rotation", `loyal_${topItem.id}`),
            type: "rotation",
            confidence: Math.min(topItem.count / wornRecords.length + 0.3, 1),
            occurrences: topItem.count,
            description: `「${itemName}」は${topItem.count}回登場のヘビロテ。あなたの相棒的存在。迷ったらこれ、の安心感。`,
            evidence: `${wornRecords.length}日間の記録で${topItem.count}回登場 — もはや分身`,
            userConfirmed: null,
        });
    }

    return rules;
}

/**
 * 7. Season rules — detect season-specific color preferences.
 */
function mineSeasonRules(wardrobe: WardrobeItem[], setups: SavedSetup[]): StyleRule[] {
    if (wardrobe.length < 4) return [];

    const rules: StyleRule[] = [];

    const darkColors = new Set(["black", "navy", "charcoal", "brown", "burgundy", "olive", "khaki"]);
    const lightColors = new Set(["white", "cream", "ivory", "beige", "offwhite", "ecru", "off-white", "light", "pastel"]);

    const awItems = wardrobe.filter((i) => i.season === "aw");
    const ssItems = wardrobe.filter((i) => i.season === "ss");

    if (awItems.length >= 2 && ssItems.length >= 2) {
        const awDarkCount = awItems.filter((i) => {
            const c = (i.colorName ?? i.color ?? "").toLowerCase();
            return [...darkColors].some((d) => c.includes(d));
        }).length;

        const ssLightCount = ssItems.filter((i) => {
            const c = (i.colorName ?? i.color ?? "").toLowerCase();
            return [...lightColors].some((l) => c.includes(l));
        }).length;

        const awDarkRatio = awDarkCount / awItems.length;
        const ssLightRatio = ssLightCount / ssItems.length;

        if (awDarkRatio >= 0.5 && ssLightRatio >= 0.5) {
            rules.push({
                id: makeId("color", "seasonal_tone_shift"),
                type: "color",
                confidence: (awDarkRatio + ssLightRatio) / 2,
                occurrences: awDarkCount + ssLightCount,
                description: "秋冬はダークトーン、春夏は明るめ。季節で気分が切り替わるタイプ。服で季節を纏ってる。",
                evidence: `AW服の${Math.round(awDarkRatio * 100)}%がダーク系、SS服の${Math.round(ssLightRatio * 100)}%がライト系`,
                userConfirmed: null,
            });
        } else if (awDarkRatio >= 0.6) {
            rules.push({
                id: makeId("color", "aw_dark_dominant"),
                type: "color",
                confidence: awDarkRatio,
                occurrences: awDarkCount,
                description: `秋冬は${Math.round(awDarkRatio * 100)}%がダーク系。寒い季節に深い色で包まれたい、そういう感覚がある。`,
                evidence: `AW服${awItems.length}着中${awDarkCount}着がダーク系カラー — 季節の空気を色で纏う`,
                userConfirmed: null,
            });
        }
    }

    // All-season items dominant?
    const allSeasonItems = wardrobe.filter((i) => i.season === "all" || !i.season);
    if (wardrobe.length > 0) {
        const allSeasonRatio = allSeasonItems.length / wardrobe.length;
        if (allSeasonRatio >= 0.6 && allSeasonItems.length >= 4) {
            rules.push({
                id: makeId("color", "all_season_preference"),
                type: "color",
                confidence: allSeasonRatio,
                occurrences: allSeasonItems.length,
                description: `季節に関係なく使えるアイテムが${Math.round(allSeasonRatio * 100)}%。ブレない軸がある証拠。効率よりも「自分らしさ」で選んでる。`,
                evidence: `ワードローブ${wardrobe.length}着中${allSeasonItems.length}着が通年対応 — 季節に振り回されない`,
                userConfirmed: null,
            });
        }
    }

    return rules;
}

/**
 * 8. Day-of-week rules — detect formality/tone shifts by weekday.
 */
function mineDayOfWeekRules(wardrobe: WardrobeItem[], wornRecords: WornRecord[]): StyleRule[] {
    if (wornRecords.length < 7) return [];

    const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
    const itemMap = new Map(wardrobe.map((i) => [i.id, i]));
    const rules: StyleRule[] = [];

    // Count formality per day of week
    const dayFormality: Map<number, { formal: number; casual: number; total: number }> = new Map();
    for (let d = 0; d < 7; d++) dayFormality.set(d, { formal: 0, casual: 0, total: 0 });

    for (const record of wornRecords) {
        const date = new Date(record.date);
        const dow = date.getDay();
        const entry = dayFormality.get(dow)!;
        entry.total++;

        const items = record.itemIds.map((id) => itemMap.get(id)).filter(Boolean) as WardrobeItem[];
        const formalities = items.map((i) => i.formality).filter(Boolean);
        const hasDress = formalities.includes("dress");
        const hasSmart = formalities.includes("smart");
        const hasCasual = formalities.includes("casual");

        if (hasDress || hasSmart) entry.formal++;
        if (hasCasual && !hasDress && !hasSmart) entry.casual++;
    }

    // Find days with strong formality bias
    let mostFormalDay = -1;
    let mostFormalRatio = 0;
    let mostCasualDay = -1;
    let mostCasualRatio = 0;

    for (const [dow, stats] of dayFormality) {
        if (stats.total < 2) continue;
        const formalRatio = stats.formal / stats.total;
        const casualRatio = stats.casual / stats.total;

        if (formalRatio > mostFormalRatio && formalRatio >= 0.6) {
            mostFormalRatio = formalRatio;
            mostFormalDay = dow;
        }
        if (casualRatio > mostCasualRatio && casualRatio >= 0.6) {
            mostCasualRatio = casualRatio;
            mostCasualDay = dow;
        }
    }

    if (mostFormalDay >= 0 && mostCasualDay >= 0 && mostFormalDay !== mostCasualDay) {
        const formalStats = dayFormality.get(mostFormalDay)!;
        const casualStats = dayFormality.get(mostCasualDay)!;
        rules.push({
            id: makeId("dayOfWeek", `shift_${mostFormalDay}_${mostCasualDay}`),
            type: "dayOfWeek",
            confidence: (mostFormalRatio + mostCasualRatio) / 2,
            occurrences: formalStats.total + casualStats.total,
            description: `${dayNames[mostFormalDay]}曜はきちんとめ、${dayNames[mostCasualDay]}曜はカジュアル寄り。曜日で無意識にギアが変わってる。`,
            evidence: `${dayNames[mostFormalDay]}曜の${Math.round(mostFormalRatio * 100)}%がフォーマル系、${dayNames[mostCasualDay]}曜の${Math.round(mostCasualRatio * 100)}%がカジュアル系`,
            userConfirmed: null,
        });
    } else if (mostFormalDay >= 0) {
        const stats = dayFormality.get(mostFormalDay)!;
        rules.push({
            id: makeId("dayOfWeek", `formal_${mostFormalDay}`),
            type: "dayOfWeek",
            confidence: mostFormalRatio,
            occurrences: stats.total,
            description: `${dayNames[mostFormalDay]}曜日はきちんとした服を選びがち。週のリズムに合わせて、無意識にスイッチが入ってる。`,
            evidence: `${dayNames[mostFormalDay]}曜の${stats.total}回中${stats.formal}回がフォーマル寄り`,
            userConfirmed: null,
        });
    }

    return rules;
}

/* ── Main function ── */

export function mineStyleLogic(state: SavedState, wornRecords?: WornRecord[]): StyleLogicProfile {
    const { wardrobe, setups } = state;
    const records = wornRecords ?? [];

    const totalOutfitsAnalyzed = setups.length + records.length;

    let dataQuality: DataQuality;
    if (setups.length < 3) {
        dataQuality = "insufficient";
    } else if (setups.length < 10) {
        dataQuality = "emerging";
    } else {
        dataQuality = "reliable";
    }

    if (dataQuality === "insufficient") {
        return {
            rules: [],
            totalOutfitsAnalyzed,
            dataQuality,
            generatedAt: new Date().toISOString(),
        };
    }

    // Run all miners
    const allRules: StyleRule[] = [
        ...mineComboRules(wardrobe, setups),
        ...mineColorRules(wardrobe, setups),
        ...mineSilhouetteRules(wardrobe, setups),
        ...mineFormalityRules(wardrobe, setups),
        ...mineAvoidanceRules(wardrobe, setups),
        ...mineRotationRules(wardrobe, records),
        ...mineSeasonRules(wardrobe, setups),
        ...mineDayOfWeekRules(wardrobe, records),
    ];

    // Filter: confidence >= 0.5 AND occurrences >= 2
    const filtered = allRules.filter((r) => r.confidence >= 0.5 && r.occurrences >= 2);

    // Deduplicate by id
    const seen = new Set<string>();
    const deduped = filtered.filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
    });

    // Sort by confidence * occurrences descending
    deduped.sort((a, b) => b.confidence * b.occurrences - a.confidence * a.occurrences);

    return {
        rules: deduped.slice(0, 12), // cap at 12 rules
        totalOutfitsAnalyzed,
        dataQuality,
        generatedAt: new Date().toISOString(),
    };
}
