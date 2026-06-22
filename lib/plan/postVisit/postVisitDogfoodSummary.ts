/**
 * lib/plan/postVisit/postVisitDogfoodSummary.ts
 *   — 評価OS / Stage 4-A2: dogfood readiness / context inspection の **pure 集計**（read-only）
 *
 * ★目的: dev/dogfood で flag ON した時、観測が正しく・redact されたまま貯まっているかを集計で可視化。
 *   Stage 4-B（Context Fit readout）に進める観測量/品質を見えるようにする。
 * ★絶対原則: **raw 値・PII・exact 値を一切出さない**。集計（件数・bucket 別カウント）と opaque placeKey の短縮のみ。
 *   生 locationText/住所/GPS/notes/相手名/exact gap minutes/exact dwell は出さない（そもそも観測に存在しない）。
 * ★pure: I/O なし（observations は呼び出し側が loadPostVisitObservations() で渡す）。ranking/推薦に一切影響しない。
 */
import type { PostVisitObservation } from "./postVisitObservation";
import { PERSISTED_CONTEXT_KEYS, sanitizeContextSnapshot } from "./postVisitContext";
import { buildFitArcReadout, type FitArcState } from "./fitArcReadout";
import { countRedactionViolations } from "./postVisitMetrics";

const NULL_KEY = "·null"; // contextSnapshot 無し / field null を表す集計キー

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

/** contextSnapshot が redaction 違反か（whitelist 外キー / 非 bucket 値 / sourceSurface 不正）。 */
function contextSnapshotViolation(raw: unknown): boolean {
  if (raw == null) return false;
  if (typeof raw !== "object") return true;
  const keys = Object.keys(raw as Record<string, unknown>);
  if (keys.some((k) => !(PERSISTED_CONTEXT_KEYS as readonly string[]).includes(k))) return true; // 余分キー
  const clean = sanitizeContextSnapshot(raw);
  if (clean == null) return true; // sourceSurface 不正
  const o = raw as Record<string, unknown>;
  const c = clean as unknown as Record<string, unknown>;
  // sanitize で値が変わった = 非 bucket 値（PII/自由値/数値）が入っていた
  return PERSISTED_CONTEXT_KEYS.some((k) => k !== "v" && o[k] !== c[k]);
}

/** opaque placeKey を短縮表示（既に hash・PII なし。さらに短縮して画面に出す）。 */
export function shortenPlaceKey(placeKey: string): string {
  return placeKey.length <= 10 ? placeKey : `${placeKey.slice(0, 10)}…`;
}

export interface FitArcEligibility {
  readonly placeKeyShort: string;
  readonly count: number; // 回答済み観測数
  readonly state: FitArcState; // insufficient / tentative / observed
}

export interface PostVisitDogfoodSummary {
  readonly total: number;
  readonly withContext: number;
  readonly withoutContext: number; // legacy（後方互換で残る）
  readonly contextCoverage: number; // withContext / total（0..1・total 0 で 0）
  readonly bySourceSurface: Record<string, number>;
  readonly byTrigger: Record<string, number>;
  readonly byTimeOfDay: Record<string, number>;
  readonly byDayType: Record<string, number>;
  readonly byGapBucket: Record<string, number>;
  readonly byResponse: Record<string, number>; // 未回答は "unanswered"
  /** ★0 必須。observation 単位の redaction 違反（whitelist 外 / 非 opaque placeKey / 非 bucket context）。 */
  readonly redactionViolations: number;
  /** place ごとの Fit-Arc 到達状況（観測量の可視化・placeKey は短縮 opaque）。 */
  readonly fitArcByPlace: readonly FitArcEligibility[];
  /** 観測あり×回答済みで埋まった (timeOfDay|dayType|gapBucket) のユニーク数（4-B の条件付け素地の粗い指標）。 */
  readonly contextCellsCovered: number;
}

/**
 * post-visit 観測群 → dogfood 集計（pure）。raw/PII/exact を出さない。
 */
export function summarizePostVisitDogfood(observations: readonly PostVisitObservation[]): PostVisitDogfoodSummary {
  const total = observations.length;
  let withContext = 0;
  const bySourceSurface: Record<string, number> = {};
  const byTrigger: Record<string, number> = {};
  const byTimeOfDay: Record<string, number> = {};
  const byDayType: Record<string, number> = {};
  const byGapBucket: Record<string, number> = {};
  const byResponse: Record<string, number> = {};
  const byPlace = new Map<string, PostVisitObservation[]>();
  const contextCells = new Set<string>();
  let redactionViolations = 0;

  for (const o of observations) {
    const cs = o.contextSnapshot;
    if (cs != null) withContext++;
    bump(byTrigger, o.trigger);
    bump(byResponse, o.response ?? "unanswered");
    bump(bySourceSurface, cs?.sourceSurface ?? NULL_KEY);
    bump(byTimeOfDay, cs?.timeOfDay ?? NULL_KEY);
    bump(byDayType, cs?.dayType ?? NULL_KEY);
    bump(byGapBucket, cs?.gapBucket ?? NULL_KEY);

    // per-place（Fit-Arc 到達状況）
    const list = byPlace.get(o.placeKey) ?? [];
    list.push(o);
    byPlace.set(o.placeKey, list);

    // 条件付け素地（回答済み×文脈あり）
    if (cs != null && o.response != null) {
      contextCells.add(`${cs.timeOfDay ?? "_"}|${cs.dayType ?? "_"}|${cs.gapBucket ?? "_"}`);
    }

    // redaction 監視（0 必須）: observation 単位 OR context 単位の違反で 1 計上
    const obsBad = countRedactionViolations([o]) > 0;
    const ctxBad = cs != null && contextSnapshotViolation(cs);
    if (obsBad || ctxBad) redactionViolations++;
  }

  const fitArcByPlace: FitArcEligibility[] = [...byPlace.entries()]
    .map(([placeKey, obs]) => {
      const r = buildFitArcReadout(obs);
      return { placeKeyShort: shortenPlaceKey(placeKey), count: r.observationCount, state: r.state };
    })
    .sort((a, b) => b.count - a.count);

  return {
    total,
    withContext,
    withoutContext: total - withContext,
    contextCoverage: total > 0 ? withContext / total : 0,
    bySourceSurface,
    byTrigger,
    byTimeOfDay,
    byDayType,
    byGapBucket,
    byResponse,
    redactionViolations,
    fitArcByPlace,
    contextCellsCovered: contextCells.size,
  };
}
