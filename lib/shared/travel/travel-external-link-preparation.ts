/**
 * B-D-A — Travel external-link **preparation** helper（**pure・server/display 専用・配線なし**）
 *
 * 設計正本: docs/t11-bd-producer-consumer-links-wiring-design.md（§6 A′ / §12 + CEO 命名補正）
 *
 * ★ Server/display preparation only. **UI must not call this.**
 *   UI（TravelLivePanel）は `display.externalLinks` を render するだけで、本 helper も
 *   `buildGeneratedMapsSearchIntent` / `prepareSafeTravelLinkHrefModels` も呼んではならない。
 *
 * 役割（B-D-A）: confirmed **かつ shared-safe** な destination/entity ラベル（+ 任意 manual intents）を、
 *   既存 ladder（Tier1-C 生成 → Preparation 変換）で合成し `SafeTravelLinkHrefModel[]` にする。
 *   生成/変換ロジックは分離 pure helper に置き、adapter（B・別 GO）はデータ供給 + attach のみを担う。
 *
 * 厳守（しないこと）:
 *   - 生成は **`buildGeneratedMapsSearchIntent` 経由のみ**（URL を自前生成/mutate しない）。
 *   - eligibility を **再実装しない**（Tier1-C confirmed gate + Tier1-B を Preparation 経由で再利用）。
 *   - **manual intent を捏造しない**（caller 供給時のみ・既定 []）。
 *   - UI/render/adapter/engine/provider/M2/CoAlter/`/talk`/Maps・Places API/DB・Supabase/fetch を呼ばない・import しない。
 *   - **deterministic / idempotent**（Date/random なし・入力 mutate なし）。
 */

import type { ConstraintOwner, Visibility } from "./core-types";
import type { SafeTravelLinkIntent } from "./safe-link-types";
import type { SafeTravelLinkHrefModel } from "./safe-link-href-types";
import { buildGeneratedMapsSearchIntent } from "./generated-maps-search";
import { prepareSafeTravelLinkHrefModels } from "./safe-link-preparation";

/** 生成 Maps 検索 link の中立 label（予約語なし）。 */
const GENERATED_MAPS_LABEL = "地図で検索する";

export interface TravelExternalLinkDestinationCandidate {
  label: string;
  status: "confirmed" | "unconfirmed" | "missing";
  visibility: Visibility;
  /** 任意。shared-safe 判定（owner shared かつ visibility shared）に使う。 */
  owner?: ConstraintOwner;
}

export interface TravelExternalLinkEntityCandidate {
  label: string;
  confirmed: boolean;
  visibility: Visibility;
  owner?: ConstraintOwner;
}

export interface PrepareTravelExternalLinksInput {
  destination?: TravelExternalLinkDestinationCandidate;
  entity?: TravelExternalLinkEntityCandidate;
  /** 将来 URL 収集 phase 用。**現状 production 源なし＝既定 []**（捏造しない）。 */
  manualIntents?: SafeTravelLinkIntent[];
}

/** shared-safe = `visibility === "shared"` かつ（owner 無 or `owner.kind === "shared"`）。 */
function isSharedSafe(visibility: Visibility, owner?: ConstraintOwner): boolean {
  if (visibility !== "shared") return false;
  if (owner && owner.kind !== "shared") return false; // participant 所有 → shared-safe でない
  return true;
}

/**
 * confirmed shared-safe destination/entity（+ 任意 manual intents）→ 順序付き・dedupe 済 href model[]。
 *   ★ Server/display preparation only — UI から呼ばない。
 */
export function prepareTravelExternalLinkHrefModels(
  input: PrepareTravelExternalLinksInput,
): SafeTravelLinkHrefModel[] {
  if (!input || typeof input !== "object") return [];

  // manual は caller 供給時のみ（捏造しない）
  const intents: SafeTravelLinkIntent[] = [...(input.manualIntents ?? [])];

  // destination → 生成（confirmed + shared-safe のみ・Tier1-C が confirmed/visibility を gate）
  const d = input.destination;
  if (d && isSharedSafe(d.visibility, d.owner)) {
    const gen = buildGeneratedMapsSearchIntent({
      query: d.label,
      destinationStatus: d.status,
      visibility: d.visibility,
      label: GENERATED_MAPS_LABEL,
    });
    if (gen) intents.push(gen);
  }

  // entity → 生成（明示束縛 confirmed + shared-safe のみ）
  const e = input.entity;
  if (e && isSharedSafe(e.visibility, e.owner)) {
    const gen = buildGeneratedMapsSearchIntent({
      query: e.label,
      destinationStatus: "missing",
      entityConfirmed: e.confirmed,
      visibility: e.visibility,
      label: GENERATED_MAPS_LABEL,
    });
    if (gen) intents.push(gen);
  }

  // 既存 Preparation ladder（順序・dedupe・marker guard・eligible のみ）を再利用
  return prepareSafeTravelLinkHrefModels(intents);
}
