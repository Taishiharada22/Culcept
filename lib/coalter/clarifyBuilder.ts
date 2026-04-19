/**
 * CoAlter Phase 2 — clarifyBuilder (2026-04-19 v0.3)
 *
 * 位置づけ: 誤読 / 論点ずれの是正、感情と事実の分離。**翻訳のみ**。
 *
 * 参照: docs/coalter-phase2-3mode-design.md §2.2（clarify 責務）
 *       docs/coalter-phase2-3mode-design.md §3（Intent Translation / NVC 棲み分け）
 *       docs/coalter-phase2-3mode-design.md §3.6（依存禁止表）
 *       docs/coalter-phase2-3mode-design.md §4.3（ClarifyCard 契約）
 *
 * CEO 実装固定条件（フェーズ 6.B 条件 4）:
 *  - 候補を絶対に出さない（型で担保: ClarifyCard は proposals / candidates を持たない）
 *  - neutralTranslation は **言い換え（paraphrase）のみ**
 *  - 感情調停 / 第三案提示 / 感情中立化の混入禁止
 *
 * 依存禁止表（§3.6）の遵守:
 *  - ranker / webConnector / candidate generation: **すべて不可**
 *    （このファイルで import しない）
 *  - lib/talk/intentTranslation/*: direct import **不可**
 *    （MisreadSignal の戻り値を**読むだけ**、import 経路を持たない）
 *  - nvcAnalysis direct import: 不可
 *  - LLM: 不可
 */

import type {
  ClarifyCard,
  ConversationTurn,
  MisreadSignal,
  ToneModifier,
} from "./types";

// ─────────────────────────────────────────────
// Paraphrase-only 辞書
//
// 「感情調停 / 提案 / 感情中立化」を持ち込まないため、
// ここには**語用論的な言い換え**だけを登録する。
// 感情ラベル（怒り / 悲しみ / etc）は**使わない**。
// ─────────────────────────────────────────────

const PARAPHRASE_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  // 敬語シフト / 語尾マイルド化
  { pattern: /だよ$/, replacement: "だよ（→ という意味）" },
  // 省略の補完
  { pattern: /^うん$/, replacement: "うん（→ 同意）" },
  { pattern: /^まあ$/, replacement: "まあ（→ 留保気味の同意）" },
  // 暗黙の主語明示
  { pattern: /したい$/, replacement: "（自分としては）したい" },
];

/**
 * Paraphrase ルールを順に当てて言い換え文を作る。
 * 当たらなければ null（翻訳不要と判断）。
 *
 * ここでは**感情推測や提案を一切入れない**。文字列置換のみ。
 */
function paraphrase(text: string): string | null {
  if (!text || text.trim().length === 0) return null;
  for (const { pattern, replacement } of PARAPHRASE_RULES) {
    if (pattern.test(text)) {
      return text.replace(pattern, replacement);
    }
  }
  // 長文は「主語を補った言い換え」をシンプル生成
  if (text.length >= 6 && !text.startsWith("（")) {
    return `（${text}、という発言）`;
  }
  return null;
}

// ─────────────────────────────────────────────
// 論点抽出（事実 / 感情）
// ─────────────────────────────────────────────

const FACT_MARKERS: RegExp[] = [
  /\d+\s?(時|分|円|人|日)/,
  /(駅|徒歩|分|円)/,
  /(\d+\s?年|\d+\s?月|\d+\s?日)/,
];

const FEELING_MARKERS: RegExp[] = [
  /(嬉しい|悲しい|疲れた|しんどい|だるい|気分|楽しい|つらい|不安|心配|申し訳)/,
  /(〜たい|〜たくない)/,
];

function classify(text: string): "fact" | "feeling" | null {
  if (!text || text.trim().length === 0) return null;
  const isFact = FACT_MARKERS.some((p) => p.test(text));
  const isFeeling = FEELING_MARKERS.some((p) => p.test(text));
  if (isFact && !isFeeling) return "fact";
  if (isFeeling && !isFact) return "feeling";
  if (isFact && isFeeling) return "fact"; // 事実優先
  return null;
}

function extractPointList(
  turns: ConversationTurn[],
): { facts: string[]; feelings: string[] } {
  const facts: string[] = [];
  const feelings: string[] = [];
  for (const t of turns) {
    const cls = classify(t.body ?? "");
    if (cls === "fact") facts.push(t.body);
    else if (cls === "feeling") feelings.push(t.body);
  }
  return { facts, feelings };
}

// ─────────────────────────────────────────────
// clarify builder
// ─────────────────────────────────────────────

export interface ClarifyBuilderInput {
  misread: MisreadSignal;
  recentTurns: ConversationTurn[];
  userAId: string;
  userBId: string;
  tone: ToneModifier;
}

/**
 * ClarifyCard を組み立てる。logic-only、翻訳のみ。
 *
 * 契約:
 *  - candidates / proposals は**型に存在しない**（§4.3 の shape 定義で保証）
 *  - neutralTranslation.aToB / bToA は **paraphrase のみ**
 *  - tone.maxQuestion === 0 または target 不明 → question は null
 */
export function buildClarifyCard(input: ClarifyBuilderInput): ClarifyCard {
  const { misread, recentTurns, userAId, userBId, tone } = input;

  // anchor メッセージ（誤読の基点）を取得
  const anchor =
    misread.anchorMessageId
      ? recentTurns.find((t) => t.id === misread.anchorMessageId)
      : null;

  // 言い換え: direction に応じて A→B または B→A の 1 方向
  // anchor が無い場合は null（翻訳不能 = 感情調停に走らない）
  let aToB: string | null = null;
  let bToA: string | null = null;
  if (anchor) {
    if (misread.direction === "a_to_b") {
      aToB = paraphrase(anchor.body);
    } else if (misread.direction === "b_to_a") {
      bToA = paraphrase(anchor.body);
    }
  }

  // 論点（事実 / 感情）
  const pointList = extractPointList(recentTurns);

  // summary は「ずれがある」事実のみを記述。感情推測や助言を含めない。
  const summary = misread.direction
    ? `${misread.direction === "a_to_b" ? "A さん" : "B さん"}の発言の意図が、${misread.direction === "a_to_b" ? "B さん" : "A さん"}に別の意味で届いている可能性。`
    : "2 人の間で話の論点がずれている可能性。";

  // question は maxQuestion=0 なら出さない、direction が不明なら target 不定で出さない
  const canAskQuestion = tone.maxQuestion === 1 && misread.direction !== null;
  const question: ClarifyCard["question"] = canAskQuestion
    ? {
        target: misread.direction === "a_to_b" ? "a" : "b",
        text: "この発言は、どういう意味で言った？",
      }
    : null;

  // closing は tone によって柔らかさだけ変える（提案は入れない）
  const closing = tone.softenClosing
    ? "ここが少しズレてそうなので、ゆっくり確認してみて。"
    : "ここがズレてそうなので、確認してみて。";

  return {
    mode: "clarify",
    summary,
    pointList,
    neutralTranslation: { aToB, bToA },
    question,
    closing,
  };
}

/**
 * neutralTranslation が「翻訳のみ」に閉じていることを検証する runtime ガード。
 * paraphrase 禁止キーワードを含んでいないかを確認する（テストと本実装の両方で使う）。
 */
export function assertParaphraseOnly(translated: string | null): void {
  if (translated === null) return;
  // 禁止: 感情調停 / 提案 / 感情中立化 / 助言
  const FORBIDDEN = [
    /本当は/,
    /気持ちは/,
    /こうすべき/,
    /〜してあげて/,
    /提案/,
    /別の候補/,
    /別の店/,
    /こういう店/,
    /代わりに/,
  ];
  for (const p of FORBIDDEN) {
    if (p.test(translated)) {
      throw new Error(
        `neutralTranslation contract violated: paraphrase 以外の表現が混入 (${p.source})`,
      );
    }
  }
}
