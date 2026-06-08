/**
 * Reality Control OS — R2-3 Empty-day Reason Builder / Readiness（**pure・no-UI/DB/route**・barrel 非 export）
 *
 * 設計: docs/r2-empty-day-asset-audit-and-boundary.md / docs/reality-secretary-os-unbuilt-roadmap.md（R2）
 *
 * 役割: R2-2 の `EmptyDayProposal` と `EmptyDayInput` から「**なぜその日にそれを入れるか**」を **非断定**に組む pure 層。
 *   time/energy/weather/mobility fit・memory 根拠・permission risk・confidence(≤tentative)・readiness を構造化する。
 *
 * 厳守: 非断定 copy（trait / fixed preference / liked-disliked を断定しない）・certainty high 禁止・
 *   **正本型を作らない**（PlanCandidate / LifeOpsCandidate に変換しない）・pure・Date.now なし。
 */

import type { MemoryLeaning } from "../learning/memory-model";
import type { DecisionBand } from "../learning/prm-alter-bridge";
import type { EmptyDayInput } from "./empty-day-input";
import type { EmptyDayProposal, EmptyDayProposalSet, EmptyDayTier } from "./empty-day-generator";

export type FitLevel = "good" | "ok" | "caution";

export interface EmptyDayReasoning {
  readonly tier: EmptyDayTier;
  readonly fits: {
    readonly time: FitLevel;
    readonly energy: FitLevel;
    readonly weather: FitLevel;
    readonly mobility: FitLevel;
  };
  /** 影響した memory の非断定根拠（空=memory 不使用）。 */
  readonly memoryBasis: readonly string[];
  /** 提案でなく実行に進む際の確認要否（R2 は提案のみゆえ低 permission で確認推奨）。 */
  readonly permissionRisk: "none" | "confirm_recommended";
  /** ≤tentative（high なし）。 */
  readonly confidence: "low" | "tentative";
  readonly readiness: "draft" | "ready_to_show";
  /** 非断定 copy。 */
  readonly lines: readonly string[];
}

const NEUTRAL_ENERGY = 0.6;
const BAD_WEATHER = new Set(["rain", "snow", "storm"]);
const TIER_INTENT_LINE: Record<EmptyDayTier, string> = {
  protect: "予定を詰めすぎず、余白を残す組み方です",
  easy: "回復を優先する、軽めの組み方です",
  push: "前に進めたいこと向けの、動きの多い組み方です",
};
const BAND_LABEL: Record<DecisionBand, string> = { morning: "朝", afternoon: "午後", evening: "夜", none: "ある時間帯" };
const LEANING_VERB: Record<MemoryLeaning, string> = {
  toward_adopting: "取り入れやすい",
  toward_declining: "見送りやすい",
  toward_deferring: "後回しにしやすい",
};

function timeFit(p: EmptyDayProposal): FitLevel {
  const total = p.activeMinutes + p.restMinutes;
  if (total === 0) return "ok";
  const restFraction = p.restMinutes / total;
  if (restFraction === 0) return "caution"; // 余白ゼロ＝詰めすぎ
  return restFraction < 0.2 ? "ok" : "good";
}
function energyFit(p: EmptyDayProposal, energy: number): FitLevel {
  if (p.strain === "high" && energy < 0.5) return "caution"; // 疲れた日に高負荷
  if (p.strain === "high") return "ok";
  return p.strain === "low" ? "good" : "ok";
}
function weatherFit(p: EmptyDayProposal, weather: EmptyDayInput["weather"]): FitLevel {
  if (weather == null) return "ok";
  if (BAD_WEATHER.has(weather)) return p.activeMinutes > p.restMinutes ? "caution" : "ok";
  return "good";
}
function mobilityFit(input: EmptyDayInput): FitLevel {
  return input.mobility == null ? "ok" : "good"; // v0 placeholder（MAP 正本に触れない）
}

/** proposal の blocks から非断定 memory 根拠（distinct band×leaning）。 */
function memoryBasisOf(p: EmptyDayProposal): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of p.blocks) {
    if (!b.memoryLeaning) continue;
    const key = `${b.band}:${b.memoryLeaning}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`${BAND_LABEL[b.band]}の時間帯では${LEANING_VERB[b.memoryLeaning]}傾向を反映`);
  }
  return out;
}

/** R2-3: 1 proposal の reasoning（非断定）。 */
export function buildEmptyDayReasoning(input: EmptyDayInput, proposal: EmptyDayProposal): EmptyDayReasoning {
  const energy = input.energy ?? NEUTRAL_ENERGY;
  const fits = {
    time: timeFit(proposal),
    energy: energyFit(proposal, energy),
    weather: weatherFit(proposal, input.weather),
    mobility: mobilityFit(input),
  };
  const memoryBasis = memoryBasisOf(proposal);
  const memoryInformed = memoryBasis.length > 0;
  const confidence: "low" | "tentative" =
    memoryInformed && input.memoryUsableContexts.some((c) => c.confidence === "tentative") ? "tentative" : "low";
  const permissionRisk = input.permissionLevel <= 1 ? "confirm_recommended" : "none";
  const readiness: "draft" | "ready_to_show" =
    proposal.blocks.length === 0 || (fits.time === "caution" && fits.energy === "caution") ? "draft" : "ready_to_show";

  const lines: string[] = [TIER_INTENT_LINE[proposal.tier]];
  if (fits.energy === "caution") lines.push("今日は負荷が高めかもしれないので、無理のない範囲で進められます");
  if (fits.time === "caution") lines.push("余白が少なめなので、詰めすぎないか見直せます");
  if (fits.weather === "caution") lines.push("天気を見て、外の予定は後ろ倒しにもできます");

  return { tier: proposal.tier, fits, memoryBasis, permissionRisk, confidence, readiness, lines };
}

/** R2-3: 3 案すべての reasoning。 */
export function buildAllReasoning(input: EmptyDayInput, set: EmptyDayProposalSet): readonly EmptyDayReasoning[] {
  return set.proposals.map((p) => buildEmptyDayReasoning(input, p));
}
