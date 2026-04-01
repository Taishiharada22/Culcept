/**
 * Shared Location Domain
 *
 * 居住地は Calendar にも My-Style にも属さない共通ドメイン。
 * 都道府県を正本とし、天気予報用の JMA office code を自動マッピングする。
 *
 * Storage: Supabase `user_weather_settings.default_location` (JMA office code)
 *          + `user_weather_settings.prefecture` (表示用都道府県名)
 * Read by: Calendar (天気予報 + コーデ提案), My-Style (天気コーデ)
 */

// ── 都道府県 → JMA office code マッピング ──
// 北海道は石狩(札幌)、鹿児島は奄美除く、沖縄は本島地方を代表値とする
export const PREFECTURE_OFFICE_MAP: Record<string, string> = {
  "北海道": "016000",
  "青森県": "020000",
  "岩手県": "030000",
  "宮城県": "040000",
  "秋田県": "050000",
  "山形県": "060000",
  "福島県": "070000",
  "茨城県": "080000",
  "栃木県": "090000",
  "群馬県": "100000",
  "埼玉県": "110000",
  "千葉県": "120000",
  "東京都": "130000",
  "神奈川県": "140000",
  "新潟県": "150000",
  "富山県": "160000",
  "石川県": "170000",
  "福井県": "180000",
  "山梨県": "190000",
  "長野県": "200000",
  "岐阜県": "210000",
  "静岡県": "220000",
  "愛知県": "230000",
  "三重県": "240000",
  "滋賀県": "250000",
  "京都府": "260000",
  "大阪府": "270000",
  "兵庫県": "280000",
  "奈良県": "290000",
  "和歌山県": "300000",
  "鳥取県": "310000",
  "島根県": "320000",
  "岡山県": "330000",
  "広島県": "340000",
  "山口県": "350000",
  "徳島県": "360000",
  "香川県": "370000",
  "愛媛県": "380000",
  "高知県": "390000",
  "福岡県": "400000",
  "佐賀県": "410000",
  "長崎県": "420000",
  "熊本県": "430000",
  "大分県": "440000",
  "宮崎県": "450000",
  "鹿児島県": "460100",
  "沖縄県": "471000",
};

export const PREFECTURES = Object.keys(PREFECTURE_OFFICE_MAP);

export function prefectureToOfficeCode(prefecture: string): string | null {
  return PREFECTURE_OFFICE_MAP[prefecture] ?? null;
}

// JMA office code → 都道府県の逆引き
// 北海道(7分割)・鹿児島(2分割)・沖縄(4分割)は複数コードが同一県にマッピング
const OFFICE_TO_PREFECTURE: Record<string, string> = {};
for (const [pref, code] of Object.entries(PREFECTURE_OFFICE_MAP)) {
  OFFICE_TO_PREFECTURE[code] = pref;
}
// 北海道の分割コード
for (const code of ["011000", "012000", "013000", "014030", "014100", "015000", "017000"]) {
  OFFICE_TO_PREFECTURE[code] = "北海道";
}
// 鹿児島の分割コード（奄美地方）
OFFICE_TO_PREFECTURE["460040"] = "鹿児島県";
// 沖縄の分割コード
for (const code of ["472000", "473000", "474000"]) {
  OFFICE_TO_PREFECTURE[code] = "沖縄県";
}

export function officeCodeToPrefecture(officeCode: string): string | null {
  return OFFICE_TO_PREFECTURE[officeCode] ?? null;
}

export interface SharedLocation {
  prefecture: string;
  officeCode: string;
}

// ── 都道府県 → 代表座標（県庁所在地）──
// Open-Meteo API 等、緯度経度ベースの天気取得用
export const PREFECTURE_COORDS: Record<string, { lat: number; lon: number }> = {
  "北海道": { lat: 43.0646, lon: 141.3468 },
  "青森県": { lat: 40.8244, lon: 140.7400 },
  "岩手県": { lat: 39.7036, lon: 141.1527 },
  "宮城県": { lat: 38.2688, lon: 140.8721 },
  "秋田県": { lat: 39.7186, lon: 140.1024 },
  "山形県": { lat: 38.2405, lon: 140.3634 },
  "福島県": { lat: 37.7503, lon: 140.4676 },
  "茨城県": { lat: 36.3419, lon: 140.4468 },
  "栃木県": { lat: 36.5657, lon: 139.8836 },
  "群馬県": { lat: 36.3912, lon: 139.0608 },
  "埼玉県": { lat: 35.8569, lon: 139.6489 },
  "千葉県": { lat: 35.6047, lon: 140.1233 },
  "東京都": { lat: 35.6762, lon: 139.6503 },
  "神奈川県": { lat: 35.4478, lon: 139.6425 },
  "新潟県": { lat: 37.9026, lon: 139.0236 },
  "富山県": { lat: 36.6953, lon: 137.2114 },
  "石川県": { lat: 36.5946, lon: 136.6256 },
  "福井県": { lat: 36.0652, lon: 136.2216 },
  "山梨県": { lat: 35.6642, lon: 138.5684 },
  "長野県": { lat: 36.2332, lon: 138.1810 },
  "岐阜県": { lat: 35.3912, lon: 136.7223 },
  "静岡県": { lat: 34.9769, lon: 138.3831 },
  "愛知県": { lat: 35.1802, lon: 136.9066 },
  "三重県": { lat: 34.7303, lon: 136.5086 },
  "滋賀県": { lat: 35.0045, lon: 135.8686 },
  "京都府": { lat: 35.0214, lon: 135.7556 },
  "大阪府": { lat: 34.6864, lon: 135.5200 },
  "兵庫県": { lat: 34.6913, lon: 135.1830 },
  "奈良県": { lat: 34.6851, lon: 135.8328 },
  "和歌山県": { lat: 34.2261, lon: 135.1675 },
  "鳥取県": { lat: 35.5039, lon: 134.2381 },
  "島根県": { lat: 35.4723, lon: 133.0505 },
  "岡山県": { lat: 34.6618, lon: 133.9344 },
  "広島県": { lat: 34.3963, lon: 132.4596 },
  "山口県": { lat: 34.1860, lon: 131.4714 },
  "徳島県": { lat: 34.0658, lon: 134.5593 },
  "香川県": { lat: 34.3401, lon: 134.0434 },
  "愛媛県": { lat: 33.8416, lon: 132.7657 },
  "高知県": { lat: 33.5597, lon: 133.5311 },
  "福岡県": { lat: 33.6064, lon: 130.4183 },
  "佐賀県": { lat: 33.2494, lon: 130.2988 },
  "長崎県": { lat: 32.7448, lon: 129.8737 },
  "熊本県": { lat: 32.7898, lon: 130.7417 },
  "大分県": { lat: 33.2382, lon: 131.6126 },
  "宮崎県": { lat: 31.9111, lon: 131.4239 },
  "鹿児島県": { lat: 31.5602, lon: 130.5581 },
  "沖縄県": { lat: 26.2124, lon: 127.6809 },
};

/**
 * shared location をクライアントから取得する
 * /api/weather/subscription を叩いて保存済みの都道府県を返す
 */
export async function fetchSharedLocation(): Promise<SharedLocation | null> {
  try {
    const res = await fetch("/api/weather/subscription", { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    const sub = json?.subscription;
    if (sub?.prefecture && sub?.office_code) {
      return { prefecture: sub.prefecture, officeCode: sub.office_code };
    }
    return null;
  } catch {
    return null;
  }
}
