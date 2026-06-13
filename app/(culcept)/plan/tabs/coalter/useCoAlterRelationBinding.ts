"use client";

/**
 * useCoAlterRelationBinding — C-1 relation metadata binding hook（read-only）
 *
 * 責務: 既存 `GET /api/genome-connections` を **flag ON ∧ 前提充足時に高々 1 回**読み、
 * pure resolver（`resolveRelationParticipants`）で session participants を解決して返す。
 *
 * 前提（すべて満たす時だけ fetch する＝無駄打ち回避・fail-closed）:
 *   - C-1 flag ON / viewerUserId（server 由来）あり / target counterpart userId あり。
 *   いずれか欠ければ **fetch せず unbound**（fixture のまま）。
 *
 * 存在しないもの: talk スレッド系 API・send・既読・typing・Realtime・useCoAlter・CoAlter runtime API・
 * service_role・supabase import（fetch は genome-connections の GET 1 回のみ）。
 */

import { useEffect, useMemo, useState } from "react";

import {
  fetchGenomeConnectionsOnce,
  resolveAttachedThreadRef,
  resolveRelationParticipants,
  type GenomeConnectionMetadata,
} from "./coalterRelationBinding";
import type { AttachedThreadRef, SessionParticipant } from "./coalterPlanSessionContract";

/** 結合状態（UI バッジ/出し分け用）。 */
export type RelationBindingState = "off" | "loading" | "bound" | "unbound";

/** module-level in-flight dedupe（genome-connections は user-scoped・URL 一定）。 */
let inflightConnectionsRead: Promise<
  Awaited<ReturnType<typeof fetchGenomeConnectionsOnce>>
> | null = null;

export function readGenomeConnectionsDeduped(
  fetchImpl?: (url: string) => Promise<Response>,
): Promise<Awaited<ReturnType<typeof fetchGenomeConnectionsOnce>>> {
  if (!inflightConnectionsRead) {
    inflightConnectionsRead = fetchGenomeConnectionsOnce(fetchImpl).finally(() => {
      inflightConnectionsRead = null;
    });
  }
  return inflightConnectionsRead;
}

export function useCoAlterRelationBinding(opts: {
  readonly enabled: boolean;
  readonly viewerUserId: string | null;
  readonly targetCounterpartUserIds: readonly string[];
}): {
  participants: readonly SessionParticipant[] | null;
  /** TalkBridge-A: 単一 counterpart の accepted connection から導出した thread 参照（無ければ null）。 */
  attachedThreadRef: AttachedThreadRef | null;
  state: RelationBindingState;
} {
  const { enabled, viewerUserId } = opts;
  // 依存安定化（配列 identity 由来の再 fetch を防ぐ）
  const targetKey = [...opts.targetCounterpartUserIds].filter((s) => s.length > 0).sort().join(",");

  // fetch する前提が揃っているか
  const shouldFetch =
    enabled && typeof viewerUserId === "string" && viewerUserId.length > 0 && targetKey.length > 0;

  const [connections, setConnections] = useState<readonly GenomeConnectionMetadata[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!shouldFetch) return; // fixture 経路: fetch 0
    let cancelled = false;
    void readGenomeConnectionsDeduped().then((result) => {
      if (cancelled) return;
      if (result.ok) setConnections(result.connections);
      else setFailed(true); // 401/403/http/invalid/network → fail-closed
    });
    return () => {
      cancelled = true;
    };
    // targetKey は fetch 可否のみ左右（URL は不変）。viewerUserId/enabled も同様。
  }, [shouldFetch]);

  const binding = useMemo(() => {
    if (!shouldFetch) return { participants: null, attachedThreadRef: null, state: "off" as RelationBindingState };
    if (failed) return { participants: null, attachedThreadRef: null, state: "unbound" as RelationBindingState };
    if (connections === null)
      return { participants: null, attachedThreadRef: null, state: "loading" as RelationBindingState };
    const targets = targetKey.length > 0 ? targetKey.split(",") : [];
    const result = resolveRelationParticipants({ connections, viewerUserId, targetCounterpartUserIds: targets });
    // attachedThreadRef は同一 fetch から導出（relation→thread・無ければ null）。
    const attachedThreadRef = resolveAttachedThreadRef(connections, targets);
    if (result.bound) {
      return { participants: result.participants, attachedThreadRef, state: "bound" as RelationBindingState };
    }
    return { participants: null, attachedThreadRef, state: "unbound" as RelationBindingState };
  }, [shouldFetch, failed, connections, viewerUserId, targetKey]);

  return binding;
}
