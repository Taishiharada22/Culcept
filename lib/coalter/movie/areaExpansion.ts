/**
 * CoAlter Stage 3 Resolve (movie) — Concentric Area Expansion (Tier 0/1/2)
 *
 * 三段式 §2.4.1 / mainstream plan §3.3 元 D-3-b / handover §6 D-2-b /
 * D-2 設計レビュー §3.3.
 *
 * ユーザー指定エリア (Tier 0) で劇場が見つからない時、隣接エリア (Tier 1) まで
 * 拡張する。Tier 1 も全て失敗なら Tier 2 fail を返し、別作品再起動を促す
 * (D-2-c `tierFailNarration` への signal、本 file scope 外)。
 *
 * Tier 設計 (三段式 §2.4.1):
 *   - **Tier 0**: ユーザー指定エリア
 *   - **Tier 1**: adjacencyTable の隣接エリア (3km 以内 or 同路線 2 駅以内)
 *   - **Tier 2**: Tier 0 + Tier 1 全 fail (= 「この近辺では上映が弱い」signal)
 *
 * Tier 1 拡張戦略 (CEO 採用、D-2 設計レビュー §3.3 で「early-stop 採用」):
 *   - 隣接駅を **順次試行** (adjacencyTable の配列順、決定論)
 *   - **first non-empty 採用** (最初に劇場 found した area で確定、後続は不呼出)
 *   - 理由: cost 削減 + 「最も近い area で十分」のユーザー認知 (Lynch 1960 mental map)
 *   - 全 area merge は Step E で観測値ベースに別審議
 *
 * 構造 invariant:
 *   - Tier 0 success → state="success", tier=0, foundAtArea=tier0Area
 *   - Tier 1 success → state="tier1_expanded_success", tier=1, foundAtArea=隣接 area
 *   - Tier 2 → state="tier2_fail", tier=2, theaters=[], foundAtArea=null
 *
 * 凍結線整合 (handover §4.2):
 *   - `webConnector.ts` / `movieRanker.ts` / `movieCatalog.ts` touch なし
 *   - D-2-a `theaterResolver` の DI 経由でのみ theater 解決 (実 fetcher は D-2-e で接続)
 */

import {
  resolveTheater,
  type TheaterListing,
  type TheaterResolverDeps,
  type TheaterResolverInput,
} from "./theaterResolver";
import { getAdjacentAreas } from "./adjacencyTable";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Public types
// ═══════════════════════════════════════════════════════════════════════════

/** 拡張 tier (0 = ユーザー指定、1 = 隣接拡張、2 = 全 fail)。 */
export type AreaExpansionTier = 0 | 1 | 2;

/**
 * Expansion 結果 state:
 *   - "success": Tier 0 (ユーザー指定 area) で found
 *   - "tier1_expanded_success": Tier 1 (隣接 area) で found
 *   - "tier2_fail": Tier 0 + Tier 1 全 fail (D-2-c tierFailNarration へ signal)
 */
export type AreaExpansionState =
  | "success"
  | "tier1_expanded_success"
  | "tier2_fail";

/** expandAreaConcentrically の最終結果。 */
export type AreaExpansionResult = {
  tier: AreaExpansionTier;
  state: AreaExpansionState;
  theaters: readonly TheaterListing[];
  /** 試行順序の area 一覧 (early-stop の場合は途中まで) */
  triedAreas: readonly string[];
  /** found した area (success / tier1_expanded_success 時のみ non-null) */
  foundAtArea: string | null;
};

/** expandAreaConcentrically の入力。 */
export type AreaExpansionInput = {
  title: string;
  /** ユーザー指定エリア (Tier 0) */
  tier0Area: string;
  /** source hint (optional、theaterResolver に propagate) */
  sourceHint?: TheaterResolverInput["sourceHint"];
};

/** expandAreaConcentrically の deps (DI、test では mock resolverDeps を注入)。 */
export type AreaExpansionDeps = {
  resolverDeps: TheaterResolverDeps;
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. Public API — expandAreaConcentrically
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Concentric Area Expansion (Tier 0 → Tier 1 → Tier 2)。
 *
 *   1. **Tier 0**: tier0Area で `resolveTheater` 試行
 *      - non-empty → `state: "success"`, tier=0 で確定
 *   2. **Tier 1**: adjacencyTable で tier0Area の隣接駅一覧を取得
 *      - 順次試行、first non-empty 採用 (cost 削減)
 *      - non-empty → `state: "tier1_expanded_success"`, tier=1 で確定
 *   3. **Tier 2**: Tier 0 + Tier 1 全 fail
 *      - `state: "tier2_fail"`, tier=2, theaters=[], foundAtArea=null
 *
 *   tier0Area が adjacencyTable 外 (孤立 area) → Tier 1 skip → Tier 2 へ直行
 *   (`getAdjacentAreas` が空配列を返すため自然に skip される)。
 */
export async function expandAreaConcentrically(
  input: AreaExpansionInput,
  deps: AreaExpansionDeps,
): Promise<AreaExpansionResult> {
  const triedAreas: string[] = [];

  // ── Tier 0: ユーザー指定 area で試行 ───────────────────────────────
  triedAreas.push(input.tier0Area);
  const tier0Result = await resolveTheater(
    {
      title: input.title,
      area: input.tier0Area,
      sourceHint: input.sourceHint,
    },
    deps.resolverDeps,
  );
  if (tier0Result.theaters.length > 0) {
    return {
      tier: 0,
      state: "success",
      theaters: tier0Result.theaters,
      triedAreas: [...triedAreas],
      foundAtArea: input.tier0Area,
    };
  }

  // ── Tier 1: 隣接 area で順次試行 (first non-empty 採用) ────────────
  const adjacentAreas = getAdjacentAreas(input.tier0Area);
  for (const adjacentArea of adjacentAreas) {
    triedAreas.push(adjacentArea);
    const tier1Result = await resolveTheater(
      {
        title: input.title,
        area: adjacentArea,
        sourceHint: input.sourceHint,
      },
      deps.resolverDeps,
    );
    if (tier1Result.theaters.length > 0) {
      return {
        tier: 1,
        state: "tier1_expanded_success",
        theaters: tier1Result.theaters,
        triedAreas: [...triedAreas],
        foundAtArea: adjacentArea,
      };
    }
  }

  // ── Tier 2: Tier 0 + Tier 1 全 fail (D-2-c へ signal) ─────────────
  return {
    tier: 2,
    state: "tier2_fail",
    theaters: [],
    triedAreas: [...triedAreas],
    foundAtArea: null,
  };
}
