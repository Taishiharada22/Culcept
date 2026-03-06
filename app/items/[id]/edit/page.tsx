"use client";

import React, { useState } from "react";
import type { Subcategory } from "@/lib/subcategory";
import { SubcategoryPicker } from "@/components/item-editor/SubcategoryPicker";

export default function ItemEditPageLike() {
    const [subcategory, setSubcategory] = useState<Subcategory | null>(null);

    return (
        <div style={{ padding: 16 }}>
            <SubcategoryPicker
                value={subcategory}
                onChange={(v) => setSubcategory(v)}
                description="例：コートは“外側の主役”。丈感と襟で印象が決まる。"
            />
        </div>
    );
}
