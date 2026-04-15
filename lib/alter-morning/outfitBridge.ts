/**
 * Outfit Bridge — Morning Plan → コーデ提案への変換
 *
 * MorningPlan の PlanItem[] + DayConditions を
 * Calendar の EventContext[] → Intent → 候補に変換し、
 * Alter 画面でインラインコーデ表示できるようにする。
 */

import type { MorningPlan, PlanItem, DayConditions, EndpointAnchor, EndpointType } from "./types";
import type {
  EventContext,
  EventType,
  WeatherContext,
  Intent,
  Slot,
} from "@/app/(culcept)/calendar/_lib/vcTypes";
import { NUMERIC_INTENT_KEYS as KEYS } from "@/app/(culcept)/calendar/_lib/vcTypes";
import { computePrimaryEvent, computeIntent, intentToBadges } from "@/app/(culcept)/calendar/_lib/vcIntent";
import { buildCandidates, type ScoredCandidate } from "@/app/(culcept)/calendar/_lib/vcCandidates";
import { computeSyncScore } from "@/lib/shared/outfitEngine/syncScoring";
import type { WeatherDaily, SyncScore } from "@/app/(culcept)/calendar/_lib/types";
import type { WardrobeItem } from "@/app/(immersive)/my-style/_lib/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Companion → Impression 変換
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// withWhom カテゴリから EventContext の印象軸（attentionLevel / romanceLevel / trustNeed）を導出する。
// 設計原則:
//   - eventType (BASE Intent) が主軸 → applySocial() が印象を nudge
//   - withWhom カテゴリが補助シグナル → ここで EventContext に値を注入
//   - 未分類の名前（「田中さん」等）→ nudge なし（安全なデフォルト）
//   - 生テキストは PlanItem.withWhom に保存済み → 将来の関係性DB連携で活用可能

/** 印象軸に影響するコンパニオンカテゴリ */
type CompanionCategory = "partner" | "work" | "friends" | "family" | "solo";

/** コンパニオンカテゴリ → 印象軸の変換テーブル */
const COMPANION_IMPRESSION: Record<CompanionCategory, {
  attentionLevel: number;
  romanceLevel: number;
  trustNeed: number;
}> = {
  partner: { attentionLevel: 0.6, romanceLevel: 0.7, trustNeed: 0.1 },
  work:    { attentionLevel: 0.3, romanceLevel: 0.0, trustNeed: 0.6 },
  friends: { attentionLevel: 0.3, romanceLevel: 0.0, trustNeed: 0.1 },
  family:  { attentionLevel: 0.1, romanceLevel: 0.0, trustNeed: 0.0 },
  solo:    { attentionLevel: 0.0, romanceLevel: 0.0, trustNeed: 0.0 },
};

/**
 * withWhom 生テキストからカテゴリを推定する。
 * 既にカテゴリ値（"friends" 等）の場合はそのまま返す。
 * 「田中さん」のような固有名は null（未分類）。
 */
const COMPANION_PATTERNS: Array<{ pattern: RegExp; category: CompanionCategory }> = [
  { pattern: /彼女|彼氏|恋人|パートナー/, category: "partner" },
  { pattern: /上司|同僚|クライアント|取引先|部下|先輩|後輩/, category: "work" },
  { pattern: /家族|親|母|父|兄|姉|弟|妹|祖父|祖母|おばあ|おじい|子供|息子|娘/, category: "family" },
  { pattern: /友達|友人|仲間|みんな/, category: "friends" },
  { pattern: /一人|ひとり|ソロ/, category: "solo" },
];

/** DayConditions.withWhom はカテゴリ文字列で格納されている */
const KNOWN_CATEGORIES = new Set<string>(["partner", "work", "friends", "family", "solo"]);

export function categorizeCompanion(withWhom: string): CompanionCategory | null {
  // 既にカテゴリ値ならそのまま返す（DayConditions.withWhom の値）
  if (KNOWN_CATEGORIES.has(withWhom)) return withWhom as CompanionCategory;
  // パターンマッチで推定
  for (const { pattern, category } of COMPANION_PATTERNS) {
    if (pattern.test(withWhom)) return category;
  }
  // 「田中さん」等の固有名 → null（eventType の BASE Intent に任せる）
  return null;
}

/** コンパニオンカテゴリから EventContext 印象フィールドを生成 */
function companionToImpression(category: CompanionCategory): Pick<EventContext, "attentionLevel" | "romanceLevel" | "trustNeed"> {
  return COMPANION_IMPRESSION[category];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PlanItem → EventContext 変換
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** PlanItem の eventType → EventContext.type マッピング（デフォルト: "home"） */
function resolveEventType(item: PlanItem): EventType {
  return item.eventType ?? "home";
}

/** HH:mm → ISO datetime（今日の日付ベース） */
function toISOTime(date: string, time?: string): string {
  if (!time) return `${date}T09:00:00`;
  const [h, m] = time.split(":").map(Number);
  return `${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

/** DayConditions から EventContext に適用する共通フィールドを生成 */
function dayConditionsOverlay(dc: DayConditions): Partial<EventContext> {
  const overlay: Partial<EventContext> = {};

  if (dc.venue) overlay.venue = dc.venue;
  if (dc.mainTransport) overlay.mainTransport = dc.mainTransport;

  // walkLevel → sitRatio / walkRatio 推定
  if (dc.estimatedWalkLevel === "high") {
    overlay.walkRatio = 0.6;
    overlay.sitRatio = 0.2;
  } else if (dc.estimatedWalkLevel === "medium") {
    overlay.walkRatio = 0.4;
    overlay.sitRatio = 0.4;
  } else if (dc.estimatedWalkLevel === "low") {
    overlay.walkRatio = 0.15;
    overlay.sitRatio = 0.7;
  }

  // withWhom → 日単位の印象デフォルト
  if (dc.withWhom) {
    const category = categorizeCompanion(dc.withWhom);
    if (category) {
      const impression = companionToImpression(category);
      overlay.attentionLevel = impression.attentionLevel;
      overlay.romanceLevel = impression.romanceLevel;
      overlay.trustNeed = impression.trustNeed;
    }
  }

  return overlay;
}

/**
 * eventType → dressCode 推定（下限制約として使用）
 *
 * 全 eventType に dressCode を付けるわけではない。
 * 社会的に formality の下限が明確なケースだけ guardrail を設ける:
 *   - formal (結婚式・式典) → formality floor 0.90
 *   - interview (面接)      → formality floor 0.70
 *   - sports (運動)         → mobility floor 0.80, formality ceiling 0.15
 *
 * work / party / friends 等は eventType の BASE Intent で十分。
 * ムード補正で多少くだけても問題ないレベルなので dressCode は不要。
 */
export function inferDressCode(eventType: EventType): EventContext["dressCode"] | undefined {
  switch (eventType) {
    case "formal": return "formal";
    case "interview": return "business";
    case "sports": return "sport";
    default: return undefined;
  }
}

/** PlanItem[] → EventContext[] に変換 */
export function planToEventContexts(plan: MorningPlan): EventContext[] {
  const overlay = dayConditionsOverlay(plan.dayConditions);

  return plan.items
    .filter((item) => !item.completed) // 完了済みは除外
    .map((item): EventContext => {
      const startAt = toISOTime(plan.date, item.startTime);
      const endMinutes = item.durationMin;
      const startDate = new Date(startAt);
      const endDate = new Date(startDate.getTime() + endMinutes * 60 * 1000);

      // アイテム単位の withWhom が日単位より優先
      let itemImpression: Partial<EventContext> | undefined;
      if (item.withWhom) {
        const category = categorizeCompanion(item.withWhom);
        if (category) {
          itemImpression = companionToImpression(category);
        }
      }

      // eventType → dressCode 推定（下限制約）
      const dressCode = inferDressCode(resolveEventType(item));

      return {
        id: item.id,
        title: item.text,
        type: resolveEventType(item),
        startAt,
        endAt: endDate.toISOString(),
        priority: item.kind === "fixed" ? 2 : 1,
        // dressCode 下限制約（eventType ベース）
        ...(dressCode ? { dressCode } : {}),
        // DayConditions からの共通設定（日単位の withWhom 印象含む）
        ...overlay,
        // アイテム単位の withWhom 印象で上書き（存在する場合のみ）
        ...itemImpression,
      };
    });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Outfit Invalidation — プラン変更 → コーデ再提案判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 設計原則:
//   1. 「即再生成」ではなく「再提案フラグ」→ ユーザーの今のコーデを勝手に消さない
//   2. text ではなく structured diff → Intent 計算に影響するフィールドだけ監視
//   3. reason 付き → UI で説明可能 + ログ分析可能

/** コーデ再提案の理由カテゴリ */
export type OutfitRefreshField =
  | "companion"     // 同行者が変わった
  | "event_type"    // 予定タイプが変わった
  | "transport"     // 移動手段が変わった
  | "venue"         // 場所タイプ（屋内/屋外）が変わった
  | "mood"          // ムードが変わった
  | "walk_level"    // 歩き量が変わった
  | "items_added"   // 予定が追加された
  | "items_removed" // 予定が削除された
  | "time_shift";   // 時間帯が変わった

export interface OutfitRefreshReason {
  field: OutfitRefreshField;
  detail: string;
}

export interface OutfitInvalidation {
  /** コーデを更新すべきか */
  needsRefresh: boolean;
  /** 更新理由の一覧 */
  reasons: OutfitRefreshReason[];
}

/** UI 表示用: reason → 短い日本語ラベル */
const REASON_LABELS: Record<OutfitRefreshField, string> = {
  companion: "同行者が変わった",
  event_type: "予定タイプが変わった",
  transport: "移動手段が変わった",
  venue: "場所タイプが変わった",
  mood: "ムードが変わった",
  walk_level: "歩き量が変わった",
  items_added: "予定が追加された",
  items_removed: "予定が削除された",
  time_shift: "時間帯が変わった",
};

/** 理由から UI 用の短いラベルを取得 */
export function refreshReasonLabel(reason: OutfitRefreshReason): string {
  return REASON_LABELS[reason.field];
}

/** 時間文字列から時間帯を推定（TimeVenue 補正に対応） */
function timeBand(time: string): "morning" | "day" | "evening" | "night" {
  const h = parseInt(time.split(":")[0], 10);
  if (isNaN(h)) return "day";
  if (h < 10) return "morning";
  if (h < 17) return "day";
  if (h < 21) return "evening";
  return "night";
}

/**
 * 2つの MorningPlan を比較し、コーデに影響する構造的差分を検出する。
 *
 * 監視対象（Intent 計算に影響するフィールドのみ）:
 *   DayConditions: withWhom / mainTransport / venue / moodText / estimatedWalkLevel
 *   PlanItem:      eventType / withWhom / startTime（時間帯）/ 追加 / 削除
 *
 * 監視対象外:
 *   PlanItem.text（表示用で Intent 計算に使われない）
 *   PlanItem.durationMin（primary event 選出に影響するが、微小変更は無視）
 *   天気（外部データ → 別の更新トリガー）
 *
 * @returns needsRefresh が true なら「プラン変更でコーデ更新が推奨される」
 */
export function detectOutfitInvalidation(
  prevPlan: MorningPlan,
  nextPlan: MorningPlan,
): OutfitInvalidation {
  const reasons: OutfitRefreshReason[] = [];

  // ── DayConditions 差分 ──
  const pdc = prevPlan.dayConditions;
  const ndc = nextPlan.dayConditions;

  if (pdc.withWhom !== ndc.withWhom) {
    reasons.push({
      field: "companion",
      detail: `${pdc.withWhom ?? "未設定"} → ${ndc.withWhom ?? "未設定"}`,
    });
  }
  if (pdc.mainTransport !== ndc.mainTransport) {
    reasons.push({
      field: "transport",
      detail: `${pdc.mainTransport ?? "未設定"} → ${ndc.mainTransport ?? "未設定"}`,
    });
  }
  if (pdc.venue !== ndc.venue) {
    reasons.push({
      field: "venue",
      detail: `${pdc.venue ?? "未設定"} → ${ndc.venue ?? "未設定"}`,
    });
  }
  if (pdc.moodText !== ndc.moodText) {
    reasons.push({
      field: "mood",
      detail: `${pdc.moodText ?? "未設定"} → ${ndc.moodText ?? "未設定"}`,
    });
  }
  if (pdc.estimatedWalkLevel !== ndc.estimatedWalkLevel) {
    reasons.push({
      field: "walk_level",
      detail: `${pdc.estimatedWalkLevel ?? "未設定"} → ${ndc.estimatedWalkLevel ?? "未設定"}`,
    });
  }

  // ── EndpointAnchor 差分 ──
  const prevEndpoint = prevPlan.endpointAnchor?.type;
  const nextEndpoint = nextPlan.endpointAnchor?.type;
  if (prevEndpoint !== nextEndpoint) {
    reasons.push({
      field: "venue",
      detail: `終点: ${prevEndpoint ?? "未設定"} → ${nextEndpoint ?? "未設定"}`,
    });
  }

  // ── PlanItem 差分（travel は除外）──
  const prevItems = prevPlan.items.filter(i => i.kind !== "travel");
  const nextItems = nextPlan.items.filter(i => i.kind !== "travel");

  const prevIds = new Set(prevItems.map(i => i.id));
  const nextIds = new Set(nextItems.map(i => i.id));

  // 追加されたアイテム
  const added = nextItems.filter(i => !prevIds.has(i.id));
  if (added.length > 0) {
    const labels = added.map(i => i.what || i.text).join("、");
    reasons.push({ field: "items_added", detail: labels });
  }

  // 削除されたアイテム
  const removed = prevItems.filter(i => !nextIds.has(i.id));
  if (removed.length > 0) {
    const labels = removed.map(i => i.what || i.text).join("、");
    reasons.push({ field: "items_removed", detail: labels });
  }

  // 既存アイテムの構造変更
  for (const nextItem of nextItems) {
    if (!prevIds.has(nextItem.id)) continue;
    const prevItem = prevItems.find(i => i.id === nextItem.id)!;

    // eventType 変更
    if (prevItem.eventType !== nextItem.eventType) {
      const label = nextItem.what || nextItem.text;
      reasons.push({
        field: "event_type",
        detail: `${label}: ${prevItem.eventType ?? "home"} → ${nextItem.eventType ?? "home"}`,
      });
    }

    // withWhom 変更
    if (prevItem.withWhom !== nextItem.withWhom) {
      const label = nextItem.what || nextItem.text;
      reasons.push({
        field: "companion",
        detail: `${label}: ${prevItem.withWhom ?? "未設定"} → ${nextItem.withWhom ?? "未設定"}`,
      });
    }

    // 時間帯シフト（morning↔day↔evening↔night）
    if (prevItem.startTime && nextItem.startTime) {
      const prevBand = timeBand(prevItem.startTime);
      const nextBand = timeBand(nextItem.startTime);
      if (prevBand !== nextBand) {
        const label = nextItem.what || nextItem.text;
        reasons.push({
          field: "time_shift",
          detail: `${label}: ${prevBand} → ${nextBand}`,
        });
      }
    }
  }

  return {
    needsRefresh: reasons.length > 0,
    reasons,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EndpointAnchor → Intent 補正（secondary modifier）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 終点はその日の主目的ではない。あくまで「一日の終わりにどこに戻るか」の補正。
// 主シーン（eventType BASE）を上書きしない、軽い nudge にとどめる。
//
// 例:
//   hotel → 荷物管理の利便性（pocketNeed）+ シワ耐性（wrinkleSafe）+ 重ね着対応
//   office → 職場に戻る = 最低限の印象維持（formality floor / trust nudge）
//   partner_home → 目的地の快適さ（comfort nudge）

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * EndpointAnchor の type に基づいて Intent を微補正する。
 * computeIntent の後に呼ばれる secondary modifier。
 *
 * - home / friend_home / family_home / other → 補正なし
 * - hotel → wrinkleSafe, pocketNeed 上方 nudge + layered タグ
 * - office → trust nudge + formality 下限 0.35
 * - partner_home → comfort nudge
 */
export function applyEndpointAdjustment(intent: Intent, endpoint: EndpointAnchor): void {
  switch (endpoint.type) {
    case "hotel":
      intent.wrinkleSafe = clamp01(intent.wrinkleSafe + 0.10);
      intent.pocketNeed = clamp01(intent.pocketNeed + 0.10);
      if (!intent.sceneTags.includes("layered")) {
        intent.sceneTags.push("layered");
      }
      break;
    case "office":
      intent.trust = clamp01(intent.trust + 0.05);
      // 一日の終わりにオフィスに戻る場合、最低限の formality を確保
      intent.formality = Math.max(intent.formality, 0.35);
      break;
    case "partner_home":
      intent.comfort = clamp01(intent.comfort + 0.05);
      break;
    // home, friend_home, family_home, other → 補正なし
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scene Weighting — dominant scene + secondary modifiers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 複数イベントの日に pure average をやると主張がぼやける。
// dominant scene を 1 つ選び、secondary modifier（最大 2）で軽く補正する。
//
// sceneScore の算出: structured field only（text 不使用）
//   1. eventType 重要度（interview > formal > party > date > work > ...）
//   2. duration（長いほど重要）
//   3. priority（fixed > todo）
//   4. social exposure（companion-driven events）
//   5. dressCode strength（formal > business > smart_casual > ...）

export interface SceneWeighting {
  dominant: EventContext;
  secondaries: EventContext[];
}

/** eventType → 重要度スコア（高いほどコーデへの影響が大きい） */
const TYPE_IMPORTANCE: Record<EventType, number> = {
  interview: 10, formal: 9, party: 8, date: 7, work: 6,
  sports: 5, travel: 4, outdoor: 3, friends: 2, errand: 1, home: 0,
};

/** dressCode → 重要度スコア */
const DC_IMPORTANCE: Record<string, number> = {
  formal: 4, business: 3, smart_casual: 2, sport: 2, none: 0,
};

/**
 * 1つのイベントの「コーデ決定への重要度」を算出する。
 * structured field only（text / 曖昧文言は使わない）。
 */
export function computeSceneScore(ev: EventContext): number {
  let score = 0;

  // 1. eventType 重要度（0-10）
  score += TYPE_IMPORTANCE[ev.type] ?? 0;

  // 2. duration（0-5, 10時間以上は cap）
  if (ev.endAt) {
    const durMs = new Date(ev.endAt).getTime() - new Date(ev.startAt).getTime();
    const durHours = durMs / (1000 * 60 * 60);
    score += Math.min(Math.max(durHours, 0), 5);
  }

  // 3. priority（fixed = 2 → +4, normal = 1 → +2）
  score += (ev.priority ?? 0) * 2;

  // 4. social exposure（companion-driven events boost）
  if (ev.romanceLevel != null && ev.romanceLevel > 0.3) score += 3;
  if (ev.attentionLevel != null && ev.attentionLevel > 0.3) score += 2;
  if (ev.trustNeed != null && ev.trustNeed > 0.3) score += 2;

  // 5. dressCode strength
  score += DC_IMPORTANCE[ev.dressCode ?? "none"] ?? 0;

  return score;
}

/**
 * 複数イベントから dominant（主シーン）と secondaries（補正シーン、最大2）を選出する。
 *
 * - dominant: sceneScore 最大のイベント
 * - secondaries: dominant と**異なる eventType** のイベントから、score > 0 のもの最大 2 つ
 *   （同じ eventType は重複するだけで新しい情報がないため除外）
 */
export function computeSceneWeighting(events: EventContext[]): SceneWeighting {
  if (events.length === 0) throw new Error("No events for scene weighting");
  if (events.length === 1) return { dominant: events[0], secondaries: [] };

  const scored = events
    .map(ev => ({ event: ev, score: computeSceneScore(ev) }))
    .sort((a, b) => b.score - a.score);

  const dominant = scored[0].event;

  // Secondary: dominant と異なる eventType、かつ score > 0、最大 2
  const secondaries = scored
    .slice(1)
    .filter(s => s.event.type !== dominant.type)
    .filter(s => s.score > 0)
    .slice(0, 2)
    .map(s => s.event);

  return { dominant, secondaries };
}

/**
 * dominant Intent に secondary scenes からの補正を適用する。
 *
 * 合成ルール:
 *   1. 各 secondary の Intent を個別に computeIntent で算出
 *   2. dominant Intent との差分（delta）を平均する
 *   3. 差分を SECONDARY_INFLUENCE（25%）でスケールし、±MAX_DELTA（0.15）で cap
 *   4. dominant Intent に加算
 *
 * これにより:
 *   - dominant が同軸方向なら変化なし（secondary が新情報を持たない）
 *   - secondary が逆方向でも ±0.15 に制限（dominant を壊さない）
 *   - sceneTags / bannedTags / requiredTags は union（安全側）
 */
const SECONDARY_INFLUENCE = 0.25;
const MAX_DELTA_PER_AXIS = 0.15;

export function blendWithSecondaries(
  dominantIntent: Intent,
  secondaryEvents: EventContext[],
  weather?: WeatherContext,
  moodText?: string,
): Intent {
  if (secondaryEvents.length === 0) return dominantIntent;

  // 各 secondary の Intent を計算
  const secIntents = secondaryEvents.map(ev => computeIntent(ev, weather, moodText));

  // dominant をコピー
  const result: Intent = {
    ...dominantIntent,
    sceneTags: [...dominantIntent.sceneTags],
    bannedTags: [...dominantIntent.bannedTags],
    requiredTags: [...dominantIntent.requiredTags],
  };

  // 数値軸: 平均差分 → スケール → キャップ → 加算
  for (const key of KEYS) {
    const avgDelta =
      secIntents.reduce((sum, si) => sum + (si[key] - dominantIntent[key]), 0) /
      secIntents.length;
    const scaled = avgDelta * SECONDARY_INFLUENCE;
    const capped = Math.max(-MAX_DELTA_PER_AXIS, Math.min(MAX_DELTA_PER_AXIS, scaled));
    result[key] = clamp01(result[key] + capped);
  }

  // タグ: union（安全側 — secondary の bannedTags も尊重）
  for (const si of secIntents) {
    for (const tag of si.sceneTags) {
      if (!result.sceneTags.includes(tag)) result.sceneTags.push(tag);
    }
    for (const tag of si.bannedTags) {
      if (!result.bannedTags.includes(tag)) result.bannedTags.push(tag);
    }
    for (const tag of si.requiredTags) {
      if (!result.requiredTags.includes(tag)) result.requiredTags.push(tag);
    }
  }

  return result;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 天気変換
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** OutfitBridgeInput.weather → vcTypes.WeatherContext に変換 */
export function toWeatherContext(weather?: {
  tempMax: number | null;
  tempMin: number | null;
  condition: "sunny" | "cloudy" | "rain" | "snow";
  pop: number | null;
}): WeatherContext | undefined {
  if (!weather) return undefined;

  const avgTemp =
    weather.tempMax != null && weather.tempMin != null
      ? (weather.tempMax + weather.tempMin) / 2
      : weather.tempMax ?? weather.tempMin ?? undefined;

  return {
    tempC: avgTemp ?? undefined,
    condition: weather.condition,
    precipMm: weather.condition === "rain" ? 5 : weather.condition === "snow" ? 3 : 0,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WeatherDaily 変換（SYNCスコア用）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function toWeatherDaily(weather?: {
  tempMax: number | null;
  tempMin: number | null;
  condition: "sunny" | "cloudy" | "rain" | "snow";
  pop: number | null;
}): WeatherDaily | null {
  if (!weather) return null;
  const iconMap: Record<string, WeatherDaily["weather_icon"]> = {
    sunny: "sun", cloudy: "cloud", rain: "rain", snow: "snow",
  };
  return {
    weather_icon: iconMap[weather.condition] ?? "unknown",
    temp_max: weather.tempMax,
    temp_min: weather.tempMin,
    pop_max: weather.pop,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メインブリッジ関数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface OutfitBridgeResult {
  /** 各スロットの候補アイテム（上位7件） */
  candidates: Record<Slot, ScoredCandidate[]>;
  /** 20軸 Intent（デバッグ/表示用） */
  intent: Intent;
  /** 代表イベント */
  primaryEvent: EventContext;
  /** Intent から生成されたバッジ */
  badges: Array<{ label: string; color: string }>;
  /** SYNCスコア（top候補の組み合わせで計算） */
  syncScore: SyncScore | null;
  /** ワードローブが空で提案できなかった */
  noWardrobe: boolean;
}

/**
 * Morning Plan → コーデ候補を生成する。
 * クライアントサイドで実行（ワードローブは localStorage から取得）。
 */
export function generateOutfitFromPlan(
  plan: MorningPlan,
  wardrobe: WardrobeItem[],
  weather?: {
    tempMax: number | null;
    tempMin: number | null;
    condition: "sunny" | "cloudy" | "rain" | "snow";
    pop: number | null;
  },
): OutfitBridgeResult | null {
  // ワードローブが空なら提案不可（Intent とバッジだけ返す）
  if (wardrobe.length === 0) {
    const events = planToEventContexts(plan);
    if (events.length === 0) return null;
    const { dominant } = computeSceneWeighting(events);
    const wc = toWeatherContext(weather);
    const moodText = plan.dayConditions.moodText;
    const intent = computeIntent(dominant, wc, moodText);
    if (plan.endpointAnchor) applyEndpointAdjustment(intent, plan.endpointAnchor);

    return {
      candidates: { accessory: [], outer: [], top: [], bottom: [], shoes: [] },
      intent,
      primaryEvent: dominant,
      badges: intentToBadges(intent),
      syncScore: null,
      noWardrobe: true,
    };
  }

  // 1. PlanItem[] → EventContext[]
  const events = planToEventContexts(plan);
  if (events.length === 0) return null;

  // 2. Scene Weighting: dominant（主シーン）+ secondaries（補正シーン、最大2）
  const { dominant, secondaries } = computeSceneWeighting(events);

  // 3. 天気コンテキスト
  const wc = toWeatherContext(weather);

  // 4. Dominant Intent 計算（Mood → DressCode → Weather 順）
  const moodText = plan.dayConditions.moodText;
  const dominantIntent = computeIntent(dominant, wc, moodText);

  // 4.5. Secondary シーン blend（dominant 維持 + 補正 ±0.15 cap）
  const intent = blendWithSecondaries(dominantIntent, secondaries, wc, moodText);

  // 4.6. EndpointAnchor 補正（secondary modifier）
  if (plan.endpointAnchor) {
    applyEndpointAdjustment(intent, plan.endpointAnchor);
  }

  // 5. 候補生成
  const candidates = buildCandidates(wardrobe, intent);

  // 6. バッジ
  const badges = intentToBadges(intent);

  // 7. SYNCスコア（各スロットのtop候補で計算）
  const topItems: WardrobeItem[] = [];
  for (const slot of ["top", "bottom", "outer", "shoes", "accessory"] as const) {
    if (candidates[slot].length > 0) {
      topItems.push(candidates[slot][0].item);
    }
  }

  let syncScore: SyncScore | null = null;
  if (topItems.length >= 2) {
    const wd = toWeatherDaily(weather);
    const syncEvents = events.map((e) => ({ event_type: e.type }));
    const month = new Date().getMonth() + 1;
    syncScore = computeSyncScore(topItems, wd, syncEvents, month);
  }

  return {
    candidates,
    intent,
    primaryEvent: dominant,
    badges,
    syncScore,
    noWardrobe: false,
  };
}
