"use client";

/**
 * Admin Identity Verification Review Page
 * 本人確認書類のレビュー・承認・リジェクト
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

/* ---------- Types ---------- */

type DocType = "drivers_license" | "passport" | "my_number_card";

type Verification = {
  user_id: string;
  display_name: string;
  document_type: DocType;
  id_document_path: string | null;
  selfie_path: string | null;
  verification_status: string;
  review_status: string;
  verification_submitted_at: string | null;
  verification_reviewer_note: string | null;
  verification_level: number;
  frozen_at: string | null;
  frozen_reason: string | null;
  manual_review_required: boolean;
  // Computed for UI compatibility
  id: string; // mapped from user_id
  status: "pending" | "approved" | "rejected" | "resubmit_requested";
  submitted_at: string;
  document_image_url: string | null;
  selfie_image_url: string | null;
  reviewer_note: string | null;
};

type FilterTab = "all" | "pending" | "approved" | "rejected" | "frozen";

const DOC_TYPE_LABELS: Record<DocType, string> = {
  drivers_license: "運転免許証",
  passport: "パスポート",
  my_number_card: "マイナンバーカード",
};

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "全て" },
  { key: "pending", label: "確認待ち" },
  { key: "approved", label: "承認済み" },
  { key: "rejected", label: "リジェクト" },
  { key: "frozen", label: "凍結中" },
];

const LEVEL_LABELS: Record<number, string> = {
  0: "L0 未確認",
  1: "L1 メール",
  2: "L2 写真",
  3: "L3 身分証",
  4: "L4 追加証明",
};

// verification_status 表示用
const VS_COLORS: Record<string, string> = {
  unverified: "rgba(255,255,255,0.3)",
  pending: "#F59E0B",
  verified: "#22C55E",
  rejected: "#EF4444",
  expired: "#F97316",
};

const VS_LABELS: Record<string, string> = {
  unverified: "未確認",
  pending: "確認中",
  verified: "確認済み",
  rejected: "却下",
  expired: "期限切れ",
};

// review_status 表示用
const RS_COLORS: Record<string, string> = {
  not_submitted: "rgba(255,255,255,0.3)",
  pending: "#F59E0B",
  approved: "#22C55E",
  rejected: "#EF4444",
};

const RS_LABELS: Record<string, string> = {
  not_submitted: "未提出",
  pending: "審査中",
  approved: "承認",
  rejected: "却下",
};

// Legacy compat (UI internal)
const STATUS_COLORS: Record<string, string> = { ...VS_COLORS, ...RS_COLORS };
const STATUS_LABELS: Record<string, string> = { ...VS_LABELS, ...RS_LABELS };

/* ---------- Main Component ---------- */

export default function VerificationReviewPage() {
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("pending");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [noteInputId, setNoteInputId] = useState<string | null>(null);
  const [noteAction, setNoteAction] = useState<"request_resubmit" | "reject" | "freeze" | null>(null);
  const [noteText, setNoteText] = useState("");
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  const fetchVerifications = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/rendezvous/verifications?status=all`);
      const data = await res.json();
      if (data.ok) {
        // Map raw DB fields to UI-compatible shape
        const mapped = (data.verifications ?? []).map((row: any) => ({
          ...row,
          id: row.user_id,
          // UI内部の status は review_status を使用（管理側の審査状態）
          status: row.review_status === "not_submitted" ? "not_submitted" : row.review_status,
          submitted_at: row.verification_submitted_at ?? new Date().toISOString(),
          document_image_url: row.id_document_path ?? null,
          selfie_image_url: row.selfie_path ?? null,
          reviewer_note: row.verification_reviewer_note ?? null,
        }));
        setVerifications(mapped);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVerifications();
  }, [fetchVerifications]);

  /* -- Actions -- */

  const handleAction = async (
    userId: string,
    verificationId: string,
    action: "approve" | "request_resubmit" | "reject" | "freeze" | "unfreeze",
    note?: string
  ) => {
    setActionLoadingId(verificationId);
    try {
      const res = await fetch("/api/admin/rendezvous/verifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action, note }),
      });
      if (res.ok) {
        // Animate removal
        setRemovingIds((prev) => new Set(prev).add(verificationId));
        setTimeout(() => {
          setVerifications((prev) => prev.filter((v) => v.id !== verificationId));
          setRemovingIds((prev) => {
            const next = new Set(prev);
            next.delete(verificationId);
            return next;
          });
        }, 400);
      }
    } catch {
      /* silent */
    } finally {
      setActionLoadingId(null);
      setNoteInputId(null);
      setNoteAction(null);
      setNoteText("");
    }
  };

  const openNoteInput = (id: string, action: "request_resubmit" | "reject" | "freeze") => {
    setNoteInputId(id);
    setNoteAction(action);
    setNoteText("");
  };

  /* -- Filtering -- */

  const filtered = verifications.filter((v) => {
    if (filter === "all") return true;
    if (filter === "frozen") return !!v.frozen_at;
    if (filter === "pending") return v.review_status === "pending";
    if (filter === "approved") return v.review_status === "approved";
    if (filter === "rejected") return v.review_status === "rejected";
    return true;
  });

  const pendingCount = verifications.filter(
    (v) => v.review_status === "pending"
  ).length;

  /* -- Loading -- */

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>
        読み込み中...
      </div>
    );
  }

  return (
    <div style={{ padding: "20px", maxWidth: 960, margin: "0 auto", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link
          href="/admin/rendezvous"
          style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textDecoration: "none" }}
        >
          &larr; Rendezvous Dashboard
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: 0 }}>
            本人確認レビュー
          </h1>
          {pendingCount > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 24,
                height: 24,
                borderRadius: 12,
                background: "#F59E0B",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                padding: "0 8px",
              }}
            >
              {pendingCount}
            </span>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {FILTER_TABS.map((tab) => {
          const active = filter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              style={{
                padding: "8px 16px",
                borderRadius: 10,
                border: "1px solid",
                borderColor: active ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.08)",
                background: active ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.04)",
                color: active ? "#A5B4FC" : "rgba(255,255,255,0.45)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Card List */}
      {filtered.length === 0 ? (
        <div
          style={{
            padding: 40,
            textAlign: "center",
            color: "rgba(255,255,255,0.25)",
            fontSize: 13,
          }}
        >
          該当する確認申請はありません
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((v) => {
            const isRemoving = removingIds.has(v.id);
            const isActionLoading = actionLoadingId === v.id;
            const showNoteInput = noteInputId === v.id;

            return (
              <div
                key={v.id}
                style={{
                  padding: "18px 20px",
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.06)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  opacity: isRemoving ? 0 : 1,
                  transform: isRemoving ? "translateX(60px)" : "translateX(0)",
                  transition: "opacity 0.4s, transform 0.4s",
                  overflow: "hidden",
                }}
              >
                {/* Top row: Info + Status */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 14,
                  }}
                >
                  <div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
                      {v.display_name}
                    </span>
                    <span
                      style={{
                        marginLeft: 10,
                        fontSize: 11,
                        color: "rgba(255,255,255,0.4)",
                        fontWeight: 500,
                      }}
                    >
                      {DOC_TYPE_LABELS[v.document_type] ?? v.document_type}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {typeof v.verification_level === "number" && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: v.verification_level >= 3 ? "#22C55E" : "#A5B4FC",
                          padding: "3px 8px",
                          borderRadius: 6,
                          background: v.verification_level >= 3 ? "rgba(34,197,94,0.12)" : "rgba(99,102,241,0.12)",
                        }}
                      >
                        {LEVEL_LABELS[v.verification_level] ?? `L${v.verification_level}`}
                      </span>
                    )}
                    {v.frozen_at && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#EF4444",
                          padding: "3px 8px",
                          borderRadius: 6,
                          background: "rgba(239,68,68,0.12)",
                        }}
                      >
                        凍結中
                      </span>
                    )}
                    {/* verification_status (ユーザー向け) */}
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: VS_COLORS[v.verification_status] ?? "#fff",
                        padding: "3px 8px",
                        borderRadius: 6,
                        background: `${VS_COLORS[v.verification_status] ?? "#fff"}15`,
                      }}
                    >
                      {VS_LABELS[v.verification_status] ?? v.verification_status}
                    </span>
                    {/* review_status (管理側) */}
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: RS_COLORS[v.review_status] ?? "#fff",
                        padding: "3px 8px",
                        borderRadius: 6,
                        background: `${RS_COLORS[v.review_status] ?? "#fff"}15`,
                      }}
                    >
                      審査: {RS_LABELS[v.review_status] ?? v.review_status}
                    </span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
                      {new Date(v.submitted_at).toLocaleString("ja-JP", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                {/* Images: Document (blurred) + Selfie */}
                <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
                  {/* Document image - blurred for privacy */}
                  <div style={{ flex: 1, position: "relative" }}>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: "rgba(255,255,255,0.35)",
                        marginBottom: 6,
                      }}
                    >
                      書類画像
                    </div>
                    <div
                      style={{
                        position: "relative",
                        width: "100%",
                        aspectRatio: "4/3",
                        borderRadius: 12,
                        overflow: "hidden",
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      {v.document_image_url ? (
                        <img
                          src={v.document_image_url}
                          alt="本人確認書類"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            filter: "blur(8px)",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "rgba(255,255,255,0.2)",
                            fontSize: 11,
                          }}
                        >
                          画像なし
                        </div>
                      )}
                      <div
                        style={{
                          position: "absolute",
                          bottom: 8,
                          left: 8,
                          right: 8,
                          fontSize: 9,
                          color: "rgba(255,255,255,0.5)",
                          background: "rgba(0,0,0,0.5)",
                          padding: "4px 8px",
                          borderRadius: 6,
                          textAlign: "center",
                        }}
                      >
                        プライバシー保護のためぼかし表示
                      </div>
                    </div>
                  </div>

                  {/* Selfie image */}
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: "rgba(255,255,255,0.35)",
                        marginBottom: 6,
                      }}
                    >
                      セルフィー
                    </div>
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "4/3",
                        borderRadius: 12,
                        overflow: "hidden",
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      {v.selfie_image_url ? (
                        <img
                          src={v.selfie_image_url}
                          alt="セルフィー"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "rgba(255,255,255,0.2)",
                            fontSize: 11,
                          }}
                        >
                          画像なし
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Reviewer note (if exists) */}
                {v.reviewer_note && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.4)",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "rgba(255,255,255,0.03)",
                      marginBottom: 12,
                    }}
                  >
                    前回のメモ: {v.reviewer_note}
                  </div>
                )}

                {/* Note input (for resubmit/reject) */}
                {showNoteInput && (
                  <div style={{ marginBottom: 12 }}>
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder={
                        noteAction === "request_resubmit"
                          ? "再撮影の理由を入力してください..."
                          : noteAction === "freeze"
                            ? "凍結理由を入力してください（必須）..."
                            : "リジェクトの理由を入力してください..."
                      }
                      style={{
                        width: "100%",
                        minHeight: 60,
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.1)",
                        background: "rgba(255,255,255,0.04)",
                        color: "#fff",
                        fontSize: 12,
                        resize: "vertical",
                        outline: "none",
                        fontFamily: "inherit",
                      }}
                    />
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button
                        onClick={() =>
                          handleAction(v.user_id, v.id, noteAction!, noteText || undefined)
                        }
                        disabled={isActionLoading || (noteAction === "freeze" && !noteText.trim())}
                        style={{
                          padding: "7px 14px",
                          borderRadius: 8,
                          border: "none",
                          background:
                            noteAction === "reject" ? "#EF4444" : noteAction === "freeze" ? "#8B5CF6" : "#F59E0B",
                          color: "#fff",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: (isActionLoading || (noteAction === "freeze" && !noteText.trim())) ? "not-allowed" : "pointer",
                          opacity: isActionLoading ? 0.5 : 1,
                        }}
                      >
                        {isActionLoading
                          ? "処理中..."
                          : noteAction === "reject"
                            ? "リジェクト実行"
                            : noteAction === "freeze"
                              ? "凍結実行"
                              : "再撮影依頼を送信"}
                      </button>
                      <button
                        onClick={() => {
                          setNoteInputId(null);
                          setNoteAction(null);
                          setNoteText("");
                        }}
                        style={{
                          padding: "7px 14px",
                          borderRadius: 8,
                          border: "1px solid rgba(255,255,255,0.1)",
                          background: "transparent",
                          color: "rgba(255,255,255,0.4)",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}

                {/* Action buttons (only for pending review_status, hide when note input is open) */}
                {v.review_status === "pending" &&
                  !showNoteInput && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => handleAction(v.user_id, v.id, "approve")}
                        disabled={isActionLoading}
                        style={{
                          padding: "8px 16px",
                          borderRadius: 10,
                          border: "none",
                          background: "rgba(34,197,94,0.15)",
                          color: "#22C55E",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: isActionLoading ? "not-allowed" : "pointer",
                          opacity: isActionLoading ? 0.5 : 1,
                          transition: "background 0.2s",
                        }}
                      >
                        {isActionLoading ? "処理中..." : "承認"}
                      </button>
                      <button
                        onClick={() => openNoteInput(v.id, "request_resubmit")}
                        disabled={isActionLoading}
                        style={{
                          padding: "8px 16px",
                          borderRadius: 10,
                          border: "none",
                          background: "rgba(245,158,11,0.12)",
                          color: "#F59E0B",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: isActionLoading ? "not-allowed" : "pointer",
                          opacity: isActionLoading ? 0.5 : 1,
                          transition: "background 0.2s",
                        }}
                      >
                        再撮影依頼
                      </button>
                      <button
                        onClick={() => openNoteInput(v.id, "reject")}
                        disabled={isActionLoading}
                        style={{
                          padding: "8px 16px",
                          borderRadius: 10,
                          border: "none",
                          background: "rgba(239,68,68,0.12)",
                          color: "#EF4444",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: isActionLoading ? "not-allowed" : "pointer",
                          opacity: isActionLoading ? 0.5 : 1,
                          transition: "background 0.2s",
                        }}
                      >
                        リジェクト
                      </button>
                      {/* Freeze / Unfreeze */}
                      {v.frozen_at ? (
                        <button
                          onClick={() => handleAction(v.user_id, v.id, "unfreeze")}
                          disabled={isActionLoading}
                          style={{
                            padding: "8px 16px",
                            borderRadius: 10,
                            border: "1px solid rgba(99,102,241,0.3)",
                            background: "transparent",
                            color: "#A5B4FC",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: isActionLoading ? "not-allowed" : "pointer",
                            opacity: isActionLoading ? 0.5 : 1,
                          }}
                        >
                          凍結解除
                        </button>
                      ) : (
                        <button
                          onClick={() => openNoteInput(v.id, "freeze")}
                          disabled={isActionLoading}
                          style={{
                            padding: "8px 16px",
                            borderRadius: 10,
                            border: "none",
                            background: "rgba(139,92,246,0.12)",
                            color: "#A78BFA",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: isActionLoading ? "not-allowed" : "pointer",
                            opacity: isActionLoading ? 0.5 : 1,
                          }}
                        >
                          凍結
                        </button>
                      )}
                    </div>
                  )}

                {/* Freeze/Unfreeze for non-pending items */}
                {v.review_status !== "pending" && !showNoteInput && (
                  <div style={{ display: "flex", gap: 8 }}>
                    {v.frozen_at ? (
                      <button
                        onClick={() => handleAction(v.user_id, v.id, "unfreeze")}
                        disabled={isActionLoading}
                        style={{
                          padding: "8px 16px",
                          borderRadius: 10,
                          border: "1px solid rgba(99,102,241,0.3)",
                          background: "transparent",
                          color: "#A5B4FC",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: isActionLoading ? "not-allowed" : "pointer",
                          opacity: isActionLoading ? 0.5 : 1,
                        }}
                      >
                        凍結解除
                      </button>
                    ) : (
                      <button
                        onClick={() => openNoteInput(v.id, "freeze")}
                        disabled={isActionLoading}
                        style={{
                          padding: "8px 16px",
                          borderRadius: 10,
                          border: "none",
                          background: "rgba(139,92,246,0.12)",
                          color: "#A78BFA",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: isActionLoading ? "not-allowed" : "pointer",
                          opacity: isActionLoading ? 0.5 : 1,
                        }}
                      >
                        凍結
                      </button>
                    )}
                  </div>
                )}

                {/* Frozen reason display */}
                {v.frozen_at && v.frozen_reason && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "rgba(239,68,68,0.8)",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "rgba(239,68,68,0.06)",
                      marginTop: 8,
                    }}
                  >
                    凍結理由: {v.frozen_reason}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
