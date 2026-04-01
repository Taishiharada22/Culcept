-- 既存 office_code → prefecture backfill
-- 47都道府県の代表 office_code + 北海道7分割 + 沖縄/鹿児島分割をカバー
UPDATE user_weather_settings
SET prefecture = CASE default_location
  -- 北海道（7分割 → すべて「北海道」）
  WHEN '011000' THEN '北海道'
  WHEN '012000' THEN '北海道'
  WHEN '013000' THEN '北海道'
  WHEN '014030' THEN '北海道'
  WHEN '014100' THEN '北海道'
  WHEN '015000' THEN '北海道'
  WHEN '016000' THEN '北海道'
  WHEN '017000' THEN '北海道'
  -- 東北
  WHEN '020000' THEN '青森県'
  WHEN '030000' THEN '岩手県'
  WHEN '040000' THEN '宮城県'
  WHEN '050000' THEN '秋田県'
  WHEN '060000' THEN '山形県'
  WHEN '070000' THEN '福島県'
  -- 関東
  WHEN '080000' THEN '茨城県'
  WHEN '090000' THEN '栃木県'
  WHEN '100000' THEN '群馬県'
  WHEN '110000' THEN '埼玉県'
  WHEN '120000' THEN '千葉県'
  WHEN '130000' THEN '東京都'
  WHEN '140000' THEN '神奈川県'
  -- 中部
  WHEN '150000' THEN '新潟県'
  WHEN '160000' THEN '富山県'
  WHEN '170000' THEN '石川県'
  WHEN '180000' THEN '福井県'
  WHEN '190000' THEN '山梨県'
  WHEN '200000' THEN '長野県'
  -- 東海
  WHEN '210000' THEN '岐阜県'
  WHEN '220000' THEN '静岡県'
  WHEN '230000' THEN '愛知県'
  WHEN '240000' THEN '三重県'
  -- 近畿
  WHEN '250000' THEN '滋賀県'
  WHEN '260000' THEN '京都府'
  WHEN '270000' THEN '大阪府'
  WHEN '280000' THEN '兵庫県'
  WHEN '290000' THEN '奈良県'
  WHEN '300000' THEN '和歌山県'
  -- 中国
  WHEN '310000' THEN '鳥取県'
  WHEN '320000' THEN '島根県'
  WHEN '330000' THEN '岡山県'
  WHEN '340000' THEN '広島県'
  WHEN '350000' THEN '山口県'
  -- 四国
  WHEN '360000' THEN '徳島県'
  WHEN '370000' THEN '香川県'
  WHEN '380000' THEN '愛媛県'
  WHEN '390000' THEN '高知県'
  -- 九州
  WHEN '400000' THEN '福岡県'
  WHEN '410000' THEN '佐賀県'
  WHEN '420000' THEN '長崎県'
  WHEN '430000' THEN '熊本県'
  WHEN '440000' THEN '大分県'
  WHEN '450000' THEN '宮崎県'
  -- 鹿児島（2分割 → すべて「鹿児島県」）
  WHEN '460040' THEN '鹿児島県'
  WHEN '460100' THEN '鹿児島県'
  -- 沖縄（4分割 → すべて「沖縄県」）
  WHEN '471000' THEN '沖縄県'
  WHEN '472000' THEN '沖縄県'
  WHEN '473000' THEN '沖縄県'
  WHEN '474000' THEN '沖縄県'
  ELSE NULL
END
WHERE prefecture IS NULL
  AND default_location IS NOT NULL;
