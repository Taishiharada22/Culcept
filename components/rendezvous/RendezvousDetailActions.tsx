"use client";

/**
 * RendezvousDetailActions
 * Like / Pass / Save action buttons for candidate detail page.
 * Light-mode: 透明感のある淡い色
 *
 * 既存機能を維持:
 * - Like/Pass/Save/Block/Report API呼び出し
 * - mutual_likeでConversationPrompt表示
 * - フィードバック表示
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { safeLSSet } from "@/lib/safeLocalStorage";
import MatchRevealCeremony from "./MatchRevealCeremony";
import ReportFormModal from "./ReportFormModal";
import OrbiterReflectionModal from "@/components/orbiter/OrbiterReflectionModal";
import DisconnectReasonSelector from "@/components/rendezvous/counselor/DisconnectReasonSelector";
import RecoveryFlow from "@/components/rendezvous/counselor/RecoveryFlow";
import type { DisconnectReasonCode } from "@/lib/rendezvous/counselor/types";
import { hapticSuccess } from "@/lib/rendezvous/haptics";

type ActionResult = {
  ok: boolean;
  status?: string;
  error?: string;
};

type Props = {
  candidateId: string;
  actions: {
    canLike: boolean;
    canPass: boolean;
    canSave: boolean;
    canMute: boolean;
    canBlock: boolean;
    canReport: boolean;
  };
};

export default function RendezvousDetailActions({
  candidateId,
  actions,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showReflection, setShowReflection] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showDisconnectSelector, setShowDisconnectSelector] = useState(false);
  const [disconnectAnalysisId, setDisconnectAnalysisId] = useState<string | null>(null);

  const handleCounselorDisconnect = async (reasonCode: DisconnectReasonCode, detail?: string) => {
    setShowDisconnectSelector(false);
    setBusy(true);
    try {
      const res = await fetch("/api/rendezvous/counselor/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ candidateId, reasonCode, reasonDetail: detail }),
      });
      const data = await res.json();
      if (data.analysisId) {
        setDisconnectAnalysisId(data.analysisId);
      } else {
        setFeedback("見送りました");
        setTimeout(() => router.push("/rendezvous"), 800);
      }
    } catch {
      setFeedback("通信エラーが発生しました");
    } finally {
      setBusy(false);
    }
  };

  const callAction = useCallback(
    async (action: string) => {
      setBusy(true);
      setFeedback(null);
      try {
        const res = await fetch(`/api/rendezvous/${candidateId}/${action}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        const data: ActionResult = await res.json();
        if (!data.ok) {
          setFeedback(data.error ?? "エラーが発生しました");
          return;
        }

        // Increment interaction count for growth tracking
        try {
          const count = parseInt(localStorage.getItem("rv_interaction_count") ?? "0", 10);
          localStorage.setItem("rv_interaction_count", String(count + 1));
        } catch {}

        if (action === "like" && data.status === "mutual_liked") {
          hapticSuccess();
          // Check if reflection already submitted for this candidate
          const reflectionKey = `orbiter_reflection_done_${candidateId}`;
          const alreadyReflected = localStorage.getItem(reflectionKey);
          if (!alreadyReflected) {
            setShowReflection(true); // Show reflection first, then prompt
          } else {
            setShowPrompt(true);
          }
          return;
        }

        if (action === "like") {
          setFeedback("興味を伝えました。相手の反応を待ちましょう");
        } else if (action === "pass") {
          setFeedback("見送りました。新しい出会いが表示されます");
          setTimeout(() => router.push("/rendezvous"), 1200);
        } else if (action === "save") {
          setFeedback("保留リストに追加しました。いつでも見返せます");
        } else if (action === "block") {
          setFeedback("ブロックしました");
          setTimeout(() => router.push("/rendezvous"), 800);
        } else if (action === "report") {
          setFeedback("報告を受け付けました");
        }
      } catch {
        setFeedback("通信エラーが発生しました");
      } finally {
        setBusy(false);
      }
    },
    [candidateId, router],
  );

  // Reflection modal (shown after mutual_liked, before conversation prompt)
  if (showReflection) {
    return (
      <>
        <OrbiterReflectionModal
          candidateId={candidateId}
          reflectionType="chat_phase"
          onClose={() => {
            // Mark as done to prevent re-triggering
            safeLSSet(
              `orbiter_reflection_done_${candidateId}`,
              "mutual_liked",
            );
            setShowReflection(false);
            setShowPrompt(true); // Proceed to conversation prompt
          }}
          onSubmitted={() => {
            safeLSSet(
              `orbiter_reflection_done_${candidateId}`,
              "mutual_liked",
            );
            setShowReflection(false);
            setShowPrompt(true);
          }}
        />
      </>
    );
  }

  // --- Counselor disconnect flow ---
  if (showDisconnectSelector) {
    return (
      <DisconnectReasonSelector
        candidateId={candidateId}
        onSubmit={handleCounselorDisconnect}
        onCancel={() => setShowDisconnectSelector(false)}
      />
    );
  }

  if (disconnectAnalysisId) {
    return (
      <RecoveryFlow
        analysisId={disconnectAnalysisId}
        onComplete={() => router.push("/rendezvous")}
      />
    );
  }

  if (showPrompt) {
    return (
      <MatchRevealCeremony
        candidateId={candidateId}
        onStartChat={() => {
          router.push(`/rendezvous/${candidateId}?chat=1`);
        }}
        onLater={() => {
          setShowPrompt(false);
          router.push("/rendezvous");
        }}
      />
    );
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Primary actions */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: feedback ? 8 : 0,
        }}
      >
        {/* Like */}
        {actions.canLike && (
          <button
            disabled={busy}
            onClick={() => callAction("like")}
            style={{
              flex: 1,
              padding: "12px 0",
              borderRadius: 10,
              border: "none",
              cursor: busy ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 700,
              color: "#fff",
              background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
              boxShadow: "0 2px 12px rgba(99,102,241,0.2)",
              opacity: busy ? 0.5 : 1,
              transition: "opacity 0.2s",
            }}
          >
            軌道をつなぐ
          </button>
        )}

        {/* Pass — カウンセラーフロー経由 */}
        {actions.canPass && (
          <button
            disabled={busy}
            onClick={() => setShowDisconnectSelector(true)}
            style={{
              flex: 0.6,
              padding: "12px 0",
              borderRadius: 10,
              border: "1px solid rgba(30,30,60,0.08)",
              cursor: busy ? "not-allowed" : "pointer",
              fontSize: 12,
              fontWeight: 600,
              color: "rgba(30,30,60,0.4)",
              background: "rgba(255,255,255,0.6)",
              opacity: busy ? 0.5 : 1,
              transition: "opacity 0.2s",
            }}
          >
            見送る
          </button>
        )}

        {/* Save */}
        {actions.canSave && (
          <button
            disabled={busy}
            onClick={() => callAction("save")}
            style={{
              flex: 0.6,
              padding: "12px 0",
              borderRadius: 10,
              border: "1px solid rgba(139,92,246,0.12)",
              cursor: busy ? "not-allowed" : "pointer",
              fontSize: 12,
              fontWeight: 600,
              color: "#7C3AED",
              background: "rgba(139,92,246,0.05)",
              opacity: busy ? 0.5 : 1,
              transition: "opacity 0.2s",
            }}
          >
            あとで考える
          </button>
        )}

        {/* Overflow menu button */}
        <button
          onClick={() => setShowMenu((v) => !v)}
          style={{
            width: 40,
            padding: "12px 0",
            borderRadius: 10,
            border: "1px solid rgba(30,30,60,0.06)",
            cursor: "pointer",
            fontSize: 14,
            color: "rgba(30,30,60,0.3)",
            background: "rgba(255,255,255,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          ...
        </button>
      </div>

      {/* Feedback message */}
      {feedback && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            background: "rgba(99,102,241,0.06)",
            border: "1px solid rgba(99,102,241,0.08)",
            fontSize: 12,
            fontWeight: 500,
            color: "rgba(30,30,60,0.65)",
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          {feedback}
        </div>
      )}

      {/* Overflow menu */}
      {showMenu && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 52,
            padding: "4px 0",
            borderRadius: 10,
            background: "#fff",
            border: "1px solid rgba(30,30,60,0.06)",
            boxShadow: "0 4px 20px rgba(30,30,60,0.1)",
            zIndex: 10,
            minWidth: 160,
          }}
        >
          {actions.canBlock && (
            <button
              onClick={() => {
                setShowMenu(false);
                callAction("block");
              }}
              style={{
                display: "block",
                width: "100%",
                padding: "10px 16px",
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                color: "#DC2626",
                background: "transparent",
                textAlign: "left",
              }}
            >
              ブロックする
            </button>
          )}
          {actions.canReport && (
            <button
              onClick={() => {
                setShowMenu(false);
                setShowReportModal(true);
              }}
              style={{
                display: "block",
                width: "100%",
                padding: "10px 16px",
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                color: "#DC2626",
                background: "transparent",
                textAlign: "left",
              }}
            >
              通報する
            </button>
          )}
        </div>
      )}

      {/* Report form modal */}
      {showReportModal && (
        <ReportFormModal
          candidateId={candidateId}
          onClose={() => setShowReportModal(false)}
          onSubmitted={() => {
            setFeedback("報告を受け付けました");
          }}
        />
      )}
    </div>
  );
}
