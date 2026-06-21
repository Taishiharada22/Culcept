"use client";

/**
 * UX-6b-2a: Travel personalization の consent トグル（dev preview 内・本番 /plan 非接触）。
 *
 * 「性格傾向を旅行プランに反映する」明示同意（既定 OFF・local-only）。consent + flag + solo の gate 状態を表示。
 * **6b-2a では gate が許可状態でも snapshotReader は実行しない**（real read は 6b-2b）。
 */

import { useEffect, useState } from "react";
import {
  getBrowserStorage,
  grantConsent,
  loadConsent,
  revokeConsent,
  type TravelPersonalizationConsent,
} from "@/lib/plan/travel/personalizationConsent";
import { isRealPersonalizationReadAllowed } from "@/lib/plan/travel/realPersonalizationGate";

export function ConsentPanel({ realReadFlag }: { realReadFlag: boolean }) {
  const [consent, setConsent] = useState<TravelPersonalizationConsent | null>(null);

  // SSR hydration mismatch 防止: localStorage は mount 後に読む。
  useEffect(() => {
    setConsent(loadConsent(getBrowserStorage()));
  }, []);

  if (!consent) {
    return <div className="min-h-[64px]" aria-busy="true" data-testid="consent-loading" />;
  }

  const toggle = () => {
    const storage = getBrowserStorage();
    if (!storage) return;
    setConsent(consent.granted ? revokeConsent(storage) : grantConsent(storage, new Date().toISOString()));
  };

  // gate = flag ∧ consent ∧ solo（companions は HOLD）。
  const allowed = isRealPersonalizationReadAllowed({
    flagEnabled: realReadFlag,
    consentGranted: consent.granted,
    mode: "solo",
  });

  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/50 p-3" data-testid="consent-panel">
      <label className="flex items-center gap-2 text-[13px] font-medium text-gray-800">
        <input
          type="checkbox"
          checked={consent.granted}
          onChange={toggle}
          data-testid="consent-toggle"
        />
        性格傾向を旅行プランに反映する（solo・local-only・既定 OFF）
      </label>
      <p className="mt-1 text-[11px] text-gray-500" data-testid="consent-state">
        consent: {consent.granted ? `ON（${consent.grantedAt}）` : "OFF"} / real read flag: {realReadFlag ? "ON" : "OFF"} / mode: solo
      </p>
      <p className="mt-0.5 text-[11px] font-bold" data-testid="gate-state">
        {allowed
          ? "gate: 許可状態（ただし 6b-2a では snapshotReader 未実行＝fixture のまま。real read は 6b-2b）"
          : "gate: no-op（flag・consent・solo の AND 不成立 → fixture のまま・DB 不触）"}
      </p>
    </div>
  );
}
