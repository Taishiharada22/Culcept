"use client";

/**
 * LocationOptInBanner — Alter Morning location opt-in inline banner (PR B-2d-b)
 *
 * 責務:
 *   ユーザーに「現在地を使うか?」を明示的に opt-in してもらうための inline banner。
 *   modal は使わない (押し付け感が強すぎる)。Aneurasync の "押し付けない" 世界観に合わせる。
 *
 * 設計方針 (CEO/GPT 2026-05-02 確定):
 *   - 純粋な presentation。state は持たない (= 親の useAlterChat が保持)。
 *   - 3 表示モード: normal / loading / error
 *   - banner 自体の表示/非表示は親が制御 (= effectiveOptInState === "not_asked" のときのみ render)
 *   - コピー文言は CEO/GPT 2026-05-02 確定:
 *       通常: 「現在地を使うと、今日の出発地をより正確に推定できます。」
 *       エラー: 「現在地を取得できませんでした。あとで再試行できます。」
 *   - ボタン: 〔位置情報を使う〕〔あとで〕 (CEO 確定)
 *
 * 状態遷移は親 hook (useAlterChat) が orchestrate する:
 *   - normal: 通常表示。ユーザーが選択するまで持続
 *   - loading: 「位置情報を使う」押下後、getCurrentPosition 待ち。両ボタン disabled
 *   - error: getCurrentPosition timeout/unavailable 後。リトライ可能
 *
 * 不変条件:
 *   - mode に応じて文言とボタン状態が決まる
 *   - mode="loading" のときは onGrant / onSnooze が呼ばれない (button disabled)
 *   - PERMISSION_DENIED 時はそもそも banner が render されない (= declined に遷移、親が unmount)
 */

import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Color tokens (CoAlterConsent と同じ系統で柔らかいトーン)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const C = {
  primary: "#6366F1",
  accent: "#8B5CF6",
  errorAccent: "#F59E0B", // 警告ではなく "気づき" の色 (押し付けない)
  s1: "#ffffff",
  s2: "#f5f6fa",
  t1: "#1a1a2e",
  t2: "#4a4a68",
  t3: "#8888a0",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type LocationOptInBannerMode = "normal" | "loading" | "error";

export interface LocationOptInBannerProps {
  /** 表示モード。親が opt-in flow の状態に応じて切り替える */
  mode: LocationOptInBannerMode;
  /**
   * 「位置情報を使う」押下時のハンドラ。
   * mode === "error" のときも同じハンドラを叩く (= retry)。
   * 親側で getCurrentPosition を呼び、結果に応じて mode を遷移させる責務。
   */
  onGrant: () => void;
  /**
   * 「あとで」押下時のハンドラ。
   * 親側で markSnoozed() を呼び、banner を unmount する責務。
   */
  onSnooze: () => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Copy (CEO/GPT 2026-05-02 確定)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const COPY = {
  normalMessage: "現在地を使うと、今日の出発地をより正確に推定できます。",
  errorMessage: "現在地を取得できませんでした。あとで再試行できます。",
  primaryButton: "位置情報を使う",
  primaryButtonRetry: "もう一度",
  secondaryButton: "あとで",
  loadingLabel: "確認中…",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function LocationOptInBanner({
  mode,
  onGrant,
  onSnooze,
}: LocationOptInBannerProps) {
  const isLoading = mode === "loading";
  const isError = mode === "error";
  const accentColor = isError ? C.errorAccent : C.primary;

  const message = isError ? COPY.errorMessage : COPY.normalMessage;
  const primaryLabel = isError ? COPY.primaryButtonRetry : COPY.primaryButton;

  return (
    <motion.div
      role="region"
      aria-label="位置情報の利用について"
      className="mx-auto max-w-md rounded-2xl overflow-hidden"
      style={{
        background: C.s1,
        border: `1px solid ${accentColor}20`,
        boxShadow: `0 2px 12px ${accentColor}08`,
      }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.25 }}
    >
      {/* 本文 */}
      <div className="px-4 pt-3 pb-2">
        <p
          style={{
            fontSize: 13,
            color: isError ? C.t2 : C.t1,
            lineHeight: 1.6,
          }}
        >
          {message}
        </p>
      </div>

      {/* ボタン */}
      <div className="px-4 pb-3 flex gap-2">
        <button
          type="button"
          onClick={onSnooze}
          disabled={isLoading}
          className="flex-1 py-2.5 rounded-xl text-sm transition-all min-h-[40px]"
          style={{
            background: C.s2,
            color: C.t3,
            opacity: isLoading ? 0.5 : 1,
            cursor: isLoading ? "not-allowed" : "pointer",
          }}
          aria-label={COPY.secondaryButton}
        >
          {COPY.secondaryButton}
        </button>
        <button
          type="button"
          onClick={onGrant}
          disabled={isLoading}
          className="flex-1 py-2.5 rounded-xl text-sm transition-all min-h-[40px] flex items-center justify-center gap-1.5"
          style={{
            background: `linear-gradient(135deg, ${accentColor}, ${C.accent})`,
            color: "white",
            fontWeight: 500,
            opacity: isLoading ? 0.6 : 1,
            cursor: isLoading ? "wait" : "pointer",
          }}
          aria-label={isLoading ? COPY.loadingLabel : primaryLabel}
        >
          {isLoading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span>{COPY.loadingLabel}</span>
            </>
          ) : (
            <span>{primaryLabel}</span>
          )}
        </button>
      </div>
    </motion.div>
  );
}
