/**
 * Conversation Starter — 入力欄クリック時の先行メッセージ制御
 *
 * ユーザーがAlterの入力欄をクリックした瞬間に、
 * Alterから先に左側バブルで時間帯に応じたメッセージを1通送る。
 *
 * 4時間帯:
 * - morning  (5:00-11:59)  → 予定整理 or 進捗
 * - afternoon(12:00-16:59) → 予定整理(未確定) or 進捗(確定済み)
 * - evening  (17:00-22:59) → ジャーナル誘導
 * - night    (23:00-4:59)  → 軽い締め（質問なし）
 *
 * プラン状態:
 * - none:        予定未開始 → 予定整理starter
 * - in_progress: 途中離脱 → 前回文脈を引いて聞き直す
 * - confirmed:   予定確定 → 進捗/ジャーナル/締めに切り替え
 *
 * ルール:
 * - 各時間帯で1回のみ
 * - Home表示時は出さない（入力欄クリック時のみ）
 * - 14:59まで予定未確定なら15:00以降は予定starterの効力なし
 */

import { todayJST, currentHourJST } from "./dateUtils";
import type { PlanItem, PlanItemKind } from "./types";

const STORAGE_KEY = "alter_conversation_starter_v2";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 時間帯
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type TimeSlot = "morning" | "afternoon" | "evening" | "night";

function getTimeSlot(hour: number): TimeSlot {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 23) return "evening";
  return "night"; // 23:00-4:59
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// プラン状態
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type PlanStatus = "none" | "in_progress" | "confirmed";

export interface StarterState {
  /** 今日の日付（日付変更でリセット） */
  date: string;
  /** 各時間帯で表示済みか */
  shownSlots: TimeSlot[];
  /** プラン状態 */
  planStatus: PlanStatus;
  /** 途中離脱時のアイテム（前回文脈復帰用） */
  partialItems: Array<{ text: string; kind: PlanItemKind; startTime?: string }>;
}

function emptyState(): StarterState {
  return {
    date: todayJST(),
    shownSlots: [],
    planStatus: "none",
    partialItems: [],
  };
}

export function loadStarterState(): StarterState {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as StarterState;
    // 日付が変わったらリセット
    if (parsed.date !== todayJST()) return emptyState();
    return parsed;
  } catch {
    return emptyState();
  }
}

function saveStarterState(state: StarterState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* storage full */ }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// プラン状態の更新（外部から呼ばれる）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * プランが確定した時に呼ぶ。
 */
export function markPlanConfirmed(): void {
  const state = loadStarterState();
  saveStarterState({ ...state, planStatus: "confirmed", partialItems: [] });
}

/**
 * プラン作成中（途中状態）のアイテムを保存する。
 * アプリを閉じても次回復帰できるようにする。
 */
export function savePartialItems(items: PlanItem[]): void {
  const state = loadStarterState();
  saveStarterState({
    ...state,
    planStatus: "in_progress",
    partialItems: items.map((i) => ({
      text: i.text,
      kind: i.kind,
      startTime: i.startTime,
    })),
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Starter 判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface StarterDecision {
  /** starterを出すか */
  shouldShow: boolean;
  /** メッセージ内容 */
  message: string;
  /** 現在の時間帯 */
  slot: TimeSlot;
  /** プラン状態 */
  planStatus: PlanStatus;
}

/**
 * 入力欄クリック時に starter を出すべきか判定し、メッセージを返す。
 */
export function getStarterDecision(): StarterDecision {
  const state = loadStarterState();
  const hour = currentHourJST();
  const slot = getTimeSlot(hour);

  const noShow: StarterDecision = {
    shouldShow: false,
    message: "",
    slot,
    planStatus: state.planStatus,
  };

  // この時間帯で既に表示済み — ただし in_progress（途中離脱）の場合は再表示を許可
  if (state.shownSlots.includes(slot) && state.planStatus !== "in_progress") return noShow;

  // メッセージを構築
  const message = buildStarterMessage(slot, state, hour);
  if (!message) return noShow;

  return {
    shouldShow: true,
    message,
    slot,
    planStatus: state.planStatus,
  };
}

/**
 * starter を表示した後に呼ぶ。
 */
export function markStarterShown(slot: TimeSlot): void {
  const state = loadStarterState();
  saveStarterState({
    ...state,
    shownSlots: [...state.shownSlots, slot],
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メッセージ構築
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildStarterMessage(
  slot: TimeSlot,
  state: StarterState,
  hour: number
): string | null {
  switch (slot) {
    case "morning":
      return buildMorningMessage(state, hour);
    case "afternoon":
      return buildAfternoonMessage(state);
    case "evening":
      return buildEveningMessage(state);
    case "night":
      return buildNightMessage(state);
  }
}

function buildMorningMessage(state: StarterState, hour: number): string {
  const greeting = hour < 10 ? "おはよう。" : "おはよう。";

  switch (state.planStatus) {
    case "none":
      return `${greeting}今日はどんな1日にする？\nやりたいこと、決まってる予定、なんでも教えて`;
    case "in_progress": {
      const itemsSummary = state.partialItems
        .map((i) => i.text)
        .join("、");
      if (itemsSummary) {
        return `${greeting}さっき${itemsSummary}って聞いたけど、他にも何かある？`;
      }
      return `${greeting}さっきの続きだけど、今日の予定もう少し教えて`;
    }
    case "confirmed":
      // 予定確定済み → morning slotでは出さない（afternoonで進捗確認）
      return `${greeting}今日のプランもう決まってるね。何か気になることある？`;
  }
}

function buildAfternoonMessage(state: StarterState): string {
  switch (state.planStatus) {
    case "none":
      // 14:59まで予定未確定→15:00以降はplanの効力なし
      return "こんにちは。午後の予定はもう決まってる？";
    case "in_progress": {
      const itemsSummary = state.partialItems
        .map((i) => i.text)
        .join("、");
      if (itemsSummary) {
        return `さっき${itemsSummary}って聞いたけど、午後は他にも何かある？`;
      }
      return "さっきの続きだけど、午後の予定はどんな感じ？";
    }
    case "confirmed":
      return "午後の調子はどう？ プランの進み具合、教えて";
  }
}

function buildEveningMessage(state: StarterState): string {
  switch (state.planStatus) {
    case "confirmed":
      return "今日もお疲れさま。プランの振り返り、記録しておく？";
    default:
      return "今日もお疲れさま。記録残しておく？";
  }
}

function buildNightMessage(_state: StarterState): string {
  // 深夜は軽い締めのみ。追加質問なし。
  return "お疲れさま。ゆっくり休んでね";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// W3-PR-10 positive-path nudge — 1件目 place 確定直後の follow-up
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 目的:
//   自然会話フローで 2 件目 place が確定されず positive-path telemetry
//   (segment_count > 0 / travel_rendered_count > 0) が発火しない問題に対し、
//   1 件目 place 確定直後に Alter 側から軽く次の立ち寄り先を尋ねる nudge を
//   出して、自然な 2 件目進行を促す。
//
// 設計方針（CEO 2026-04-24 承認範囲）:
//   - DialogState / reducer / ConversationStatus 一切変更しない
//   - derivePendingClarify / clarify kind 追加しない
//   - planReadinessGate の ready 判定も変更しない（1-place plan を引き続き ready とみなす）
//   - DB dialogues への永続化もしない（UI 上の nudge のみで目的を果たす）
//   - 固定テンプレ v1（LLM 非呼び出し）。place 名差し込みは後続の personalization で検討
//   - flag 判定 (transportV2 allowlist) は caller 側で行う。本 helper は flag 非依存の pure functions のみ提供
//
// 呼び出し口: app/api/stargazer/alter/selection/route.ts のみ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 1 件目 place 確定直後に Alter が自然に次の立ち寄り先を尋ねる文（固定テンプレ v1）。
 *
 * 方針:
 *   - 短く、プレッシャーなく、1-place plan 完結も許容する問い
 *   - place 名や時刻の差し込みはしない（personalization は後続 PR）
 *   - 決定論的（A/B 計測容易）
 */
export function buildNextPlaceAskText(): string {
  return "このあと、どこか寄る？";
}

/**
 * predicate helper で参照する event の最小 shape。
 *   - `where.coordinates` が non-null かつ lat/lng が finite number なら「解決済み」とみなす
 *   - これは buildTransportSegments が segment 生成の前提としている判定と同じ軸
 *     （lib/alter-morning/planning/planRebuild.ts:hasCoordinates）
 *   - 実際の Event 型から必要な field のみを structural subset として拾う
 */
export interface EventWithCoordinates {
  where?: {
    coordinates?: { lat: number; lng: number } | null;
  };
}

/**
 * events のうち、segment build 前提を満たす（= coordinates 解決済み）place 数を数える。
 *
 * 判定軸は buildTransportSegments.hasCoordinates と一致させる:
 *   - `where.coordinates` が non-null
 *   - lat, lng がともに finite number
 */
export function countConfirmedPlacesInEvents(
  events: ReadonlyArray<EventWithCoordinates>,
): number {
  let count = 0;
  for (const ev of events) {
    const c = ev?.where?.coordinates;
    if (!c) continue;
    if (typeof c.lat !== "number" || !Number.isFinite(c.lat)) continue;
    if (typeof c.lng !== "number" || !Number.isFinite(c.lng)) continue;
    count += 1;
  }
  return count;
}

/**
 * Predicate A — ちょうどこのターンで 1 件目 place が confirm された？
 *
 *   prev=0 件解決済み && next=1 件解決済み の両方を満たせば true。
 *   2 件目以降の confirm / 既存 plan の修正では false。
 *   差分ベースで判定するため、連続 click や session 復元などの edge case にも耐える。
 */
export function justConfirmedFirstPlace(
  prevEvents: ReadonlyArray<EventWithCoordinates>,
  nextEvents: ReadonlyArray<EventWithCoordinates>,
): boolean {
  return (
    countConfirmedPlacesInEvents(prevEvents) === 0 &&
    countConfirmedPlacesInEvents(nextEvents) === 1
  );
}

/**
 * Predicate B — plan にすでに 2 件以上 place が confirm されている？
 *
 *   Predicate A が真なら必ず false（冗長）だが、設計書の narrow 条件を明示するため
 *   独立した述語として持つ。異常 event graph の defense in depth にもなる。
 */
export function hasMultiplePlaces(
  events: ReadonlyArray<EventWithCoordinates>,
): boolean {
  return countConfirmedPlacesInEvents(events) >= 2;
}

/**
 * ユーザーが直近のターンで「終了意思」を示したか。
 *
 * 対象パターン: 「これだけ」「以上」「終わり」「直接帰る」「まっすぐ帰る」「もう寝る」系
 * 走査対象: DialogState.capturedHistory の直近 N ターン（rawSpan に対して regex match）
 *
 * 注意: capturedHistory は append-only log なので末尾が直近。
 * lookbackTurns は defense として 3 turn を default（最近 3 ターン内に終了意思あり = nudge 抑制）。
 */
const END_SIGNAL_PATTERNS: readonly RegExp[] = [
  /これだけ/,
  /それだけ/,
  /以上(です|かな|だ|$)/,
  /これで(いい|終わり|おしまい|大丈夫|十分)/,
  /終わり(です|だ|$)/,
  /直接帰る/,
  /まっすぐ帰る/,
  /(家|自宅|うち)に(帰る|戻る)/,
  /(もう|今日は)(寝る|休む)/,
];

export interface CapturedHistoryLike {
  capture: { rawSpan: string };
}

export function userSignaledEnd(
  capturedHistory: ReadonlyArray<CapturedHistoryLike>,
  lookbackTurns: number = 3,
): boolean {
  if (lookbackTurns <= 0) return false;
  const recent = capturedHistory.slice(-lookbackTurns);
  for (const h of recent) {
    const span = h?.capture?.rawSpan;
    if (typeof span !== "string" || span.length === 0) continue;
    for (const rx of END_SIGNAL_PATTERNS) {
      if (rx.test(span)) return true;
    }
  }
  return false;
}

/**
 * selection endpoint が alterFollowUp を注入すべきか最終判定する narrow trigger。
 *
 * 条件（全 AND）:
 *   A. このターンで 1 件目 place が confirm された         (justConfirmedFirstPlace)
 *   B. まだ複数 place に到達していない                     (!hasMultiplePlaces)
 *   C. ユーザーが終了意思を示していない                    (!userSignaledEnd)
 *
 * flag 判定 (transportV2 allowlist) は caller が担う（本 helper は flag 非依存）。
 */
export function shouldAskNextPlace(args: {
  prevEvents: ReadonlyArray<EventWithCoordinates>;
  nextEvents: ReadonlyArray<EventWithCoordinates>;
  capturedHistory: ReadonlyArray<CapturedHistoryLike>;
}): boolean {
  return (
    justConfirmedFirstPlace(args.prevEvents, args.nextEvents) &&
    !hasMultiplePlaces(args.nextEvents) &&
    !userSignaledEnd(args.capturedHistory)
  );
}
