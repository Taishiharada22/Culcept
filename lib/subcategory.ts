// src/lib/subcategory.ts
export const SUBCATEGORIES = [
    "backpack",
    "blouse",
    "blouson",
    "boots",
    "cargo",
    "chino",
    "coat",
    "crossbody",
    "denim",
    "derby",
    "down",
    "hoodie",
    "jacket",
    "knit",
    "loafer",
    "shirt",
    "shoulder",
    "skirt",
    "slacks",
    "sneakers",
    "sweatshirt",
    "tote",
    "trench",
    "tshirt",
    "vest",
] as const;

export type Subcategory = (typeof SUBCATEGORIES)[number];

export function isSubcategory(x: string): x is Subcategory {
    return (SUBCATEGORIES as readonly string[]).includes(x);
}

export function subcategorySampleTransparentUrl(subcategory: Subcategory) {
    return `/ui/subcategory-samples/${subcategory}_transparent.png`;
}
