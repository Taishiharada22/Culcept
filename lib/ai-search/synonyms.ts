// lib/ai-search/synonyms.ts
// 同義語・関連語辞書

export const SYNONYMS: Record<string, string[]> = {
    // トップス
    'ジャケット': ['jacket', 'ブレザー', 'blazer', '上着', 'アウター', 'outerwear'],
    'コート': ['coat', 'オーバーコート', 'overcoat', 'アウター'],
    'シャツ': ['shirt', 'ブラウス', 'blouse', 'ワイシャツ', 'Yシャツ', 'dress shirt'],
    'Tシャツ': ['tshirt', 't-shirt', 'ティーシャツ', 'カットソー', 'tee'],
    'ニット': ['knit', 'セーター', 'sweater', 'ニットウェア', 'knitwear'],
    'パーカー': ['hoodie', 'フーディー', 'スウェット', 'sweatshirt', 'プルオーバー'],
    'カーディガン': ['cardigan', 'カーデ', 'ニットカーデ'],
    'ベスト': ['vest', 'ジレ', 'gilet'],

    // ボトムス
    'パンツ': ['pants', 'trousers', 'ズボン', 'slacks', 'スラックス'],
    'デニム': ['denim', 'ジーンズ', 'jeans', 'Gパン', 'ジーパン'],
    'チノパン': ['chinos', 'chino pants', 'チノ', 'チノーズ'],
    'スカート': ['skirt', 'ミニスカ', 'ロングスカート', 'プリーツ'],
    'ショーツ': ['shorts', '短パン', 'ショートパンツ', 'ハーフパンツ'],
    'ワイドパンツ': ['wide pants', 'ワイド', 'バギー', 'baggy'],

    // シューズ
    'スニーカー': ['sneakers', 'sneaker', 'スニーカーズ', '運動靴'],
    'ブーツ': ['boots', 'boot', 'ショートブーツ', 'ロングブーツ'],
    'ローファー': ['loafers', 'loafer', 'ペニーローファー'],
    'サンダル': ['sandals', 'sandal', 'ビーチサンダル', 'ビーサン'],
    '革靴': ['leather shoes', 'ドレスシューズ', 'dress shoes', 'オックスフォード', 'oxford'],

    // バッグ
    'トートバッグ': ['tote', 'tote bag', 'トート'],
    'リュック': ['backpack', 'バックパック', 'リュックサック'],
    'ショルダーバッグ': ['shoulder bag', 'ショルダー', 'クロスボディ', 'crossbody'],
    'クラッチ': ['clutch', 'クラッチバッグ', 'ポーチ'],

    // スタイル
    'カジュアル': ['casual', 'ラフ', 'リラックス', 'relaxed', '普段着'],
    'フォーマル': ['formal', 'ドレッシー', 'dressy', 'きれいめ', 'きちんと'],
    'ストリート': ['street', 'streetwear', 'ストリートファッション', 'アーバン', 'urban'],
    'ミニマル': ['minimal', 'シンプル', 'simple', 'ベーシック', 'basic', 'クリーン', 'clean'],
    'ヴィンテージ': ['vintage', 'ビンテージ', 'レトロ', 'retro', 'クラシック', 'classic', '古着'],
    'スポーティ': ['sporty', 'アスレジャー', 'athleisure', 'スポーツ', 'athletic'],
    'モード': ['mode', 'モード系', 'ハイファッション', 'high fashion', 'アヴァンギャルド'],
    'ガーリー': ['girly', 'フェミニン', 'feminine', '女の子', '可愛い'],
    'マニッシュ': ['mannish', 'ボーイッシュ', 'boyish', 'メンズライク'],

    // 色
    '黒': ['black', 'ブラック', '黒色', 'noir'],
    '白': ['white', 'ホワイト', '白色', '生成り', 'オフホワイト', 'off-white'],
    'グレー': ['grey', 'gray', 'グレイ', '灰色', 'チャコール', 'charcoal'],
    'ネイビー': ['navy', 'ネービー', '紺', '紺色', 'dark blue'],
    'ベージュ': ['beige', 'キャメル', 'camel', 'タン', 'tan'],
    'ブラウン': ['brown', '茶色', 'チョコレート', 'chocolate'],

    // 素材
    'レザー': ['leather', '革', '皮革', 'レザー素材'],
    'コットン': ['cotton', '綿', '木綿'],
    'リネン': ['linen', '麻', 'リネン素材'],
    'ウール': ['wool', '羊毛', 'ウール素材'],
    'シルク': ['silk', '絹', 'シルク素材'],
    'ナイロン': ['nylon', 'ナイロン素材'],
    'ポリエステル': ['polyester', 'ポリ'],

    // シーン
    '仕事': ['work', 'ビジネス', 'business', 'オフィス', 'office', '出勤'],
    'デート': ['date', '恋人', '彼氏', '彼女'],
    '結婚式': ['wedding', 'ウェディング', '披露宴', '二次会'],
    '旅行': ['travel', 'trip', '観光', 'トラベル'],
    'パーティ': ['party', 'パーティー', '宴会'],
};

// 検索クエリを同義語で展開
export function expandSearchTerms(query: string): string[] {
    const terms = query.split(/[\s　,、。・]+/).filter(Boolean);
    const expanded = new Set<string>();

    for (const term of terms) {
        expanded.add(term);
        expanded.add(term.toLowerCase());

        // 同義語を追加
        for (const [key, synonyms] of Object.entries(SYNONYMS)) {
            // キー自体がマッチ
            if (key === term || key.toLowerCase() === term.toLowerCase()) {
                synonyms.forEach(s => expanded.add(s.toLowerCase()));
            }
            // 同義語の中にマッチするものがある
            if (synonyms.some(s => s.toLowerCase() === term.toLowerCase())) {
                expanded.add(key.toLowerCase());
                synonyms.forEach(s => expanded.add(s.toLowerCase()));
            }
        }
    }

    return [...expanded];
}

// カテゴリを検出
export function detectCategory(query: string): string | null {
    const lowerQuery = query.toLowerCase();

    const categoryKeywords: Record<string, string[]> = {
        tops: ['トップス', 'シャツ', 'tシャツ', 'ニット', 'セーター', 'パーカー', 'ブラウス', '上', 'shirt', 'sweater', 'hoodie'],
        bottoms: ['ボトムス', 'パンツ', 'ズボン', 'スカート', 'デニム', 'ジーンズ', '下', 'pants', 'jeans', 'skirt'],
        outerwear: ['アウター', 'ジャケット', 'コート', '上着', '羽織り', 'jacket', 'coat', 'outerwear'],
        shoes: ['シューズ', '靴', 'スニーカー', 'ブーツ', 'サンダル', 'shoes', 'sneakers', 'boots'],
        bags: ['バッグ', 'カバン', '鞄', 'リュック', 'bag', 'backpack'],
        accessories: ['アクセサリー', '小物', 'アクセ', '帽子', 'キャップ', 'accessories', 'hat', 'cap'],
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
        if (keywords.some(kw => lowerQuery.includes(kw.toLowerCase()))) {
            return category;
        }
    }

    return null;
}

// 価格帯を検出
export function detectPriceRange(query: string): { min: number; max: number } | null {
    // "1万円以内"、"〜5000円"、"3000-5000円"などのパターン
    const patterns = [
        /(\d+)万円?以内/,
        /(\d+)円以内/,
        /〜(\d+)円/,
        /(\d+)[-〜](\d+)円/,
        /予算(\d+)/,
        /(\d+)k/i,
    ];

    for (const pattern of patterns) {
        const match = query.match(pattern);
        if (match) {
            if (match[2]) {
                return { min: parseInt(match[1]), max: parseInt(match[2]) };
            } else {
                const value = parseInt(match[1]);
                if (query.includes('万')) {
                    return { min: 0, max: value * 10000 };
                }
                if (query.toLowerCase().includes('k')) {
                    return { min: 0, max: value * 1000 };
                }
                return { min: 0, max: value };
            }
        }
    }

    // 抽象的な表現
    if (query.includes('安め') || query.includes('プチプラ') || query.includes('安い')) {
        return { min: 0, max: 5000 };
    }
    if (query.includes('高め') || query.includes('高級') || query.includes('ラグジュアリー')) {
        return { min: 20000, max: 100000 };
    }

    return null;
}

// スタイルを検出
export function detectStyle(query: string): string[] {
    const lowerQuery = query.toLowerCase();
    const styles: string[] = [];

    const styleKeywords: Record<string, string[]> = {
        casual: ['カジュアル', 'casual', 'ラフ', '普段着'],
        formal: ['フォーマル', 'formal', 'きれいめ', 'ドレッシー', 'きちんと'],
        street: ['ストリート', 'street', 'アーバン'],
        minimal: ['ミニマル', 'minimal', 'シンプル', 'simple', 'ベーシック'],
        vintage: ['ヴィンテージ', 'vintage', 'レトロ', '古着'],
        sporty: ['スポーティ', 'sporty', 'アスレジャー'],
    };

    for (const [style, keywords] of Object.entries(styleKeywords)) {
        if (keywords.some(kw => lowerQuery.includes(kw.toLowerCase()))) {
            styles.push(style);
        }
    }

    return styles;
}
