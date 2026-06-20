import "server-only";
/**
 * D — Travel live **best-effort persistence** helper（**display-without-save・fail-open・injected-only・no real DB**）
 *
 * 設計正本: docs/t11-server-action-persistence-wiring-preflight.md（§7-10）
 *
 * 役割: events + server auth owner を pure mapper で write input にし、**provider seam で解決した repository が
 *   available の時だけ** save する。**display readiness を決めない**・**raw diagnostics を client に出さない**・
 *   **production は repository unavailable（注入なし）＝no-op**。
 *
 * 厳守:
 *   - mapper not-ready → repository を呼ばない（`not_attempted`）。repository unavailable → save しない（`unavailable`）。
 *   - 中立 status のみ返す（`saved`/`not_saved`/`not_attempted`/`unavailable`）・**session id / raw error / bundle を返さない**。
 *   - concrete Supabase port / supabaseServer / service_role / createClient を import/構築しない・global repository を持たない。
 *   - engine/display を呼ばない（display は action 側 primary path）。FormData から owner/session を読まない（owner は引数のみ）。
 */

import type { SessionSurfaceEvent } from "@/lib/shared/travel/travel-session-binding-types";
import type { TravelSessionRepositoryContract } from "@/lib/shared/travel/travel-session-persistence-types";
import type { TravelSessionRepositoryProviderMode } from "./travel-session-repository-provider";
import { mapTravelSessionEventsToPersistenceWriteInput } from "@/lib/shared/travel/travel-session-persistence-write-mapper";
import { resolveTravelSessionRepository } from "./travel-session-repository-provider";

export interface PersistTravelLiveIntentInput {
  events: SessionSurfaceEvent[];
  /** ★ server auth owner のみ（FormData/client から取らない）。 */
  ownerUserId: string;
  viewerId?: string;
  /** ★ test 用に注入された repository（production では渡さない＝unavailable）。 */
  injectedRepository?: TravelSessionRepositoryContract;
  mode?: TravelSessionRepositoryProviderMode;
}

/** 中立 persistence status（client-sensitive な情報を含まない）。 */
export type PersistTravelLiveIntentResult = {
  status: "saved" | "not_saved" | "not_attempted" | "unavailable";
};

/**
 * best-effort persistence（display を壊さない・provider-ready ∧ repository available の時だけ save）。
 */
export async function persistTravelLiveIntentIfAvailable(
  input: PersistTravelLiveIntentInput,
): Promise<PersistTravelLiveIntentResult> {
  // ① mapper（provider-ready のみ write input）。not-ready → repository を呼ばない。
  const mapped = mapTravelSessionEventsToPersistenceWriteInput({
    events: input.events,
    ownerUserId: input.ownerUserId,
    viewerId: input.viewerId,
  });
  if (mapped.status !== "ready") return { status: "not_attempted" };

  // ② repository を seam で解決。注入が無ければ unavailable（display-without-save）。
  const resolved = resolveTravelSessionRepository({
    ownerUserId: input.ownerUserId,
    injectedRepository: input.injectedRepository,
    mode: input.mode,
  });
  if (resolved.status !== "available") return { status: "unavailable" };

  // ③ save（中立 status のみ・raw DB/repository error を leak しない）。
  try {
    const saveRes = await resolved.repository.saveTravelSessionIntent(mapped.writeInput);
    return { status: saveRes.ok ? "saved" : "not_saved" };
  } catch {
    return { status: "not_saved" };
  }
}
