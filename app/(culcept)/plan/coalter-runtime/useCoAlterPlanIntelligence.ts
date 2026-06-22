"use client";

/**
 * C6-A-1 — CoAlter Plan Intelligence live fetch hook（**client・flag gated・read-only**）
 *
 * 役割: flag `coalterEngineLive` ON のときだけ GET /api/plan/coalter/intelligence?mode= を 1 回読み、
 *   engine 駆動の display-safe ViewModel を state に置く。flag OFF なら **fetch 0・vm=null**（従来 fixture）。
 *
 * 厳守: read-only（GET のみ）・書き込みなし・flag OFF で完全 inert・mode 変化で再取得（cancel 安全）。
 */

import { useEffect, useState } from "react";

import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import type { CoAlterPlanMode } from "@/app/(culcept)/plan/tabs/coalter/coalterPlanSessionFixture";
import type { PlanIntelligenceLiveVM } from "@/app/(culcept)/plan/tabs/coalter/planIntelligenceLiveViewModel";

export interface CoAlterPlanIntelligenceState {
  vm: PlanIntelligenceLiveVM | null;
  loading: boolean;
}

export function useCoAlterPlanIntelligence(mode: CoAlterPlanMode): CoAlterPlanIntelligenceState {
  const [vm, setVm] = useState<PlanIntelligenceLiveVM | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // flag OFF（本番既定）→ fetch 0・従来 fixture（vm=null）。
    if (!PLAN_FLAGS.coalterEngineLive) {
      setVm(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/plan/coalter/intelligence?mode=${encodeURIComponent(mode)}`, { method: "GET" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { vm?: PlanIntelligenceLiveVM | null } | null) => {
        if (!cancelled) setVm(d?.vm ?? null);
      })
      .catch(() => {
        if (!cancelled) setVm(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  return { vm, loading };
}
