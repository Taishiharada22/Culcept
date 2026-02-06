-- Luxury Lane機能用テーブル

-- luxury_lanes: Lane定義テーブル（8-10種類の系統）
CREATE TABLE IF NOT EXISTS luxury_lanes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lane_id TEXT UNIQUE NOT NULL,
    name_ja TEXT NOT NULL,
    name_en TEXT NOT NULL,
    description TEXT,
    color_primary TEXT,
    color_secondary TEXT,
    icon_emoji TEXT,
    keywords TEXT[],
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- luxury_cards: Lane用カード画像テーブル
CREATE TABLE IF NOT EXISTS luxury_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id TEXT UNIQUE NOT NULL,
    lane_id TEXT NOT NULL REFERENCES luxury_lanes(lane_id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    tags TEXT[],
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- luxury_impressions: ユーザーのスワイプ記録
CREATE TABLE IF NOT EXISTS luxury_impressions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    card_id TEXT NOT NULL,
    lane_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('like', 'dislike', 'skip')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- luxury_lane_scores: ユーザーのLaneスコア集計
CREATE TABLE IF NOT EXISTS luxury_lane_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    lane_id TEXT NOT NULL,
    score DECIMAL(5,2) DEFAULT 0,
    like_count INT DEFAULT 0,
    dislike_count INT DEFAULT 0,
    total_count INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, lane_id)
);

-- luxury_results: Lane診断結果保存
CREATE TABLE IF NOT EXISTS luxury_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    top_lane_id TEXT,
    top_tags TEXT[],
    reason TEXT,
    all_scores JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_luxury_cards_lane ON luxury_cards(lane_id);
CREATE INDEX IF NOT EXISTS idx_luxury_cards_active ON luxury_cards(is_active);
CREATE INDEX IF NOT EXISTS idx_luxury_impressions_user ON luxury_impressions(user_id);
CREATE INDEX IF NOT EXISTS idx_luxury_impressions_user_card ON luxury_impressions(user_id, card_id);
CREATE INDEX IF NOT EXISTS idx_luxury_lane_scores_user ON luxury_lane_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_luxury_results_user ON luxury_results(user_id);

-- 初期Lane定義データ（10種類）
INSERT INTO luxury_lanes (lane_id, name_ja, name_en, description, color_primary, color_secondary, icon_emoji, keywords, display_order) VALUES
('timeless_elegance', 'タイムレス・エレガンス', 'Timeless Elegance', '時代を超える上品さと洗練。クラシックで普遍的な美しさを追求するスタイル。', '#C9B037', '#8B7355', '✨', ARRAY['classic', 'elegant', 'refined', 'sophisticated', 'timeless'], 1),
('avant_garde', 'アヴァンギャルド', 'Avant-Garde', '前衛的で実験的なデザイン。常識を超えた創造性と革新を体現。', '#8B00FF', '#4B0082', '🔮', ARRAY['experimental', 'innovative', 'bold', 'artistic', 'unconventional'], 2),
('modern_minimalist', 'モダン・ミニマリスト', 'Modern Minimalist', '洗練されたシンプルさ。無駄を削ぎ落とした究極の美。', '#1A1A1A', '#4A4A4A', '◼️', ARRAY['minimal', 'clean', 'simple', 'modern', 'sleek'], 3),
('romantic_luxury', 'ロマンティック・ラグジュアリー', 'Romantic Luxury', '繊細で女性的な美しさ。ソフトでドリーミーな雰囲気。', '#FFB6C1', '#DDA0DD', '🌸', ARRAY['romantic', 'feminine', 'soft', 'delicate', 'dreamy'], 4),
('bold_statement', 'ボールド・ステートメント', 'Bold Statement', '大胆で主張的なスタイル。強い個性と存在感を表現。', '#FF4500', '#DC143C', '🔥', ARRAY['bold', 'statement', 'powerful', 'dramatic', 'striking'], 5),
('heritage_classic', 'ヘリテージ・クラシック', 'Heritage Classic', '伝統と歴史への敬意。時を経て証明された品格。', '#8B4513', '#CD853F', '👑', ARRAY['heritage', 'traditional', 'classic', 'prestigious', 'timeless'], 6),
('sporty_luxe', 'スポーティ・ラグジュアリー', 'Sporty Luxe', 'スポーツとラグジュアリーの融合。アクティブでありながら上質。', '#2E8B57', '#228B22', '🏆', ARRAY['sporty', 'athletic', 'luxury', 'performance', 'dynamic'], 7),
('artistic_expression', 'アーティスティック', 'Artistic Expression', 'アートと創造性の表現。ファッションをキャンバスに。', '#9932CC', '#BA55D3', '🎨', ARRAY['artistic', 'creative', 'expressive', 'unique', 'imaginative'], 8),
('eco_conscious', 'エコ・コンシャス', 'Eco-Conscious', 'サステナブルな高級感。環境への配慮と美の両立。', '#228B22', '#3CB371', '🌿', ARRAY['sustainable', 'eco', 'conscious', 'ethical', 'green'], 9),
('urban_sophisticate', 'アーバン・ソフィスティケート', 'Urban Sophisticate', '都会的で洗練されたスタイル。モダンシティライフの象徴。', '#4169E1', '#1E90FF', '🏙️', ARRAY['urban', 'sophisticated', 'city', 'modern', 'cosmopolitan'], 10)
ON CONFLICT (lane_id) DO NOTHING;
