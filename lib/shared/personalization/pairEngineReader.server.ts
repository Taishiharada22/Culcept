import "server-only";
/**
 * M2-B-1 Pair engine reader（server-only・DI のみ・実装は未配線の純ライブラリ）
 *
 * 設計: docs/m2-b-pair-read-design.md §6 / §9（M2-B-1 最小安全スライス）
 *
 * 役割: CoAlter 2 人セッションで、**サーバ側エンジンだけ**が両ユーザーの
 * personalization snapshot を読むための consent-gated read。
 *
 * 厳守:
 *   - **client は両方とも注入**（createClient しない・実 service_role client を作らない）。
 *       userClient      = caller の user-RLS client（consent 前置検査用）
 *       adminReadClient = structural select-only な特権 read client（注入。型上 write 不可）
 *   - consent 前置検査は **userClient のみ**で行い、**不合格なら adminReadClient を
 *     一切呼ばずに null を返す**（テストで from 呼び出し 0 回を保証）。
 *   - 合格後のみ adminReadClient で M2-A 互換の読み取り規則（getPersonalizationSnapshot）を再利用。
 *   - 戻り値は **EngineOnly ブランド付き**（client へ素通しできない。出口で per-viewer 射影が必須）。
 *   - throw しない（M2-A house style）。読めない/不可視/欠落は null または null-safe placeholder。
 */

import { getPersonalizationSnapshot } from "./snapshotReader";
import type { PersonalizationSnapshot } from "./types";
import { markEngineOnly, type EngineOnly } from "./engineOnly";

const TABLE_PAIR = "coalter_pair_states";

/** エンジン専用のペア snapshot（self = caller / partner = 相手）。ブランド前の素の形。 */
export interface PairEngineSnapshots {
  pairStateId: string;
  /** caller 自身の userId */
  selfUserId: string;
  /** 相手の userId */
  partnerUserId: string;
  asOf: string;
  /**
   * 各 snapshot は M2-A getPersonalizationSnapshot の出力（観測ゼロは空 axes の placeholder、
   * 読み取りエラーのみ全体 null になる＝下記の戻り値で表現）。
   */
  self: PersonalizationSnapshot;
  partner: PersonalizationSnapshot;
}

/** ブランド付き戻り値型。client へ serialize する前に必ず per-viewer 射影で剥がすこと。 */
export type EngineOnlyPairSnapshots = EngineOnly<PairEngineSnapshots>;

export interface PairEngineReadParams {
  /** caller の user-RLS client（consent 前置検査用・select chain のみ使用） */
  userClient: unknown;
  /** 注入される structural select-only な特権 read client（実 client 生成は呼び出し側責務・M2-B-1 では未配線） */
  adminReadClient: unknown;
  pairStateId: string;
  /** caller の userId（将来 route 層が auth.uid() から供給。defense-in-depth の member 照合に使用） */
  callerUserId: string;
  /** snapshot 時刻 ISO（caller 注入・決定論のため内部で現在時刻を取らない） */
  asOf: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// consent 前置検査が要求する userClient の structural 最小 interface（select chain のみ）
// ─────────────────────────────────────────────────────────────────────────────

type ReadResult = { data: unknown[] | null; error: { message: string } | null };

interface PairSelectChain extends PromiseLike<ReadResult> {
  eq(column: string, value: string): PairSelectChain;
}

interface PairPrecheckClient {
  from(table: string): { select(columns: string): PairSelectChain };
}

function asRecord(row: unknown): Record<string, unknown> | null {
  return typeof row === "object" && row !== null ? (row as Record<string, unknown>) : null;
}

/**
 * 両ユーザーの personalization snapshot を engine 用に取得する。
 *
 * @returns
 *   - consent 不合格（pair 不可視/非メンバー/state≠enabled/未accept/未onboarded）→ **null**（adminReadClient 未使用）
 *   - 特権 read のいずれかが query error → **null**（partial を返さない）
 *   - 観測ゼロのユーザーは空 axes の placeholder snapshot（partner missing は null-safe）
 *   - 成功 → EngineOnly ブランド付き { self, partner }
 */
export async function getPairSnapshotsForEngine(
  params: PairEngineReadParams,
): Promise<EngineOnlyPairSnapshots | null> {
  const { userClient, adminReadClient, pairStateId, callerUserId, asOf } = params;

  // ── 1. consent 前置検査（userClient = caller の RLS のみ） ──
  const partnerUserId = await precheckConsent(userClient, pairStateId, callerUserId);
  if (partnerUserId === null) return null; // ★ ここで return → adminReadClient は触れない

  // ── 2. 特権 read（前置検査合格後のみ・M2-A 互換規則を再利用） ──
  const self = await getPersonalizationSnapshot(adminReadClient, callerUserId, asOf);
  if (self === null) return null;
  const partner = await getPersonalizationSnapshot(adminReadClient, partnerUserId, asOf);
  if (partner === null) return null;

  return markEngineOnly<PairEngineSnapshots>({
    pairStateId,
    selfUserId: callerUserId,
    partnerUserId,
    asOf,
    self,
    partner,
  });
}

/**
 * consent 前置検査。合格時は partner の userId を返し、不合格は null。
 * userClient（RLS）でしか pair 行を読まないため、行が見えること自体がメンバー証明。
 * callerUserId と user_a/user_b の照合は defense-in-depth（過度に寛容な client への保険）。
 */
async function precheckConsent(
  client: unknown,
  pairStateId: string,
  callerUserId: string,
): Promise<string | null> {
  const c = client as PairPrecheckClient;
  let res: ReadResult;
  try {
    res = await c
      .from(TABLE_PAIR)
      .select("id, user_a, user_b, state, accepted_at, onboarded_at")
      .eq("id", pairStateId);
  } catch {
    return null;
  }
  if (res.error) return null;

  const row = asRecord((res.data ?? [])[0]);
  if (!row) return null; // RLS 不可視 / 非メンバー / pair 不在

  const userA = typeof row.user_a === "string" ? row.user_a : null;
  const userB = typeof row.user_b === "string" ? row.user_b : null;
  if (userA === null || userB === null) return null;
  if (callerUserId !== userA && callerUserId !== userB) return null; // defense-in-depth

  if (row.state !== "enabled") return null; // consent 有効でない
  if (row.accepted_at == null) return null; // 相互同意未完
  if (row.onboarded_at == null) return null; // CoAlter activate 前

  return callerUserId === userA ? userB : userA;
}
