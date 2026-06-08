/**
 * lib/plan/mobility/movementToleranceCorroboration.ts
 *   — PRG 軸: 移動耐性の **explicit 自己申告による corroboration**（pure・未配線・standalone）
 *
 * ★目的: movementTolerance.ts は mode-effort の **行動シグナル（implicit）** で「負荷を避けやすい条件」を読む。
 *   本 module は A0 reason（hypothesisFeedbackStore）の **自己申告（explicit）** で、その解釈を **別の証拠軸** から裏づける。
 *   → 行動（implicit）× 自己申告（explicit）の **convergent evidence**（測定論）で確信を上げる。捏造はしない。
 *
 * ★★HONESTY 制約（最重要・audit で確定）:
 *   - hypothesisFeedbackStore の entry は { kind, surfacedMode, chosenMode, reason? } のみで
 *     **weatherKind / timeband / weekday を持たない**。よって A0 を「雨の日は…」等の
 *     **条件別 signal に結合するのはデータが支えない join の捏造** → 本 module は **global（条件非依存）のみ**。
 *   - movementTolerance の条件別 signal と **コードで融合しない**（条件が裏づいたと誤読させない）。
 *     提示層（将来の UI mini-design）が「別々の観測」として並置するかを決める。
 *
 * ★load-avoidance reason の選定（physical-load 軸に厳密化）:
 *   - "tired"（疲れ）= 疲労ゆえに楽な手段を選んだ = **physical-load 回避の直接自己申告**。→ 採用。
 *   - "hurry"（急ぎ）= 時間圧 = **time-load**（physical-load と別軸）→ 混同回避のため **除外**（doc 化）。
 *   - scenery/cheap/mood/other = 負荷と無関係 → 除外。
 *
 * ★安全境界: trait/人格化しない（「移動が苦手な人」と言わない・observational）・偽数値なし（出力は boolean + 実カウント）・
 *   sparse は沈黙（sufficient gate）・新規データ保存なし（既存 A0 read のみ）・sensitive は元々非記録（excludeLegKeys で二重安全）・
 *   pure / Date 不使用 / DB・network なし / belief 非汚染。
 */
import type { HypothesisFeedbackStore, MobilityReason } from "./hypothesisFeedbackStore";

/** ★physical-load 回避の自己申告 reason（hurry=time-load は別軸ゆえ除外）。 */
export const LOAD_AVOIDANCE_REASON: MobilityReason = "tired";

export interface CorroborationConfig {
  /** reason 付き観測がこの数未満なら not_enough（sparse 保護）。 */
  readonly minReasonObservations: number;
  /** load-avoidance(tired) の実カウントがこの数以上で corroborate 候補。 */
  readonly minLoadAvoidanceCount: number;
  /** load-avoidance share がこの値以上（無視できない頻度＝「理由に挙がる」を honest に支える）。 */
  readonly minLoadAvoidanceShare: number;
}

/** 固定初期値（実データ後の較正は backlog）。 */
export const DEFAULT_CORROBORATION_CONFIG: CorroborationConfig = {
  minReasonObservations: 5,
  minLoadAvoidanceCount: 3,
  minLoadAvoidanceShare: 0.3,
};

export type CorroborationStatus = "not_enough" | "ready";

export interface MovementToleranceCorroboration {
  readonly status: CorroborationStatus;
  /** reason 付き観測の総数（internal・実カウント）。 */
  readonly totalReasonObservations: number;
  /** うち load-avoidance(tired) の数（internal・実カウント）。 */
  readonly loadAvoidanceCount: number;
  /** ★行動シグナルとは独立に、自己申告が physical-load 回避を裏づけるか（global・条件非依存）。 */
  readonly corroboratesLoadAvoidance: boolean;
}

export interface CorroborationOptions {
  readonly config?: CorroborationConfig;
  /** sensitive/hidden 等で対象外にする legKey（feedback store は元々 sensitive 非記録・二重安全）。 */
  readonly excludeLegKeys?: ReadonlySet<string>;
}

/**
 * ★core: A0 reason を **global** に集約して physical-load 回避の自己申告 corroboration を出す（pure・未配線）。
 *   条件別には決して結合しない（store に条件 key が無いため・HONESTY 制約）。
 */
export function buildMovementToleranceCorroboration(
  store: HypothesisFeedbackStore,
  opts: CorroborationOptions = {},
): MovementToleranceCorroboration {
  const config = opts.config ?? DEFAULT_CORROBORATION_CONFIG;
  const exclude = opts.excludeLegKeys ?? new Set<string>();

  let totalReasonObservations = 0;
  let loadAvoidanceCount = 0;
  // day 昇順で決定論（順序は結果に影響しないが安定のため）。
  for (const day of Object.keys(store.byDay).sort()) {
    const legs = store.byDay[day];
    for (const legKey of Object.keys(legs)) {
      if (exclude.has(legKey)) continue;
      const reason = legs[legKey].reason;
      if (reason == null) continue; // ★reason なし entry は無視（自己申告のみ）
      totalReasonObservations += 1;
      if (reason === LOAD_AVOIDANCE_REASON) loadAvoidanceCount += 1;
    }
  }

  if (totalReasonObservations < config.minReasonObservations) {
    return { status: "not_enough", totalReasonObservations, loadAvoidanceCount, corroboratesLoadAvoidance: false };
  }

  const share = loadAvoidanceCount / totalReasonObservations;
  const corroboratesLoadAvoidance =
    loadAvoidanceCount >= config.minLoadAvoidanceCount && share >= config.minLoadAvoidanceShare;

  return { status: "ready", totalReasonObservations, loadAvoidanceCount, corroboratesLoadAvoidance };
}

/**
 * ★corroboration → 1 行（観測トーン・global・trait でない・数字なし）。
 *   裏づかない/薄い→null（沈黙）。★条件（雨等）には言及しない（global ゆえ）。
 */
export function movementToleranceCorroborationLine(
  corroboration: MovementToleranceCorroboration,
): string | null {
  if (corroboration.status !== "ready" || !corroboration.corroboratesLoadAvoidance) return null;
  return "移動手段を変えるとき、疲れを理由に挙げることがあるようです。";
}
