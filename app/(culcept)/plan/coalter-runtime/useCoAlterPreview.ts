"use client";

/**
 * C5-E: useCoAlterPreview — CoAlter 非永続 preview の on-demand 取得 hook（**ephemeral・保存なし**）
 *
 * 役割: flag(`enabled`) ∧ sessionId がある時、`generate()` で **1 回だけ** preview を GET し、state に持つ。
 *   保存しない・自動 fetch しない（明示トリガのみ）・既存 read/send 経路に触れない。
 */

import { useCallback, useState } from "react";

import type { CoAlterBrainPreview } from "@/lib/coalter/preview/brainPreviewCore";
import { fetchCoAlterPreviewOnce, type CoAlterPreviewFetchState } from "./coalterPreviewClient";

export interface UseCoAlterPreviewResult {
  readonly state: "off" | "loading" | CoAlterPreviewFetchState;
  readonly preview: CoAlterBrainPreview | null;
  /** preview を 1 回生成（flag OFF / sessionId 無 → 何もしない）。 */
  readonly generate: () => void;
}

export function useCoAlterPreview(opts: {
  readonly enabled: boolean;
  readonly sessionId: string | null;
  readonly fetchImpl?: typeof fetch;
}): UseCoAlterPreviewResult {
  const { enabled, sessionId, fetchImpl } = opts;
  const [state, setState] = useState<UseCoAlterPreviewResult["state"]>("off");
  const [preview, setPreview] = useState<CoAlterBrainPreview | null>(null);

  const generate = useCallback(() => {
    if (!enabled || !sessionId) return;
    setState("loading");
    setPreview(null);
    void fetchCoAlterPreviewOnce(sessionId, fetchImpl).then((r) => {
      setState(r.state);
      setPreview(r.preview);
    });
  }, [enabled, sessionId, fetchImpl]);

  return { state, preview, generate };
}
