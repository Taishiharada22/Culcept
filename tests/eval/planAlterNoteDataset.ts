/**
 * Phase 3-N Plan P2 Step 2 — Synthetic alterNote 評価 dataset (= 50 件代表 anchor)
 *
 * 設計書: docs/alter-plan-p2-llm-step2-readiness-v3.md §3 + §13
 *
 * 役割 (= CEO + GPT 2026-05-25 並行運用ルール):
 *   - **「実データ不足」 は停止理由にしない、 synthetic / representative dataset を先行評価の主軸**
 *   - 50 件 = カテゴリ × 時刻帯 × location × sensitive バリエーション網羅
 *   - LLM 呼ばない pure data (= 機械検証 + LLM-as-judge 採点入力)
 *
 * 採用判定 (= readiness §3.2.5):
 *   - Step 2 LLM 採点:
 *     - 自然さ ≥ 4.2
 *     - あなたらしさ ≥ 3.5
 *     - 押しつけ感の弱さ ≥ 4.0
 *
 * Personal Model 仮想 user (= 50 件全体で 5 種の代表 user 定義):
 *   - 後述 PERSONAL_MODEL_PROFILES に 5 種を定義
 *   - 各 anchor は 5 user × 各 50 件 = 250 評価ケース (= judge harness 入力)
 *
 * 不変原則:
 *   - LLM / API / DB / network 不使用
 *   - synthetic = 実 user データなし、 完全合成
 *   - sensitive バリエーションは synthetic で十分に表現可能 (= 実 user 個人情報不在)
 *
 * 設計書 references:
 *   - lib/plan/external-anchor.ts (= ExternalAnchor 型)
 *   - lib/plan/llm/types.ts (= PersonalModelSummary、 V2 で 3 層拡張)
 */

import type { ExternalAnchor } from "@/lib/plan/external-anchor";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 補助 型 (= 評価 dataset 用、 ExternalAnchor の最小サブセット)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Synthetic anchor (= ExternalAnchor の評価必要 field のみ抽出)
 *
 * 「実データの最小骨格」 として、 alterNote 生成に必要な情報だけ:
 *   - id, title, startTime: 必須
 *   - endTime, locationText, locationCategory: optional
 *   - sensitiveCategory: privacy バリエーション
 */
export type SyntheticAnchor = {
  readonly id: string;
  readonly title: string;
  readonly startTime: string; // "HH:MM"
  readonly endTime?: string;
  readonly locationText?: string;
  readonly locationCategory?: ExternalAnchor["locationCategory"];
  readonly sensitiveCategory?: ExternalAnchor["sensitiveCategory"];
  /** 評価 dataset 用 metadata (= LLM 入力には含めない) */
  readonly _meta: {
    readonly category: "cafe" | "meal" | "work" | "home" | "other";
    readonly timeOfDay: "morning" | "lunch" | "afternoon" | "evening" | "late_night";
    readonly locationSpecificity: "specific" | "abstract" | "absent";
    readonly purpose?: string; // 例: "ひとり / 仕事 / 友人"
  };
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5 種代表 user (= Personal Model profile)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 評価用 user profile (= readiness v3 §1 で定義された 3 層 PM 短縮版)
 *
 * 各 user は典型的 「タイプ」 を代表、 250 評価ケース (= 5 user × 50 anchor) を生成:
 *
 *   P1: 集中型 + 朝強い + ひとり静か (= 「内向型クラフター」)
 *   P2: 関係エネルギー型 + 中庸 + 人と話す (= 「外向型コネクター」)
 *   P3: 分散型 + 夜強い + 集中続き直近 (= 「夜型クリエイター、 直近忙しい」)
 *   P4: 中庸型 + 朝強い + 直近休息余裕 (= 「バランス型、 リズム回復中」)
 *   P5: 観測初期 (= Phase < 2、 PM 注入 skip、 deterministic 維持比較対象)
 *
 * Phase 別:
 *   P1-P4: Phase ≥ 2 (= 個別化 ON)
 *   P5: Phase < 2 (= 個別化 OFF、 control 群)
 */
export type EvalUserProfile = {
  readonly id: "P1" | "P2" | "P3" | "P4" | "P5";
  readonly description: string;
  readonly hdmPhase: number; // 0-5
  readonly trustLevel: number; // 0-5
  readonly stable: {
    readonly judgmentMode: string;
    readonly timePreference: string;
    readonly energyRecovery: string;
    readonly archetype?: string;
  };
  readonly recent: {
    readonly innerWeather: string;
    readonly recentRhythm: string;
    readonly stressLoad: string;
  };
};

export const EVAL_USER_PROFILES: ReadonlyArray<EvalUserProfile> = [
  {
    id: "P1",
    description: "集中型 + 朝強い + ひとり静か (= 内向型クラフター)",
    hdmPhase: 4,
    trustLevel: 4,
    stable: {
      judgmentMode: "集中型",
      timePreference: "朝強い",
      energyRecovery: "ひとり静か",
      archetype: "賢者型",
    },
    recent: {
      innerWeather: "穏やか",
      recentRhythm: "深い集中続き",
      stressLoad: "中",
    },
  },
  {
    id: "P2",
    description: "関係エネルギー型 + 中庸 + 人と話す (= 外向型コネクター)",
    hdmPhase: 3,
    trustLevel: 4,
    stable: {
      judgmentMode: "関係エネルギー型",
      timePreference: "中庸",
      energyRecovery: "人と話す",
      archetype: "つなぎ手型",
    },
    recent: {
      innerWeather: "活発",
      recentRhythm: "対話多め",
      stressLoad: "中",
    },
  },
  {
    id: "P3",
    description: "分散型 + 夜強い + 集中続き直近 (= 夜型クリエイター、 直近忙しい)",
    hdmPhase: 3,
    trustLevel: 3,
    stable: {
      judgmentMode: "分散型",
      timePreference: "夜強い",
      energyRecovery: "ひとり静か",
      archetype: "創造者型",
    },
    recent: {
      innerWeather: "やや疲れ",
      recentRhythm: "集中続き、 休息少なめ",
      stressLoad: "高",
    },
  },
  {
    id: "P4",
    description: "中庸型 + 朝強い + 直近休息余裕 (= バランス型、 リズム回復中)",
    hdmPhase: 4,
    trustLevel: 4,
    stable: {
      judgmentMode: "中庸型",
      timePreference: "朝強い",
      energyRecovery: "バランス",
      archetype: "整え手型",
    },
    recent: {
      innerWeather: "晴れ",
      recentRhythm: "休息余裕、 整え中",
      stressLoad: "低",
    },
  },
  {
    id: "P5",
    description: "観測初期 (= Phase < 2、 PM 注入 skip、 deterministic 維持比較対象)",
    hdmPhase: 1,
    trustLevel: 1,
    stable: {
      judgmentMode: "観測中",
      timePreference: "観測中",
      energyRecovery: "観測中",
    },
    recent: {
      innerWeather: "観測中",
      recentRhythm: "観測中",
      stressLoad: "観測中",
    },
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 50 件 synthetic anchor (= category 別 8-12 件、 readiness §3.2.1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Cafe category (= 12 件)
 *
 * 時刻帯: morning 3 / lunch 2 / afternoon 3 / evening 2 / late_night 2
 * Location: specific (= 店名あり) 7 / abstract (= 「カフェ」 等) 3 / absent 2
 * 用途: ひとり 6 / 仕事 3 / 友人 2 / 学習 1
 */
const CAFE_ANCHORS: ReadonlyArray<SyntheticAnchor> = [
  {
    id: "syn-cafe-01",
    title: "朝のスタバ",
    startTime: "07:30",
    endTime: "08:30",
    locationText: "スターバックス コーヒー 新宿南口店",
    locationCategory: "cafe",
    _meta: { category: "cafe", timeOfDay: "morning", locationSpecificity: "specific", purpose: "ひとり" },
  },
  {
    id: "syn-cafe-02",
    title: "ドトールでひと息",
    startTime: "08:00",
    endTime: "09:00",
    locationText: "ドトールコーヒー 渋谷駅前店",
    locationCategory: "cafe",
    _meta: { category: "cafe", timeOfDay: "morning", locationSpecificity: "specific", purpose: "ひとり" },
  },
  {
    id: "syn-cafe-03",
    title: "朝活カフェ会",
    startTime: "07:00",
    endTime: "08:30",
    locationText: "カフェ",
    locationCategory: "cafe",
    _meta: { category: "cafe", timeOfDay: "morning", locationSpecificity: "abstract", purpose: "友人" },
  },
  {
    id: "syn-cafe-04",
    title: "ランチ前にカフェ",
    startTime: "11:00",
    endTime: "12:00",
    locationText: "コメダ珈琲店 池袋東口店",
    locationCategory: "cafe",
    _meta: { category: "cafe", timeOfDay: "lunch", locationSpecificity: "specific", purpose: "ひとり" },
  },
  {
    id: "syn-cafe-05",
    title: "カフェミーティング",
    startTime: "13:30",
    endTime: "15:00",
    locationText: "タリーズコーヒー 表参道店",
    locationCategory: "cafe",
    _meta: { category: "cafe", timeOfDay: "lunch", locationSpecificity: "specific", purpose: "仕事" },
  },
  {
    id: "syn-cafe-06",
    title: "勉強 カフェ",
    startTime: "14:00",
    endTime: "17:00",
    locationText: "スターバックス コーヒー 甲府平和通り店",
    locationCategory: "cafe",
    _meta: { category: "cafe", timeOfDay: "afternoon", locationSpecificity: "specific", purpose: "学習" },
  },
  {
    id: "syn-cafe-07",
    title: "午後のカフェ",
    startTime: "15:30",
    locationCategory: "cafe",
    _meta: { category: "cafe", timeOfDay: "afternoon", locationSpecificity: "absent", purpose: "ひとり" },
  },
  {
    id: "syn-cafe-08",
    title: "打ち合わせ",
    startTime: "16:00",
    endTime: "17:30",
    locationText: "カフェ",
    locationCategory: "cafe",
    _meta: { category: "cafe", timeOfDay: "afternoon", locationSpecificity: "abstract", purpose: "仕事" },
  },
  {
    id: "syn-cafe-09",
    title: "夜カフェ",
    startTime: "19:00",
    endTime: "21:00",
    locationText: "ブルーボトルコーヒー 青山店",
    locationCategory: "cafe",
    _meta: { category: "cafe", timeOfDay: "evening", locationSpecificity: "specific", purpose: "ひとり" },
  },
  {
    id: "syn-cafe-10",
    title: "夜の作業",
    startTime: "20:00",
    endTime: "22:00",
    locationCategory: "cafe",
    _meta: { category: "cafe", timeOfDay: "evening", locationSpecificity: "absent", purpose: "仕事" },
  },
  {
    id: "syn-cafe-11",
    title: "深夜のカフェ",
    startTime: "23:30",
    endTime: "01:00",
    locationText: "カフェ",
    locationCategory: "cafe",
    _meta: { category: "cafe", timeOfDay: "late_night", locationSpecificity: "abstract", purpose: "ひとり" },
  },
  {
    id: "syn-cafe-12",
    title: "夜更けの語らい",
    startTime: "23:00",
    endTime: "00:30",
    locationText: "コメダ珈琲店 駅前店",
    locationCategory: "cafe",
    _meta: { category: "cafe", timeOfDay: "late_night", locationSpecificity: "specific", purpose: "友人" },
  },
];

/**
 * Meal category (= 10 件)
 *
 * 時刻帯: morning 2 / lunch 3 / afternoon 1 / evening 3 / late_night 1
 * 用途: ひとり 3 / 家族 2 / 友人 2 / ビジネス 2 / sensitive 1
 */
const MEAL_ANCHORS: ReadonlyArray<SyntheticAnchor> = [
  {
    id: "syn-meal-01",
    title: "朝食",
    startTime: "07:00",
    endTime: "07:45",
    locationText: "自宅",
    locationCategory: "home",
    _meta: { category: "meal", timeOfDay: "morning", locationSpecificity: "specific", purpose: "ひとり" },
  },
  {
    id: "syn-meal-02",
    title: "ホテルの朝食",
    startTime: "07:30",
    endTime: "08:30",
    locationText: "ホテルニューオータニ",
    _meta: { category: "meal", timeOfDay: "morning", locationSpecificity: "specific", purpose: "ビジネス" },
  },
  {
    id: "syn-meal-03",
    title: "ランチミーティング",
    startTime: "12:00",
    endTime: "13:30",
    locationText: "イタリアン リストランテ 銀座店",
    _meta: { category: "meal", timeOfDay: "lunch", locationSpecificity: "specific", purpose: "ビジネス" },
  },
  {
    id: "syn-meal-04",
    title: "ランチ",
    startTime: "12:30",
    endTime: "13:30",
    locationText: "とんかつ専門店",
    _meta: { category: "meal", timeOfDay: "lunch", locationSpecificity: "specific", purpose: "ひとり" },
  },
  {
    id: "syn-meal-05",
    title: "昼食",
    startTime: "13:00",
    endTime: "14:00",
    _meta: { category: "meal", timeOfDay: "lunch", locationSpecificity: "absent", purpose: "ひとり" },
  },
  {
    id: "syn-meal-06",
    title: "おやつ",
    startTime: "15:00",
    endTime: "15:30",
    locationText: "ケーキ屋さん",
    _meta: { category: "meal", timeOfDay: "afternoon", locationSpecificity: "specific", purpose: "ひとり" },
  },
  {
    id: "syn-meal-07",
    title: "家族で夕食",
    startTime: "19:00",
    endTime: "20:30",
    locationText: "自宅",
    locationCategory: "home",
    _meta: { category: "meal", timeOfDay: "evening", locationSpecificity: "specific", purpose: "家族" },
  },
  {
    id: "syn-meal-08",
    title: "友人と飲み会",
    startTime: "19:30",
    endTime: "22:00",
    locationText: "居酒屋 とりや",
    _meta: { category: "meal", timeOfDay: "evening", locationSpecificity: "specific", purpose: "友人" },
  },
  {
    id: "syn-meal-09",
    title: "夕食",
    startTime: "20:00",
    endTime: "21:00",
    sensitiveCategory: "medical",
    _meta: { category: "meal", timeOfDay: "evening", locationSpecificity: "absent", purpose: "sensitive" },
  },
  {
    id: "syn-meal-10",
    title: "夜食",
    startTime: "23:00",
    endTime: "23:30",
    locationText: "自宅",
    locationCategory: "home",
    _meta: { category: "meal", timeOfDay: "late_night", locationSpecificity: "specific", purpose: "ひとり" },
  },
];

/**
 * Work category (= 12 件)
 *
 * 時刻帯: morning 3 / lunch 1 / afternoon 5 / evening 3 / late_night 0
 * 用途: 集中作業 4 / 会議 4 / 出張 2 / 学習 1 / sensitive 1
 */
const WORK_ANCHORS: ReadonlyArray<SyntheticAnchor> = [
  {
    id: "syn-work-01",
    title: "朝の作業時間",
    startTime: "08:00",
    endTime: "10:00",
    locationText: "自宅",
    locationCategory: "home",
    _meta: { category: "work", timeOfDay: "morning", locationSpecificity: "specific", purpose: "集中作業" },
  },
  {
    id: "syn-work-02",
    title: "朝の定例ミーティング",
    startTime: "09:30",
    endTime: "10:30",
    locationText: "渋谷オフィス",
    locationCategory: "office",
    _meta: { category: "work", timeOfDay: "morning", locationSpecificity: "specific", purpose: "会議" },
  },
  {
    id: "syn-work-03",
    title: "出張",
    startTime: "07:00",
    endTime: "10:00",
    locationText: "新幹線 のぞみ",
    _meta: { category: "work", timeOfDay: "morning", locationSpecificity: "specific", purpose: "出張" },
  },
  {
    id: "syn-work-04",
    title: "1on1",
    startTime: "11:30",
    endTime: "12:00",
    locationText: "オフィス",
    locationCategory: "office",
    _meta: { category: "work", timeOfDay: "lunch", locationSpecificity: "abstract", purpose: "会議" },
  },
  {
    id: "syn-work-05",
    title: "午後の集中時間",
    startTime: "14:00",
    endTime: "17:00",
    locationCategory: "office",
    _meta: { category: "work", timeOfDay: "afternoon", locationSpecificity: "absent", purpose: "集中作業" },
  },
  {
    id: "syn-work-06",
    title: "会議",
    startTime: "14:30",
    endTime: "15:30",
    locationText: "会議室 A",
    locationCategory: "office",
    _meta: { category: "work", timeOfDay: "afternoon", locationSpecificity: "specific", purpose: "会議" },
  },
  {
    id: "syn-work-07",
    title: "面接",
    startTime: "15:00",
    endTime: "16:00",
    locationText: "オフィス",
    locationCategory: "office",
    _meta: { category: "work", timeOfDay: "afternoon", locationSpecificity: "abstract", purpose: "会議" },
  },
  {
    id: "syn-work-08",
    title: "資料作成",
    startTime: "15:30",
    endTime: "17:30",
    locationText: "自宅",
    locationCategory: "home",
    _meta: { category: "work", timeOfDay: "afternoon", locationSpecificity: "specific", purpose: "集中作業" },
  },
  {
    id: "syn-work-09",
    title: "研修",
    startTime: "16:00",
    endTime: "18:00",
    sensitiveCategory: "medical",
    _meta: { category: "work", timeOfDay: "afternoon", locationSpecificity: "absent", purpose: "sensitive" },
  },
  {
    id: "syn-work-10",
    title: "夕方の打ち合わせ",
    startTime: "18:00",
    endTime: "19:30",
    locationText: "クライアント先",
    _meta: { category: "work", timeOfDay: "evening", locationSpecificity: "abstract", purpose: "会議" },
  },
  {
    id: "syn-work-11",
    title: "残業",
    startTime: "19:00",
    endTime: "21:00",
    locationText: "オフィス",
    locationCategory: "office",
    _meta: { category: "work", timeOfDay: "evening", locationSpecificity: "specific", purpose: "集中作業" },
  },
  {
    id: "syn-work-12",
    title: "夜の出張帰り",
    startTime: "20:00",
    endTime: "22:30",
    locationText: "新幹線 のぞみ",
    _meta: { category: "work", timeOfDay: "evening", locationSpecificity: "specific", purpose: "出張" },
  },
];

/**
 * Home category (= 8 件)
 *
 * 時刻帯: morning 2 / lunch 1 / afternoon 1 / evening 2 / late_night 2
 * 用途: 朝の準備 / 帰宅 / 休日 / 深夜
 */
const HOME_ANCHORS: ReadonlyArray<SyntheticAnchor> = [
  {
    id: "syn-home-01",
    title: "朝の支度",
    startTime: "06:30",
    endTime: "07:30",
    locationText: "自宅",
    locationCategory: "home",
    _meta: { category: "home", timeOfDay: "morning", locationSpecificity: "specific", purpose: "朝の準備" },
  },
  {
    id: "syn-home-02",
    title: "朝ヨガ",
    startTime: "06:00",
    endTime: "06:30",
    locationText: "自宅",
    locationCategory: "home",
    _meta: { category: "home", timeOfDay: "morning", locationSpecificity: "specific", purpose: "ひとり" },
  },
  {
    id: "syn-home-03",
    title: "在宅作業前の整理",
    startTime: "11:00",
    endTime: "11:30",
    locationCategory: "home",
    _meta: { category: "home", timeOfDay: "lunch", locationSpecificity: "absent", purpose: "ひとり" },
  },
  {
    id: "syn-home-04",
    title: "休憩",
    startTime: "16:00",
    endTime: "16:30",
    locationText: "自宅",
    locationCategory: "home",
    _meta: { category: "home", timeOfDay: "afternoon", locationSpecificity: "specific", purpose: "ひとり" },
  },
  {
    id: "syn-home-05",
    title: "帰宅",
    startTime: "18:30",
    endTime: "19:00",
    locationCategory: "home",
    _meta: { category: "home", timeOfDay: "evening", locationSpecificity: "absent", purpose: "帰宅" },
  },
  {
    id: "syn-home-06",
    title: "夜のリラックス",
    startTime: "21:00",
    endTime: "22:30",
    locationText: "自宅",
    locationCategory: "home",
    _meta: { category: "home", timeOfDay: "evening", locationSpecificity: "specific", purpose: "ひとり" },
  },
  {
    id: "syn-home-07",
    title: "就寝準備",
    startTime: "23:00",
    endTime: "23:30",
    locationCategory: "home",
    _meta: { category: "home", timeOfDay: "late_night", locationSpecificity: "absent", purpose: "ひとり" },
  },
  {
    id: "syn-home-08",
    title: "深夜の読書",
    startTime: "23:30",
    endTime: "00:30",
    locationText: "自宅",
    locationCategory: "home",
    _meta: { category: "home", timeOfDay: "late_night", locationSpecificity: "specific", purpose: "ひとり" },
  },
];

/**
 * Other category (= 8 件)
 *
 * 時刻帯: morning 2 / lunch 1 / afternoon 3 / evening 2 / late_night 0
 * 用途: 旅行 / 病院 / 友人 / イベント / 試験 / 引越 / sensitive
 */
const OTHER_ANCHORS: ReadonlyArray<SyntheticAnchor> = [
  {
    id: "syn-other-01",
    title: "予定 A",
    startTime: "09:00",
    endTime: "10:00",
    _meta: { category: "other", timeOfDay: "morning", locationSpecificity: "absent", purpose: "抽象" },
  },
  {
    id: "syn-other-02",
    title: "出発",
    startTime: "08:00",
    endTime: "09:00",
    locationText: "羽田空港",
    _meta: { category: "other", timeOfDay: "morning", locationSpecificity: "specific", purpose: "旅行" },
  },
  {
    id: "syn-other-03",
    title: "通院",
    startTime: "11:00",
    endTime: "12:30",
    sensitiveCategory: "medical",
    _meta: { category: "other", timeOfDay: "lunch", locationSpecificity: "absent", purpose: "sensitive" },
  },
  {
    id: "syn-other-04",
    title: "資格試験",
    startTime: "13:00",
    endTime: "16:00",
    locationText: "試験会場",
    _meta: { category: "other", timeOfDay: "afternoon", locationSpecificity: "abstract", purpose: "学習" },
  },
  {
    id: "syn-other-05",
    title: "ジム",
    startTime: "15:00",
    endTime: "16:30",
    locationText: "RIZAP 表参道店",
    _meta: { category: "other", timeOfDay: "afternoon", locationSpecificity: "specific", purpose: "ひとり" },
  },
  {
    id: "syn-other-06",
    title: "イベント参加",
    startTime: "14:00",
    endTime: "17:00",
    locationText: "東京ビッグサイト",
    _meta: { category: "other", timeOfDay: "afternoon", locationSpecificity: "specific", purpose: "ビジネス" },
  },
  {
    id: "syn-other-07",
    title: "友人と映画",
    startTime: "19:00",
    endTime: "21:30",
    locationText: "TOHO シネマズ 六本木",
    _meta: { category: "other", timeOfDay: "evening", locationSpecificity: "specific", purpose: "友人" },
  },
  {
    id: "syn-other-08",
    title: "引越作業",
    startTime: "18:00",
    endTime: "22:00",
    locationText: "新居",
    _meta: { category: "other", timeOfDay: "evening", locationSpecificity: "abstract", purpose: "イベント" },
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 統合 dataset (= 50 件、 export)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 50 件 synthetic dataset (= readiness §3.2.1 で確定した内訳通り)
 *
 * cafe 12 + meal 10 + work 12 + home 8 + other 8 = 50 件
 *
 * 各 anchor の評価ケース:
 *   - 5 user × 50 anchor = 250 評価ケース
 *   - 各ケースで deterministic / Step 1 LLM / Step 2 LLM の 3 出力を比較
 *   - 3 軸 × 5 階で採点 (= readiness §3.2.2)
 *   - 採用基準: 自然さ ≥ 4.2 / あなたらしさ ≥ 3.5 / 押しつけ感の弱さ ≥ 4.0
 */
export const PLAN_ALTER_NOTE_DATASET: ReadonlyArray<SyntheticAnchor> = [
  ...CAFE_ANCHORS,
  ...MEAL_ANCHORS,
  ...WORK_ANCHORS,
  ...HOME_ANCHORS,
  ...OTHER_ANCHORS,
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Dataset metadata (= 検証 + judge harness 用)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Dataset 統計 (= 構造検証用、 readiness §3.2.1 内訳と一致)
 */
export const DATASET_STATS = {
  total: 50,
  byCategory: {
    cafe: 12,
    meal: 10,
    work: 12,
    home: 8,
    other: 8,
  },
  sensitiveCount: 3, // syn-meal-09 / syn-work-09 / syn-other-03
  userProfileCount: 5,
  totalEvalCases: 250, // 5 user × 50 anchor
} as const;
