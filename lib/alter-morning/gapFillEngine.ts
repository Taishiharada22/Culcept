/**
 * Gap Fill Engine v2.5 — 行動科学エビデンス + ユーザー意思尊重 + 天気連携
 *
 * v2 → v2.5 変更点 (2026-04-16 CEO方針):
 * - R2: explicit_free_time → HARD昇格（「休み」「フリー」と明言した gap は埋めない）
 * - 逆U字: sparse-day exception（スカスカな日だけ MAX_PROPOSALS を3に緩和）
 * - Phase 2a: 天気連携（雨天時に outdoor 候補の priority を下げる）
 * - Phase 2a: T2 短gap高認知制限（gap < 30min に maintenance/enrichment 禁止）
 * - Phase 3 先行: accept/dismiss ログ基盤（ProposalEvent 型 + logProposalEvent）
 *
 * 研究基盤:
 * - Implementation Intentions (d=0.65) → if-then 形式の提案理由
 * - MCII / WOOP (g=0.34) → obstacle contrast（障害想定）を理由に含める
 * - 午後ディップ (13-15時) → recovery 系のみ許可
 * - Slack研究 (稼働率70-80%最適) → 過密ガード・空白保護・逆U字
 * - 通知疲労 (6+/日で崩壊) → 最大2-3提案/プラン
 * - Planning Fallacy (40%過小評価) → 前後5分バッファ
 *
 * アーキテクチャ:
 *   1. Gap Detection — 連続アイテム間の ≥45min 空白を検出
 *   2. Load Guard — 過密なプランでは gap fill をスキップ
 *   3. R2 Guard — ユーザーが明示した空白は埋めない（HARD）
 *   4. Circadian Filter — 時間帯に合わない候補を除外
 *   5. Context Selection — gap の前後コンテキストから候補プールを選択
 *   6. Prohibition Filter — 禁止ルール (T1-T4, C1-C6, L1-L3) でフィルタ
 *   7. Weather Filter — 天気に合わない候補を降格
 *   8. Reason Generation — if-then + obstacle contrast テンプレート
 *   9. Soft Proposal — PlanItem(kind="todo") + proposal=true で差し込み
 *
 * 設計書: docs/alter-morning-gap-fill-research.md
 */

import type { PlanItem } from "./types";
import type { ActivityCategory } from "./activityVocabulary";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 型定義
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 検出された gap */
export interface GapSlot {
  /** gap の開始時刻（分） */
  startMin: number;
  /** gap の終了時刻（分） */
  endMin: number;
  /** gap の長さ（分） */
  durationMin: number;
  /** gap の直前のアイテム（before1） */
  before: PlanItem | null;
  /** gap の直後のアイテム（after1） */
  after: PlanItem | null;
  /** gap の2つ前のアイテム（before2 — 補助文脈） */
  before2: PlanItem | null;
  /** gap の2つ後のアイテム（after2 — 補助文脈） */
  after2: PlanItem | null;
  /** gap が挿入される items 配列内の位置（after の index） */
  insertIndex: number;
  /**
   * Block 3 Phase 1: gap の位置種別。
   * - "between"       … 既存の items 間（middle gap）
   * - "before_anchor" … minimal plan の anchor より前の擬似 gap（1予定モードのみ）
   * - "after_anchor"  … minimal plan の anchor より後の擬似 gap（1予定モードのみ）
   */
  position?: "between" | "before_anchor" | "after_anchor";
}

/** gap に対する提案候補 */
export interface GapCandidate {
  /** 提案アクティビティ名 */
  activity: string;
  /** 推定所要時間（分） */
  durationMin: number;
  /** カテゴリ */
  category: ActivityCategory;
  /** 提案理由（UI 表示用）— if-then + obstacle contrast 形式 */
  reason: string;
  /** 候補の優先度（小さいほど優先） */
  priority: number;
  /** taxonomy カテゴリ */
  taxonomy: "recovery" | "preparation" | "maintenance" | "nourishment" | "enrichment";
  /** 屋外活動か（天気フィルタ用） */
  outdoor?: boolean;
}

/** PlanItem に付与する提案フラグ */
export type ProposalKind = "alter_suggestion";

/** fillGaps に渡すオプション（天気等の外部コンテキスト） */
export interface GapFillOptions {
  /** 天気アイコン（JMA由来） */
  weatherIcon?: "sun" | "cloud" | "rain" | "snow" | "storm" | "fog" | "unknown";
  /** 降水確率 (0-100) */
  popMax?: number | null;
  /**
   * Block 3 Phase 1: 1予定モード（minimal plan）の制御。
   *
   * CEO方針 2026-04-17:
   * - 1件の hard anchor だけがある状態で、その前後を自然に埋める
   * - pre/post window は activityCategory 別テーブルで決定
   * - hard 帰宅接続は endpointAnchor 明示時のみ（ここでは関与しない）
   * - negation signal (泊まり/二次会) は Phase 2 以降
   * - dinner post=0: anchor の endTime ≥ 20:00 のとき post soft 禁止（HARD）
   */
  minimalPlan?: {
    /** 1件の hard anchor */
    anchor: PlanItem;
    /**
     * 「今」の分（00:00 起算）。pre gap がこの時刻より前にはみ出さないよう clamp する。
     * 未指定なら 0（= 深夜基準で pre をフルに取れる。将来プランでは十分）
     */
    nowMin?: number;
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 3 先行: Proposal Event ログ基盤
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 提案イベントの種別 */
export type ProposalAction =
  | "impression"       // 提案が表示された
  | "accept"           // ユーザーが採用した
  | "dismiss"          // ユーザーが却下した
  | "ignored"          // 表示されたが操作なし（セッション終了時に判定）
  | "edited_after_accept"; // 採用後に内容を変更した

/** 提案イベントログ（将来の contextual bandit の reward に使う） */
export interface ProposalEvent {
  /** イベントID */
  eventId: string;
  /** 提案アイテムID */
  proposalId: string;
  /** 提案されたアクティビティ名 */
  activity: string;
  /** taxonomy カテゴリ */
  taxonomy: string;
  /** ActivityCategory */
  category: string;
  /** アクション */
  action: ProposalAction;
  /** gap の時間帯（分） */
  gapStartMin: number;
  /** gap の長さ（分） */
  gapDurationMin: number;
  /** 前アイテムのカテゴリ */
  beforeCategory: string | null;
  /** 後アイテムのカテゴリ */
  afterCategory: string | null;
  /** 天気 */
  weatherIcon: string | null;
  /** タイムスタンプ */
  timestamp: string;
}

/**
 * 提案イベントをログに記録する。
 *
 * Phase 3 先行: まずは localStorage に蓄積。
 * 将来: Supabase の proposal_events テーブルに永続化し、
 * Thompson Sampling の reward として使う。
 *
 * CEO方針: "ログ先、学習後"
 */
export function logProposalEvent(event: ProposalEvent): void {
  try {
    if (typeof window === "undefined") return; // SSR ガード

    const STORAGE_KEY = "aneurasync_proposal_events_v1";
    const MAX_EVENTS = 200; // ローカルには最大200件保持

    const raw = localStorage.getItem(STORAGE_KEY);
    const events: ProposalEvent[] = raw ? JSON.parse(raw) : [];
    events.push(event);

    // 古いイベントを削除（FIFO）
    while (events.length > MAX_EVENTS) {
      events.shift();
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // localStorage 失敗は握りつぶす（ログ基盤が本体を壊してはいけない）
  }
}

/**
 * ログ済みの提案イベントを取得する（分析用）。
 */
export function getProposalEvents(): ProposalEvent[] {
  try {
    if (typeof window === "undefined") return [];
    const STORAGE_KEY = "aneurasync_proposal_events_v1";
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * 提案表示時に impression イベントを生成するヘルパー。
 * UI 側で `proposal=true` のアイテムが描画されたときに呼ぶ。
 */
export function buildImpressionEvent(
  item: PlanItem,
  gap: { startMin: number; durationMin: number; beforeCategory: string | null; afterCategory: string | null },
  weatherIcon?: string | null,
): ProposalEvent {
  return {
    eventId: `pe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    proposalId: item.id,
    activity: item.what ?? item.text,
    taxonomy: item.proposalTaxonomy ?? "",
    category: item.activityCategory ?? "",
    action: "impression",
    gapStartMin: gap.startMin,
    gapDurationMin: gap.durationMin,
    beforeCategory: gap.beforeCategory,
    afterCategory: gap.afterCategory,
    weatherIcon: weatherIcon ?? null,
    timestamp: new Date().toISOString(),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 定数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** gap 検出の最小閾値（分） */
const MIN_GAP_MINUTES = 45;

/** 提案の最大数（通常プラン）— 通知疲労研究: 6+/日で崩壊 */
const MAX_PROPOSALS = 2;

/** sparse-day exception: スカスカな日の提案最大数（逆U字対応） */
const MAX_PROPOSALS_SPARSE = 3;

/** sparse-day 判定: 非travelアイテムがこの数以下ならスカスカ */
const SPARSE_DAY_THRESHOLD = 2;

/** 過密ガード閾値 — Slack研究: 稼働率80%超は逆効果 */
const OVERLOAD_ITEM_THRESHOLD = 7;

/** Planning Fallacy バッファ（分）— 前後各5分 */
const BUFFER_MINUTES = 5;

/** 午後ディップ開始（分）— 13:00 */
const AFTERNOON_DIP_START = 780;

/** 午後ディップ終了（分）— 15:00 */
const AFTERNOON_DIP_END = 900;

/** T2: 短gap高認知制限の閾値（分） */
const SHORT_GAP_THRESHOLD = 30;

/** 天気フィルタ: outdoor 候補の priority ペナルティ */
const WEATHER_OUTDOOR_PENALTY = 10;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Block 3 Phase 1: Minimal Plan 定数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// CEO 決裁 2026-04-17:
//   1予定入力モードは既存 fillGaps を拡張。anchor 前後を最大2件、例外3件で埋める。
//   窓幅は activityCategory × 時刻で可変。ディナー 20時以降は post=0 (HARD)。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Minimal Plan モードの 1予定タイプ別 pre/post 窓幅（分） */
const MINIMAL_PLAN_WINDOWS: Record<string, { pre: number; post: number }> = {
  meal_lunch:   { pre: 120, post: 120 },
  meal_dinner:  { pre: 120, post: 60 },
  work_meeting: { pre: 90,  post: 90 },
  social_meal:  { pre: 120, post: 90 },
  default:      { pre: 60,  post: 60 },
};

/** Minimal Plan 通常上限（提案件数） */
const MAX_PROPOSALS_MINIMAL = 2;

/** Minimal Plan 例外上限（昼アンカーで前後に十分な余白） */
const MAX_PROPOSALS_MINIMAL_WIDE = 3;

/** ディナー post 禁止の時刻閾値（分）— 20:00 */
const DINNER_LATE_CUTOFF_MIN = 20 * 60;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 候補プール — if-then + obstacle contrast 理由テンプレート
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 仕事モードの gap 候補
 * CEO方針: 次予定の準備 > 軽い休憩 > 食事 > 持ち越しタスク > 読書
 */
const WORK_DAY_CANDIDATES: GapCandidate[] = [
  {
    activity: "次の準備・資料確認",
    durationMin: 25,
    category: "work_document",
    reason: "次の予定まで少し間があるから、資料をさっと見ておくと安心だよ",
    priority: 1,
    taxonomy: "preparation",
  },
  {
    activity: "カフェで一息",
    durationMin: 25,
    category: "life_rest",
    reason: "集中が続くと効率が落ちやすいから、ここで一息入れてリセットしよう",
    priority: 2,
    taxonomy: "recovery",
  },
  {
    activity: "軽い食事",
    durationMin: 25,
    category: "social_meal",
    reason: "午前の作業でエネルギー使ってるから、ここで軽く食べておくと午後の集中が持つよ",
    priority: 3,
    taxonomy: "nourishment",
  },
  {
    activity: "メール・連絡整理",
    durationMin: 15,
    category: "work_email",
    reason: "移動の前にメール整理しておくと、着いてからすぐ本題に入れるよ",
    priority: 4,
    taxonomy: "maintenance",
  },
  {
    activity: "読書",
    durationMin: 25,
    category: "study_reading",
    reason: "予定の合間に読書を挟むと、頭の切り替えになるよ",
    priority: 5,
    taxonomy: "enrichment",
  },
];

/** 食事前の gap 候補 */
const PRE_MEAL_CANDIDATES: GapCandidate[] = [
  {
    activity: "カフェで一息",
    durationMin: 25,
    category: "life_rest",
    reason: "食事の前にちょっと落ち着くと、ゆっくり味わえるよ",
    priority: 1,
    taxonomy: "recovery",
  },
  {
    activity: "散歩",
    durationMin: 15,
    category: "exercise_walk",
    reason: "食前に軽く歩くとお腹が整って、食事がおいしくなるよ",
    priority: 2,
    taxonomy: "recovery",
    outdoor: true,
  },
  {
    activity: "近くを散策",
    durationMin: 25,
    category: "exercise_walk",
    reason: "食事まで時間があるから、周辺を歩いてみるのもいいかも",
    priority: 3,
    taxonomy: "enrichment",
    outdoor: true,
  },
];

/** 食事後の gap 候補 */
const POST_MEAL_CANDIDATES: GapCandidate[] = [
  {
    activity: "散歩",
    durationMin: 15,
    category: "exercise_walk",
    reason: "食後は眠くなりやすいから、15分くらい歩くと頭がスッキリするよ",
    priority: 1,
    taxonomy: "recovery",
    outdoor: true,
  },
  {
    activity: "カフェで一息",
    durationMin: 25,
    category: "life_rest",
    reason: "食後にすぐ動くより、少しゆっくりした方が消化にもいいよ",
    priority: 2,
    taxonomy: "recovery",
  },
  {
    activity: "読書",
    durationMin: 25,
    category: "study_reading",
    reason: "食後のゆったりした時間は、軽い読書がちょうどいいペースだよ",
    priority: 3,
    taxonomy: "enrichment",
  },
];

/** 会議/打ち合わせ前の gap 候補 */
const PRE_MEETING_CANDIDATES: GapCandidate[] = [
  {
    activity: "打ち合わせ準備",
    durationMin: 25,
    category: "work_document",
    reason: "打ち合わせ前に論点を整理しておくと、発言しやすくなるよ",
    priority: 1,
    taxonomy: "preparation",
  },
  {
    activity: "カフェで一息",
    durationMin: 15,
    category: "life_rest",
    reason: "打ち合わせ前に気持ちを切り替えておくと、落ち着いて臨めるよ",
    priority: 2,
    taxonomy: "recovery",
  },
];

/** 帰宅前の gap 候補 */
const PRE_RETURN_CANDIDATES: GapCandidate[] = [
  {
    activity: "買い物",
    durationMin: 25,
    category: "errand_shopping",
    reason: "帰り道のついでに寄れるから、必要なものがあれば今のうちに",
    priority: 1,
    taxonomy: "maintenance",
  },
  {
    activity: "カフェで一息",
    durationMin: 25,
    category: "life_rest",
    reason: "帰る前にちょっと一息つくと、家でリラックスモードに切り替えやすいよ",
    priority: 2,
    taxonomy: "recovery",
  },
  {
    activity: "散歩",
    durationMin: 15,
    category: "exercise_walk",
    reason: "帰り道に少し歩くと、1日の疲れが和らぐよ",
    priority: 3,
    taxonomy: "recovery",
    outdoor: true,
  },
];

/** 午後ディップ専用候補（13-15時）— 生物学的パフォーマンス低下期 */
const AFTERNOON_DIP_CANDIDATES: GapCandidate[] = [
  {
    activity: "散歩",
    durationMin: 15,
    category: "exercise_walk",
    reason: "午後は誰でも集中力が落ちる時間帯。軽く歩くとリセットできるよ",
    priority: 1,
    taxonomy: "recovery",
    outdoor: true,
  },
  {
    activity: "カフェで一息",
    durationMin: 20,
    category: "life_rest",
    reason: "午後のこの時間は脳が休みたがってる。無理せず一息入れよう",
    priority: 2,
    taxonomy: "recovery",
  },
  {
    activity: "軽いストレッチ",
    durationMin: 10,
    category: "exercise_yoga",
    reason: "午後の眠気にはストレッチが効くよ。体を動かすと頭もスッキリする",
    priority: 3,
    taxonomy: "recovery",
  },
];

/** デフォルト候補 */
const DEFAULT_CANDIDATES: GapCandidate[] = [
  {
    activity: "カフェで一息",
    durationMin: 25,
    category: "life_rest",
    reason: "予定の合間に一息つくと、次に集中しやすくなるよ",
    priority: 1,
    taxonomy: "recovery",
  },
  {
    activity: "散歩",
    durationMin: 15,
    category: "exercise_walk",
    reason: "少し歩くだけでも気分転換になるよ",
    priority: 2,
    taxonomy: "recovery",
    outdoor: true,
  },
  {
    activity: "読書",
    durationMin: 25,
    category: "study_reading",
    reason: "空いた時間に読書を挟むと、いい切り替えになるよ",
    priority: 3,
    taxonomy: "enrichment",
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ユーティリティ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. Gap Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Block 3 Phase 1: anchor の activityCategory + テキスト + 時刻から
 * minimal plan 窓幅を決定する。
 *
 * 分類ルール:
 *   - social_meal 系 → ランチ/ディナーを time + text で判別
 *   - work_meeting 系 → meal_meeting 窓
 *   - それ以外 → default
 */
export function resolveMinimalPlanWindow(anchor: PlanItem): { pre: number; post: number; key: string } {
  const cat = anchor.activityCategory;
  const t = `${anchor.text} ${anchor.what ?? ""}`.toLowerCase();
  const startMin = anchor.startTime ? timeToMinutes(anchor.startTime) : undefined;
  const startHour = startMin !== undefined ? Math.floor(startMin / 60) : undefined;

  // 食事系: ランチ vs ディナー 判別
  const isSocialMealCat = cat?.startsWith("social_meal") || cat?.startsWith("social_drink");
  const isMealText = /ランチ|昼食|lunch/.test(t);
  const isDinnerText = /ディナー|夕食|dinner|飲み会|飲み/.test(t);

  if (isSocialMealCat || isMealText || isDinnerText) {
    // ランチ判定: text にランチ系 OR 11-14時開始
    if (isMealText || (startHour !== undefined && startHour >= 11 && startHour < 14)) {
      return { ...MINIMAL_PLAN_WINDOWS.meal_lunch, key: "meal_lunch" };
    }
    // ディナー判定: text にディナー系 OR 17時以降開始
    if (isDinnerText || (startHour !== undefined && startHour >= 17)) {
      return { ...MINIMAL_PLAN_WINDOWS.meal_dinner, key: "meal_dinner" };
    }
    // その他の食事系（朝食・昼下がり等）
    return { ...MINIMAL_PLAN_WINDOWS.social_meal, key: "social_meal" };
  }

  // 会議系
  if (cat === "work_meeting" || cat?.startsWith("work_meeting") || /打ち合わせ|ミーティング|会議|meeting/.test(t)) {
    return { ...MINIMAL_PLAN_WINDOWS.work_meeting, key: "work_meeting" };
  }

  return { ...MINIMAL_PLAN_WINDOWS.default, key: "default" };
}

/**
 * Block 3 Phase 1: ディナー anchor の endTime が 20:00 以降かを判定する。
 * true のとき post soft 禁止（HARD rule）。
 */
export function isLateDinnerAnchor(anchor: PlanItem, windowKey: string): boolean {
  if (windowKey !== "meal_dinner") return false;
  if (!anchor.startTime) return false;
  const endMin = timeToMinutes(anchor.startTime) + anchor.durationMin;
  return endMin >= DINNER_LATE_CUTOFF_MIN;
}

/**
 * アイテム列から空き時間を検出する。
 * travel 以外の隣接アイテムペア間で、endTime(前) と startTime(後) の差が MIN_GAP_MINUTES 以上なら gap。
 *
 * Block 3 Phase 1: minimalPlan オプション指定時、anchor の前後に擬似 gap を追加生成する。
 */
export function detectGaps(items: PlanItem[], options?: GapFillOptions): GapSlot[] {
  const gaps: GapSlot[] = [];

  // 時間が割り当てられているアイテムだけ対象（travel 含む — 時間構造の正確性のため）
  const timed = items.filter(i => i.startTime);

  // ── middle gaps（既存ロジック）──
  if (timed.length >= 2) {
    for (let i = 0; i < timed.length - 1; i++) {
      const current = timed[i];
      const next = timed[i + 1];
      if (!current.startTime || !next.startTime) continue;

      const currentEnd = timeToMinutes(current.startTime) + current.durationMin;
      const nextStart = timeToMinutes(next.startTime);
      const gapDuration = nextStart - currentEnd;

      if (gapDuration >= MIN_GAP_MINUTES) {
        const insertIdx = items.indexOf(next);
        const before2 = i >= 1 ? timed[i - 1] : null;
        const after2 = i + 2 < timed.length ? timed[i + 2] : null;

        gaps.push({
          startMin: currentEnd,
          endMin: nextStart,
          durationMin: gapDuration,
          before: current,
          after: next,
          before2,
          after2,
          insertIndex: insertIdx >= 0 ? insertIdx : items.length,
          position: "between",
        });
      }
    }
  }

  // ── Block 3 Phase 1: minimal plan の pre/post pseudo-gap ──
  if (options?.minimalPlan && timed.length >= 1) {
    const { anchor, nowMin = 0 } = options.minimalPlan;
    if (anchor.startTime) {
      const win = resolveMinimalPlanWindow(anchor);
      const anchorStart = timeToMinutes(anchor.startTime);
      const anchorEnd = anchorStart + anchor.durationMin;

      // 先頭 timed item（travel 含む）までの時刻 = pre gap の終了点
      // 末尾 timed item の終了時刻 = post gap の開始点
      const firstTimed = timed[0];
      const lastTimed = timed[timed.length - 1];
      const firstStart = firstTimed.startTime ? timeToMinutes(firstTimed.startTime) : anchorStart;
      const lastEnd = lastTimed.startTime
        ? timeToMinutes(lastTimed.startTime) + lastTimed.durationMin
        : anchorEnd;

      // ── pre gap ──
      if (win.pre > 0) {
        const preEnd = firstStart; // anchor or 前 travel の開始
        const preStart = Math.max(nowMin, anchorStart - win.pre);
        const preDuration = preEnd - preStart;
        if (preDuration >= MIN_GAP_MINUTES) {
          gaps.push({
            startMin: preStart,
            endMin: preEnd,
            durationMin: preDuration,
            before: null,
            after: firstTimed,
            before2: null,
            after2: timed[1] ?? null,
            insertIndex: 0,
            position: "before_anchor",
          });
        }
      }

      // ── post gap ──
      // ディナー 20時以降は post=0（HARD rule）
      const postWindow = isLateDinnerAnchor(anchor, win.key) ? 0 : win.post;
      if (postWindow > 0) {
        const postStart = lastEnd;
        const postEnd = postStart + postWindow;
        const postDuration = postEnd - postStart;
        if (postDuration >= MIN_GAP_MINUTES) {
          gaps.push({
            startMin: postStart,
            endMin: postEnd,
            durationMin: postDuration,
            before: lastTimed,
            after: null,
            before2: timed[timed.length - 2] ?? null,
            after2: null,
            insertIndex: items.length,
            position: "after_anchor",
          });
        }
      }
    }
  }

  // 時刻順にソートして返す（pre → between → post の順）
  gaps.sort((a, b) => a.startMin - b.startMin);
  return gaps;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. Load Guard（過密ガード — Slack研究）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * プランが過密かどうかを判定する。
 * 稼働率80%超 or アイテム数≥7 なら gap fill をスキップ。
 */
function isOverloaded(items: PlanItem[]): boolean {
  const nonTravel = items.filter(i => i.kind !== "travel" && !i.proposal);
  return nonTravel.length >= OVERLOAD_ITEM_THRESHOLD;
}

/**
 * プランがスカスカかどうかを判定する（逆U字対応）。
 *
 * CEO方針: 常時3ではなく sparse-day exception にする。
 * 条件:
 *   - nonTravel ≤ 2
 *   - gap ≥ 90min が少なくとも1つ
 *   - explicit_free_time がない
 *   - overloaded でない
 */
function isSparseDay(items: PlanItem[], gaps: GapSlot[]): boolean {
  const nonTravel = items.filter(i => i.kind !== "travel" && !i.proposal);
  if (nonTravel.length > SPARSE_DAY_THRESHOLD) return false;
  if (!gaps.some(g => g.durationMin >= 90)) return false;

  // explicit_free_time がいたら sparse-day とは見なさない
  for (const gap of gaps) {
    if (isExplicitFreeTime(gap)) return false;
  }

  return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. R2: Explicit Free Time Guard（HARD — ユーザー意思尊重）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ユーザーが「休み」「フリー」と明言した gap を検出する。
 *
 * CEO方針: R2 は LEARN ではなく HARD。明示意図の尊重は学習対象ではない。
 *
 * 検出対象: gap の前後アイテムのテキストに「休み」「フリー」「自由時間」「off」「free」等が含まれる。
 * また、アイテム自体が「休憩」「休み時間」等の場合は、その前後の gap は埋めない。
 */
function isExplicitFreeTime(gap: GapSlot): boolean {
  // 注意: "オフ" は "オフィス" に部分マッチするため、negative lookahead で除外
  // GPT注意1対応: false positive を防ぐ
  const FREE_TIME_PATTERN = /休み|フリー|自由時間|オフ(?!ィ)|(?<![a-z])off(?![a-z])|(?<![a-z])free(?![a-z])|何もしない|ゆっくり/i;

  /** テキストが free time パターンにマッチするか */
  const matchesFreeTime = (item: PlanItem | null): boolean => {
    if (!item) return false;
    const text = `${item.text} ${item.what ?? ""}`.toLowerCase();
    return FREE_TIME_PATTERN.test(text);
  };

  // 前アイテムが「休み」系のテキスト → その後の gap は意図的空白
  if (matchesFreeTime(gap.before)) return true;

  // 後アイテムが「休み」系のテキスト → その前の gap は意図的空白
  if (matchesFreeTime(gap.after)) return true;

  // Phase 2b: before2/after2 が「休み」系で、間が travel の場合も空白保護
  // 例: 「休み→travel→[gap]→仕事」のケース
  if (gap.before?.kind === "travel" && matchesFreeTime(gap.before2)) return true;
  if (gap.after?.kind === "travel" && matchesFreeTime(gap.after2)) return true;

  return false;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. Context Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** アクティビティカテゴリが食事系か */
function isMealCategory(cat?: ActivityCategory | string): boolean {
  if (!cat) return false;
  return cat.startsWith("social_meal") || cat.startsWith("social_drink") || cat === "social_meal" || cat === "social_drink";
}

/** アクティビティカテゴリが会議/打ち合わせ系か */
function isMeetingCategory(cat?: ActivityCategory | string): boolean {
  if (!cat) return false;
  return cat === "work_meeting" || cat.startsWith("work_meeting");
}

/** テキストから食事系か判定 */
function isMealText(item: PlanItem | null): boolean {
  if (!item) return false;
  const t = (item.text + (item.what ?? "")).toLowerCase();
  return /食事|ランチ|ディナー|昼食|夕食|朝食|ご飯|食べ/.test(t) || isMealCategory(item.activityCategory);
}

/** テキストから会議系か判定 */
function isMeetingText(item: PlanItem | null): boolean {
  if (!item) return false;
  const t = (item.text + (item.what ?? "")).toLowerCase();
  return /打ち合わせ|ミーティング|会議|商談|面談|meeting/.test(t) || isMeetingCategory(item.activityCategory);
}

/** 帰宅トラベルか判定 */
function isReturnTravel(item: PlanItem | null): boolean {
  if (!item || item.kind !== "travel") return false;
  const t = (item.text + (item.travelTo ?? "")).toLowerCase();
  return /帰宅|自宅|家/.test(t);
}

/** 高負荷カテゴリか */
function isHighIntensity(cat: ActivityCategory): boolean {
  return cat.startsWith("exercise_gym") || cat.startsWith("exercise_run") || cat.startsWith("exercise_sports");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. Candidate Selection（Circadian + Context）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * gap の時間帯と前後コンテキストに基づいて、最適な候補プールを選択する。
 *
 * Circadian Layer: 13-15時は午後ディップ → recovery のみ
 * Context Layer: 前後の予定種別でプール切替
 */
function selectCandidatePool(gap: GapSlot): GapCandidate[] {
  // ── Circadian: 午後ディップ (13:00-15:00) → recovery 専用候補 ──
  if (gap.startMin >= AFTERNOON_DIP_START && gap.startMin < AFTERNOON_DIP_END) {
    return AFTERNOON_DIP_CANDIDATES;
  }

  const { before, after, after2 } = gap;

  // ── Context: 前後の予定から最適プールを選択 ──
  // Phase 2b: after1 が travel の場合、after2 を「実質的な次の予定」として使う

  // 帰宅前: 買い物や一息
  if (isReturnTravel(after)) return PRE_RETURN_CANDIDATES;

  // 食事前: 散歩やカフェ（after2 も考慮 — gap→travel→食事 のパターン）
  if (isMealText(after)) return PRE_MEAL_CANDIDATES;
  if (after?.kind === "travel" && isMealText(after2)) return PRE_MEAL_CANDIDATES;

  // 食事後: 散歩（眠気対策）や読書
  if (isMealText(before)) return POST_MEAL_CANDIDATES;

  // 会議/打ち合わせ前: 準備（after2 も考慮 — gap→travel→会議 のパターン）
  if (isMeetingText(after)) return PRE_MEETING_CANDIDATES;
  if (after?.kind === "travel" && isMeetingText(after2)) return PRE_MEETING_CANDIDATES;

  // 仕事日の gap（メール整理、読書等）
  const beforeWork = before?.activityCategory?.startsWith("work_");
  const afterWork = after?.activityCategory?.startsWith("work_");
  if (beforeWork || afterWork) return WORK_DAY_CANDIDATES;

  return DEFAULT_CANDIDATES;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. Prohibition Filter（禁止ルール — T/C/L taxonomy）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 候補が禁止ルールに該当しないかチェック。
 *
 * HARD禁止:
 *   T1: duration_overflow（バッファ込み）
 *   C1: high_intensity_before_meeting
 *   C2: meal_near_meal
 *
 * SOFT禁止:
 *   T2: short_gap_complex（gap < 30min に高認知タスク禁止）
 *   T3: buffer_violation（前後5分バッファ考慮）
 *   C3: duplicate_activity（同カテゴリ重複）
 *   C5: high_cognitive_after_meal
 *   C6: intense_before_travel
 */
function filterCandidate(candidate: GapCandidate, gap: GapSlot, allItems: PlanItem[]): boolean {
  // T1 + T3: バッファ込み duration チェック（Planning Fallacy 対策）
  const usableGap = gap.durationMin - (BUFFER_MINUTES * 2);
  if (candidate.durationMin > usableGap) {
    // バッファなしでも収まらなければ完全アウト (T1)
    if (candidate.durationMin > gap.durationMin) return false;
    // バッファ付きだと収まらない → ギリギリなので許可するが、短い候補を優先させる
    // （ここでは reject しない — priority で調整）
  }

  // T2: 短gap高認知制限（gap < 30min に maintenance/enrichment は非推奨）
  if (gap.durationMin < SHORT_GAP_THRESHOLD) {
    if (candidate.taxonomy === "maintenance" || candidate.taxonomy === "enrichment") {
      return false;
    }
  }

  // C1: 高負荷運動の制限
  if (isHighIntensity(candidate.category)) {
    // 会議/打ち合わせの前に高負荷運動は禁止
    if (isMeetingText(gap.after)) return false;
    // 仕事日の隙間に高負荷運動は禁止
    const hasWork = allItems.some(i => i.activityCategory?.startsWith("work_"));
    if (hasWork) return false;
    // C6: 移動直前の高負荷は禁止
    if (gap.after?.kind === "travel") return false;
  }

  // C2: 食事の重複回避
  if (isMealCategory(candidate.category)) {
    if (isMealText(gap.before) || isMealText(gap.after)) return false;
  }

  // C3: 同カテゴリ重複回避（前後に同じカテゴリがあれば非推奨）
  // Phase 2b: before2/after2 も考慮して近接重複を防ぐ
  if (gap.before?.activityCategory === candidate.category ||
      gap.after?.activityCategory === candidate.category ||
      gap.before2?.activityCategory === candidate.category ||
      gap.after2?.activityCategory === candidate.category) {
    return false;
  }

  // C5: 食後に高認知タスクは非推奨（maintenance, enrichment の一部）
  if (isMealText(gap.before)) {
    if (candidate.taxonomy === "maintenance") return false;
  }

  return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. Weather Filter（天気フィルタ — Phase 2a）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 天気情報に基づいて候補の priority を調整する。
 *
 * - rain/snow/storm → outdoor 候補に WEATHER_OUTDOOR_PENALTY を加算
 * - これにより indoor 候補が自然に上位に来る
 * - outdoor 候補を完全に除外はしない（ユーザーが雨でも散歩したい場合もある）
 */
function applyWeatherPenalty(candidates: GapCandidate[], options?: GapFillOptions): GapCandidate[] {
  if (!options?.weatherIcon) return candidates;

  const badWeather = options.weatherIcon === "rain"
    || options.weatherIcon === "snow"
    || options.weatherIcon === "storm";

  // 降水確率60%以上でも bad weather 扱い
  const highPop = (options.popMax ?? 0) >= 60;

  if (!badWeather && !highPop) return candidates;

  // outdoor 候補の priority にペナルティを加算
  return candidates.map(c =>
    c.outdoor
      ? { ...c, priority: c.priority + WEATHER_OUTDOOR_PENALTY }
      : c,
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. Proposal Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * gap に対する提案 PlanItem を生成する。
 * proposal = true のフラグを付けて、UI で「提案」として表示されるようにする。
 * T3: 前5分バッファを適用。
 */
function buildProposalItem(candidate: GapCandidate, gap: GapSlot): PlanItem {
  // T3: 前5分バッファを適用（Planning Fallacy 対策）
  const startMin = gap.startMin + BUFFER_MINUTES;

  return {
    id: `gf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    kind: "todo",
    text: candidate.activity,
    what: candidate.activity,
    startTime: minutesToTime(startMin),
    durationMin: candidate.durationMin,
    fixedStart: false,
    orderHint: 9990, // 提案は末尾寄りの order
    sourceTurnIndex: -1, // -1 = Alter 提案
    activityCategory: candidate.category,
    completed: false,
    proposal: true,
    proposalReason: candidate.reason,
    proposalTaxonomy: candidate.taxonomy,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * プランの空き時間に Alter 提案を差し込む。
 *
 * @param items - 現在のプランアイテム（travel 含む、時刻割り当て済み）
 * @param options - 天気等の外部コンテキスト
 * @returns 提案が差し込まれた新しいアイテム配列（元の items は変更しない）
 *
 * 使い方:
 *   const plan = buildDayPlan(items, conditions);
 *   plan.items = fillGaps(plan.items, { weatherIcon: "rain" });
 */
export function fillGaps(items: PlanItem[], options?: GapFillOptions): PlanItem[] {
  const isMinimalMode = !!options?.minimalPlan;

  // L1: 過密ガード — minimal モードでは skip（1予定モードは定義上スカスカ）
  if (!isMinimalMode && isOverloaded(items)) return items;

  const gaps = detectGaps(items, options);
  if (gaps.length === 0) return items;

  // ── 提案上限の決定 ──
  let effectiveMax: number;
  if (isMinimalMode) {
    // Block 3 Phase 1: default 2, 例外 3（昼アンカーで前後に十分な余白）
    effectiveMax = MAX_PROPOSALS_MINIMAL;
    const anchor = options!.minimalPlan!.anchor;
    const anchorStart = anchor.startTime ? timeToMinutes(anchor.startTime) : undefined;
    if (anchorStart !== undefined) {
      const hour = Math.floor(anchorStart / 60);
      const preGap = gaps.find(g => g.position === "before_anchor");
      const postGap = gaps.find(g => g.position === "after_anchor");
      // 昼アンカー (11-14時) + pre ≥ 120min + post ≥ 150min の三条件
      if (
        hour >= 11 && hour < 14 &&
        preGap && preGap.durationMin >= 120 &&
        postGap && postGap.durationMin >= 150
      ) {
        effectiveMax = MAX_PROPOSALS_MINIMAL_WIDE;
      }
    }
  } else {
    // 逆U字: sparse-day exception — スカスカな日は MAX を3に緩和
    const sparse = isSparseDay(items, gaps);
    effectiveMax = sparse ? MAX_PROPOSALS_SPARSE : MAX_PROPOSALS;
  }

  // sparse-day ガード判定は minimal モード外だけ使う
  const sparse = !isMinimalMode && isSparseDay(items, gaps);

  // 各 gap に対して最大1つの提案を生成
  const proposals: Array<{ item: PlanItem; insertIndex: number }> = [];
  let proposalCount = 0;
  let previousGapHadProposal = false;
  let hasRecoveryProposal = false; // sparse-day ガード: recovery 過多を防ぐ

  for (const gap of gaps) {
    if (proposalCount >= effectiveMax) break;

    // R2 (HARD): ユーザーが「休み」「フリー」と明言した gap は絶対に埋めない
    if (isExplicitFreeTime(gap)) {
      previousGapHadProposal = false;
      continue;
    }

    // L3: 連続する gap に両方提案しない（空白保護）
    // minimal モードでは pre/post が anchor を挟んで離れているため L3 無効化
    if (!isMinimalMode && previousGapHadProposal) {
      previousGapHadProposal = false;
      continue;
    }

    let pool = selectCandidatePool(gap);

    // 7. Weather Filter: 雨天時に outdoor 候補を降格
    pool = applyWeatherPenalty(pool, options);

    const valid = pool.filter(c => filterCandidate(c, gap, items));

    if (valid.length > 0) {
      // 優先度順ソート → 最上位を選択
      valid.sort((a, b) => a.priority - b.priority);

      // sparse-day ガード: recovery を2つ以上出さない（バリエーション確保）
      let best = valid[0];
      if (sparse && hasRecoveryProposal && best.taxonomy === "recovery") {
        const nonRecovery = valid.find(c => c.taxonomy !== "recovery");
        if (nonRecovery) best = nonRecovery;
      }

      const proposalItem = buildProposalItem(best, gap);

      proposals.push({ item: proposalItem, insertIndex: gap.insertIndex });
      proposalCount++;
      previousGapHadProposal = true;
      if (best.taxonomy === "recovery") hasRecoveryProposal = true;
    } else {
      previousGapHadProposal = false;
    }
  }

  if (proposals.length === 0) return items;

  // proposals を insert index 降順でソート（後ろから挿入して index がずれない）
  proposals.sort((a, b) => b.insertIndex - a.insertIndex);

  const result = [...items];
  for (const { item, insertIndex } of proposals) {
    result.splice(insertIndex, 0, item);
  }

  return result;
}
