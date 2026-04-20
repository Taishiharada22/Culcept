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
import type { TwoPersonLensToday } from "./understanding/types";
import type { FoodLensToday } from "./understanding/foodLensAdapter";

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
  /**
   * F-2 / F-3 (2026-04-20): Stage 1 Understand の lens と food 翻訳を受け取る
   * optional 入力。
   *
   * 供給時: F-3 Personality-Rooted 5 要素 narration に使う。
   * 未供給時: 従来 brief-only 経路で logic fallback（互換性保持）。
   */
  lens?: TwoPersonLensToday;
  foodLensToday?: FoodLensToday;
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
  // F-3 (2026-04-20): Personality-Rooted 5 要素 reasoning
  //
  //   lens + foodLensToday が供給されていれば 5 要素 narration を logic で組む。
  //   未供給時は従来 buildReasoning にフォールバック（互換性維持）。
  //
  //   5 要素（doc §2.3.3）:
  //     personA_lens  : A さんの判断原理 × 今日の空気
  //     personB_lens  : B さんの判断原理 × 今日の空気
  //     relational_fit: 2人の関係性 × 店の雰囲気
  //     today_hook    : 今日の会話・気分 × 店選定の接続
  //     veto_guard    : 避けたいもの（avoid/dislikes）は外した旨
  const reasoning =
    input.lens && input.foodLensToday
      ? buildFoodPersonalityRootedReasoning({
          ranked,
          brief,
          profileA,
          profileB,
          lens: input.lens,
          foodLensToday: input.foodLensToday,
        })
      : buildReasoning(ranked as unknown as RankedCandidate[], brief);
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

// ─────────────────────────────────────────────
// F-3: Personality-Rooted 5 要素 reasoning (logic-only)
// ─────────────────────────────────────────────

interface PersonalityRootedInput {
  ranked: RankedFoodCandidate[];
  brief: ConversationBrief;
  profileA: CoAlterPersonProfile;
  profileB: CoAlterPersonProfile;
  lens: TwoPersonLensToday;
  foodLensToday: FoodLensToday;
}

/**
 * Personality-Rooted 5 要素 reasoning を logic で組む。
 *
 * 契約:
 *  - LLM を使わない。lens / foodLensToday から短文を決定論的に合成する
 *  - 5 要素を「。」区切りで 1 つの reasoning string に畳む
 *    （ProposalCard.reasoning は string 型。UI 側の構造要件を壊さない）
 *  - lens.sourcedFrom に該当観測が無い軸は「一般論」になるため元の buildReasoning
 *    に倒してよい、が本 F-3 では 5 要素を「空で書かない」方針（= skip）で欠落を許す
 *  - 一般論（「人気」「口コミ」「ランキング」）は書かない（doc §2.3.3 禁止事項）
 */
function buildFoodPersonalityRootedReasoning(
  input: PersonalityRootedInput,
): string {
  const { ranked, brief, profileA, profileB, lens, foodLensToday } = input;
  const parts: string[] = [];

  const personA = buildPersonLensSentence(
    profileA,
    lens.personalLenses.a,
    "A",
  );
  if (personA) parts.push(personA);

  const personB = buildPersonLensSentence(
    profileB,
    lens.personalLenses.b,
    "B",
  );
  if (personB) parts.push(personB);

  const relational = buildRelationalFitSentence(lens, foodLensToday);
  if (relational) parts.push(relational);

  const todayHook = buildTodayHookSentence(lens, foodLensToday);
  if (todayHook) parts.push(todayHook);

  const veto = buildVetoGuardSentence(lens, profileA, profileB);
  if (veto) parts.push(veto);

  // Gap B (doc §2.3.3): fairnessAdjustment がある場合は 6 番目要素として note を追加。
  //   rationale は narration 引用可（types.ts §2.4）。
  const fairnessNote = buildFairnessNoteSentence(lens);
  if (fairnessNote) parts.push(fairnessNote);

  // 要素が一つも埋まらない場合は従来 reasoning にフォールバック（防御）
  if (parts.length === 0) {
    return buildReasoning(ranked as unknown as RankedCandidate[], brief);
  }
  return parts.join("。") + "。";
}

function buildPersonLensSentence(
  profile: CoAlterPersonProfile,
  lens: TwoPersonLensToday["personalLenses"]["a"],
  fallbackLabel: "A" | "B",
): string | null {
  const name = lens.displayName || profile.displayName || fallbackLabel;
  const principle = lens.coreDecisionPrinciples[0]?.trim();
  const hue = lens.currentEmotionalHue?.trim();
  if (!principle && !hue) return null;
  // Gap A (doc §2.3.3 item 6): narration に 1 箇所以上、由来引用を含める。
  //   sourcedFrom の非空バケツから priority 順（stargazer > alter > behavioral）で
  //   1 件だけ prefix として使う。PII は出さない（category のみ）。
  const prefix = buildSourcedFromPrefix(lens.sourcedFrom);
  const head = prefix ? `${prefix}、` : "";
  if (principle && hue) {
    return `${head}${name}さんは${principle}を大事にする人で、今は「${hue}」の空気`;
  }
  if (principle) return `${head}${name}さんは${principle}を大事にする人`;
  return `${head}${name}さんは今「${hue}」の空気`;
}

/**
 * sourcedFrom 由来引用の prefix を組む。
 * 優先度: stargazer > alter > behavioral。全 empty なら null。
 * 生テキスト（quote / summary）は出さない — カテゴリ名のみ（[CEO lock 2026-04-20 A]）。
 */
function buildSourcedFromPrefix(
  sourced: TwoPersonLensToday["personalLenses"]["a"]["sourcedFrom"],
): string | null {
  if (sourced.stargazer.length > 0) return "Stargazer の観測では";
  if (sourced.alter.length > 0) return "Alter の記録では";
  if (sourced.behavioral.length > 0) return "普段の行動から";
  return null;
}

function buildRelationalFitSentence(
  lens: TwoPersonLensToday,
  food: FoodLensToday,
): string | null {
  const temp = lens.relationalLens.temperature;
  const atmos = food.foodContext.atmosphereDesire;
  const tempLabel: Record<typeof temp, string> = {
    warm: "温かい",
    neutral: "落ち着いた",
    cool: "少し距離のある",
  };
  const quietLabel: Record<typeof atmos.quietness, string | null> = {
    quiet: "静かで",
    moderate: "ほどよい賑わいで",
    lively: "賑やかで",
    either: null,
  };
  const lightLabel: Record<typeof atmos.lighting, string | null> = {
    warm_low: "光は温かく落とした",
    neutral: "光は自然な",
    bright: "明るい",
    either: null,
  };
  const bits = [quietLabel[atmos.quietness], lightLabel[atmos.lighting]]
    .filter((s): s is string => !!s)
    .join("・");
  if (!bits) {
    return `2人の今日は${tempLabel[temp]}空気に合う店を選んだ`;
  }
  return `2人の今日は${tempLabel[temp]}空気で、${bits}店を選んだ`;
}

function buildTodayHookSentence(
  lens: TwoPersonLensToday,
  food: FoodLensToday,
): string | null {
  const intent = lens.todayReading.implicitIntent?.trim();
  const mood = food.foodContext.moodTags[0];
  if (!intent && !mood) return null;
  if (intent && mood) {
    return `今日の『${mood}』な流れから、${intent}を一回受け止められる形にした`;
  }
  if (mood) return `今日の『${mood}』な流れに合わせた`;
  return `今日の会話の「${intent}」を受け止められる形にした`;
}

function buildVetoGuardSentence(
  lens: TwoPersonLensToday,
  _profileA: CoAlterPersonProfile,
  _profileB: CoAlterPersonProfile,
): string | null {
  const avoids = new Set<string>();
  for (const a of lens.relationalLens.avoidElements ?? []) {
    const t = a.trim();
    if (t) avoids.add(t);
  }
  const list = Array.from(avoids).slice(0, 2);
  if (list.length === 0) return null;
  return `${list.join("・")}は外した`;
}

function buildFairnessNoteSentence(
  lens: TwoPersonLensToday,
): string | null {
  const fa = lens.fairnessAdjustment;
  if (!fa || fa.favorSide == null) return null;
  const rationale = fa.rationale?.trim();
  if (!rationale) return null;
  const sideName =
    fa.favorSide === "a"
      ? lens.personalLenses.a.displayName || "A"
      : lens.personalLenses.b.displayName || "B";
  return `今日は${sideName}さんに少し寄せた（${rationale}）`;
}

// テスト用 export
export const __narrationInternal = {
  buildFoodPersonalityRootedReasoning,
  buildPersonLensSentence,
  buildRelationalFitSentence,
  buildTodayHookSentence,
  buildVetoGuardSentence,
  buildFairnessNoteSentence,
  buildSourcedFromPrefix,
};
