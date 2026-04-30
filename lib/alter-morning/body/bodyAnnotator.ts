/**
 * L2.4 Body Annotator — Comprehension-First v1.3+ Wave 3 (W3-PR-2)
 *
 * 設計書: docs/alter-morning-comprehension-first-wave3-design.md §5
 *
 * 責務:
 *   plan graph (events + grounded places) に対し、ユーザーの phenotype
 *   （personalColor / bodyType / hairType）から outfit / tone / avoid の
 *   候補群を **annotation** として添える。
 *
 * 設計原則（Wave 3 北極星）:
 *   1. plan graph を **書き換えない**（pure function）
 *   2. 候補は **複数保持**（断定しない、narration 側で hedge）
 *   3. narration に自動注入しない（C-2 固定）
 *   4. 実 LLM / 外部辞書は Wave 4+ に送る（rule-based stub から始める）
 *
 * 本関数は純関数。副作用なし。LLM 呼び出しなし。
 */

import type { Event } from "../comprehension/eventSchema";
import type { GroundedPlace } from "../planning/placeGrounder";
import { PLACE_TABLE, type PlaceCategory } from "../placeTable";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ユーザーの phenotype 入力。全 field optional（未設定ユーザーでも動作する）。
 */
export interface PhenotypeInput {
  /** パーソナルカラーシーズン（spring / summer / autumn / winter） */
  pcSeason?: "spring" | "summer" | "autumn" | "winter" | null;
  /** 骨格タイプ日本語（ストレート / ウェーブ / ナチュラル 等） */
  bodyType?: string | null;
  /** 髪質タイプ（省略可） */
  hairType?: string | null;
}

export type AnnotationConfidence = "low" | "medium" | "high";

/**
 * event_id 毎に添える body annotation。
 *
 * candidates は **複数保持**（narration 側で hedge 表現を選べるように）。
 * 全フィールドが空配列でも valid（phenotype 未設定 / 根拠が弱い場合）。
 */
export interface BodyAnnotation {
  event_id: string;
  /** 服装の提案候補（例: "ジャケット", "薄手のニット"） */
  outfit_candidates: string[];
  /** トーンの提案候補（例: "落ち着いた", "清潔感のある"） */
  tone_candidates: string[];
  /** 避けるべきもの（例: "派手な柄", "ラフすぎるサンダル"） */
  avoid_candidates: string[];
  /** 総合信頼度（phenotype 充足度 + place category 明瞭度から決まる） */
  confidence: AnnotationConfidence;
  /** 根拠トレース（pc season / bodyType / placeCategory 等） */
  basis: string[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rule tables
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Place category → outfit 候補（formal 度を変える）。
 *
 * narration に流さない前提なので候補は複数持つ（断定を避ける）。
 */
const OUTFIT_BY_CATEGORY: Partial<Record<PlaceCategory, string[]>> = {
  office: ["ジャケット", "襟付きシャツ", "きれいめパンツ"],
  hospital: ["落ち着いた服装", "羽織りもの"],
  clinic: ["落ち着いた服装", "羽織りもの"],
  restaurant: ["きれいめカジュアル", "ワンピース"],
  cafe: ["カジュアル", "リラックスした服装"],
  fast_food: ["カジュアル"],
  library: ["静かで動きやすい服装"],
  school: ["動きやすい服装"],
  coworking: ["きれいめカジュアル"],
  hotel: ["きちんとした服装"],
  gym: ["スポーツウェア"],
  park: ["動きやすい服装", "歩きやすい靴"],
  shopping: ["動きやすい服装", "歩きやすい靴"],
  station: ["歩きやすい靴"],
  entertainment: ["カジュアル"],
  convenience_store: [],
  home: [],
  other: [],
};

const AVOID_BY_CATEGORY: Partial<Record<PlaceCategory, string[]>> = {
  office: ["ラフすぎる服装"],
  hospital: ["派手な香水", "露出の多い服"],
  clinic: ["派手な香水"],
  restaurant: ["ラフすぎるサンダル"],
  hotel: ["ラフすぎるサンダル"],
  gym: ["ジーンズ"],
  park: ["ヒール"],
};

/**
 * Personal color season → tone 候補。
 */
const TONE_BY_SEASON: Record<NonNullable<PhenotypeInput["pcSeason"]>, string[]> = {
  spring: ["明るい", "澄んだ"],
  summer: ["やわらかい", "くすみ色"],
  autumn: ["深みのある", "落ち着いた"],
  winter: ["クリアで鮮やかな", "くっきりした"],
};

/**
 * 骨格タイプ（日本語）→ silhouette hint。
 * 表記揺れに対して contains マッチ。
 */
const OUTFIT_BY_BODY_JP: Array<{ match: string; outfit: string[] }> = [
  { match: "ストレート", outfit: ["すっきりしたIライン", "直線的なカット"] },
  { match: "ウェーブ", outfit: ["柔らかい素材", "曲線的なシルエット"] },
  { match: "ナチュラル", outfit: ["ラフなシルエット", "リラックスした素材感"] },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const KNOWN_CATEGORIES: PlaceCategory[] = [
  "cafe",
  "fast_food",
  "restaurant",
  "library",
  "school",
  "office",
  "home",
  "hospital",
  "clinic",
  "shopping",
  "convenience_store",
  "gym",
  "park",
  "station",
  "coworking",
  "hotel",
  "entertainment",
  "other",
];

function getCategoryForEvent(
  ev: Event,
  grounded: GroundedPlace[],
): PlaceCategory | null {
  const g = grounded.find((x) => x.event_id === ev.event_id);
  // PlaceCandidate.entryId → PLACE_TABLE で category 逆引き
  if (g?.selected?.entryId) {
    const entry = PLACE_TABLE.find((e) => e.id === g.selected?.entryId);
    if (entry) return entry.category;
  }
  // Fallback: L1 placeType が PlaceCategory 互換ならそのまま使う
  if (ev.where.placeType && (KNOWN_CATEGORIES as string[]).includes(ev.where.placeType)) {
    return ev.where.placeType as PlaceCategory;
  }
  return null;
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr.filter((x) => x && x.trim().length > 0)));
}

function deriveConfidence(
  hasCategory: boolean,
  pheno: PhenotypeInput,
): AnnotationConfidence {
  const pcDefined = Boolean(pheno.pcSeason);
  const bodyDefined = Boolean(pheno.bodyType);
  const phenoScore = (pcDefined ? 1 : 0) + (bodyDefined ? 1 : 0);
  if (hasCategory && phenoScore === 2) return "high";
  if (hasCategory || phenoScore >= 1) return "medium";
  return "low";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Entry
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * event ごとに BodyAnnotation を生成する。
 *
 * 契約:
 *   - events / grounded / phenotype を一切書き換えない
 *   - 返り値は event 数と等しい長さ（pass_through 含む）
 *   - annotation の値は narration 側で勝手に参照されない限り副作用を起こさない（C-2）
 */
export function annotateBody(
  events: Event[],
  grounded: GroundedPlace[],
  phenotype: PhenotypeInput,
): BodyAnnotation[] {
  return events.map((ev) => {
    const cat = getCategoryForEvent(ev, grounded);

    const basis: string[] = [];
    const outfit: string[] = [];
    const tone: string[] = [];
    const avoid: string[] = [];

    if (cat) {
      basis.push(`category=${cat}`);
      outfit.push(...(OUTFIT_BY_CATEGORY[cat] ?? []));
      avoid.push(...(AVOID_BY_CATEGORY[cat] ?? []));
    }

    if (phenotype.pcSeason) {
      basis.push(`pcSeason=${phenotype.pcSeason}`);
      tone.push(...(TONE_BY_SEASON[phenotype.pcSeason] ?? []));
    }

    if (phenotype.bodyType) {
      for (const rule of OUTFIT_BY_BODY_JP) {
        if (phenotype.bodyType.includes(rule.match)) {
          basis.push(`bodyType=${rule.match}`);
          outfit.push(...rule.outfit);
          break;
        }
      }
    }

    return {
      event_id: ev.event_id,
      outfit_candidates: uniq(outfit),
      tone_candidates: uniq(tone),
      avoid_candidates: uniq(avoid),
      confidence: deriveConfidence(Boolean(cat), phenotype),
      basis,
    };
  });
}
