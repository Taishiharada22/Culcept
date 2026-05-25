"use server";

/**
 * Phase 3-N Plan P2 Step 1 — server action wrapper for LLM-aware alterNote enhancement
 *
 * 設計書: docs/alter-plan-p2-llm-readiness.md v2
 *
 * 役割:
 *   - Client (FlowTab.tsx) は `convertExternalAnchorListWithDayBookendsAsync` を
 *     直接 import できない (= generator が server-only)
 *   - 本 server action が薄い wrapper として client から呼出可能 (= Next.js 15 RSC)
 *   - FlowTab は本 action を useEffect で fire-and-forget、 完了で 1 回だけ setState
 *
 * Step 3 Phase 5 補正 (= 2026-05-25):
 *   - **userId は server-side authn (= supabase.auth.getUser) で取得** (= client から渡さない、 privacy + 安全)
 *   - options.userId が呼出側から渡されればそれを優先 (= test 等の override)
 *   - userId 取得失敗 → undefined のまま伝搬 → PM extraction skip → V1 path (= safe degrade)
 *
 * 不変原則:
 *   - flag OFF / LLM 失敗時は **既存 sync builder の output 通り** を return (= UI 不変)
 *   - 入力 anchors mutate なし (= server action 内で readonly 扱い)
 *   - ReadonlyArray を mutable Array に widen して return (= server action signature 要件)
 */

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { convertExternalAnchorListWithDayBookendsAsync } from "@/lib/plan/list/adapters/externalAnchorAdapterAsync";
import type { StrictEventCardViewModel } from "@/lib/plan/list/sourceProvenance";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * 1 日分の anchors → LLM-enhanced events (= alterNote 上書き、 popcorn 防止 一括 return)
 *
 * - flag OFF or LLM 失敗 → sync builder と同 events (= alterNote は deterministic のまま)
 * - flag ON + LLM 成功 → 該 anchor の alterNote を LLM 文に置換
 * - sensitive anchor / category 'other' / cost cap 超過 → deterministic 維持
 *
 * Step 3 Phase 5 補正:
 *   - userId 取得経路: options.userId 優先 → 失敗時 supabase.auth.getUser() で server-side 取得
 *   - 取得した userId は personal model extractor 経路 (= externalAnchorAdapterAsync)
 *     を経由して `extractPersonalModelFromStargazer` に伝搬する
 *   - auth 失敗 → userId undefined 維持 → PM 注入 skip、 V1 path に safe degrade
 *
 * 注: 本 action は client から network round-trip 経由で呼ばれる。 各 anchor を
 *     serialize して送り、 結果も serialize して return。 readonly な ExternalAnchor
 *     を mutable に widen して signature 整合。
 */
export async function enhanceAlterNotesAction(
  anchors: ExternalAnchor[],
  options?: {
    readonly userId?: string;
    readonly sessionId?: string;
  },
): Promise<StrictEventCardViewModel[]> {
  // Step 3 Phase 5: userId を server-side authn で取得 (= client は渡さない)
  // options.userId が呼出側で指定されていればそちらを優先 (= test override)
  let effectiveUserId = options?.userId;
  if (effectiveUserId === undefined) {
    try {
      const supabase = await supabaseServer();
      const { data } = await supabase.auth.getUser();
      if (data.user?.id) {
        effectiveUserId = data.user.id;
      }
    } catch {
      // auth 取得失敗 → userId undefined 維持 (= V1 path safe degrade、 例外を上に伝えない)
    }
  }

  const effectiveOptions =
    effectiveUserId !== undefined
      ? { ...options, userId: effectiveUserId }
      : options;

  const result = await convertExternalAnchorListWithDayBookendsAsync(
    anchors,
    effectiveOptions,
  );
  // readonly → mutable widening (= Server Action signature 要件)
  return [...result];
}
