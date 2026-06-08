/**
 * Reality Control OS — A1-7-34 Second Self Presenter（**pure・非断定・観察トーン**・barrel 非 export）
 *
 * 設計: docs/prm-second-self-surfacing-design.md（A1-7-34）
 *
 * 役割: `SecondSelfTendency`（M3 review 済 tendency）を **断定しない・観察・共同編集トーン**の copy に変換する pure formatter。
 *   哲学（「自分って、そういう人間だったのか」）を、**trait でなく「ある状況で出やすい傾向」**として・尊厳を持って提示する。
 *
 * 厳守（哲学の絶対原則）:
 *   - **断定しない**: 「傾向が見えています」≠「あなたは〜です」。**観測** tone（"観測"・"見えています"・"かもしれません"）。
 *   - **trait 語彙を出さない**: 性格 / personality / 怠惰 / だらしない 等を使わない。文脈束縛 tendency のみ。
 *   - **counter-evidence / stillPossible を必ず併記**（過断定防止をユーザーにも見せる）。certainty ≤tentative を明示。
 *   - **correctable**: 「違っていたら直せます（あなたの観測です）」を見せる（**v1 は導線 copy のみ・write しない**）。pure・LLM 不使用。
 */

import type { SecondSelfTendency } from "./prm-model-entry-read";

/** context_dimension+value → 人間が読める文脈句（"...では"）。 */
const CONTEXT_PHRASE: Record<string, Record<string, string>> = {
  band: { morning: "朝の予定", afternoon: "午後の予定", evening: "夜の予定", none: "時間帯の決まっていない予定" },
  durationBucket: { short: "短い予定", medium: "中くらいの予定", long: "時間のかかる予定", unknown: "所要時間の不明な予定" },
  confidence: { high: "確信度が高めの提案", medium: "確信度が中くらいの提案", low: "確信度が低めの提案" },
  source: { seed_explicit: "会話から拾った予定", correction: "調整された予定" },
};
function contextPhrase(dim: string, value: string): string {
  return CONTEXT_PHRASE[dim]?.[value] ?? "ある場面";
}

/** tendency_direction → 非断定の傾向動詞（"出やすい傾向"）。 */
const TENDENCY_VERB: Record<string, string> = {
  adoption: "取り入れやすい",
  non_adoption: "見送りやすい",
  deferral: "後回しにしやすい",
};

const CERTAINTY_NOTE: Record<string, string> = {
  low: "まだ手がかりは少なめで、ゆるやかな見えかたです",
  tentative: "今のところ、ゆるやかな傾向として見えています",
};

const CORRECTION_NOTE: Record<string, string> = {
  rejected: "あなたが「これは違う」とした観測です",
  direction_adjusted: "あなたが向きを調整した観測です",
  context_refined: "あなたが文脈を補った観測です",
};

/** 第二の自己 1 件の表示 card（**全文 非断定・観察**）。 */
export interface SecondSelfCard {
  /** 観測の主文（断定しない）。 */
  readonly observation: string;
  /** 確からしさ（≤tentative）。 */
  readonly certaintyNote: string;
  /** counter-evidence（無ければ null）。 */
  readonly counterNote: string | null;
  /** 他の見方（無ければ null）。 */
  readonly stillPossibleNote: string | null;
  /** provenance（人が確認した観測）。 */
  readonly provenanceNote: string;
  /** 共同編集導線（**v1 は copy のみ・write しない**）。 */
  readonly correctable: string;
  /** ユーザー訂正状態（無ければ null）。 */
  readonly correctionState: string | null;
}

/** A1-7-34: SecondSelfTendency → 非断定 card。 */
export function presentTendency(t: SecondSelfTendency): SecondSelfCard {
  const ctx = contextPhrase(t.contextDimension, t.contextValue);
  const verb = TENDENCY_VERB[t.tendencyDirection] ?? "動きが出やすい";
  return {
    observation: `${ctx}では、${verb}傾向が見えています`,
    certaintyNote: CERTAINTY_NOTE[t.certainty] ?? "ゆるやかな見えかたです",
    counterNote: t.counterCount > 0 ? `ただし ${t.counterCount} 件は違う動きでした（決めつけてはいません）` : null,
    stillPossibleNote: t.stillPossible.length > 0 ? `別の見方も ${t.stillPossible.length} 件、残しています` : null,
    provenanceNote: t.reviewed ? "これは一度、人の目で確認した観測です" : "これは観測の途中です",
    correctable: "違っていたら、いつでも直せます（これはあなた自身の観測です）",
    correctionState: t.userCorrection ? CORRECTION_NOTE[t.userCorrection] ?? null : null,
  };
}

/** 第二の自己 surface（cards + 空状態）。 */
export interface SecondSelfView {
  readonly cards: readonly SecondSelfCard[];
  readonly isEmpty: boolean;
  /** 空状態 copy（review された tendency が無いとき）。 */
  readonly emptyNote: string;
}

/** A1-7-34: tendencies → view（空状態 copy 付き・非断定）。 */
export function presentSecondSelf(tendencies: readonly SecondSelfTendency[]): SecondSelfView {
  return {
    cards: tendencies.map(presentTendency),
    isEmpty: tendencies.length === 0,
    emptyNote: "まだ、確認された傾向はありません。観測が貯まり、人の目で一度確認されると、ここにそっと見えてきます。",
  };
}
