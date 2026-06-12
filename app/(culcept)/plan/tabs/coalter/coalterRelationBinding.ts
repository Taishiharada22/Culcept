/**
 * coalterRelationBinding — C-1: Culcept relation metadata binding（read-only・pure resolver + GET）
 *
 * 正本: docs/coalter-plan-tab-c1-relation-binding-preflight.md（CEO 承認 2026-06-12）。
 *
 * C-1 厳格スコープ:
 *   - 一次かつ唯一の relation 源 = **`GET /api/genome-connections`**
 *     （user-RLS・profiles 由来表示名＝**service_role 不要**・relation-keyed）。
 *   - **talk スレッド metadata は使わない**（relation binding に・fallback にも）。
 *   - pure resolver は fetch しない・random/Date.now/process.env なし・service_role なし・
 *     TalkBridge（thread 読み機構）に依存しない。
 *   - 解決規則: `culcept_relation` は **accepted connection id + counterpart userId** のみから生成。
 *     self は **viewerUserId のみ**（messages/relation list/client state から**推論しない**）。
 *     `talk_pair_member` 不生成・`pairStateId` 非依存・`threadId` 無視・**勝手に relation を選ばない**。
 *   - 失敗/不一致/欠落は **fail-closed**（unbound・fake source なし・クラッシュなし）。
 */

import type {
  ParticipantSourceRef,
  SessionParticipant,
} from "./coalterPlanSessionContract";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 入力 payload（GET /api/genome-connections の **consume する field のみ**）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// **意図的に consume しない**: threadId（C-1 で無視）・visibilityRequester/visibilityTarget・
// requesterId/targetId・createdAt/respondedAt（private personalization / thread root 化を避ける）。

export interface GenomeConnectionMetadata {
  readonly id?: string;
  readonly status?: string;
  readonly counterpart?: {
    readonly userId?: string;
    readonly displayName?: string | null;
    readonly avatarUrl?: string | null;
  } | null;
}

/** 表示名が無いときの中立ラベル（**raw userId を表示に使わない**・CEO note #3）。 */
export const COUNTERPART_ROLE_LABEL = "相手";
export const SELF_ROLE_LABEL = "あなた";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pure resolver
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface RelationBindingInput {
  readonly connections: readonly GenomeConnectionMetadata[];
  /** 認証 self user id（server 由来・null = self 解決不可）。**client 推論禁止**。 */
  readonly viewerUserId: string | null;
  /** 解決したい counterpart の userId（明示）。空 = unbound（勝手に選ばない）。 */
  readonly targetCounterpartUserIds: readonly string[];
}

export type RelationBindingUnboundReason =
  | "no_target" // 明示 target なし
  | "no_viewer" // viewerUserId なし（self を推論しない）
  | "no_accepted_relation"; // target が accepted connection に解決できない

export type RelationBindingResult =
  | { readonly bound: true; readonly participants: readonly SessionParticipant[] }
  | { readonly bound: false; readonly reason: RelationBindingUnboundReason };

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function trimmedNonEmpty(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function buildCounterpartParticipant(
  connectionId: string,
  userId: string,
  displayName: string | null,
): SessionParticipant {
  const source: ParticipantSourceRef = {
    kind: "culcept_relation",
    relationId: connectionId,
    userId,
  };
  // displayName が無くても **raw userId を表示に使わない** → 中立ラベル
  return {
    userId,
    source,
    displayName: displayName ?? COUNTERPART_ROLE_LABEL,
    initial: (displayName ?? COUNTERPART_ROLE_LABEL).charAt(0),
    tone: "rose",
  };
}

function buildSelfParticipant(viewerUserId: string): SessionParticipant {
  // self の表示名は endpoint が返さない（counterpart のみ）→ 役割ラベル固定。userId は表示に出さない。
  return {
    userId: viewerUserId,
    source: { kind: "self", userId: viewerUserId },
    displayName: SELF_ROLE_LABEL,
    initial: SELF_ROLE_LABEL.charAt(0),
    tone: "sky",
  };
}

/**
 * 指定 counterpart userId を accepted connection に照合して resolve（pure・捏造ゼロ）。
 *
 *   - 各 target に対し、**status==="accepted" ∧ counterpart.userId===target ∧ connection.id 実在**の
 *     connection が **ちょうど 1 件**のときだけ resolve（0=未解決・2+=曖昧で**選ばない**）。
 *   - resolve できた counterpart が 1 件以上あれば bound（self + counterparts）。
 *   - self は viewerUserId からのみ（推論しない）。viewerUserId が無ければ no_viewer で unbound。
 *   - `talk_pair_member` / `pairStateId` / `threadId` は一切登場しない。
 */
export function resolveRelationParticipants(
  input: RelationBindingInput,
): RelationBindingResult {
  const targets = [...new Set(input.targetCounterpartUserIds.filter(nonEmptyString))];
  if (targets.length === 0) return { bound: false, reason: "no_target" };
  if (!nonEmptyString(input.viewerUserId)) return { bound: false, reason: "no_viewer" };

  const counterparts: SessionParticipant[] = [];
  for (const target of targets) {
    if (target === input.viewerUserId) continue; // self を counterpart にしない
    const matches = input.connections.filter(
      (c) =>
        c.status === "accepted" &&
        nonEmptyString(c.id) &&
        c.counterpart != null &&
        c.counterpart.userId === target,
    );
    // **勝手に選ばない**: ちょうど 1 件のときだけ採用（0=未解決, 2+=曖昧で不採用）
    if (matches.length !== 1) continue;
    const conn = matches[0];
    counterparts.push(
      buildCounterpartParticipant(
        conn.id as string,
        target,
        trimmedNonEmpty(conn.counterpart?.displayName),
      ),
    );
  }

  if (counterparts.length === 0) {
    return { bound: false, reason: "no_accepted_relation" };
  }
  return {
    bound: true,
    participants: [buildSelfParticipant(input.viewerUserId), ...counterparts],
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET-only fetch（read-only・fail-closed・POST/PATCH/DELETE 構文上不可）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface GenomeConnectionsPayload {
  readonly ok?: boolean;
  readonly connections?: readonly GenomeConnectionMetadata[];
}

export type GenomeConnectionsReadFailure =
  | "unauthorized" // 401
  | "forbidden" // 403
  | "http_error"
  | "invalid_payload"
  | "network_error";

export type GenomeConnectionsReadResult =
  | { readonly ok: true; readonly connections: readonly GenomeConnectionMetadata[] }
  | { readonly ok: false; readonly reason: GenomeConnectionsReadFailure };

/**
 * `GET /api/genome-connections` を 1 回読む。
 *   - `fetchImpl` は `(url) => Promise<Response>` 形＝method/init/body を渡せない
 *     ＝**POST/PATCH/DELETE が構文上発行できない**。
 *   - 401/403/HTTP error/parse 失敗/network 例外 → すべて fail-closed（throw しない）。
 *   - **talk スレッド系 API には一切アクセスしない**（relation 源は genome-connections のみ）。
 */
export async function fetchGenomeConnectionsOnce(
  fetchImpl: (url: string) => Promise<Response> = (url) => fetch(url),
): Promise<GenomeConnectionsReadResult> {
  try {
    const res = await fetchImpl("/api/genome-connections");
    if (!res.ok) {
      const reason: GenomeConnectionsReadFailure =
        res.status === 401 ? "unauthorized" : res.status === 403 ? "forbidden" : "http_error";
      return { ok: false, reason };
    }
    const payload = (await res.json()) as GenomeConnectionsPayload;
    if (payload.ok !== true || !Array.isArray(payload.connections)) {
      return { ok: false, reason: "invalid_payload" };
    }
    return { ok: true, connections: payload.connections };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}
