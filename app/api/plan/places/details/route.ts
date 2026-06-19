/**
 * Plan Places **Details** API — POST placeId → Place Details enrichment（写真/営業時間）
 *   — Candidate Lens / Phase 4-b（server endpoint）
 *
 * 不変原則（既存 search route 継承 + P4 強化）:
 *   1. **auth 必須**（requireAuthenticatedUser）。userId は body から信用しない。
 *   2. **strict input**: body は `{ placeId }` のみ・形式 validation・不正は 400。
 *   3. **flag gate（dev-only/production hard block）**: `isPlaceDetailsFetchEnabled()` false → Google を叩かず skipped。
 *   4. **budget guard**: per-process 分/日/月 上限を超えたら skipped（fail-open）。本丸は GCP quota/budget（CEO）。
 *   5. **field mask 固定**: adapter が `PLACE_DETAILS_FIELD_MASK` 定数のみ送る（逸脱不能）。
 *   6. **1 候補 = Details 1 ＋ Photo 1（先頭のみ）**。それ以上叩かない。
 *   7. **fail-open**: throw/timeout/HTTP/key 不在 → enrichment(error/skipped) を 200 で返す（UI は abstract/未確認）。
 *   8. **key 秘匿**: API キーを応答・ログに出さない（enrichment にキーは含まれない）。
 *   9. **no persistent cache**: DB/Supabase/localStorage に書かない（memo は client 責務）。
 *
 * 範囲外（別 GO）: production 有効化・永続キャッシュ・ranking 反映・Places 属性追加。
 */
import { NextResponse } from "next/server";

import { supabaseServer } from "@/lib/supabase/server";
import { parseJsonBody, requireAuthenticatedUser } from "@/lib/plan/api-helpers";
import { isPlacesApiAvailable } from "@/lib/alter-morning/placesApiClient";
import { isPlaceDetailsFetchEnabled, skippedEnrichment } from "@/lib/plan/candidateLens/placeDetailsEnrichment";
import { GooglePlaceDetailsAdapter } from "@/lib/plan/candidateLens/googlePlaceDetailsAdapter";
import { checkAndIncrementEnrichmentBudget } from "@/lib/plan/candidateLens/enrichmentBudgetGuard";
import { validatePlaceId, enrichmentGate } from "@/lib/plan/candidateLens/enrichmentEndpointPolicy";

export async function POST(request: Request) {
  try {
    // (1) auth
    const supabase = await supabaseServer();
    const auth = await requireAuthenticatedUser(supabase);
    if (!auth.ok) return auth.response;

    // (2) body validation（placeId のみ）
    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return parsed.response;
    const placeId = validatePlaceId(parsed.value);
    if (!placeId) {
      return NextResponse.json({ ok: false, error: "Invalid placeId" }, { status: 400 });
    }

    // (3) gate: flag OFF / production / key 不在 / budget 超過 → skipped（Google を叩かない＝課金ゼロ）
    const fetchEnabled = isPlaceDetailsFetchEnabled();
    const apiAvailable = isPlacesApiAvailable();
    const budgetAllowed = fetchEnabled && apiAvailable ? checkAndIncrementEnrichmentBudget(Date.now()).allowed : false;
    if (enrichmentGate({ fetchEnabled, apiAvailable, budgetAllowed }) === "skipped") {
      return NextResponse.json({ ok: true, data: skippedEnrichment(placeId) });
    }

    // (4) 実 fetch（Details 1 ＋ Photo 1・fail-open・key は enrichment に含まれない）
    const adapter = new GooglePlaceDetailsAdapter();
    const enrichment = await adapter.fetchDetails(placeId);
    return NextResponse.json({ ok: true, data: enrichment });
  } catch {
    // ★ログにキー/詳細を出さない
    console.error("[plan/places/details] error");
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
