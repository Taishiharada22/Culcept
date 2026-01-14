export type Vec3 = { street: number; loud: number; vintage: number };

// 0..100 の座標
export const TAG_VEC: Record<string, Vec3> = {
    "street-core": { street: 90, loud: 60, vintage: 30 },
    "luxury-street": { street: 85, loud: 55, vintage: 35 },
    "techwear": { street: 80, loud: 20, vintage: 20 },
    "skate": { street: 85, loud: 55, vintage: 55 },
    "gorpcore": { street: 70, loud: 25, vintage: 45 },
    "outdoor": { street: 55, loud: 20, vintage: 50 },
    "military": { street: 50, loud: 20, vintage: 85 },
    "workwear-heritage": { street: 55, loud: 25, vintage: 85 },
    "american-vintage": { street: 65, loud: 45, vintage: 95 },
    "denim-focus": { street: 60, loud: 25, vintage: 90 },
    "minimal": { street: 40, loud: 10, vintage: 35 },
    "preppy-ivy": { street: 25, loud: 15, vintage: 80 },
    "archive-mode": { street: 45, loud: 40, vintage: 60 },
    "designer-luxury": { street: 35, loud: 25, vintage: 55 },
    "y2k": { street: 85, loud: 85, vintage: 65 },
    "punk-grunge": { street: 75, loud: 75, vintage: 75 },
    "kawaii-lolita": { street: 20, loud: 70, vintage: 55 },
    "subculture-jfashion": { street: 35, loud: 80, vintage: 55 },
    "sneaker-focus": { street: 90, loud: 55, vintage: 35 },
    "sportswear": { street: 65, loud: 35, vintage: 40 }
};
