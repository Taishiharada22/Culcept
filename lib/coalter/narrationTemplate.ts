/**
 * CoAlter Layer 3c: Narration Template (logic-only full card)
 *
 * LLM が失敗 / タイムアウトしたときでも **品質を落とさず** 提案カードを返す路線。
 * narrationBuilder の各 builder を統合するだけの薄い層だが、
 * 「LLM 無しでも完全に成立する」ことを契約として明示する。
 *
 * CEO 方針: 「品質は絶対に落としません」
 * → template = degraded ではない。事実ベースの本文を logic で直接組み立てる。
 *
 * Phase B Commit 4 (2026-04-19):
 *   theme dispatch 導入。brief.theme === "food" のときは food 用 builder 群を使う。
 *   theme: "movie" ハードコードを解消し brief.theme をそのまま反映。
 *   LLM enricher は food / movie どちらの path でも呼ばない（CEO 条件 #3）。
 */

import type {
  ConversationBrief,
  ConversationTheme,
  CoAlterPersonProfile,
  ProposalCard,
  RankedAlternative,
  RankedCandidate,
  RankedFoodAlternative,
  RankedFoodCandidate,
  RelationshipContext,
  SearchCandidate,
} from "./types";

/**
 * ConversationBrief.theme ("date" を含む) から ProposalCard.theme
 * (ConversationTheme; "date" → "activity" に正規化) へのマッピング。
 *
 * 2 つの型が別 union で宣言されているため、narration layer で明示的に橋渡しする。
 * "date" は ProposalCard.theme 側に存在しないので "activity" に倒す。
 */
function toConversationTheme(
  briefTheme: ConversationBrief["theme"],
): ConversationTheme {
  if (briefTheme === "date") return "activity";
  return briefTheme;
}
import {
  buildProposalCandidates,
  buildProposalCandidatesFood,
  buildPriorities,
  buildReasoning,
  buildSummary,
  buildSummaryFood,
  buildClosing,
  buildCandidateDetail,
  buildCandidateDetailFood,
} from "./narrationBuilder";
import { COALTER_FLAGS } from "./flags";

// ─────────────────────────────────────────────
// Movie narration input (既存互換)
// ─────────────────────────────────────────────

export interface NarrationInput {
  ranked: RankedCandidate[];
  brief: ConversationBrief;
  profileA: CoAlterPersonProfile;
  profileB: CoAlterPersonProfile;
  relationship: RelationshipContext;
  /** Phase A: bottom sheet 用の alternatives プール (上限 2) */
  alternatives?: RankedAlternative[];
  /** Phase A: URL / booking / sources 解決用の生 search 結果 */
  searchCandidates?: SearchCandidate[];
}

/**
 * Movie 用 logic-only 完全 ProposalCard を組み立てる。
 *
 * narrationEnricher が呼ばれない / 失敗したときに最終品として返る。
 * 既存呼び出し箇所との互換のため名前と shape を維持する。
 */
export function buildNarrationFromLogic(input: NarrationInput): ProposalCard {
  const { ranked, brief, profileA, profileB } = input;
  const alternatives = input.alternatives ?? [];
  const searchCandidates = input.searchCandidates ?? [];

  const baseCandidates = buildProposalCandidates(ranked);

  // Phase A (2026-04-18): 各 candidate に detail (bottom sheet 用) を attach
  // kill switch: COALTER_BOOKING_HANDOFF_ENABLED=false で detail 付与をスキップ → 旧 UI に戻る
  const attachDetail = COALTER_FLAGS.bookingHandoffEnabled;
  const candidates = baseCandidates.map((cand, i) => {
    if (!attachDetail) return cand;
    const rc = ranked[i];
    if (!rc) return cand;
    const detail = buildCandidateDetail({
      candidate: rc,
      alternatives,
      searchCandidates,
      brief,
    });
    return { ...cand, detail };
  });

  const summary = buildSummary(brief, ranked);
  const priorities = buildPriorities(ranked, brief, profileA, profileB);
  const reasoning = buildReasoning(ranked, brief);
  const closing = buildClosing();

  return {
    summary,
    priorities,
    candidates,
    reasoning,
    closing,
    // Commit 4: brief.theme を信じる（theme: "movie" ハードコード解消）。
    // ただしこの関数は movie 専用 builder を呼ぶため、実質 theme は "movie"。
    // brief.theme が movie でない呼び出しは呼び出し側の誤配線なので brief.theme をそのまま透過する。
    theme: toConversationTheme(brief.theme),
  };
}

// ─────────────────────────────────────────────
// Food narration input (Commit 4 追加)
// ─────────────────────────────────────────────

export interface FoodNarrationInput {
  ranked: RankedFoodCandidate[];
  brief: ConversationBrief;
  profileA: CoAlterPersonProfile;
  profileB: CoAlterPersonProfile;
  relationship: RelationshipContext;
  /** bottom sheet 用の alternatives プール（RankedFoodAlternative、上限 2） */
  alternatives?: RankedFoodAlternative[];
  /** URL / booking / sources 解決用の生 search 結果 */
  searchCandidates?: SearchCandidate[];
}

/**
 * Food 用 logic-only 完全 ProposalCard を組み立てる。
 *
 * 契約:
 *  - narrationEnricher は呼ばない（Commit 4 時点で食 path に接続していません。
 *    接続前に CEO 承認が必要）
 *  - venue.name / station / area / priceBand / openingHours / rating は
 *    すべて pure entity 由来。null は null のまま UI に渡す（補完しない）
 *  - alternatives は上限 2（重複除外は builder 側）
 *  - theme = brief.theme（通常 "food"）
 */
export function buildFoodNarrationFromLogic(input: FoodNarrationInput): ProposalCard {
  const { ranked, brief, profileA, profileB } = input;
  const alternatives = input.alternatives ?? [];
  const searchCandidates = input.searchCandidates ?? [];

  const baseCandidates = buildProposalCandidatesFood(ranked);

  const attachDetail = COALTER_FLAGS.bookingHandoffEnabled;
  const candidates = baseCandidates.map((cand, i) => {
    if (!attachDetail) return cand;
    const rc = ranked[i];
    if (!rc) return cand;
    const detail = buildCandidateDetailFood({
      candidate: rc,
      alternatives,
      searchCandidates,
      brief,
    });
    return { ...cand, detail };
  });

  const summary = buildSummaryFood(brief, ranked);
  // priorities / reasoning / closing は theme 非依存で共通
  // RankedFoodCandidate の役割・rationale shape は movie RankedCandidate と互換なので
  // buildPriorities / buildReasoning に流せる（SelectionRationale の共通型が根拠）
  const priorities = buildPriorities(
    // 型上は RankedCandidate[] を取る関数だが、rationale / role のみ参照するので食 ranked で代用可能。
    // 安全のため unknown 経由で構造的互換を宣言する。
    ranked as unknown as RankedCandidate[],
    brief,
    profileA,
    profileB,
  );
  const reasoning = buildReasoning(
    ranked as unknown as RankedCandidate[],
    brief,
  );
  const closing = buildClosing();

  return {
    summary,
    priorities,
    candidates,
    reasoning,
    closing,
    theme: toConversationTheme(brief.theme),
  };
}
