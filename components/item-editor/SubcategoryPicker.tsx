// src/components/item-editor/SubcategoryPicker.tsx
"use client";

import React from "react";
import { SUBCATEGORIES, type Subcategory } from "@/lib/subcategory";
import { SubcategorySampleBackground } from "./SubcategorySampleBackground";

type Props = {
    value: Subcategory | null;
    onChange: (v: Subcategory) => void;
    description?: string;
};

export function SubcategoryPicker({ value, onChange, description }: Props) {
    return (
        <SubcategorySampleBackground subcategory={value} className="w-full">
            <div style={{ padding: 16 }}>
                {/* チップ一覧 */}
                <div
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        marginBottom: 12,
                    }}
                >
                    {SUBCATEGORIES.map((c) => {
                        const active = value === c;
                        return (
                            <button
                                key={c}
                                type="button"
                                onClick={() => onChange(c)}
                                style={{
                                    padding: "8px 10px",
                                    borderRadius: 999,
                                    border: active
                                        ? "1px solid rgba(0,0,0,0.55)"
                                        : "1px solid rgba(0,0,0,0.12)",
                                    background: active ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.70)",
                                    fontSize: 12,
                                    lineHeight: "12px",
                                }}
                            >
                                {c}
                            </button>
                        );
                    })}
                </div>

                {/* 説明 */}
                <div style={{ fontSize: 14, lineHeight: 1.5, color: "rgba(0,0,0,0.78)" }}>
                    {value ? (
                        <>
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>{value}</div>
                            <div>{description ?? "ここに説明文を表示"}</div>
                        </>
                    ) : (
                        <div style={{ color: "rgba(0,0,0,0.55)" }}>
                            subcategory を選択すると背景が切り替わる
                        </div>
                    )}
                </div>
            </div>
        </SubcategorySampleBackground>
    );
}
