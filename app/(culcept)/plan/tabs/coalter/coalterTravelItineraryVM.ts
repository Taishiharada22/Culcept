/**
 * C6-A — Travel itinerary 表示 VM（**pure・display-safe・solver 出力 → UI**）
 *
 * 役割: 既存決定論 solver `generateTravelItineraries` の出力（`TravelItineraryGeneratorOutput`）を、
 *   CoAlter パネルの「具体行程（試作）」カードが描く display-safe VM へ写す純関数。
 *
 * honest / M5（捏造ゼロ・privacy）:
 *   - 時刻は **離散スロット（朝/昼/午後/夕方/夜）**＝偽の精密時刻を出さない（solver の TravelTimeSlot 由来）。
 *   - rationale は **synthesis（shared）のみ**表示。`perUserA` / `perUserB`（本人向け private）は **載せない**（M5 leak 防止）。
 *   - placeId は opaque code。表示名は caller が渡す demo label map で解決（無ければ code 素通し）。
 *   - reasonCode は enum を JA ラベルへ（未知 code は素通し＝誤訳より素直）。
 *   - solver / 入力 seed は無改修。本 VM は写像のみ（DB / fetch / 時刻 API なし）。
 */

import type {
  TravelItineraryGeneratorOutput,
  TravelItineraryFeasibilityNoteCode,
} from "@/lib/coalter/travel/itinerary";
// ★ server/display preparation only（UI は呼ばない）。本 VM builder は route から server 実行される。
import { prepareTravelExternalLinkHrefModels } from "@/lib/shared/travel/travel-external-link-preparation";
import { buildCoAlterDayContingency, type DayContingencyVM } from "./coalterDayContingency";
import type {
  TravelActivityType,
  TravelAnchorLevel,
  TravelParetoAxis,
  TravelTimeSlot,
  TravelUncertaintyLabel,
} from "@/lib/coalter/travel/types";

const SLOT_JA: Record<TravelTimeSlot, string> = {
  morning: "朝",
  noon: "昼",
  afternoon: "午後",
  evening: "夕方",
  night: "夜",
};

const ACTIVITY_JA: Record<TravelActivityType, string> = {
  sightseeing: "観光",
  meal: "食事",
  lodging: "宿泊",
  transport: "移動",
  experience: "体験",
  rest: "休憩",
};

const PARETO_JA: Record<TravelParetoAxis, string> = {
  cheap_far: "費用を抑える案",
  near_expensive: "近場で快適な案",
  balanced: "バランス案",
  slow_pace: "ゆっくり案",
  intense_pace: "盛りだくさん案",
};

const UNCERTAINTY_JA: Record<TravelUncertaintyLabel, string> = {
  high_confidence: "確度は高い",
  mid_confidence: "おおよそ確か",
  low_confidence: "情報は少なめ",
  info_lacking: "要確認（情報不足）",
};

const FEASIBILITY_JA: Record<TravelItineraryFeasibilityNoteCode, string> = {
  transit_missing_between_destinations: "目的地間の移動が未確定",
  lodging_missing_for_first_night: "1 泊目の宿が未定",
  lodging_missing_for_second_night: "2 泊目の宿が未定",
  meal_node_missing_for_evening: "夕食の予定が未定",
  rest_node_recommended: "休憩を 1 つ挟むと安心",
  anchor_density_low: "予定が少なめ（余白多め）",
  anchor_density_high: "やや詰め込み気味",
  weather_dependent_in_rain_warning: "雨だと変更が要る予定あり",
  seasonal_mismatch_warning: "季節が少し外れる予定あり",
  pair_together_ratio_low_warning: "二人別行動が多めの構成",
};

export interface ItineraryNodeVM {
  timeLabel: string;
  placeLabel: string;
  activityLabel: string;
  /** anchor=確定 / wander=現地で調整余地 */
  anchor: boolean;
  /** 体力負荷 1..5 */
  fatigue: number;
  /** ★ M3: 予約直前リンク（Maps/safe・非権威・外部 handoff）。confirmed(anchor) 場所のみ生成され得る。 */
  links: { label: string; href: string }[];
}

export interface ItineraryDayVM {
  /** 「1 日目」「2 日目」 */
  dayLabel: string;
  nodes: ItineraryNodeVM[];
}

export interface ItineraryCandidateVM {
  /** 1-based */
  rank: number;
  /** pareto 特徴（JA） */
  paretoLabel: string;
  /** 不確実性（JA） */
  uncertaintyLabel: string;
  /** 二人合意点の説明（shared のみ・private 非搭載＝M5） */
  synthesis: string;
  /** 予算帯ラベル（〜N万円） */
  budgetLabel: string;
  /** 日ごとの行程（宿泊 node を境に分割・スロット順） */
  days: ItineraryDayVM[];
  /** 注意点（feasibility note・JA） */
  warnings: string[];
}

export interface TravelItineraryVM {
  /** true = preview 用 demo seeds。UI にバッジ表示する。 */
  demo: boolean;
  /** ランク順候補（非空・空なら builder が null を返す）。 */
  candidates: ItineraryCandidateVM[];
  /** honest note（時刻はスロット目安・実経路で確定）。 */
  note: string;
  /** ★ P2: 当日の備え（solver ネイティブ事前分岐・雨/疲れ/移動）。 */
  contingency?: DayContingencyVM;
  /** ★ P2: 提案の確度ひとこと（solver の uncertaintyLabel 由来）。 */
  readinessNote?: string;
  /** ★ P3: 前回からの学び（後悔台帳→次回制約・今回反映した点）。 */
  regretReflection?: string[];
}

function budgetLabel(hi: number): string {
  if (hi >= 10000) {
    const man = Math.round((hi / 10000) * 10) / 10;
    return `〜${Number.isInteger(man) ? man : man.toFixed(1)}万円`;
  }
  return `〜${Math.max(0, Math.round(hi)).toLocaleString("ja-JP")}円`;
}

const NOTE = "時刻は「朝・昼・午後…」の目安です（実際の経路・所要は場所確定後に算出）。デモ用の候補です。";

/** 宿泊 node を境に日を分割（宿泊を当日末に含め、次 node から翌日）。 */
function splitIntoDays(items: { isLodging: boolean; vm: ItineraryNodeVM }[]): ItineraryDayVM[] {
  const days: ItineraryDayVM[] = [];
  let current: ItineraryNodeVM[] = [];
  for (const it of items) {
    current.push(it.vm);
    if (it.isLodging) {
      days.push({ dayLabel: `${days.length + 1} 日目`, nodes: current });
      current = [];
    }
  }
  if (current.length > 0) days.push({ dayLabel: `${days.length + 1} 日目`, nodes: current });
  return days;
}

/**
 * solver 出力 → 具体行程 VM（rankedCandidates 空なら null）。決定論・副作用なし。
 *   @param placeLabels placeId（opaque code）→ 表示名の demo map（無い code は素通し）。
 */
export function buildCoAlterTravelItineraryVM(
  output: TravelItineraryGeneratorOutput,
  placeLabels: Record<string, string>,
  opts?: { regretReflection?: string[] },
): TravelItineraryVM | null {
  if (output.rankedCandidates.length === 0) return null;

  // candidate 共通の feasibility note（candidateId 無し）＋当該候補向けを集約。
  const generalWarnings = output.feasibilityNotes
    .filter((n) => !n.candidateId)
    .map((n) => FEASIBILITY_JA[n.reasonCode] ?? n.reasonCode);

  const candidates: ItineraryCandidateVM[] = output.rankedCandidates.map((rc) => {
    const it = rc.candidate.itinerary;
    const perCandWarnings = output.feasibilityNotes
      .filter((n) => n.candidateId === rc.candidate.candidateId)
      .map((n) => FEASIBILITY_JA[n.reasonCode] ?? n.reasonCode);

    return {
      rank: rc.rank,
      paretoLabel: PARETO_JA[rc.candidate.paretoAxis] ?? rc.candidate.paretoAxis,
      uncertaintyLabel: UNCERTAINTY_JA[rc.uncertaintyLabel] ?? rc.uncertaintyLabel,
      // ★ M5: shared synthesis のみ。perUserA / perUserB は構造的に載せない。
      synthesis: rc.candidate.rationale.synthesis,
      budgetLabel: budgetLabel(it.budgetBand.hi),
      // 宿泊 node を境に日を分割（TravelNode は day index を持たないため・宿泊までを当日に含める）。
      days: splitIntoDays(
        it.nodes.map((n) => ({
          isLodging: n.type === "lodging" || n.activityType === "lodging",
          vm: {
            timeLabel: SLOT_JA[n.startTime] ?? n.startTime,
            placeLabel: placeLabels[n.placeId] ?? n.placeId,
            activityLabel: ACTIVITY_JA[n.activityType] ?? n.activityType,
            anchor: n.anchorLevel === ("anchor" satisfies TravelAnchorLevel),
            fatigue: n.fatigueLoad,
            // ★ M3: 予約直前リンク。anchor=確定 shared 場所のみ eligible（既存 ladder が gate）。
            links: prepareTravelExternalLinkHrefModels({
              entity: {
                label: placeLabels[n.placeId] ?? n.placeId,
                confirmed: n.anchorLevel === ("anchor" satisfies TravelAnchorLevel),
                visibility: "shared",
              },
            }).map((m) => ({ label: m.label, href: m.handoffUrl })),
          },
        })),
      ),
      warnings: [...new Set([...perCandWarnings, ...generalWarnings])],
    };
  });

  // ★ P2: 当日の備え（事前分岐）+ 確度ひとこと（solver の事実から）。
  const contingency = buildCoAlterDayContingency(output) ?? undefined;
  const topUnc = output.rankedCandidates[0]?.uncertaintyLabel;
  const readinessNote =
    topUnc === "high_confidence" || topUnc === "mid_confidence"
      ? "この内容で提案できます"
      : topUnc
        ? "もう少し情報があると、より確かにできます"
        : undefined;

  const regretReflection = opts?.regretReflection && opts.regretReflection.length > 0 ? opts.regretReflection : undefined;

  return { demo: true, candidates, note: NOTE, contingency, readinessNote, regretReflection };
}
