// src/components/item-editor/SubcategorySampleBackground.tsx
"use client";

import React from "react";
import {
    isSubcategory,
    type Subcategory,
    subcategorySampleTransparentUrl,
} from "@/lib/subcategory";

const JA_TO_KEY: Record<string, Subcategory> = {
    "バックパック": "backpack",
    "ブラウス": "blouse",
    "ブルゾン": "blouson",
    "ブーツ": "boots",
    "カーゴ": "cargo",
    "チノ": "chino",
    "コート": "coat",
    "クロスボディ": "crossbody",
    "デニム": "denim",
    "ダービー": "derby",
    "ダウン": "down",
    "フーディ": "hoodie",
    "ジャケット": "jacket",
    "ニット": "knit",
    "ローファー": "loafer",
    "シャツ": "shirt",
    "ショルダー": "shoulder",
    "スカート": "skirt",
    "スラックス": "slacks",
    "スニーカー": "sneakers",
    "スウェット": "sweatshirt",
    "トート": "tote",
    "トレンチ": "trench",
    "Tシャツ": "tshirt",
    "ティーシャツ": "tshirt",
    "ベスト": "vest",
};

// app/my-style 側の "subcategory.xxx" を吸収（必要なものだけ）
const LEGACY_SUFFIX_TO_KEY: Record<string, Subcategory> = {
    // outer
    coat: "coat",
    jacket: "jacket",
    blouson: "blouson",
    down: "down",
    trench: "trench",

    // tops
    tee: "tshirt",
    tshirt: "tshirt",
    shirt: "shirt",
    blouse: "blouse",
    knit: "knit",
    hoodie: "hoodie",
    sweat: "sweatshirt",
    sweatshirt: "sweatshirt",
    vest: "vest",

    // bottoms
    slacks: "slacks",
    denim: "denim",
    chino: "chino",
    cargo: "cargo",
    skirt: "skirt",

    // shoes
    loafer: "loafer",
    derby: "derby",
    sneaker: "sneakers",
    sneakers: "sneakers",
    boot: "boots",
    boots: "boots",

    // bags
    tote: "tote",
    shoulder: "shoulder",
    crossbody: "crossbody",
    backpack: "backpack",

    // 変な既存値が来ても落ちないように（必要なら）
    sandals: "loafer",
};

function normalizeSubcategory(input: unknown): Subcategory | null {
    if (!input) return null;

    if (typeof input === "string") {
        // 1) そのまま "coat" など
        if (isSubcategory(input)) return input;

        // 2) "subcategory.coat" など
        if (input.startsWith("subcategory.")) {
            const suffix = input.slice("subcategory.".length);
            return LEGACY_SUFFIX_TO_KEY[suffix] ?? null;
        }

        // 3) 日本語ラベル直
        return JA_TO_KEY[input] ?? null;
    }

    if (typeof input === "object") {
        const any = input as any;
        if (typeof any.id === "string") return normalizeSubcategory(any.id);
        if (typeof any.value === "string") return normalizeSubcategory(any.value);
        if (typeof any.key === "string") return normalizeSubcategory(any.key);
        if (typeof any.label === "string") return normalizeSubcategory(any.label);
    }

    return null;
}

type Props = {
    subcategory: unknown;
    className?: string;
    children: React.ReactNode;
};

export function SubcategorySampleBackground({
    subcategory,
    className,
    children,
}: Props) {
    const key = normalizeSubcategory(subcategory);
    const url = key ? subcategorySampleTransparentUrl(key) : null;

    return (
        <div
            className={className}
            style={{ position: "relative", overflow: "hidden", borderRadius: 16 }}
            data-subcategory-key={key ?? ""}
        >
            {/* 中身 */}
            <div style={{ position: "relative", zIndex: 1 }}>{children}</div>

            {/* 背景（中身の上に重ねる） */}
            {url && (
                <>
                    <div
                        key={url + ":blur"}
                        aria-hidden="true"
                        style={{
                            position: "absolute",
                            inset: 0,
                            zIndex: 2,
                            pointerEvents: "none",
                            backgroundImage: `url(${url})`,
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "center",
                            backgroundSize: "contain",
                            opacity: 0.12,
                            filter: "blur(16px)",
                            transform: "scale(1.06)",
                        }}
                    />
                    <div
                        key={url + ":main"}
                        aria-hidden="true"
                        style={{
                            position: "absolute",
                            inset: 0,
                            zIndex: 3,
                            pointerEvents: "none",
                            backgroundImage: `url(${url})`,
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "right -8px top -8px",
                            backgroundSize: "280px auto",
                            opacity: 0.22,
                        }}
                    />
                </>
            )}
        </div>
    );
}
