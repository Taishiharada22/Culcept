/**
 * journeyOriginDebugLog — diagnostic log helpers (CEO/GPT 2026-05-03 PII-safe)
 *
 * 目的:
 *   journey_origin grounding の起動条件 / 結果を Vercel log で観測可能にする。
 *
 * PII 規律 (CEO 2026-05-03 訂正 #2 確定 = A 案):
 *   - production: kind / source / classification / labelLen / generated/skipped reason のみ
 *   - debug preview only (= env `ALTER_MORNING_DEBUG_RAW_LABELS=true`):
 *     rawLabel + labelHash も emit
 *
 *   labelHash は **debug 時のみ** emit (= unsalted sha256 は辞書攻撃 (東京駅 /
 *   渋谷駅 / 自宅 等) で再識別可能なため production には出さない)。
 *
 * 使用箇所:
 *   - chat route (= app/api/stargazer/alter/route.ts): morning protocol detect 結果
 *   - legacyAdapter (= journey origin 決定後): journeyOrigin の状態
 *   - legacyAdapter (= intent 生成箇所): journeyOriginGroundingIntent generated/skipped
 */

import type { JourneyAnchorState } from "./anchorState";
import { classifyLabel } from "../search/labelClassification";
import type { LabelClassification } from "../search/labelClassification";

function isDebugRawLabelEnabled(): boolean {
  return process.env.ALTER_MORNING_DEBUG_RAW_LABELS === "true";
}

/**
 * label を debug-only sha256 hash で識別子化 (= debug flag ON 時のみ emit)。
 *
 * - 通常: 呼ばれない (= production log には label 識別子を出さない、A 案)
 * - debug: rawLabel と並列で emit、turn 間 / user 間の同一性検証用
 *
 * 関数本体は import を **lazy** にして production 経路では node:crypto が
 * 評価されないことを担保する (= client bundle 混入防止の二重防御)。
 * journeyOriginDebugLog.ts は server-only モジュール (= legacyAdapter / route.ts
 * からのみ import) だが、念のため await import で副作用ローダーを isolate。
 */
async function hashLabelForDebug(label: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(label).digest("hex").slice(0, 8);
}

/**
 * journey origin が決定された直後に emit する log。
 *
 * production (= A 案、CEO 2026-05-03 訂正反映):
 *   `[journey-origin:resolved] caller=legacy_adapter kind=known_label_only source=user_declared classification=public_poi_proper_noun labelLen=3`
 *
 * debug preview (= ALTER_MORNING_DEBUG_RAW_LABELS=true):
 *   `[journey-origin:resolved] ... labelLen=3 rawLabel="東京駅" labelHash=a1b2c3d4`
 */
export function logJourneyOriginResolved(
  origin: JourneyAnchorState | undefined | null,
  caller: string,
): void {
  if (!origin) {
    console.info(`[journey-origin:resolved] caller=${caller} origin=null`);
    return;
  }
  const isUnknown = origin.kind === "unknown";
  let label: string | null = null;
  let cls: LabelClassification | "n/a" = "n/a";
  if (!isUnknown && (origin as { label?: string }).label) {
    label = (origin as { label: string }).label;
    cls = classifyLabel(label);
  }
  const labelLen = label ? label.length : 0;
  const source = isUnknown ? "unknown" : (origin as { source: string }).source;
  const baseLine = `[journey-origin:resolved] caller=${caller} kind=${origin.kind} source=${source} classification=${cls} labelLen=${labelLen}`;
  if (isDebugRawLabelEnabled() && label !== null) {
    // debug 時のみ rawLabel + labelHash (= node:crypto を lazy import)
    void hashLabelForDebug(label).then((hash) => {
      console.info(`${baseLine} rawLabel="${label}" labelHash=${hash}`);
    }).catch(() => {
      console.info(`${baseLine} rawLabel="${label}" labelHash=hash_unavailable`);
    });
    return;
  }
  console.info(baseLine);
}

/**
 * legacyAdapter で journeyOriginGroundingIntent を生成した / 生成しなかった結果を emit。
 *
 * production (= A 案):
 *   `[journey-origin:intent] generated=true classification=public_poi_proper_noun labelLen=3`
 *   または
 *   `[journey-origin:intent] generated=false reason=kind_not_known_label_only`
 *
 * debug preview:
 *   `[journey-origin:intent] generated=true classification=public_poi_proper_noun labelLen=3 rawLabel="東京駅" labelHash=a1b2c3d4`
 */
export function logJourneyOriginIntent(
  result:
    | { generated: true; label: string; classification: LabelClassification }
    | { generated: false; reason: string },
): void {
  if (result.generated) {
    const labelLen = result.label.length;
    const baseLine = `[journey-origin:intent] generated=true classification=${result.classification} labelLen=${labelLen}`;
    if (isDebugRawLabelEnabled()) {
      const label = result.label; // closure capture
      void hashLabelForDebug(label).then((hash) => {
        console.info(`${baseLine} rawLabel="${label}" labelHash=${hash}`);
      }).catch(() => {
        console.info(`${baseLine} rawLabel="${label}" labelHash=hash_unavailable`);
      });
      return;
    }
    console.info(baseLine);
  } else {
    console.info(
      `[journey-origin:intent] generated=false reason=${result.reason}`,
    );
  }
}

/**
 * morning protocol detection の判定結果を emit (= chat route 用)。
 *
 * `[morning-protocol:detect] intent=strong messageLen=12`
 *
 * raw message は出さない (= PII)。長さのみ。
 */
export function logMorningProtocolDetect(
  intent: "strong" | "soft" | "none",
  messageLength: number,
): void {
  console.info(
    `[morning-protocol:detect] intent=${intent} messageLen=${messageLength}`,
  );
}
