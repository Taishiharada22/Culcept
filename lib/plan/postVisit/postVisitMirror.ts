/**
 * lib/plan/postVisit/postVisitMirror.ts
 *   — 評価OS / Stage 0: 「観測の鏡」（pure・cold-start の felt-value 橋）
 *
 * ★狙い: モデルが薄いうちは推薦精度を出せない。代わりに **ユーザー自身の回答を仮説トーンで言語化して返す**
 *   ことで information gap を埋め、「自分ってそういう傾向だったのか」の前借りをする。
 * ★絶対原則: **断定しない（常に仮説トーン）**・**薄い時は沈黙（null）＝捏造より沈黙**・evidence 件数を必ず添える。
 *   推薦/ranking には一切影響しない（表示専用の鏡）。
 * ★pure: Date/network/DB なし。
 */
import {
  REASON_CHIP_LABEL,
  type PostVisitObservation,
  type PostVisitResponse,
  type ReasonChipKey,
} from "./postVisitObservation";

/** 鏡が言及できる最小観測数（これ未満は沈黙＝捏造回避）。 */
export const MIRROR_MIN_OBSERVATIONS = 3;
/** パターンと呼べる最小 support（回答済みのうち、同方向がこれ以上）。 */
export const MIRROR_MIN_SUPPORT = 2;

export interface MirrorReflection {
  /** 仮説トーンの一文（断定しない）。 */
  readonly text: string;
  /** 何由来のパターンか。 */
  readonly basis: "tendency" | "reason";
  /** 根拠となった観測件数（honesty・必ず添える）。 */
  readonly observationCount: number;
  /** 常に仮説（型レベルで断定を禁止）。 */
  readonly tentative: true;
}

function mostCommon<T extends string>(items: readonly T[]): { key: T; count: number } | null {
  if (items.length === 0) return null;
  const counts = new Map<T, number>();
  for (const it of items) counts.set(it, (counts.get(it) ?? 0) + 1);
  let best: { key: T; count: number } | null = null;
  for (const [key, count] of counts) {
    if (!best || count > best.count) best = { key, count };
  }
  return best;
}

/**
 * 観測群から「観測の鏡」を組む（pure）。
 *   - 観測 < MIRROR_MIN_OBSERVATIONS → null（沈黙）。
 *   - 回答済みの中で「また候補に残す/もういい」等の傾向が support 閾値以上 → 傾向を仮説トーンで返す。
 *   - それが弱ければ、頻出 reason chip を仮説トーンで返す。
 *   - どちらも閾値未満 → null（捏造より沈黙）。
 * 返す text は常に「〜傾向が見えました（まだ仮説です）」型。断定形は作らない。
 */
export function buildObservationMirror(observations: readonly PostVisitObservation[]): MirrorReflection | null {
  const total = observations.length;
  if (total < MIRROR_MIN_OBSERVATIONS) return null; // 薄い → 沈黙

  // ① 回答傾向（keep/no_more の偏り）
  const answered = observations.map((o) => o.response).filter((r): r is PostVisitResponse => r != null);
  const topResp = mostCommon(answered);
  if (topResp && topResp.count >= MIRROR_MIN_SUPPORT) {
    const phrase = RESPONSE_TENDENCY_PHRASE[topResp.key];
    if (phrase) {
      return {
        text: `${phrase}（観測 ${topResp.count}/${total} 件・まだ仮説です）`,
        basis: "tendency",
        observationCount: topResp.count,
        tentative: true,
      };
    }
  }

  // ② 頻出 reason chip（その他は鏡に使わない）
  const chips = observations.flatMap((o) => o.reasonChips).filter((c): c is ReasonChipKey => c !== "other");
  const topChip = mostCommon(chips);
  if (topChip && topChip.count >= MIRROR_MIN_SUPPORT) {
    return {
      text: `「${REASON_CHIP_LABEL[topChip.key]}」と感じた場面が続いている傾向が見えました（${topChip.count} 件・まだ仮説です）`,
      basis: "reason",
      observationCount: topChip.count,
      tentative: true,
    };
  }

  return null; // パターン弱い → 沈黙（捏造しない）
}

/** 回答傾向 → 仮説トーン句（断定しない・なじむ場所/避ける傾向の言語化）。 */
const RESPONSE_TENDENCY_PHRASE: Partial<Record<PostVisitResponse, string>> = {
  keep: "気に入った場所は次も候補に残す傾向が見えました",
  no_more: "合わないと感じた場所は早めに候補から外す傾向が見えました",
  conditional: "場所を「条件次第」で見極める慎重な傾向が見えました",
  not_today: "その日の状態で合う場所が変わる傾向が見えました",
};
