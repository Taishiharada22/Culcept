import "server-only";
/**
 * Reality Control OS — Live Reader Step 1: Supabase Memory Source Ports（**server-only・wiring のみ**・barrel 非 export）
 *
 * 設計: docs/live-reader-integration-design.md（§4）
 *
 * 役割: injected user-RLS client から既存の M1/M3 server-only reader を作り、`MemorySourcePorts` に束ねる **wiring**。
 *   **本ファイルは query を実行しない**（port を返すだけ・実行は readEventRows/readSecondSelfTendencies を **呼んだ時**＝次 gate）。
 *
 * 厳守: createClient しない（注入）・**service_role 禁止**（user-RLS client）・read-only（reader 内が select のみ）・
 *   column-restricted/fail-open は各 reader が担保・本 Step 1 では **実 staging を読まない**（呼び出しは shadow gate）。
 */

import { createSupabasePrmLearningEventReader, type PrmLearningEventReadClient } from "../learning/supabase-prm-learning-event-reader";
import { createSupabasePrmModelEntryReader, type PrmModelEntryReadClient } from "../learning/supabase-prm-model-entry-reader";
import type { MemorySourcePorts } from "./memory-assembler";

/**
 * Step 1: injected user-RLS client → MemorySourcePorts（M1 readEventRows + M3 readSecondSelfTendencies）。
 *   実 Supabase client が両 reader の client interface を structural に満たす（service_role を渡さないこと）。
 */
export function createSupabaseMemorySourcePorts(client: unknown, userId: string): MemorySourcePorts {
  const m1 = createSupabasePrmLearningEventReader(client as PrmLearningEventReadClient, userId);
  const m3 = createSupabasePrmModelEntryReader(client as PrmModelEntryReadClient, userId);
  return {
    readEventRows: () => m1.readEventRows(),
    readSecondSelfTendencies: () => m3.readSecondSelfTendencies(),
  };
}
