// lib/subcategorySamples.ts

export const SUBCATEGORY_SLUGS = [
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

export type SubcategorySlug = (typeof SUBCATEGORY_SLUGS)[number];

export const getOriginalSrc = (slug: SubcategorySlug) =>
    `/samples/subcategory/${slug}.png`;

export const getTransparentSrc = (slug: SubcategorySlug) =>
    `/ui/subcategory-samples/${slug}_transparent.png`;
