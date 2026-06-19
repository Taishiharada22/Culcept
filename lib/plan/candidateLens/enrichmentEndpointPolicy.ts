/**
 * lib/plan/candidateLens/enrichmentEndpointPolicy.ts
 *   — Candidate Lens / Phase 4-b: endpoint の pure ガード（validation + gate）。auth/network 非依存＝テスト可能。
 *
 * ★route.ts はこの pure helper を使うだけ（重い import なしでロジックを単体テストできるよう分離）。
 */

/**
 * placeId の strict validation。body から placeId(string) のみ受理し、保守的な文字種/長さに限定。
 *   不正 → null（route は 400）。Google place ID は URL-safe（`[A-Za-z0-9_-]`）。
 */
export function validatePlaceId(raw: unknown): string | null {
  if (typeof raw !== "object" || raw == null) return null;
  const pid = (raw as { placeId?: unknown }).placeId;
  if (typeof pid !== "string") return null;
  const trimmed = pid.trim();
  if (trimmed.length < 4 || trimmed.length > 512) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

export type EnrichmentGate = "skipped" | "proceed";

/**
 * ★Google を叩いてよいか。fetch flag ON かつ API key 有り かつ budget OK の時だけ proceed。
 *   いずれか欠ければ skipped（fail-open・Google を叩かない＝課金ゼロ）。
 *   production では fetchEnabled=false（hard block）→ 常に skipped。
 */
export function enrichmentGate(input: { fetchEnabled: boolean; apiAvailable: boolean; budgetAllowed: boolean }): EnrichmentGate {
  return input.fetchEnabled && input.apiAvailable && input.budgetAllowed ? "proceed" : "skipped";
}
