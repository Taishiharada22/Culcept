"use client";

/**
 * CoAlter Candidate Detail Sheet — Phase A (2026-04-18)
 *
 * 目的: 候補タップで「予約サイトへ自然に送る」までの導線を集約。
 *
 * CoAlter は予約代行 AI ではない。この sheet の仕事は、
 *  1. 「なぜ2人に合う候補か」を短く提示 (why2People)
 *  2. 場所/時間/アクセスの事実を確認できる
 *  3. 代替案 (0-2) を隣に置く
 *  4. 正しい外部導線にワンタップで送り出す（CTA は booking.label）
 *     - 映画: confidence が高くても「予約する」にはしない
 *     - 食事: 公式予約ページがあれば「公式の予約ページへ」
 *  5. 出典 (sources) を footer で明示
 *
 * CTA タップ / sheet open は onHandoff / onOpen でログ化想定 (coalter_handoff_events)。
 */

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  ProposalCandidate,
  BookingHandoff,
  CandidateAlternative,
  CandidateSource,
} from "@/lib/coalter/types";

const C = {
  coalter: "#6366F1",
  pulse: "#EC4899",
  s1: "#ffffff",
  s2: "#f5f6fa",
  t1: "#1a1a2e",
  t2: "#4a4a68",
  t3: "#8888a0",
  t4: "#c8c8dc",
};

export interface HandoffLogPayload {
  eventType: "sheet_open" | "cta_tap" | "alternative_tap" | "source_tap";
  candidateKey: string | null;
  providerType: BookingHandoff["providerType"] | null;
  providerName: string | null;
  confidence: BookingHandoff["confidence"] | null;
  label: string | null;
  url: string | null;
}

interface Props {
  candidate: ProposalCandidate | null;
  isOpen: boolean;
  onClose: () => void;
  /** sheet open / cta tap 等のイベントをロガーに渡す。fire-and-forget でよい。 */
  onHandoffEvent?: (payload: HandoffLogPayload) => void;
}

function candidateKeyFor(c: ProposalCandidate): string {
  return `${c.title}::${c.url ?? "?"}`;
}

export default function CoAlterCandidateDetailSheet({
  candidate,
  isOpen,
  onClose,
  onHandoffEvent,
}: Props) {
  // open 時に 1 回だけ sheet_open を発火
  useEffect(() => {
    if (!isOpen || !candidate) return;
    onHandoffEvent?.({
      eventType: "sheet_open",
      candidateKey: candidateKeyFor(candidate),
      providerType: candidate.detail?.booking?.providerType ?? null,
      providerName: candidate.detail?.booking?.providerName ?? null,
      confidence: candidate.detail?.booking?.confidence ?? null,
      label: null,
      url: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, candidate?.title]);

  if (!candidate) return null;

  const detail = candidate.detail;
  const booking = detail?.booking ?? null;

  const handleCtaTap = () => {
    if (!booking) return;
    const url = booking.bookingUrl ?? booking.officialUrl;
    if (!url) return;
    onHandoffEvent?.({
      eventType: "cta_tap",
      candidateKey: candidateKeyFor(candidate),
      providerType: booking.providerType,
      providerName: booking.providerName,
      confidence: booking.confidence,
      label: booking.label,
      url,
    });
    // 新規タブで開く（window.open は CSP で弾かれにくい）
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Phase B Commit 4 (2026-04-19):
  //   providerType === "unknown" のとき、URL があれば CTA はゴースト化、
  //   無ければ CTA ブロックごと非表示。
  //   CEO 条件 (反証 2): 虚偽導線回避のため「予約」語を出さない弱い表示。
  const isUnknownProvider = booking?.providerType === "unknown";
  const hasUrl =
    booking != null && (booking.bookingUrl != null || booking.officialUrl != null);
  const showCta = booking != null && hasUrl;

  const handleAlternativeTap = (alt: CandidateAlternative) => {
    onHandoffEvent?.({
      eventType: "alternative_tap",
      candidateKey: candidateKeyFor(candidate),
      providerType: null,
      providerName: null,
      confidence: null,
      label: alt.title,
      url: alt.url ?? null,
    });
    if (alt.url) {
      window.open(alt.url, "_blank", "noopener,noreferrer");
    }
  };

  const handleSourceTap = (s: CandidateSource) => {
    onHandoffEvent?.({
      eventType: "source_tap",
      candidateKey: candidateKeyFor(candidate),
      providerType: null,
      providerName: s.label,
      confidence: null,
      label: s.label,
      url: s.url,
    });
    window.open(s.url, "_blank", "noopener,noreferrer");
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(17,17,34,0.32)",
              zIndex: 50,
            }}
          />

          {/* sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight: "80vh",
              overflowY: "auto",
              background: C.s1,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              zIndex: 51,
              boxShadow: `0 -8px 32px ${C.coalter}25`,
            }}
          >
            {/* drag handle */}
            <div
              style={{
                width: 36,
                height: 4,
                background: C.t4,
                borderRadius: 2,
                margin: "10px auto 4px",
                opacity: 0.6,
              }}
            />

            <div style={{ padding: "8px 20px 28px" }}>
              {/* title row */}
              <div className="flex items-start justify-between" style={{ gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 10, color: C.coalter, fontWeight: 600, letterSpacing: 1 }}>
                    候補の詳細
                  </p>
                  <p
                    style={{
                      fontSize: 17,
                      color: C.t1,
                      fontWeight: 700,
                      lineHeight: 1.35,
                      marginTop: 2,
                    }}
                  >
                    {candidate.title}
                  </p>
                  {candidate.practicalInfo && (
                    <p
                      style={{
                        fontSize: 11,
                        color: C.t3,
                        marginTop: 4,
                        lineHeight: 1.5,
                      }}
                    >
                      {candidate.practicalInfo}
                    </p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  style={{
                    fontSize: 14,
                    color: C.t3,
                    padding: 4,
                    flexShrink: 0,
                  }}
                  aria-label="閉じる"
                >
                  ✕
                </button>
              </div>

              {/* why 2 people */}
              {detail?.why2People && (
                <div
                  style={{
                    marginTop: 14,
                    background: `${C.coalter}08`,
                    border: `1px solid ${C.coalter}18`,
                    borderRadius: 12,
                    padding: "10px 12px",
                  }}
                >
                  <p style={{ fontSize: 10, color: C.coalter, fontWeight: 600, marginBottom: 4 }}>
                    2人に合う理由
                  </p>
                  <p style={{ fontSize: 12, color: C.t1, lineHeight: 1.55 }}>
                    {detail.why2People}
                  </p>
                </div>
              )}

              {/* facts (address / access / hours / price) */}
              {detail && (detail.address || detail.access || detail.operatingHours || detail.priceBand) && (
                <div style={{ marginTop: 14 }}>
                  <FactLine label="場所" value={detail.address} />
                  <FactLine label="アクセス" value={detail.access} />
                  <FactLine label="時間" value={detail.operatingHours} />
                  <FactLine label="価格帯" value={detail.priceBand} />
                </div>
              )}

              {/* primary CTA (booking handoff) */}
              {showCta && booking && (
                <div style={{ marginTop: 16 }}>
                  <motion.button
                    onClick={handleCtaTap}
                    whileTap={{ scale: 0.97 }}
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      // Phase B Commit 4: providerType="unknown" のときはゴースト化
                      // （虚偽導線回避）。通常は coalter primary 色。
                      background: isUnknownProvider ? C.s2 : C.coalter,
                      color: isUnknownProvider ? C.t2 : "white",
                      borderRadius: 12,
                      fontSize: 14,
                      fontWeight: 700,
                      border: isUnknownProvider ? `1px solid ${C.t4}` : "none",
                      cursor: "pointer",
                    }}
                  >
                    {booking.label} ↗
                  </motion.button>
                  <p
                    style={{
                      fontSize: 10,
                      color: C.t3,
                      marginTop: 6,
                      textAlign: "center",
                      lineHeight: 1.5,
                    }}
                  >
                    {confidenceHint(booking)}
                  </p>
                </div>
              )}

              {/* alternatives */}
              {detail?.alternatives && detail.alternatives.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <p
                    style={{
                      fontSize: 11,
                      color: C.t2,
                      fontWeight: 600,
                      marginBottom: 8,
                    }}
                  >
                    こっちも候補
                  </p>
                  <div className="flex flex-col" style={{ gap: 8 }}>
                    {detail.alternatives.map((alt, i) => (
                      <button
                        key={`${alt.title}-${i}`}
                        onClick={() => handleAlternativeTap(alt)}
                        style={{
                          textAlign: "left",
                          background: C.s2,
                          border: `1px solid ${C.t4}40`,
                          borderRadius: 10,
                          padding: "10px 12px",
                          cursor: alt.url ? "pointer" : "default",
                        }}
                      >
                        <p
                          style={{
                            fontSize: 12,
                            color: C.t1,
                            fontWeight: 600,
                            lineHeight: 1.35,
                          }}
                        >
                          {alt.title}
                          {alt.url && (
                            <span style={{ color: C.coalter, marginLeft: 6, fontWeight: 500 }}>↗</span>
                          )}
                        </p>
                        <p
                          style={{
                            fontSize: 10,
                            color: C.t3,
                            marginTop: 2,
                            lineHeight: 1.5,
                          }}
                        >
                          {alt.reason}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* sources */}
              {detail?.sources && detail.sources.length > 0 && (
                <div
                  style={{
                    marginTop: 20,
                    paddingTop: 12,
                    borderTop: `1px solid ${C.t4}40`,
                  }}
                >
                  <p
                    style={{
                      fontSize: 10,
                      color: C.t3,
                      fontWeight: 600,
                      marginBottom: 6,
                      letterSpacing: 1,
                    }}
                  >
                    情報の出典
                  </p>
                  <div
                    className="flex flex-wrap"
                    style={{ gap: 8 }}
                  >
                    {detail.sources.map((s, i) => (
                      <button
                        key={`${s.url}-${i}`}
                        onClick={() => handleSourceTap(s)}
                        style={{
                          fontSize: 10,
                          color: C.coalter,
                          background: `${C.coalter}08`,
                          border: `1px solid ${C.coalter}20`,
                          borderRadius: 6,
                          padding: "3px 8px",
                          cursor: "pointer",
                        }}
                      >
                        {s.label} ↗
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function FactLine({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start" style={{ gap: 10, padding: "4px 0" }}>
      <span
        style={{
          fontSize: 10,
          color: C.t3,
          fontWeight: 600,
          minWidth: 52,
          flexShrink: 0,
          paddingTop: 2,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 12, color: C.t1, lineHeight: 1.5 }}>{value}</span>
    </div>
  );
}

/**
 * providerType 5 分類 × confidence に応じた補助文言。
 *
 * Phase B Commit 4 (2026-04-19): BookingProviderType を 5 分類に拡張。
 *   - official                       : 公式ドメイン（booking path あり）
 *   - official_site                  : 公式ドメイン（booking path なし）
 *   - official_reservation_partner   : 公式採用の予約 SaaS（TableCheck 等）
 *   - third_party_listing            : 第三者リスティング（食べログ / Retty 等）
 *   - unknown                        : 分類不能（虚偽導線回避のため弱い表示）
 */
function confidenceHint(b: BookingHandoff): string {
  switch (b.providerType) {
    case "official":
      // 映画は「予約」にならない文言（resolveLabel が「上映ページを見る」等を返す）
      if (b.confidence === "high") return "公式の予約ページに移動します";
      return "公式サイトに移動します";
    case "official_site":
      return "公式ページで詳細を確認できます";
    case "official_reservation_partner":
      return b.providerName
        ? `${b.providerName} 経由の公式予約ページです`
        : "公式の予約パートナーサイトに移動します";
    case "third_party_listing":
      return b.providerName
        ? `${b.providerName} の情報ページで詳細を確認できます`
        : "外部サイトで詳細を確認できます";
    case "unknown":
      // 虚偽導線回避: 「予約」「公式」を出さない弱い表現
      return "外部サイトで確認してね";
    default:
      return "外部サイトで確認してね";
  }
}
