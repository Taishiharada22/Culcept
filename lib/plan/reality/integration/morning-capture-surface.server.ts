import "server-only";
/**
 * Reality Control OS — A1-5-7-5 Morning Capture Surface（server-only・**read-only・fail-open・gated**・barrel 非 export）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.45
 *
 * 役割: `app/api/alter-morning/plan/route.ts` が呼ぶ **capture candidate surface** の production 入口（**C案**）。
 *   **pending captured seed/evidence を canonical read source 経由で read-only consumption** し（**本 module は `.from` を持たない**・
 *   plan_seeds read は `seed-source.ts`、evidence read は `duration-evidence-source.ts` の **single-read-source 制約**を遵守）、
 *   projected 出力（placements + evidence map）を `runConsumptionSurfaceFromProjected`（canonical bridge）で `CandidateSurfaceDTO` にする。
 *   route はこれを `appendCaptureCandidateToMorningResult` で additive 合成。fire-and-forget の capture write とは独立（surface は read 側・**実 LLM await なし**）。
 *
 * 厳守（後方互換・fail-open）:
 *   - **read-only**: canonical source（column-restricted SELECT・user-RLS・service_role 禁止）に委譲。**write/RPC/createClient なし**・本 module に `.from`/`.insert`/`.delete` なし。
 *   - **fail-open**: cheap guard（surface flag off / kill → null）/ gate block → **load 0・null** / read null / bridge error → null。**never-throw**。null → route で「captureCandidate を付けない」＝既存 response 維持。
 *   - **gate**: `evaluateCaptureGate`（liveEnabled=realityCaptureSurface）。kill 最優先・**production / 非 staging / 非 canary は block（surface read 0）**。**default flag off → 完全 no-op**。
 *   - **redaction**: surface は bridge 由来（**seedRef/source_ref/UUID/raw drop 済**）。canonical source は allowed col のみ・raw/source_ref 非 select。
 *   - server-only / barrel 非 export。
 */

import { PLAN_FLAGS } from "../../featureFlags";
import { evaluateCaptureGate, type CaptureGateInput } from "../capture-gate";
import { createColumnRestrictedSeedSource, type SeedUserContextClient } from "./seed-source";
import { createColumnRestrictedDurationEvidenceSource, type DurationEvidenceUserContextClient } from "./duration-evidence-source";
import { runConsumptionSurfaceFromProjected } from "./consumption-surface-bridge";
import { morningProtocolCaptureCandidateFragment, type CaptureCandidateFragment } from "./candidate-response-assembler";
import type { SeedConsumptionContext } from "./captured-seed-consumption";
import type { SeedPlacement } from "../seed-placement";
import type { DurationEvidence } from "../seed-placement-enrich";
import type { CandidateSurfaceDTO } from "./candidate-surface";

/** pending read の件数上限（canonical source 側でも clamp）。 */
const PENDING_READ_LIMIT = 50;

/**
 * surface の **標準 day context**（presentation 既定）。activeWindow=全日 / bandBounds=標準帯。
 * 注: clock 値は本 default を caller(route)が提供する形（generateComplete はハードコードしない）。将来 PRM/timeline で精緻化（dated/banded 厳密化）。
 */
export const DEFAULT_SURFACE_DAY_CONTEXT = {
  activeWindow: { startMin: 0, endMin: 1440 },
  bandBounds: {
    morning: { startMin: 360, endMin: 720 },
    afternoon: { startMin: 720, endMin: 1020 },
    evening: { startMin: 1020, endMin: 1320 },
  },
} as const;

/** read client（seed/evidence の canonical source が要求する両 interface を満たす・**read-only user-RLS**）。 */
export type PendingCapturedRowsReadClient = SeedUserContextClient & DurationEvidenceUserContextClient;

/** projected pending data（**raw/source_ref を持たない**・canonical source 由来）。 */
export interface PendingProjected {
  readonly placements: readonly SeedPlacement[];
  readonly evidenceMap: Readonly<Record<string, readonly DurationEvidence[]>>;
}

/**
 * pending を **canonical read source 経由** で projected read（**read-only**・bounded・**fail-open: null**）。
 *   plan_seeds → `createColumnRestrictedSeedSource`（active placements）/ evidence → `createColumnRestrictedDurationEvidenceSource`（adoptable map）。
 *   **本 module は `.from` を持たない**（single-read-source 制約遵守）。seed 0 → evidence read しない。
 */
export async function loadPendingProjected(
  client: PendingCapturedRowsReadClient,
  userId: string
): Promise<PendingProjected | null> {
  const placements = await createColumnRestrictedSeedSource(client, { limit: PENDING_READ_LIMIT }).loadActivePlacements(userId);
  if (!placements) return null; // read error → fail-open
  if (placements.length === 0) return { placements: [], evidenceMap: {} }; // seed 0 → evidence read しない
  const seedIds = placements.map((p) => p.seedRef);
  const evidenceMap = await createColumnRestrictedDurationEvidenceSource(client, { seedIds, limit: PENDING_READ_LIMIT }).loadEvidenceMap(userId);
  if (!evidenceMap) return null; // read error → fail-open
  return { placements, evidenceMap };
}

/** flags/env/userId → surface gate input（**pure**・liveEnabled=realityCaptureSurface）。 */
export function resolveSurfaceGate(opts: {
  readonly surfaceEnabled: boolean;
  readonly killed: boolean;
  readonly nodeEnv: string;
  readonly supabaseUrl: string | undefined;
  readonly userId: string;
  readonly canaryUserIds: readonly string[];
}): CaptureGateInput {
  return {
    liveEnabled: opts.surfaceEnabled,
    killed: opts.killed,
    nodeEnv: opts.nodeEnv,
    supabaseUrl: opts.supabaseUrl,
    requestedUserId: opts.userId,
    canaryUserIds: opts.canaryUserIds,
  };
}

/**
 * surface 構築の **DI core**（テスト可能・**fail-open**）。
 *   gateAllow=false → **loadProjected を呼ばず null**（surface read 0）。load null / bridge 失敗 → null。
 *   成功 → bridge の `surface`（redacted・candidate 無なら hasCandidate=false）。
 */
export async function buildCaptureSurfaceFromProjected(
  gateAllow: boolean,
  loadProjected: () => Promise<PendingProjected | null>,
  context: SeedConsumptionContext
): Promise<CandidateSurfaceDTO | null> {
  if (!gateAllow) return null; // gate block → read 0
  let projected: PendingProjected | null;
  try {
    projected = await loadProjected();
  } catch {
    return null; // read error → fail-open
  }
  if (!projected) return null;
  try {
    return runConsumptionSurfaceFromProjected(projected.placements, projected.evidenceMap, context).surface;
  } catch {
    return null; // bridge error → fail-open
  }
}

/**
 * A1-5-7-5: route entry（**production glue・never-throw・read-only**）。
 *   cheap guard（surface flag off / kill → null・**read 0・default no-op**）→ gate（production/staging/canary）→ canonical read → bridge → surface。
 *   返り値 null は route で「captureCandidate を付けない」＝既存 response 維持（fail-open）。
 *
 * @param client route の認証済 Supabase client（**read-only**・user-RLS）。
 * @param targetDate 当日の planned date（context・undated seed は date 非依存で候補化）。
 */
export async function buildMorningCaptureSurface(
  client: PendingCapturedRowsReadClient,
  userId: string,
  targetDate: string | undefined
): Promise<CandidateSurfaceDTO | null> {
  try {
    // cheap guard: surface off / kill → null（read 0・default no-op・production 挙動変更ゼロ）
    if (!PLAN_FLAGS.realityCaptureSurface || PLAN_FLAGS.realityCaptureKill) return null;
    const gate = evaluateCaptureGate(
      resolveSurfaceGate({
        surfaceEnabled: PLAN_FLAGS.realityCaptureSurface,
        killed: PLAN_FLAGS.realityCaptureKill,
        nodeEnv: process.env.NODE_ENV ?? "",
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        userId,
        canaryUserIds: PLAN_FLAGS.canaryUserIds,
      })
    );
    const context: SeedConsumptionContext = {
      date: targetDate,
      activeWindow: DEFAULT_SURFACE_DAY_CONTEXT.activeWindow,
      bandBounds: DEFAULT_SURFACE_DAY_CONTEXT.bandBounds,
      existing: [],
    };
    return await buildCaptureSurfaceFromProjected(gate.allow, () => loadPendingProjected(client, userId), context);
  } catch {
    return null; // never-throw（response 不変を絶対保証）
  }
}

/**
 * A1-5-8-2: morningProtocol への capture candidate fragment を、**surface loader（DI）から fail-open に解決**する seam。
 *   production route（`/api/stargazer/alter`）の morningProtocol assembly がこれを呼び、`() => buildMorningCaptureSurface(...)` を渡す。
 *
 *   - loader が **throw**（read 例外）/ **null**（flag off・kill・production/非 staging/非 canary gate block・no candidate）→ `{}`
 *     （spread しても morningProtocol は完全不変＝既存 response 維持・後方互換）。
 *   - candidate 有 → `{ captureCandidate: <redacted DTO> }`（`morningProtocolCaptureCandidateFragment` 経由で最終 redaction）。
 *
 *   surface 由来の例外を握り潰し **response 成功を壊さない**（fail-open）。**実 LLM await なし**（loader は read-only consumption のみ）。
 *   capture write（fire-and-forget・別 gate・別 GO）とは独立。route はこの fragment を inline morningProtocol object に 1 行 spread する。
 */
export async function resolveMorningProtocolCaptureFragment(
  loader: () => Promise<CandidateSurfaceDTO | null>
): Promise<CaptureCandidateFragment> {
  let surface: CandidateSurfaceDTO | null = null;
  try {
    surface = await loader();
  } catch {
    surface = null; // read failure → fail-open（captureCandidate を付けない）
  }
  return morningProtocolCaptureCandidateFragment(surface);
}
