/**
 * UX-6b-2a: real personalization read の **pure gate** + **caller skeleton（inject 形式）**。
 *
 * gate = **flag ∧ consent ∧ solo**。1つでも false なら no-op（snapshotReader を呼ばない＝byte 等価）。
 *
 * 規律（**6b-2a は code-only・real read しない**）:
 *   - snapshotReader / supabaseServer を**直接 import しない**（reader は inject）。
 *   - runtime caller を配線しない＝この skeleton は **test（fake reader 注入）からのみ呼ばれる**。
 *   - real `getPersonalizationSnapshot` を user-RLS client（service_role 厳禁）で注入するのは **UX-6b-2b**（DB gate・別 GO）。
 */

import { derivePlanParams, deriveTravelTraits } from "@/lib/shared/personalization/derive";
import { mapPersonalizationToM2SoftPreference } from "@/lib/shared/travel/personalization-to-m2-soft-preference";
import type { PersonalizationSnapshot } from "@/lib/shared/personalization/types";
import type { M2TravelSoftPreference } from "@/lib/shared/travel/m2-soft-enrichment-types";

export type PersonalizationMode = "solo" | "companions";

export interface RealReadGate {
  /** PLAN_FLAGS.travelPersonalizationRealRead（server-only・default OFF）。 */
  flagEnabled: boolean;
  /** consent.granted（local-only consent・default OFF）。 */
  consentGranted: boolean;
  /** 対象モード。companions は常に不許可（HOLD）。 */
  mode: PersonalizationMode;
}

/**
 * pure gate: **flag ∧ consent ∧ solo**。companions は常に false（pair は HOLD）。
 * 1つでも欠ければ false → caller は real read せず byte 等価（no-op）。
 */
export function isRealPersonalizationReadAllowed(g: RealReadGate): boolean {
  return g.flagEnabled === true && g.consentGranted === true && g.mode === "solo";
}

/**
 * inject される snapshot reader。6b-2b で real `getPersonalizationSnapshot(user-RLS client, asOf)` を注入する。
 * read() は自 user の PersonalizationSnapshot を返す（読めない → null）。
 */
export interface InjectedSnapshotReader {
  read(): Promise<PersonalizationSnapshot | null>;
}

/**
 * caller skeleton: gate が許可した時だけ inject reader を呼び softPersonalization を解決。
 *   - gate false → **null（reader を呼ばない＝no-op）**
 *   - gate true → reader.read() → snapshot → derive → m2 soft preference
 * **6b-2a では runtime caller を配線しないため、実 snapshotReader は実行されない**（test の fake reader のみ）。
 */
export async function resolveRealSoftPersonalization(
  gate: RealReadGate,
  reader: InjectedSnapshotReader,
): Promise<M2TravelSoftPreference | null> {
  if (!isRealPersonalizationReadAllowed(gate)) return null; // no-op（reader 不実行）
  const snapshot = await reader.read();
  if (!snapshot) return null;
  return mapPersonalizationToM2SoftPreference(derivePlanParams(snapshot), deriveTravelTraits(snapshot));
}
