// lib/origin/lifeProfile/geolocation.ts
// #2 位置情報: Geolocation API → 住環境カテゴリ自動補完

export type LocationSnapshot = {
  latitude: number;
  longitude: number;
  /** 逆ジオコーディング結果（市区町村レベル） */
  label: string | null;
  capturedAt: string;
};

/** Geolocation 対応チェック */
export function isGeolocationSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "geolocation" in navigator;
}

/** 現在位置を取得 */
export function getCurrentLocation(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!isGeolocationSupported()) {
      return reject(new Error("Geolocation not supported"));
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      (err) => reject(new Error(err.message)),
      { timeout: 10000, enableHighAccuracy: false },
    );
  });
}

/**
 * 緯度経度から地名を取得（Nominatim — 無料逆ジオコーディング）
 * レート制限: 1req/sec なので控えめに使う
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10&accept-language=ja`,
      { headers: { "User-Agent": "Aneurasync/1.0" } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    // 市区町村 + 都道府県
    const city =
      data.address?.city ??
      data.address?.town ??
      data.address?.village ??
      data.address?.county ??
      "";
    const state = data.address?.state ?? data.address?.province ?? "";
    const label = [state, city].filter(Boolean).join(" ");
    return label || null;
  } catch {
    return null;
  }
}

/**
 * 位置情報を取得してラベル付きで返す
 */
export async function captureLocation(): Promise<LocationSnapshot> {
  const { latitude, longitude } = await getCurrentLocation();
  const label = await reverseGeocode(latitude, longitude);
  return {
    latitude,
    longitude,
    label,
    capturedAt: new Date().toISOString(),
  };
}
