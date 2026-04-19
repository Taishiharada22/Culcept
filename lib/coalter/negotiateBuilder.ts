/**
 * CoAlter Phase 2 — negotiateBuilder (2026-04-19 v0.3)
 *
 * 位置づけ: 対立が検出されたときに **「第三案の方向を作る」** レイヤー。
 *           decision pipeline を置き換えない。materialization（候補の具体化）は
 *           既存 ranker（foodRanker / movieRanker）に利害軸ヒントを渡して委譲する。
 *
 * 参照: docs/coalter-phase2-3mode-design.md §2.2（negotiate の責務境界）
 *       docs/coalter-phase2-3mode-design.md §3.6（依存禁止表）
 *       docs/coalter-phase2-3mode-design.md §4.2（NegotiateCard 契約）
 *
 * CEO 実装固定条件（フェーズ 6.B 条件 3）:
 *  - proposals = 0 件は **失敗ではなく正常系**。既存 catalog で materialize できない
 *    ときは pieExpansion 非空だけで返す。
 *  - closing は proposals.length === 0 の場合、「次ターンで decision 再実行」を示す。
 *
 * 依存禁止表の遵守（§3.6）:
 *  - webConnector: **原則不可**（このファイルから import しない）
 *  - foodRanker / movieRanker: 条件付き可（利害軸ヒント付き再実行のみ）
 *  - lib/talk/intentTranslation/*: 不可
 *  - LLM 呼び出し: 不可
 *
 * 本ファイルでは ranker を**直接 import しない**。呼び出し側（narrationTemplate）が
 * ranker を回し、その結果を本 builder に渡す設計にする（依存方向を一方通行化）。
 */

import type {
  AxisKey,
  ContradictionSignal,
  NegotiateCard,
  ProposalCandidate,
  ToneModifier,
} from "./types";

// ─────────────────────────────────────────────
// 対立軸 → pie expansion の方向生成
// ─────────────────────────────────────────────

/** 軸 → pieExpansion の日本語表現テンプレート */
const AXIS_EXPANSION_TEMPLATES: Partial<Record<AxisKey, {
  axisShift: string | null;
  timeShift: string | null;
  placeShift: string | null;
}>> = {
  quietness: {
    axisShift: "静かさを2人のあいだに置ける個室・半個室を候補に含めてみる",
    timeShift: "時間帯をずらして混雑を避けると、静かさの前提が揃う",
    placeShift: "エリアをずらすと違う雰囲気の店が出てくる",
  },
  atmosphere: {
    axisShift: "雰囲気の中間（落ち着き × ほどよく賑やか）を軸にする",
    timeShift: "時間帯で雰囲気が変わる店を候補にする",
    placeShift: null,
  },
  price: {
    axisShift: "コース or 単品のどちらかに寄せて、予算の中間帯に収める",
    timeShift: "ランチ帯にずらすと予算の折り合いがつきやすい",
    placeShift: null,
  },
  access: {
    axisShift: "中間駅を基点にすると通勤負担が均等になる",
    timeShift: null,
    placeShift: "2人の中間地点で再検索する方向に振る",
  },
  novelty: {
    axisShift: "新しさ × 馴染みの折衷（同系統の別店舗）を狙う",
    timeShift: null,
    placeShift: null,
  },
  tone: {
    axisShift: "トーンの中間（重すぎない × 軽すぎない）を基準にする",
    timeShift: null,
    placeShift: null,
  },
  runtime: {
    axisShift: "上映時間の中間帯（120分前後）に絞る",
    timeShift: "開始時刻をずらして、全体の体感時間を調整する",
    placeShift: null,
  },
  activity: {
    axisShift: "アクティブ × 休息の混合プランにする",
    timeShift: null,
    placeShift: null,
  },
  relaxation: {
    axisShift: "ゆっくり度合いを二人の中間で取る",
    timeShift: null,
    placeShift: null,
  },
  flexibility: {
    axisShift: "柔軟枠と固定枠を組み合わせる",
    timeShift: null,
    placeShift: null,
  },
  effort: {
    axisShift: "準備の負担を半分ずつ分担できるプランにする",
    timeShift: null,
    placeShift: null,
  },
};

function buildPieExpansion(axes: AxisKey[]): NegotiateCard["pieExpansion"] {
  // 最初に見つかった軸のテンプレートを採用（軸 0 件のときは全て null）
  for (const ax of axes) {
    const tmpl = AXIS_EXPANSION_TEMPLATES[ax];
    if (tmpl) return { ...tmpl };
  }
  return { axisShift: null, timeShift: null, placeShift: null };
}

// ─────────────────────────────────────────────
// NegotiateCard 構築
// ─────────────────────────────────────────────

export interface NegotiateBuilderInput {
  contradiction: ContradictionSignal;
  /** 呼び出し側が既存 ranker を利害軸ヒント付きで再実行した結果（0-3 件） */
  rerankedProposals: ProposalCandidate[];
  /** Post-router modifier からの語調 */
  tone: ToneModifier;
}

/** 完全空の NegotiateCard を禁じるガード */
function assertNonEmpty(card: NegotiateCard): void {
  const pieExpFilled =
    card.pieExpansion.axisShift !== null ||
    card.pieExpansion.timeShift !== null ||
    card.pieExpansion.placeShift !== null;
  if (card.proposals.length === 0 && !pieExpFilled) {
    throw new Error(
      "NegotiateCard invariant violated: proposals が空なら pieExpansion は非空である必要がある",
    );
  }
}

/**
 * NegotiateCard を組み立てる。logic-only。
 *
 * 契約:
 *  - proposals.length === 0 は正常系（pieExpansion だけで意味を持つ）
 *  - proposals.length === 0 の closing は「次ターンで具体案」を明示
 *  - pieExpansion が完全空かつ proposals も 0 件の場合は throw（不変条件違反）
 *
 * @throws Error 完全空のカードが生成された場合
 */
export function buildNegotiateCard(input: NegotiateBuilderInput): NegotiateCard {
  const { contradiction, rerankedProposals, tone } = input;

  const summary = contradiction.detected
    ? `${contradiction.stanceA ?? "A さんの希望"} と、${contradiction.stanceB ?? "B さんの希望"} で方向が分かれている。`
    : "2 人の希望の差を整理する。";

  // interests は対立の stance を非交渉として、軸を交渉可とする素朴な骨格
  const interests: NegotiateCard["interests"] = {
    a: {
      nonNegotiable: contradiction.stanceA ? [contradiction.stanceA] : [],
      negotiable: contradiction.axes.map((ax) => ax as string),
    },
    b: {
      nonNegotiable: contradiction.stanceB ? [contradiction.stanceB] : [],
      negotiable: contradiction.axes.map((ax) => ax as string),
    },
  };

  const pieExpansion = buildPieExpansion(contradiction.axes);

  const proposals = rerankedProposals.slice(0, 3);

  // closing は proposals の有無で分岐
  const closingProposal =
    proposals.length === 0
      ? "この方向で再検討してみよう。次のターンで具体案を出す。"
      : "これで合うかは 2 人で決めてね。";

  const closing = tone.softenClosing
    ? closingProposal.replace("この方向で", "ゆっくりこの方向で").replace("。", "…。")
    : closingProposal;

  const card: NegotiateCard = {
    mode: "negotiate",
    summary,
    interests,
    pieExpansion,
    proposals,
    closing,
  };

  assertNonEmpty(card);
  return card;
}
