/**
 * Phase 3-N Plan P2 Step 2 v3.1 — Correction Memory Frame (= Layer A 観測の受け皿)
 *
 * 設計書: docs/alter-plan-p2-llm-step2-readiness-v3.md §2 + GPT Q2 確定
 *
 * 設計原則 (= CEO + GPT 2026-05-25 G2 通過判定 Q2 採用):
 *   - **Layer A のみ実装** (= 暗黙的反応観測、 UI button なし)
 *   - **受け皿のみ** (= record interface 定義、 prompt 注入は別 Step)
 *   - **server-only** (= 既存 analytics pattern 流用、 DB 書込は未着手 / 既存 home_alter_judgment 同パターン)
 *
 * Step 2 v3.1 範囲:
 *   - 反応 event 型定義 (= AlterNoteReactionEvent)
 *   - record interface (= recordAlterNoteReaction)
 *   - メモリ adapter (= 既存 home_alter_judgment 同パターンの薄い wrapper、 別 Step で wire)
 *
 * Step 2 v3.1 やらない:
 *   - UI button 追加 (= GPT 「Layer B 禁止」)
 *   - 編集記憶収集 (= GPT 「Layer C 禁止」)
 *   - DB write 実体 (= 別 Step、 既存 analytics 同パターン)
 *   - prompt 注入 (= 別 Step、 memoryPolicy 4 段階ライフサイクル適用後)
 *
 * 既存資産流用 (= 別 Step で wire):
 *   - lib/stargazer/personalizationTracker.ts (= W1 + W6 観測パターン)
 *   - lib/stargazer/memoryPolicy.ts (= 4 段階ライフサイクル candidate → tentative → active → weakening)
 *   - 既存 home_alter_judgment analytics pattern
 */

import "server-only";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer A: 暗黙的反応 event 型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Layer A 観測 event の種類 (= UI button なしの暗黙的反応)
 *
 * - viewed: alterNote が表示された (= baseline、 全 event の前提)
 * - opened_detail: alterNote 表示後、 anchor を tap して詳細を開いた (= 「気になった」 signal)
 * - edited_anchor: alterNote 表示後、 anchor を edit (= 「違うと感じた」 signal)
 * - deleted_anchor: alterNote 表示後、 anchor を delete (= 「不要と判断」 signal)
 *
 * Step 2 v3.1 では interface 定義のみ。 実 wire は別 Step で:
 *   - PlanClient / FlowTab 内の anchor tap / edit / delete handler に hook
 *   - server action 経由で record
 */
export type AlterNoteReactionEventKind =
  | "viewed"
  | "opened_detail"
  | "edited_anchor"
  | "deleted_anchor";

/**
 * Layer A reaction event payload (= analytics record 用)
 */
export type AlterNoteReactionEvent = {
  readonly eventKind: AlterNoteReactionEventKind;
  /** 対象 anchor id */
  readonly anchorId: string;
  /** 該 anchor の alterNote text (= 表示されていた文) */
  readonly alterNoteText: string;
  /** alterNote の source (= "llm" / "deterministic"、 evaluation 用) */
  readonly alterNoteSource: "llm" | "deterministic";
  /** 該 anchor の category (= 集計用) */
  readonly category: string;
  /** 観測 timestamp (= ISO string) */
  readonly observedAt: string;
  /** Optional: user id (= 認証時のみ) */
  readonly userId?: string;
  /** Optional: session id */
  readonly sessionId?: string;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer A record interface (= Step 2 v3.1 stub、 別 Step で wire)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Layer A reaction record (= 受け皿 interface、 Step 2 v3.1 では stub)
 *
 * 役割:
 *   - 呼出側 (= PlanClient anchor handler) から event を投げ込む entry
 *   - 内部で既存 analytics layer (= home_alter_judgment 等同パターン) に書込
 *
 * Step 2 v3.1 では:
 *   - interface 定義 (= type + function signature)
 *   - fail-open stub 実装 (= 内部 console.log のみ、 DB write なし)
 *
 * 別 Step で:
 *   - 既存 home_alter_judgment analytics に書込
 *   - memoryPolicy.ts 4 段階ライフサイクルを適用 (= candidate → tentative → active)
 *   - 一定累積後に Plan prompt の system prompt に 「あなたが好まない傾向」 として注入
 *
 * 不変原則:
 *   - fail-open (= 例外 throw しない、 stub 段階では console 出力のみ)
 *   - 副作用最小 (= DB write は別 Step、 本 stub では in-memory ログのみ)
 */
export async function recordAlterNoteReaction(
  event: AlterNoteReactionEvent,
): Promise<void> {
  // Step 2 v3.1 stub: console output のみ (= 別 Step で home_alter_judgment 同パターン write 実装)
  try {
    // pseudo-analytics: 受領を log するのみ、 DB write 不在
    // (= dev / preview で受領確認のために残す、 production では別 Step で実 analytics に置換)
    if (process.env.NODE_ENV === "development") {
      console.info("[plan/alterNote/reaction] recorded", {
        eventKind: event.eventKind,
        anchorId: event.anchorId,
        alterNoteSource: event.alterNoteSource,
        category: event.category,
      });
    }
  } catch {
    // fail-open: 例外 swallow (= 観測機構の失敗で UI 機能停止させない)
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Aggregation helper (= pure、 collected events から signal を抽出)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Layer A signal summary (= collected events から導出される correction signal)
 *
 * 別 Step で memoryPolicy 4 段階適用後、 prompt builder の system prompt に注入する候補。
 *
 * 役割: 「llm 出力を edit / delete された頻度」 を集計、 平均 / 多発の場合 prompt に hint。
 */
export type AlterNoteReactionSummary = {
  readonly totalViewed: number;
  readonly llmEditedRate: number;       // 0-1
  readonly llmDeletedRate: number;      // 0-1
  readonly deterministicEditedRate: number;
  readonly deterministicDeletedRate: number;
  readonly categoryEditRates: Record<string, number>;
};

/**
 * 観測 events 配列から summary 生成 (= pure、 deterministic)
 *
 * 別 Step で実 DB read events を渡す。 Step 2 v3.1 では unit test 用に export。
 */
export function summarizeReactions(
  events: ReadonlyArray<AlterNoteReactionEvent>,
): AlterNoteReactionSummary {
  let totalViewed = 0;
  let llmViewed = 0;
  let detViewed = 0;
  let llmEdited = 0;
  let llmDeleted = 0;
  let detEdited = 0;
  let detDeleted = 0;
  const categoryViews: Record<string, number> = {};
  const categoryEdits: Record<string, number> = {};

  for (const ev of events) {
    if (ev.eventKind === "viewed") {
      totalViewed += 1;
      if (ev.alterNoteSource === "llm") llmViewed += 1;
      else detViewed += 1;
      categoryViews[ev.category] = (categoryViews[ev.category] ?? 0) + 1;
    } else if (ev.eventKind === "edited_anchor") {
      if (ev.alterNoteSource === "llm") llmEdited += 1;
      else detEdited += 1;
      categoryEdits[ev.category] = (categoryEdits[ev.category] ?? 0) + 1;
    } else if (ev.eventKind === "deleted_anchor") {
      if (ev.alterNoteSource === "llm") llmDeleted += 1;
      else detDeleted += 1;
    }
    // opened_detail は positive signal、 summary に未含 (= 別 Step 拡張)
  }

  const llmEditedRate = llmViewed > 0 ? llmEdited / llmViewed : 0;
  const llmDeletedRate = llmViewed > 0 ? llmDeleted / llmViewed : 0;
  const deterministicEditedRate = detViewed > 0 ? detEdited / detViewed : 0;
  const deterministicDeletedRate = detViewed > 0 ? detDeleted / detViewed : 0;

  const categoryEditRates: Record<string, number> = {};
  for (const [cat, views] of Object.entries(categoryViews)) {
    if (views > 0) {
      categoryEditRates[cat] = (categoryEdits[cat] ?? 0) / views;
    }
  }

  return {
    totalViewed,
    llmEditedRate,
    llmDeletedRate,
    deterministicEditedRate,
    deterministicDeletedRate,
    categoryEditRates,
  };
}
