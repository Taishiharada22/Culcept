/**
 * UX-6b-2b-1: real snapshot reader factory（**user-RLS client → `getPersonalizationSnapshot` を InjectedSnapshotReader に**）。
 *
 * 規律:
 *   - **service_role 厳禁**: caller は `supabaseServer()`（cookie auth・user-RLS）client を渡す。`supabaseAdmin` を渡さない。
 *   - **production 不触**: staging link 中（CLI re-link 済み）。production axis は読まない（設計上 staging に axis なし）。
 *   - **axis なし → no-op**: staging 既定（性格診断は production のみ）。`getPersonalizationSnapshot` は観測ゼロ → axes 空 snapshot →
 *     derive が neutral（confidence 0）→ m2 が低 confidence drop → `resolveRealSoftPersonalization` が null → fixture fallback。
 *   - read-only（select のみ・RLS owner-only `auth.uid()=user_id` が自 user に限定）。
 */

import { getPersonalizationSnapshot } from "@/lib/shared/personalization/snapshotReader";
import type { InjectedSnapshotReader } from "./realPersonalizationGate";

/**
 * @param userRlsClient supabaseServer() 由来の user-RLS client（**service_role を渡さない**）。
 * @param userId 認証 self の userId（server の auth.getUser 由来）。
 * @param asOf snapshot 時刻 ISO（決定論のため caller 注入）。
 */
export function createRealSnapshotReader(
  userRlsClient: unknown,
  userId: string,
  asOf: string,
): InjectedSnapshotReader {
  return {
    read: () => getPersonalizationSnapshot(userRlsClient, userId, asOf),
  };
}
