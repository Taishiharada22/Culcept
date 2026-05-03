/**
 * journeyOriginDebugLog — diagnostic log helpers (CEO/GPT 2026-05-03 PII-safe)
 *
 * 目的:
 *   journey_origin grounding の起動条件 / 結果を Vercel log で観測可能にする。
 *
 * PII 規律 (CEO 2026-05-03 訂正):
 *   - production: kind / source / classification / labelHash / labelLength のみ
 *   - debug preview only (= env `ALTER_MORNING_DEBUG_RAW_LABELS=true`): raw label も
 *
 * 使用箇所:
 *   - chat route (= app/api/stargazer/alter/route.ts): morning protocol detect 結果
 *   - legacyAdapter (= journey origin 決定後): journeyOrigin の状態
 *   - legacyAdapter (= intent 生成箇所): journeyOriginGroundingIntent generated/skipped
 */

import { createHash } from "node:crypto";
import type { JourneyAnchorState } from "./anchorState";
import { classifyLabel } from "../search/labelClassification";
import type { LabelClassification } from "../search/labelClassification";

/**
 * label を SHA-256 hash して 8 chars に切り詰める (= PII safe identifier)。
 * 同じ label は同じ hash → debug 時に「あの user/turn と同じ label か」 確認可能。
 * raw label は復元不可 (= one-way hash)。
 */
function hashLabel(label: string): string {
  return createHash("sha256").update(label).digest("hex").slice(0, 8);
}

function isDebugRawLabelEnabled(): boolean {
  return process.env.ALTER_MORNING_DEBUG_RAW_LABELS === "true";
}

/**
 * journey origin が決定された直後に emit する log。
 *
 * production:
 *   `[journey-origin:resolved] kind=known_label_only source=user_declared classification=public_poi_proper_noun labelHash=a1b2c3d4 labelLen=3`
 * debug preview:
 *   `[journey-origin:resolved] kind=known_label_only source=user_declared classification=public_poi_proper_noun labelHash=a1b2c3d4 labelLen=3 rawLabel="東京駅"`
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
  const labelHash = label ? hashLabel(label) : "n/a";
  const labelLen = label ? label.length : 0;
  const source = isUnknown ? "unknown" : (origin as { source: string }).source;
  const rawDebug =
    isDebugRawLabelEnabled() && label !== null ? ` rawLabel="${label}"` : "";
  console.info(
    `[journey-origin:resolved] caller=${caller} kind=${origin.kind} source=${source} classification=${cls} labelHash=${labelHash} labelLen=${labelLen}${rawDebug}`,
  );
}

/**
 * legacyAdapter で journeyOriginGroundingIntent を生成した / 生成しなかった結果を emit。
 *
 * production:
 *   `[journey-origin:intent] generated=true classification=public_poi_proper_noun labelHash=a1b2c3d4`
 *   または
 *   `[journey-origin:intent] generated=false reason=kind_not_known_label_only`
 */
export function logJourneyOriginIntent(
  result:
    | { generated: true; label: string; classification: LabelClassification }
    | { generated: false; reason: string },
): void {
  if (result.generated) {
    const labelHash = hashLabel(result.label);
    const labelLen = result.label.length;
    const rawDebug = isDebugRawLabelEnabled()
      ? ` rawLabel="${result.label}"`
      : "";
    console.info(
      `[journey-origin:intent] generated=true classification=${result.classification} labelHash=${labelHash} labelLen=${labelLen}${rawDebug}`,
    );
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
