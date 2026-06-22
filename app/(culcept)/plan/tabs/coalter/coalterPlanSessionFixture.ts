/**
 * CoAlter /plan タブ — fixture data（UI プロトタイプ専用）
 *
 * 契約正本: docs/coalter-plan-tab-backend-contract-draft.md §3（CoAlterPlanSession v0）
 *   - 型は契約スケッチに「近い形」で安定させる（CEO 指示 2026-06-12）。
 *   - UI 側にしか存在しない投影（messages / participants / header / statLabels /
 *     route の正規化座標）は契約外の **UI 専権フィールド** として明示的に分離して持つ。
 *   - 本 file は **pure data のみ**: fetch なし / DB なし / route なし / backend import なし。
 *     UI 統合時に本 fixture を実 payload に差し替える前提で、shape を崩さないこと。
 *
 * One session, two projections（契約 §2）:
 *   左 Plan Intelligence パネルと右チャットは **同一 session の2つの射影**。
 *   conditions / adjustments / candidates を両パネルが共有 consume する。
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 契約準拠の型（contract draft §3 スケッチに対応）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { BudgetBand, Pace } from "@/lib/shared/travel/core-types";
import type { DescriptorKey, MobilityToleranceValue, TimeWindowValue } from "@/lib/shared/travel/slot-types";

export type CoAlterPlanMode = "daily" | "travel";

export type SharedConditionKind =
  | "mobility"
  | "time"
  | "place_quality"
  | "budget"
  | "pace"
  | "other";

export interface SharedConditionFixture {
  readonly id: string;
  /** 例「移動は軽め」 */
  readonly label: string;
  readonly kind: SharedConditionKind;
  readonly severity: "red_line" | "hard" | "soft" | "preference";
  /** profile_prior = M2 PersonalizationPort 由来（本 slice では fixture 表現のみ・未接続） */
  readonly source: "chat" | "profile_prior" | "correction_memory";
  /** M5 説明プライバシー: private はチャット要約に出さない */
  readonly visibility: "shared" | "private";
  /**
   * C6-A-1: engine 入力用の構造化 hint（additive・optional）。
   *   label の意訳 parse を避け、condition の engine 意図を fixture 作者が明示する。
   *   `coalterSessionToTravelEvents` が `SessionSurfaceEvent` へ写像（severity→red_line/soft_preference）。
   *   hint 不在の condition は engine に渡さない（honest: 扱えない意味を捏造しない）。
   */
  readonly engineHint?: CoAlterConditionEngineHint;
}

/** condition → engine slot 入力の hint（C6-A-1・travel core 値型を再利用・runtime 依存なし）。 */
export type CoAlterConditionEngineHint =
  | { readonly slot: "mobility_tolerance"; readonly value: MobilityToleranceValue }
  | { readonly slot: "time_window"; readonly value: TimeWindowValue }
  | { readonly slot: "budget_band"; readonly value: BudgetBand }
  | { readonly slot: "pace"; readonly value: Pace }
  | { readonly slot: "descriptor"; readonly descriptorKey: DescriptorKey; readonly descriptorValue: string };

/** 地図描画用の正規化ノード（viewBox 0-100 × 0-64 座標。UI 専権） */
export interface RouteNodeFixture {
  readonly order: number;
  readonly label: string;
  /** 0-100 */
  readonly x: number;
  /** 0-64 */
  readonly y: number;
  readonly tone: "sky" | "violet" | "fuchsia" | "blue" | "emerald";
}

export interface PlanCandidateFixture {
  readonly id: string;
  /** 例「水辺とアートを楽しむ一日」 */
  readonly title: string;
  readonly tags: readonly [string, string];
  readonly recommended: boolean;
  readonly stats: {
    readonly walkKm: number;
    readonly budgetBand: 1 | 2 | 3 | 4;
    /** 例 "20:40" / "翌 18:30" */
    readonly returnEta: string;
    readonly slack: "tight" | "normal" | "roomy";
  };
  readonly route: { readonly nodes: readonly RouteNodeFixture[] };
}

export interface AdjustmentSuggestionFixture {
  readonly id: string;
  /** 例「ランチをもっと近くに」 */
  readonly label: string;
  /** 効果プレビュー文。例「移動が 0.4km 減ります」 */
  readonly detail: string;
  readonly icon: "route" | "time" | "budget";
  readonly effectPreview: {
    readonly walkKmDelta?: number;
    readonly returnEtaNew?: string;
    readonly costPct?: number;
  };
  /** candidateId */
  readonly appliesTo: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UI 専権の投影（契約外。チャット面・ヘッダ描画用）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PairParticipantFixture {
  readonly id: string;
  readonly name: string;
  readonly initial: string;
  readonly tone: "sky" | "rose";
}

export interface ChatMessageFixture {
  readonly id: string;
  /** participant id か "coalter" */
  readonly author: string;
  /** 表示用時刻。例 "10:24" */
  readonly time: string;
  readonly text: string;
  /** リアクション=条件への同意シグナル（契約 §1-8。UI では表示のみ） */
  readonly reaction?: { readonly emoji: string; readonly count: number };
}

export interface CoAlterPlanSessionFixture {
  readonly id: string;
  /**
   * @deprecated 契約 v0.1（CEO 承認 2026-06-12）で **root pairStateId は廃止**。
   * session の identity 正本は `participants`（→ `coalterPlanSessionContract.ts` の
   * `CoAlterPlanSession`）。本 field は fixture 後方互換のため残すだけで **読まれない**
   * （`buildSessionContractFromFixture` も無視）。thread への参照は `attachedThreadRef?`。
   * 新コードはこの field に依存しないこと。
   */
  readonly pairStateId: string | null;
  readonly mode: CoAlterPlanMode;
  readonly window:
    | { readonly date: string }
    | { readonly start: string; readonly end: string; readonly nights: 1 | 2 };
  /**
   * C6-A-1: 行き先エリア（engine の destination_area hard 前提に供給）。
   *   CoAlter は「行き先は決まり、何をするかを 2 人で詰める」段階の demo。
   *   未指定なら engine は not_ready_missing（destination を聞く）になる。
   */
  readonly destinationArea?: string;
  readonly stage: "understanding" | "curating" | "resolving" | "confirmed";
  readonly conditions: readonly SharedConditionFixture[];
  readonly candidates: readonly PlanCandidateFixture[];
  readonly selectedCandidateId: string | null;
  readonly adjustments: readonly AdjustmentSuggestionFixture[];

  // ── 以下 UI 専権 ──
  readonly participants: readonly PairParticipantFixture[];
  readonly messages: readonly ChatMessageFixture[];
  readonly header: {
    /** 例「2026年6月14日（日）」「6月20日（土）〜21日（日）・1泊」 */
    readonly dateLabel: string;
    readonly weather: { readonly icon: "sun" | "cloud"; readonly high: number; readonly low: number };
  };
  /** 統計パネルの label はモードで変わる（旅行=想定帰着 等） */
  readonly statLabels: {
    readonly distance: string;
    readonly distanceSub: string;
    readonly slack: string;
    readonly eta: string;
  };
  /** 地図の雰囲気づけ用エリア名（hero map のみ・faint 表示） */
  readonly areaLabels: readonly { readonly x: number; readonly y: number; readonly text: string }[];
  /** クイックアクションに昇格させる調整 id（左パネルと同一操作の別ビュー＝契約 §1-6） */
  readonly quickActionAdjustmentIds: readonly [string, string];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixture: 日常モード（日帰り・既知ペア Kento × Mio）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PAIR_PARTICIPANTS: readonly PairParticipantFixture[] = [
  { id: "kento", name: "Kento", initial: "K", tone: "sky" },
  { id: "mio", name: "Mio", initial: "M", tone: "rose" },
];

const DAILY_SESSION: CoAlterPlanSessionFixture = {
  id: "fixture-session-daily",
  pairStateId: "fixture-pair",
  mode: "daily",
  window: { date: "2026-06-14" },
  destinationArea: "都内エリア",
  stage: "curating",
  conditions: [
    { id: "c-mobility", label: "移動は軽め", kind: "mobility", severity: "soft", source: "chat", visibility: "shared", engineHint: { slot: "mobility_tolerance", value: { maxWalkKm: 3 } } },
    { id: "c-time", label: "20:00 まで", kind: "time", severity: "hard", source: "chat", visibility: "shared", engineHint: { slot: "time_window", value: { returnByMin: 1200 } } },
    { id: "c-place", label: "会話しやすい場所", kind: "place_quality", severity: "soft", source: "chat", visibility: "shared", engineHint: { slot: "descriptor", descriptorKey: "scene", descriptorValue: "conversational" } },
    { id: "c-budget", label: "予算：ミディアム", kind: "budget", severity: "preference", source: "profile_prior", visibility: "shared", engineHint: { slot: "budget_band", value: { lo: 5000, hi: 15000, confidence: 0.6, currency: "JPY" } } },
  ],
  candidates: [
    {
      id: "cand-a",
      title: "水辺とアートを楽しむ一日",
      tags: ["ゆったり", "アート重視"],
      recommended: true,
      stats: { walkKm: 2.8, budgetBand: 2, returnEta: "20:40", slack: "roomy" },
      route: {
        nodes: [
          { order: 1, label: "駅前カフェ", x: 16, y: 14, tone: "sky" },
          { order: 2, label: "美術館", x: 24, y: 30, tone: "violet" },
          { order: 3, label: "ランチ", x: 40, y: 22, tone: "fuchsia" },
          { order: 4, label: "川沿い散歩", x: 62, y: 26, tone: "blue" },
          { order: 5, label: "夕食", x: 78, y: 44, tone: "emerald" },
        ],
      },
    },
    {
      id: "cand-b",
      title: "下町グルメと路地歩き",
      tags: ["グルメ", "フォトジェニック"],
      recommended: false,
      stats: { walkKm: 3.6, budgetBand: 3, returnEta: "20:30", slack: "normal" },
      route: {
        nodes: [
          { order: 1, label: "商店街", x: 14, y: 36, tone: "sky" },
          { order: 2, label: "甘味処", x: 34, y: 18, tone: "violet" },
          { order: 3, label: "路地カフェ", x: 52, y: 34, tone: "fuchsia" },
          { order: 4, label: "夕食", x: 76, y: 20, tone: "emerald" },
        ],
      },
    },
    {
      id: "cand-c",
      title: "公園とカフェでリラックス",
      tags: ["自然", "のんびり"],
      recommended: false,
      stats: { walkKm: 2.3, budgetBand: 2, returnEta: "20:05", slack: "roomy" },
      route: {
        nodes: [
          { order: 1, label: "大きな公園", x: 20, y: 20, tone: "sky" },
          { order: 2, label: "ベンチでお茶", x: 42, y: 34, tone: "violet" },
          { order: 3, label: "ブックカフェ", x: 60, y: 18, tone: "blue" },
          { order: 4, label: "夕食", x: 80, y: 36, tone: "emerald" },
        ],
      },
    },
  ],
  selectedCandidateId: "cand-a",
  adjustments: [
    {
      id: "adj-near",
      label: "ランチをもっと近くに",
      detail: "移動が 0.4km 減ります",
      icon: "route",
      effectPreview: { walkKmDelta: -0.4 },
      appliesTo: "cand-a",
    },
    {
      id: "adj-early",
      label: "帰宅を少し早める",
      detail: "19:45 頃に調整できます",
      icon: "time",
      effectPreview: { returnEtaNew: "19:45" },
      appliesTo: "cand-a",
    },
    {
      id: "adj-budget",
      label: "予算を少し下げる",
      detail: "コストを 10% 抑えられます",
      icon: "budget",
      effectPreview: { costPct: -10 },
      appliesTo: "cand-a",
    },
  ],
  participants: PAIR_PARTICIPANTS,
  messages: [
    {
      id: "msg-1",
      author: "kento",
      time: "10:24",
      text: "移動はあまり長くしたくないかな。20時には帰りたいです。",
      reaction: { emoji: "👍", count: 1 },
    },
    {
      id: "msg-2",
      author: "mio",
      time: "10:25",
      text: "カフェや美術館でゆっくり話せる時間があると嬉しいな〜",
      reaction: { emoji: "❤️", count: 1 },
    },
    {
      id: "msg-3",
      author: "coalter",
      time: "10:26",
      text: "おふたりの希望をまとめました。",
    },
    {
      id: "msg-4",
      author: "coalter",
      time: "10:26",
      text: "移動は軽めに、会話しやすい場所を中心に。20:00 までに帰れる3つの案を左のパネルに用意しています。",
    },
  ],
  header: {
    dateLabel: "2026年6月14日（日）",
    weather: { icon: "sun", high: 26, low: 18 },
  },
  statLabels: {
    distance: "移動の合計",
    distanceSub: "徒歩中心",
    slack: "予定の余裕",
    eta: "想定帰宅",
  },
  areaLabels: [
    { x: 30, y: 42, text: "中央区" },
    { x: 72, y: 56, text: "川沿いエリア" },
  ],
  quickActionAdjustmentIds: ["adj-near", "adj-budget"],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixture: 旅行モード（1泊2日・同一ペア / 条件は引き継ぎつつ窓幅が変わる＝契約 §2）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TRAVEL_SESSION: CoAlterPlanSessionFixture = {
  id: "fixture-session-travel",
  pairStateId: "fixture-pair",
  mode: "travel",
  window: { start: "2026-06-20", end: "2026-06-21", nights: 1 },
  destinationArea: "箱根",
  stage: "curating",
  conditions: [
    { id: "t-onsen", label: "温泉のある宿", kind: "place_quality", severity: "hard", source: "chat", visibility: "shared", engineHint: { slot: "descriptor", descriptorKey: "require", descriptorValue: "onsen" } },
    { id: "t-move", label: "移動は2時間まで", kind: "mobility", severity: "soft", source: "chat", visibility: "shared", engineHint: { slot: "mobility_tolerance", value: { maxWalkKm: 5 } } },
    { id: "t-pace", label: "2日目はゆっくり出発", kind: "pace", severity: "soft", source: "chat", visibility: "shared", engineHint: { slot: "pace", value: "slow" } },
    { id: "t-budget", label: "予算：2人で4万円台", kind: "budget", severity: "preference", source: "profile_prior", visibility: "shared", engineHint: { slot: "budget_band", value: { lo: 40000, hi: 49999, confidence: 0.6, currency: "JPY" } } },
  ],
  candidates: [
    {
      id: "trip-a",
      title: "海辺の温泉宿でのんびり一泊",
      tags: ["温泉", "海景色"],
      recommended: true,
      stats: { walkKm: 4.2, budgetBand: 3, returnEta: "翌 18:30", slack: "roomy" },
      route: {
        nodes: [
          { order: 1, label: "特急で移動", x: 14, y: 16, tone: "sky" },
          { order: 2, label: "港の食堂", x: 32, y: 30, tone: "violet" },
          { order: 3, label: "海辺の宿", x: 54, y: 22, tone: "fuchsia" },
          { order: 4, label: "朝の浜歩き", x: 70, y: 38, tone: "blue" },
          { order: 5, label: "帰路", x: 86, y: 24, tone: "emerald" },
        ],
      },
    },
    {
      id: "trip-b",
      title: "高原の美術館とカフェめぐり",
      tags: ["アート", "涼しい"],
      recommended: false,
      stats: { walkKm: 5.1, budgetBand: 3, returnEta: "翌 19:10", slack: "normal" },
      route: {
        nodes: [
          { order: 1, label: "高原駅", x: 18, y: 30, tone: "sky" },
          { order: 2, label: "美術館", x: 38, y: 16, tone: "violet" },
          { order: 3, label: "森のカフェ", x: 58, y: 30, tone: "blue" },
          { order: 4, label: "宿", x: 78, y: 18, tone: "emerald" },
        ],
      },
    },
    {
      id: "trip-c",
      title: "古い港町をぶらり食べ歩き",
      tags: ["グルメ", "路地歩き"],
      recommended: false,
      stats: { walkKm: 6.0, budgetBand: 2, returnEta: "翌 17:40", slack: "tight" },
      route: {
        nodes: [
          { order: 1, label: "港町到着", x: 16, y: 22, tone: "sky" },
          { order: 2, label: "市場", x: 36, y: 36, tone: "fuchsia" },
          { order: 3, label: "坂の上の神社", x: 56, y: 20, tone: "violet" },
          { order: 4, label: "宿", x: 80, y: 32, tone: "emerald" },
        ],
      },
    },
  ],
  selectedCandidateId: "trip-a",
  adjustments: [
    {
      id: "t-adj-near",
      label: "宿をもう少し駅近に",
      detail: "歩きが 0.8km 減ります",
      icon: "route",
      effectPreview: { walkKmDelta: -0.8 },
      appliesTo: "trip-a",
    },
    {
      id: "t-adj-late",
      label: "2日目の出発を遅らせる",
      detail: "帰着は翌 19:00 頃になります",
      icon: "time",
      effectPreview: { returnEtaNew: "翌 19:00" },
      appliesTo: "trip-a",
    },
    {
      id: "t-adj-budget",
      label: "予算を少し下げる",
      detail: "コストを 8% 抑えられます",
      icon: "budget",
      effectPreview: { costPct: -8 },
      appliesTo: "trip-a",
    },
  ],
  participants: PAIR_PARTICIPANTS,
  messages: [
    {
      id: "t-msg-1",
      author: "kento",
      time: "21:08",
      text: "来週末、1泊でどこか行かない？あんまり遠くないところで。",
      reaction: { emoji: "👍", count: 1 },
    },
    {
      id: "t-msg-2",
      author: "mio",
      time: "21:10",
      text: "温泉いいなあ。2日目は朝ゆっくりしたい！",
      reaction: { emoji: "♨️", count: 1 },
    },
    {
      id: "t-msg-3",
      author: "coalter",
      time: "21:11",
      text: "おふたりの希望をまとめました。",
    },
    {
      id: "t-msg-4",
      author: "coalter",
      time: "21:11",
      text: "移動2時間以内で温泉に入れる方面を中心に、1泊2日の案を3つ用意しました。2日目はどの案もゆっくり出発です。",
    },
  ],
  header: {
    dateLabel: "6月20日（土）〜21日（日）・1泊",
    weather: { icon: "cloud", high: 24, low: 17 },
  },
  statLabels: {
    distance: "移動の合計",
    distanceSub: "電車＋徒歩",
    slack: "行程の余裕",
    eta: "想定帰着",
  },
  areaLabels: [
    { x: 28, y: 48, text: "海沿い" },
    { x: 74, y: 52, text: "温泉街" },
  ],
  quickActionAdjustmentIds: ["t-adj-near", "t-adj-budget"],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const COALTER_PLAN_SESSION_FIXTURES: Readonly<
  Record<CoAlterPlanMode, CoAlterPlanSessionFixture>
> = {
  daily: DAILY_SESSION,
  travel: TRAVEL_SESSION,
};

export const COALTER_MODE_LABELS: Readonly<Record<CoAlterPlanMode, string>> = {
  daily: "日常プラン",
  travel: "旅行プラン",
};

/** 候補の表示用レター（案A / 案B / 案C） */
export function candidateLetter(index: number): string {
  return ["A", "B", "C", "D"][index] ?? String(index + 1);
}

/**
 * 増分編集（適用済み調整）を候補 stats に反映した表示用 stats を導出する。
 * 契約 §1-5「適用前に効果が分かる」のローカル投影（UI 内 pure 計算・backend なし）。
 */
export function deriveDisplayStats(
  candidate: PlanCandidateFixture,
  appliedAdjustments: readonly AdjustmentSuggestionFixture[],
): { walkKm: number; returnEta: string; costPct: number } {
  let walkKm = candidate.stats.walkKm;
  let returnEta = candidate.stats.returnEta;
  let costPct = 0;
  for (const adj of appliedAdjustments) {
    if (adj.appliesTo !== candidate.id) continue;
    if (typeof adj.effectPreview.walkKmDelta === "number") {
      walkKm = Math.max(0, walkKm + adj.effectPreview.walkKmDelta);
    }
    if (adj.effectPreview.returnEtaNew) {
      returnEta = adj.effectPreview.returnEtaNew;
    }
    if (typeof adj.effectPreview.costPct === "number") {
      costPct += adj.effectPreview.costPct;
    }
  }
  return { walkKm: Math.round(walkKm * 10) / 10, returnEta, costPct };
}
