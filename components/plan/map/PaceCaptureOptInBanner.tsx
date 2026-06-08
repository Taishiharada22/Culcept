"use client";

/**
 * components/plan/map/PaceCaptureOptInBanner.tsx — A1-7: GPS pace capture の明示 opt-in 導線（控えめ・非 modal）
 *
 * ★informed consent: 「移動の所要時間を記録してペースを学ぶ」ことへの明示同意（汎用 location 同意と分離）。
 *   ★raw GPS は保存しない（所要時間などの要約のみ）ことを明記。modal でない・小さい inline・任意・可逆。
 *   sensitive/readOnly しかない日では表示しない（呼び出し側 MapTab が判定）。
 */

export interface PaceCaptureOptInBannerProps {
  readonly onGrant: () => void;
  readonly onDecline: () => void;
}

export function PaceCaptureOptInBanner({ onGrant, onDecline }: PaceCaptureOptInBannerProps) {
  return (
    <div data-testid="pace-capture-optin-banner" className="absolute inset-x-3 bottom-3 z-30">
      <div className="rounded-2xl border border-slate-200/90 bg-white/95 px-3.5 py-3 shadow-[0_12px_36px_-12px_rgba(15,23,42,0.28)] backdrop-blur">
        <p className="text-[12px] font-semibold text-slate-700">移動の所要時間を記録して、あなたのペースを学びますか？</p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          位置情報の生データは保存しません（実際の所要時間などの要約のみ）。いつでも止められます。
        </p>
        <div className="mt-2.5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onDecline}
            className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50"
          >
            今はしない
          </button>
          <button
            type="button"
            onClick={onGrant}
            className="rounded-full bg-slate-800 px-3.5 py-1 text-[11px] font-bold text-white hover:bg-slate-700"
          >
            許可する
          </button>
        </div>
      </div>
    </div>
  );
}
