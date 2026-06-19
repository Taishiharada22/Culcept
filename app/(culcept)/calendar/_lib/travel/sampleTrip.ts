// app/(culcept)/calendar/_lib/travel/sampleTrip.ts
// 正本6画像（京都 2泊3日）に忠実なデモ content。実旅程データが未存在のため、UI の正本として使用。
// 写真は捏造せず placeholder（abstract タイル）。一部は null にして「＋写真を追加」blank 状態も実演。

import type { Trip, TripDay, TravelPhoto, PhotoTone } from "./types";

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

/** placeholder 写真（実画像でない abstract タイル）。 */
function ph(label: string, tone: PhotoTone, capturedAt?: string): TravelPhoto {
  return { source: "placeholder", label, tone, capturedAt };
}

const KYOTO_DAY1: TripDay = {
  date: "2026-06-24",
  dayIndex: 1,
  weekdayLabel: "火",
  monthDayLabel: "6/24",
  theme: "千年の都を感じる、はんなり京都さんぽ",
  themeSubtitle: "歴史と文化に触れながら、京の美と味を満喫する一日",
  weather: { icon: "sun", tempMax: 28, tempMin: 19, current: 25 },
  heroPhoto: ph("八坂の塔・夕景", "sunset", "2026-06-24T17:40:00"),

  schedule: [
    {
      id: "s1",
      startTime: "09:30",
      name: "京都駅 到着",
      subtitle: "新幹線 のぞみ9号",
      categories: ["到着", "観光"],
      description: "新幹線のぞみ9号で京都へ。旅の始まりです。",
      durationMin: 30,
      photo: ph("京都駅", "street", "2026-06-24T09:32:00"),
      coords: { lat: 34.9858, lng: 135.7588 },
      address: "京都市下京区烏丸通",
      transportToNext: { mode: "walk", durationMin: 12, label: "徒歩 約12分", distanceText: "850 m", fareText: null },
    },
    {
      id: "s2",
      startTime: "10:30",
      name: "清水寺",
      subtitle: "拝観・散策（約90分）",
      categories: ["拝観・散策", "世界遺産"],
      description: "世界遺産の清水寺を参拝。舞台からの絶景を楽しみます。",
      durationMin: 90,
      photo: ph("清水寺", "temple", "2026-06-24T10:45:00"),
      coords: { lat: 34.9949, lng: 135.7851 },
      address: "京都市東山区清水1丁目",
      transportToNext: { mode: "walk", durationMin: 10, label: "ランチへ 徒歩 約10分", distanceText: "700 m", fareText: null },
    },
    {
      id: "s3",
      startTime: "13:00",
      name: "ランチ（予約済）",
      subtitle: "京料理 たん熊 北店",
      categories: ["食事", "京料理"],
      description: "京料理 たん熊 北店で季節の京料理を堪能。",
      durationMin: 90,
      photo: ph("京料理", "food", "2026-06-24T13:10:00"),
      coords: { lat: 35.0136, lng: 135.7836 },
      address: "京都市左京区岡崎円勝寺町91-65",
      reservationId: "r2",
      transportToNext: { mode: "bus", durationMin: 15, label: "バス 約15分", distanceText: "4.3 km", fareText: "¥230" },
    },
    {
      id: "s4",
      startTime: "15:00",
      name: "祇園散策",
      subtitle: "花見小路・八坂神社",
      categories: ["散策", "フォトスポット"],
      description: "花見小路や八坂神社周辺をゆったり散策。",
      durationMin: 120,
      photo: ph("花見小路", "street", "2026-06-24T15:30:00"),
      coords: { lat: 35.0036, lng: 135.7755 },
      address: "京都市東山区祇園町",
      transportToNext: { mode: "taxi", durationMin: 15, label: "タクシー 約15分", distanceText: "5.6 km", fareText: "¥1,980" },
    },
    {
      id: "s5",
      startTime: "17:30",
      name: "THE HIRAMATSU 京都",
      subtitle: "チェックイン",
      categories: ["宿泊"],
      description: "チェックインで、くつろぎの時間。美しい宿で上質なひととき。",
      durationMin: 60,
      // ★blank 実演：チェックインの写真は未設定 →「＋写真を追加」
      photo: null,
      coords: { lat: 35.0086, lng: 135.7669 },
      address: "京都市中京区麩屋町通三条上る弁慶石町37",
      reservationId: "r1",
      transportToNext: { mode: "walk", durationMin: 3, label: "徒歩 約3分", distanceText: "240 m", fareText: null },
    },
    {
      id: "s6",
      startTime: "19:30",
      name: "ディナー（予約済）",
      subtitle: "高台寺 和久傳",
      categories: ["食事", "懐石料理"],
      description: "高台寺 和久傳で、京の旬を味わう特別なディナー。",
      durationMin: 120,
      photo: ph("懐石料理", "food", "2026-06-24T19:45:00"),
      coords: { lat: 35.0001, lng: 135.7805 },
      address: "京都市東山区高台寺下河原町530",
      reservationId: "r3",
    },
  ],

  reservations: [
    {
      id: "r1",
      category: "宿泊",
      name: "THE HIRAMATSU 京都",
      status: "確定済み",
      confirmationCode: "HKT-6247",
      timeLabel: "チェックイン 6/24 (火) 17:30",
      address: "京都市中京区麩屋町通三条上る弁慶石町37",
      phone: "075-211-7151",
      changeable: true,
      checkIn: "6/24 (火) 17:30",
      checkOut: "6/26 (木) 11:00",
      partySize: 2,
      tags: [
        { label: "キャンセル無料 6/22まで", tone: "muted" },
        { label: "朝食付き 2名", tone: "info" },
      ],
      actions: [
        { kind: "detail", label: "詳細を見る", emphasis: "outline" },
        { kind: "map", label: "地図で見る", emphasis: "outline" },
        { kind: "change", label: "変更・キャンセル", emphasis: "gold" },
      ],
      photo: ph("客室", "stay"),
      coords: { lat: 35.0086, lng: 135.7669 },
    },
    {
      id: "r2",
      category: "食事",
      name: "京料理 たん熊 北店",
      status: "確定済み",
      confirmationCode: "TKH-6241",
      timeLabel: "6/24 (火) 13:00・2名",
      address: "京都市左京区岡崎円勝寺町91-65",
      phone: "075-771-3306",
      changeable: true,
      partySize: 2,
      tags: [
        { label: "キャンセル無料 6/22まで", tone: "muted" },
        { label: "個室確約", tone: "info" },
      ],
      actions: [
        { kind: "detail", label: "詳細を見る", emphasis: "outline" },
        { kind: "menu", label: "メニューを見る", emphasis: "outline" },
        { kind: "change", label: "変更・キャンセル", emphasis: "gold" },
      ],
      photo: ph("京料理", "food"),
      coords: { lat: 35.0136, lng: 135.7836 },
    },
    {
      id: "r3",
      category: "食事",
      name: "高台寺 和久傳",
      status: "確定済み",
      confirmationCode: "WKT-6244",
      timeLabel: "6/24 (火) 19:30・2名",
      address: "京都市東山区高台寺下河原町530",
      phone: "075-561-5550",
      changeable: true,
      partySize: 2,
      tags: [
        { label: "キャンセル無料 6/23まで", tone: "muted" },
        { label: "個室確約", tone: "info" },
      ],
      actions: [
        { kind: "detail", label: "詳細を見る", emphasis: "outline" },
        { kind: "menu", label: "メニューを見る", emphasis: "outline" },
        { kind: "change", label: "変更・キャンセル", emphasis: "gold" },
      ],
      photo: ph("懐石料理", "food"),
      coords: { lat: 35.0001, lng: 135.7805 },
    },
    {
      id: "r4",
      category: "交通",
      name: "新幹線（のぞみ9号）",
      status: "確定済み",
      confirmationCode: "TRN-6240",
      transitFrom: "東京",
      transitTo: "京都",
      transitDepart: "6/24 (火) 09:03 発",
      transitArrive: "11:16 着",
      seat: "普通車指定席 2名 / 2A・2B",
      changeable: true,
      tags: [
        { label: "変更可能 6/23まで", tone: "muted" },
        { label: "払戻手数料あり", tone: "info" },
      ],
      actions: [
        { kind: "ticket", label: "チケットを表示", emphasis: "outline" },
        { kind: "timetable", label: "時刻表・乗換案内", emphasis: "outline" },
      ],
      photo: ph("新幹線", "street"),
      coords: { lat: 34.9858, lng: 135.7588 },
    },
  ],
  // 4スタット行は image 表示値（trip 全体の集計・一部は未掲載分含む）。
  reservationStats: { total: 6, confirmed: 6, changeable: 4, needsAction: 0 },

  meal: {
    areaLabel: "祇園・東山エリア",
    pick: {
      name: "京料理 たん熊 北店",
      badge: "和食・会席",
      rating: 4.8,
      ratingCount: 128,
      walkText: "徒歩 約2分 (160m)",
      recommendTime: "12:30–13:30",
      priceLevel: "¥¥¥¥",
      availability: "空席あり 予約OK",
      tags: ["四季の京料理", "老舗の安心感", "落ち着いた個室あり", "記念日におすすめ"],
      whyFitsYou: "静かな昼の時間帯に、京都らしい伝統とおもてなしをゆったりとご堪能いただけます。",
      conciergeName: "コンシェルジュ 木村より",
      photo: ph("会席料理", "food"),
      coords: { lat: 35.0136, lng: 135.7836 },
    },
    alternatives: [
      {
        id: "m1",
        category: "カフェ",
        name: "% ARABICA 京都東山",
        rating: 4.6,
        ratingCount: 892,
        walkText: "徒歩5分",
        hours: "08:00–10:00",
        priceLevel: "¥",
        description: "東山の静かな石畳で、上質な一杯を。",
        photo: ph("コーヒー", "food"),
        coords: { lat: 34.9966, lng: 135.7807 },
      },
      {
        id: "m2",
        category: "スイーツ",
        name: "茶寮 宝泉",
        rating: 4.7,
        ratingCount: 256,
        walkText: "徒歩7分",
        hours: "10:00–17:00",
        priceLevel: "¥¥",
        description: "季節の和パフェで、京都らしい甘味を。",
        photo: ph("和パフェ", "food"),
        coords: { lat: 35.0469, lng: 135.7905 },
      },
      {
        id: "m3",
        category: "ランチ",
        name: "祇園 丸山",
        rating: 4.6,
        ratingCount: 173,
        walkText: "徒歩8分",
        hours: "11:30–13:30",
        priceLevel: "¥¥¥",
        description: "祇園で味わう、京の粋な昼ごはん。",
        photo: ph("昼ごはん", "food"),
        coords: { lat: 35.003, lng: 135.778 },
      },
      {
        id: "m4",
        category: "ディナー",
        name: "祇園 肉処 紡",
        rating: 4.8,
        ratingCount: 210,
        walkText: "徒歩10分",
        hours: "17:30–21:00",
        priceLevel: "¥¥¥¥",
        description: "京の夜にふさわしい、上質な肉割烹。",
        photo: ph("肉割烹", "food"),
        coords: { lat: 35.0035, lng: 135.774 },
      },
    ],
  },

  budget: {
    todayBudget: 38000,
    todaySpend: 27650,
    todayRemaining: 10350,
    totalBudget: 110350,
    spentSoFar: 27650,
    remaining: 82700,
    spentPct: 25.0,
    remainingPct: 75.0,
    donut: [
      { key: "accommodation", labelEn: "ACCOMMODATION", labelJa: "宿泊費", amount: 38000, pct: 34 },
      { key: "food", labelEn: "FOOD & DINING", labelJa: "食費", amount: 26000, pct: 23 },
      { key: "transport", labelEn: "TRANSPORT", labelJa: "交通費", amount: 13000, pct: 12 },
      { key: "experiences", labelEn: "EXPERIENCES", labelJa: "体験・拝観料", amount: 11000, pct: 10 },
      { key: "shopping", labelEn: "SHOPPING", labelJa: "お土産・ショッピング", amount: 9850, pct: 9 },
      { key: "others", labelEn: "OTHERS", labelJa: "その他", amount: 12500, pct: 11 },
    ],
    dayComparison: [
      { label: "DAY 1", amount: 30000 },
      { label: "DAY 2", amount: 35000 },
      { label: "TODAY", amount: 33000, isToday: true },
      { label: "DAY 4", amount: 32000 },
      { label: "DAY 5", amount: 25000 },
    ],
    dailyAverage: 27588,
    progressPct: 25,
    progressLabel: "順調です",
    forecast: {
      predictedRemaining: 6800,
      statusLabel: "余裕あり",
      tip: "このままのペースでいくと、ご旅行全体で ¥6,800 程度の余裕が生まれる見込みです。",
    },
  },

  walking: { steps: 12450, distanceKm: 8.6 },

  move: {
    legs: [
      { id: "l1", time: "09:10", endpointKind: "depart", name: "京都駅", sub: "京都市下京区烏丸通", mode: "taxi", modeLabel: "タクシー", durationText: "約20分", distanceText: "7.2 km", fareText: "¥2,650" },
      { id: "l2", time: "09:30", endpointKind: "arrive", name: "清水寺", sub: "京都市東山区清水1丁目", mode: "walk", modeLabel: "徒歩", durationText: "約12分", distanceText: "850 m", fareText: null },
      { id: "l3", time: "09:42", endpointKind: "depart", name: "清水寺", sub: "バス停（五条坂）", mode: "bus", modeLabel: "市バス 206", durationText: "約18分", distanceText: "4.3 km", fareText: "¥230" },
      { id: "l4", time: "10:00", endpointKind: "arrive", name: "祇園", sub: "バス停（祇園）", mode: "walk", modeLabel: "徒歩", durationText: "約8分", distanceText: "650 m", fareText: null },
      { id: "l5", time: "10:08", endpointKind: "depart", name: "祇園", sub: "京都市東山区祇園町", mode: "taxi", modeLabel: "タクシー", durationText: "約18分", distanceText: "5.6 km", fareText: "¥1,980" },
      { id: "l6", time: "10:26", endpointKind: "arrive", name: "THE HIRAMATSU 京都", sub: "京都市中京区富小路通三条下ル", isDestination: true },
    ],
    summary: {
      perMode: [
        { mode: "taxi", label: "タクシー", durationText: "約38分", distanceText: "12.8 km" },
        { mode: "walk", label: "徒歩", durationText: "約20分", distanceText: "1.5 km" },
        { mode: "bus", label: "バス", durationText: "約18分", distanceText: "4.3 km" },
      ],
      totalDurationText: "約76分",
      totalDistanceText: "18.6 km",
      totalFareText: "概算 ¥4,860",
    },
  },

  memories: {
    text: "夕暮れの二年坂はとても風情がありました。明日は嵐山へ。竹林の小径が楽しみ。",
    photo: ph("二年坂", "sunset"),
  },

  routeStops: [
    { order: 1, name: "京都駅", coords: { lat: 34.9858, lng: 135.7588 }, modeToNext: "taxi" },
    { order: 2, name: "清水寺", coords: { lat: 34.9949, lng: 135.7851 }, modeToNext: "bus" },
    { order: 3, name: "ランチ", coords: { lat: 35.0136, lng: 135.7836 }, modeToNext: "walk" },
    { order: 4, name: "祇園", coords: { lat: 35.0036, lng: 135.7755 }, modeToNext: "taxi" },
    { order: 5, name: "THE HIRAMATSU 京都", coords: { lat: 35.0086, lng: 135.7669 }, modeToNext: "taxi" },
    { order: 6, name: "高台寺 和久傳", coords: { lat: 35.0001, lng: 135.7805 } },
  ],
};

export const SAMPLE_KYOTO_TRIP: Trip = {
  id: "trip-kyoto-sample",
  title: "京都 2泊3日",
  destinationLabel: "京都",
  startDate: "2026-06-24",
  endDate: "2026-06-26",
  dateRangeLabel: "6/24 (火) ～ 6/26 (木)",
  partySize: 2,
  days: [KYOTO_DAY1],
};

/**
 * クリックされた日付に対する旅の1日詳細を返す（デモ）。
 * 実データ未存在のため、京都サンプル Day1 の content を返しつつ、ヘッダーの日付ラベルは
 * クリックされた実日付に合わせて上書きする（「その日」を開いた体験に接続）。
 */
export function getSampleTripDay(date: string): { trip: Trip; day: TripDay } {
  const d = new Date(`${date}T00:00:00`);
  const valid = !Number.isNaN(d.getTime());
  const day: TripDay = valid
    ? {
        ...KYOTO_DAY1,
        date,
        monthDayLabel: `${d.getMonth() + 1}/${d.getDate()}`,
        weekdayLabel: WEEKDAY_JA[d.getDay()],
      }
    : KYOTO_DAY1;
  return { trip: SAMPLE_KYOTO_TRIP, day };
}
