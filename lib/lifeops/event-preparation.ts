/**
 * Life Ops L-4 — 予定前準備エンジン（**pure 部分のみ**・no-DB・no-external-API・no-UI・barrel 非 export）
 *
 * 設計: docs/life-ops-l4-event-preparation-mini-design.md（CEO 指示 2026-06-09）/ §4 / Appendix A.3・A.7・A.12 / candidate-types
 *
 * 役割: **注入された近接イベント**（人と会う/旅行/面接/出張/冠婚葬祭/撮影）から、**外見重要イベント前だけ**、
 *   周期が `nearing` の美容行動を **前倒し候補**（`LifeOpsCandidate`・event_prep 根拠）にする pure エンジン。
 *   L-3 と非重複: L-3=beyond_typical 以上を周期で出す。**L-4=nearing をイベント近接で前倒し**（CEO 核心指示）。
 *
 * 厳守（CEO 指示）:
 *   - **pure・deterministic**: Date.now/argless Date 不使用・`nowISO` 注入。**events は注入**（calendar 読まない・実データ源/推定なし）。
 *   - **nearing のみ前倒し**（within=新しすぎ／beyond 以上=L-3 既出）。**外見重要イベントのみ**（business_trip=荷造り側で除外）。
 *   - dueReason は事実（イベント種/残日数/phase/推奨リード日）。「行け」でなく「この時期が自然」の素。配置/window 確定は横 R2。
 *   - **横エンジン（lib/plan/reality/*）非 import**。横 R2/R4・Morning Briefing・Moment Trigger・UI・通知・外部・予約 非接触。
 */

import { getCategorySpec, type LifeOpsCategoryId, type PreEventPrepCategoryId } from "./category-model";
import { getCadenceSpec, computeCadenceStatus, daysBetween, cadenceKey, type BeautyMenu } from "./cadence-model";
import type { CadenceObservation, EventKind, LifeOpsCandidate } from "./candidate-types";

export type { EventKind } from "./candidate-types";

/** 注入される近接イベント（calendar 読まない・pure）。 */
export interface UpcomingEvent {
  readonly kind: EventKind;
  readonly startISO: string;
}

/** 「近接」の窓（日）。 */
const EVENT_HORIZON_DAYS = 14;

/** 外見が重要なイベント（前倒し対象）。business_trip は荷造り側＝除外（MVP）。 */
const APPEARANCE_RELEVANT: ReadonlySet<EventKind> = new Set<EventKind>([
  "meeting_someone",
  "trip",
  "interview",
  "ceremony",
  "shoot",
  "important_event",
]);

/** 自然なリード日（A.12・行動×馴染み）。cadenceKey 単位。既定 2。 */
const LEAD_DAYS: Record<string, number> = {
  "beauty_salon:cut": 3,
  "beauty_salon:color": 3,
  eyebrow: 2,
};
function leadDaysFor(categoryId: LifeOpsCategoryId, menu: BeautyMenu | null): number {
  return LEAD_DAYS[cadenceKey(categoryId, menu)] ?? 2;
}

interface QualifyingEvent {
  readonly kind: EventKind;
  readonly daysUntil: number;
}

/** 外見重要 ∧ 近接（0..HORIZON）のイベントだけ残す（不正/過去/遠すぎは除外）。 */
function qualifyingEvents(events: readonly UpcomingEvent[], nowISO: string): QualifyingEvent[] {
  const out: QualifyingEvent[] = [];
  for (const e of events) {
    if (!APPEARANCE_RELEVANT.has(e.kind)) continue;
    const d = daysBetween(nowISO, e.startISO);
    if (d === null || d < 0 || d > EVENT_HORIZON_DAYS) continue;
    out.push({ kind: e.kind, daysUntil: d });
  }
  return out;
}

/**
 * L-4: 近接イベント × nearing 美容 → event_prep 候補（pure・nowISO 注入）。
 *   各美容 observation が nearing のとき、適格イベントのうち **daysUntil 最小**を根拠に 1 候補化。
 *   MVP 外 cadence / L-1 未定義 / 非 nearing は skip。出力は daysUntil 昇順（差し迫った順・安定）。
 */
export function generateEventPrepCandidates(
  events: readonly UpcomingEvent[],
  observations: readonly CadenceObservation[],
  nowISO: string
): readonly LifeOpsCandidate[] {
  const evs = qualifyingEvents(events, nowISO);
  if (evs.length === 0) return []; // 近接の外見重要イベントなし → 前倒しなし
  const nearest = evs.reduce((a, b) => (b.daysUntil < a.daysUntil ? b : a));

  const out: LifeOpsCandidate[] = [];
  const seen = new Set<string>(); // (category:menu) 重複 observation 防御
  for (const obs of observations) {
    const menu = obs.menu ?? null;
    const cadence = getCadenceSpec(obs.categoryId, menu);
    if (!cadence) continue; // MVP 外 cadence
    const status = computeCadenceStatus(cadence, obs.lastCompletedAtISO, nowISO);
    if (status.phase !== "nearing") continue; // L-4 は nearing のみ前倒し（within=新しすぎ／beyond=L-3）
    const cat = getCategorySpec(obs.categoryId);
    if (!cat) continue; // L-1 未定義
    if (cat.group !== "body_appearance") continue; // (a) 前倒しは美容のみ（daily_upkeep 等は周期 L-3 で・面接前に食料品を前倒ししない）
    const key = cadenceKey(cat.id, menu);
    if (seen.has(key)) continue; // 同カテゴリ重複 observation は 1 件
    seen.add(key);
    out.push({
      category: cat.id,
      menu,
      dueReason: {
        kind: "event_prep",
        eventKind: nearest.kind,
        daysUntilEvent: nearest.daysUntil,
        cyclePhase: "nearing",
        recommendedLeadDays: leadDaysFor(cat.id, menu),
      },
      suggestedWindow: null,
      placeQuery: cat.placeQueryHint,
      permissionLevelHint: cat.defaultMaxLevelHint,
      riskFlags: cat.typicalRiskFlags,
    });
  }
  // 差し迫った順（daysUntil 昇順・決定的・安定）
  return out
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const da = a.c.dueReason.kind === "event_prep" ? a.c.dueReason.daysUntilEvent : 0;
      const db = b.c.dueReason.kind === "event_prep" ? b.c.dueReason.daysUntilEvent : 0;
      return da !== db ? da - db : a.i - b.i;
    })
    .map((x) => x.c);
}

// ── L-4(b) イベント固有 one-shot 準備（cadence 無関係・周期なし・外見フィルタなし）──

/** イベント種 → one-shot 準備カテゴリ（MVP マップ）。全 EventKind を網羅。 */
const EVENT_PREP_MAP: Record<EventKind, readonly PreEventPrepCategoryId[]> = {
  interview: ["outfit_prep", "document_prep"],
  trip: ["packing", "ticket_hotel_check"],
  business_trip: ["packing", "ticket_hotel_check", "document_prep"],
  ceremony: ["outfit_prep", "belongings_check"],
  shoot: ["outfit_prep"],
  important_event: ["outfit_prep"],
  meeting_someone: [], // 手土産は文脈依存・MVP 除外（gift は birthday イベント種と共に後続）
};

/** one-shot 準備の自然なリード日（MVP・固定・イベント直前ほど短い）。 */
const ONESHOT_LEAD_DAYS: Record<PreEventPrepCategoryId, number> = {
  ticket_hotel_check: 5,
  packing: 2,
  outfit_prep: 2,
  document_prep: 2,
  belongings_check: 1,
};

/**
 * L-4(b): 注入イベント → one-shot 準備候補（pure・nowISO 注入）。
 *   イベント種→準備マップ。**cadence 無関係**（cyclePhase なし）。**外見フィルタなし**（business_trip も対象）。
 *   同 category は **daysUntil 最小**の event を採用（dedupe）。出力は daysUntil 昇順（安定）。
 */
export function generateOneshotPrepCandidates(
  events: readonly UpcomingEvent[],
  nowISO: string
): readonly LifeOpsCandidate[] {
  // category → 最も近い適格イベント（近接 0..HORIZON・過去/不正除外）
  const nearestByCategory = new Map<PreEventPrepCategoryId, { kind: EventKind; daysUntil: number }>();
  for (const e of events) {
    const d = daysBetween(nowISO, e.startISO);
    if (d === null || d < 0 || d > EVENT_HORIZON_DAYS) continue;
    for (const catId of EVENT_PREP_MAP[e.kind]) {
      const prev = nearestByCategory.get(catId);
      if (!prev || d < prev.daysUntil) nearestByCategory.set(catId, { kind: e.kind, daysUntil: d });
    }
  }
  const out: LifeOpsCandidate[] = [];
  for (const [catId, ev] of nearestByCategory) {
    const cat = getCategorySpec(catId);
    if (!cat) continue; // 防御（L-1 未定義）
    out.push({
      category: cat.id,
      menu: null,
      dueReason: {
        kind: "event_prep",
        eventKind: ev.kind,
        daysUntilEvent: ev.daysUntil,
        recommendedLeadDays: ONESHOT_LEAD_DAYS[catId],
        // cyclePhase は省略（one-shot は周期なし）
      },
      suggestedWindow: null,
      placeQuery: cat.placeQueryHint,
      permissionLevelHint: cat.defaultMaxLevelHint,
      riskFlags: cat.typicalRiskFlags,
    });
  }
  return out
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const da = a.c.dueReason.kind === "event_prep" ? a.c.dueReason.daysUntilEvent : 0;
      const db = b.c.dueReason.kind === "event_prep" ? b.c.dueReason.daysUntilEvent : 0;
      return da !== db ? da - db : a.i - b.i;
    })
    .map((x) => x.c);
}
