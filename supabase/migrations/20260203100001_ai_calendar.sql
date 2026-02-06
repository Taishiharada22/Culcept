-- AIカレンダー機能用テーブル

-- calendar_outfits: 生成済みコーディネート
CREATE TABLE IF NOT EXISTS calendar_outfits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    date DATE NOT NULL,
    outfit_items JSONB NOT NULL DEFAULT '[]',
    weather_input JSONB,
    scene TEXT,
    style_notes TEXT,
    is_worn BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- user_weather_settings: ユーザーの天気設定
CREATE TABLE IF NOT EXISTS user_weather_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL,
    default_location TEXT,
    temp_preference TEXT CHECK (temp_preference IN ('cold', 'normal', 'hot')),
    rain_sensitivity TEXT CHECK (rain_sensitivity IN ('low', 'normal', 'high')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- calendar_events: 予定（オプション）
CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    date DATE NOT NULL,
    event_type TEXT,
    event_name TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_calendar_outfits_user ON calendar_outfits(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_outfits_user_date ON calendar_outfits(user_id, date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_date ON calendar_events(user_id, date);
