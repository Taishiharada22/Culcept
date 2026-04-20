/**
 * CoAlter Stage 3a — Food Tier Expander
 *
 * 位置づけ（`docs/coalter-food-three-stage-design.md` §2.4.1）:
 *   食事固有の二重制約（エリア × 時間帯）を段階的に緩めるための tier 生成器。
 *
 *   Tier 0  : 指定エリア × 指定時間帯（積集合）
 *   Tier 1a : 指定エリア × 時間帯隣接（時間拡張）
 *   Tier 1b : 隣接エリア × 指定時間帯（地理拡張）
 *   Tier 2  : 両 fail → 「薄い」返却（代替提示のための状態）
 *
 * 契約:
 *   - **logic のみ**、純関数。webConnector / booking / rank からは独立
 *   - F-4 scope（2026-04-20）: plan の生成だけ担う。実行（retrieval）は呼び出し側
 *   - adjacencyTable はまだ movie と共有していないため、本ファイル内に最小テーブルを
 *     持つ（将来 `lib/coalter/adjacency/` に切り出し予定）
 *   - `tier2` は hard error ではなく state。caller が「薄い」旨を narration する
 *
 * 非スコープ:
 *   - 実 retrieval / 予約確保 / 営業時間チェック（Stage 3 後半）
 *   - 日跨ぎ提案（「明日同時刻」）は Tier 1a の将来拡張
 */

// ═══════════════════════════════════════════════════════════════════════════
// Public types
// ═══════════════════════════════════════════════════════════════════════════

export type FoodTier = "T0" | "T1a" | "T1b" | "T2";

export interface TimeWindowRange {
  /** 0-23 の開始時刻（inclusive） */
  startHour: number;
  /** 0-23 の終了時刻（exclusive） */
  endHour: number;
  /**
   * 相対日付。0 = same day / 1 = 明日同時刻。
   * Gap C (doc §2.4.1): Tier 1a は prev / next に加えて明日同時刻を第 3 候補として返す。
   */
  dayOffset: 0 | 1;
}

export interface FoodTierPlan {
  tier: FoodTier;
  areas: string[];
  /** 評価対象の時間帯レンジ。複数（隣接含む）の場合もある */
  timeSlots: TimeWindowRange[];
  /** tier2 のときのみ設定。「薄い」理由 */
  thinReason?: "area_thin" | "time_thin" | "both_thin";
}

export interface BuildTierPlansInput {
  /** ユーザー指定エリア（都内駅名 / 区名）。空文字は許容しない */
  area: string;
  /** 指定時間帯レンジ。例: 19:00-20:00 → { start:19, end:20 } */
  timeSlot: TimeWindowRange;
}

// ═══════════════════════════════════════════════════════════════════════════
// Adjacency tables（minimum viable。F-x で拡張予定）
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 地理隣接表。key → 周辺エリア候補（重要度順）。
 *
 * 将来 `lib/coalter/adjacency/area.ts` に切り出して movie と共有する。
 * 未登録 area は空配列扱い（Tier 1b は発行するが areas=[area] のまま；上位で tier_thin 判定）。
 */
const AREA_ADJACENCY: Record<string, string[]> = {
  // 山手西
  渋谷: ["表参道", "恵比寿", "代官山", "原宿"],
  表参道: ["渋谷", "原宿", "青山"],
  恵比寿: ["渋谷", "代官山", "広尾", "中目黒"],
  中目黒: ["恵比寿", "代官山", "祐天寺"],
  // 山手東
  新宿: ["代々木", "初台", "西新宿", "新宿三丁目"],
  池袋: ["目白", "雑司が谷", "要町"],
  // 下町・東
  銀座: ["有楽町", "新橋", "築地", "京橋"],
  新橋: ["銀座", "虎ノ門", "汐留"],
  六本木: ["乃木坂", "麻布十番", "赤坂"],
  // ターミナル
  品川: ["高輪", "北品川", "田町"],
  東京: ["大手町", "日本橋", "有楽町"],
};

// ═══════════════════════════════════════════════════════════════════════════
// Time adjacency
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 時間帯の隣接拡張。
 *   dinner 19-20 指定 → 18-19 / 20-21 / 明日 19-20 の 3 スロットを返す
 *   lunch 12-13 指定  → 11-12 / 13-14 / 明日 12-13
 *
 * 営業時間の上下限にぶつかった場合は同日側を縮める（0〜24 で clamp）。
 * 同じ (dayOffset, start, end) が重複しないように dedupe。
 * Gap C (doc §2.4.1): 明日同時刻 (dayOffset=1) を第 3 候補として常に発行する。
 * 同日 prev/next が両方 clamp で消えても、明日同時刻は残る。
 */
export function adjacentTimeSlots(
  slot: TimeWindowRange,
): TimeWindowRange[] {
  const span = Math.max(1, slot.endHour - slot.startHour);
  const prev = clampSlot({
    startHour: slot.startHour - span,
    endHour: slot.startHour,
    dayOffset: 0,
  });
  const next = clampSlot({
    startHour: slot.endHour,
    endHour: slot.endHour + span,
    dayOffset: 0,
  });
  const nextDay: TimeWindowRange = {
    startHour: Math.max(0, Math.min(24, slot.startHour)),
    endHour: Math.max(0, Math.min(24, slot.endHour)),
    dayOffset: 1,
  };
  const acc: TimeWindowRange[] = [];
  const seen = new Set<string>();
  for (const s of [prev, next, nextDay]) {
    if (s.startHour >= s.endHour) continue;
    const key = `${s.dayOffset}-${s.startHour}-${s.endHour}`;
    if (seen.has(key)) continue;
    seen.add(key);
    acc.push(s);
  }
  return acc;
}

function clampSlot(s: TimeWindowRange): TimeWindowRange {
  return {
    startHour: Math.max(0, Math.min(24, s.startHour)),
    endHour: Math.max(0, Math.min(24, s.endHour)),
    dayOffset: s.dayOffset,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 二重制約 Tier の 4 段階 plan を生成する（実行はしない）。
 *
 * 返り値は tier 順 (T0 → T1a → T1b → T2) の固定 4 件。caller は
 * 上位から試して最初に hit した tier を確定し、以降は捨てる想定。
 */
export function buildFoodTierPlans(
  input: BuildTierPlansInput,
): FoodTierPlan[] {
  const area = input.area.trim();
  if (!area) {
    throw new Error("buildFoodTierPlans: area must be non-empty");
  }
  const base = clampSlot(input.timeSlot);
  if (base.startHour >= base.endHour) {
    throw new Error("buildFoodTierPlans: timeSlot must be non-empty range");
  }

  const adjacentTimes = adjacentTimeSlots(base);
  const neighborAreas = AREA_ADJACENCY[area] ?? [];

  const t0: FoodTierPlan = {
    tier: "T0",
    areas: [area],
    timeSlots: [base],
  };
  const t1a: FoodTierPlan = {
    tier: "T1a",
    areas: [area],
    timeSlots: adjacentTimes,
  };
  const t1b: FoodTierPlan = {
    tier: "T1b",
    areas: neighborAreas.length > 0 ? neighborAreas : [area],
    timeSlots: [base],
  };

  // Gap C 反映後: adjacentTimes は明日同時刻を含むため、ほぼ常に length >= 1。
  //   time_thin は「同日 prev/next が両方消えた上で明日同時刻も発行されなかった」稀な
  //   退化ケースのみ立つ（実質 0-range 入力が guard で弾かれるため発火しない）。
  const areaThin = neighborAreas.length === 0;
  const timeThin = adjacentTimes.length === 0;
  const thinReason: FoodTierPlan["thinReason"] = areaThin && timeThin
    ? "both_thin"
    : areaThin
      ? "area_thin"
      : timeThin
        ? "time_thin"
        : undefined;

  // Gap D: 通常ケース（どちらも隣接あり）は thinReason を undefined のまま返す。
  //   以前は `?? "both_thin"` で保険として上書きしていたが仕様と不一致だった。
  const t2: FoodTierPlan = {
    tier: "T2",
    areas: [area, ...neighborAreas],
    timeSlots: [base, ...adjacentTimes],
    thinReason,
  };

  return [t0, t1a, t1b, t2];
}

// ═══════════════════════════════════════════════════════════════════════════
// Test-only exports
// ═══════════════════════════════════════════════════════════════════════════

export const __internal = {
  AREA_ADJACENCY,
  clampSlot,
};
