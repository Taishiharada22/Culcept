"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { GlassCard, GlassButton, GlassBadge, FadeInView } from "@/components/ui/glassmorphism-design";

/* ---------- Types ---------- */

type VerificationStatus = "pending" | "approved" | "rejected";

type Verification = {
  id: string;
  user_id: string;
  status: VerificationStatus;
  display_name: string;
  photo_atmosphere: string | null;
  photo_face: string | null;
  photo_best: string | null;
  photo_current: string | null;
  id_document: string | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

type FilterTab = "all" | "pending" | "approved" | "rejected";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "全て" },
  { key: "pending", label: "確認待ち" },
  { key: "approved", label: "承認済み" },
  { key: "rejected", label: "却下" },
];

const STATUS_BADGE: Record<VerificationStatus, { label: string; variant: "default" | "success" | "warning" | "danger" }> = {
  pending: { label: "確認待ち", variant: "warning" },
  approved: { label: "承認済み", variant: "success" },
  rejected: { label: "却下", variant: "danger" },
};

const PHOTO_LABELS: { key: keyof Pick<Verification, "photo_atmosphere" | "photo_face" | "photo_best" | "photo_current">; label: string }[] = [
  { key: "photo_atmosphere", label: "雰囲気" },
  { key: "photo_face", label: "顔写真" },
  { key: "photo_best", label: "ベストショット" },
  { key: "photo_current", label: "今の自分" },
];

/* ---------- Main Component ---------- */

export default function VerificationDashboard() {
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("pending");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const fetchVerifications = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/verification");
      const data = await res.json();
      if (data.ok) setVerifications(data.verifications ?? []);
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

  const handleApprove = async (v: Verification) => {
    setActionLoadingId(v.id);
    try {
      const res = await fetch("/api/admin/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationId: v.id, action: "approve" }),
      });
      if (res.ok) {
        setVerifications((prev) =>
          prev.map((item) =>
            item.id === v.id ? { ...item, status: "approved" as const, reviewed_at: new Date().toISOString() } : item,
          ),
        );
      }
    } catch {
      /* silent */
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (v: Verification) => {
    setActionLoadingId(v.id);
    try {
      const res = await fetch("/api/admin/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verificationId: v.id,
          action: "reject",
          reason: rejectReason || undefined,
        }),
      });
      if (res.ok) {
        setVerifications((prev) =>
          prev.map((item) =>
            item.id === v.id
              ? { ...item, status: "rejected" as const, rejection_reason: rejectReason || null, reviewed_at: new Date().toISOString() }
              : item,
          ),
        );
        setRejectingId(null);
        setRejectReason("");
      }
    } catch {
      /* silent */
    } finally {
      setActionLoadingId(null);
    }
  };

  /* -- Filtering -- */

  const filtered = verifications.filter((v) => {
    if (filter === "all") return true;
    return v.status === filter;
  });

  const pendingCount = verifications.filter((v) => v.status === "pending").length;

  /* -- Render -- */

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-slate-400">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 min-h-screen">
      {/* Header */}
      <FadeInView>
        <div className="mb-6">
          <Link
            href="/admin"
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            &larr; 管理画面
          </Link>
          <div className="flex items-center gap-3 mt-2">
            <h1 className="text-2xl font-extrabold text-slate-900">
              本人確認ダッシュボード
            </h1>
            {pendingCount > 0 && (
              <GlassBadge variant="warning" size="sm">
                {pendingCount}件 待機中
              </GlassBadge>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Rendezvous 本人確認の審査を行います
          </p>
        </div>
      </FadeInView>

      {/* Filter Tabs */}
      <FadeInView delay={0.1}>
        <div className="flex gap-2 mb-6">
          {FILTER_TABS.map((tab) => (
            <GlassButton
              key={tab.key}
              variant={filter === tab.key ? "primary" : "ghost"}
              size="sm"
              onClick={() => setFilter(tab.key)}
            >
              {tab.label}
            </GlassButton>
          ))}
        </div>
      </FadeInView>

      {/* Verification Cards */}
      {filtered.length === 0 ? (
        <FadeInView delay={0.2}>
          <GlassCard className="p-8 text-center">
            <p className="text-sm text-slate-400">
              該当する確認申請はありません
            </p>
          </GlassCard>
        </FadeInView>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((v, i) => {
            const isActionLoading = actionLoadingId === v.id;
            const isRejecting = rejectingId === v.id;
            const badge = STATUS_BADGE[v.status];

            return (
              <FadeInView key={v.id} delay={0.1 + i * 0.05}>
                <GlassCard className="p-5">
                  {/* Top row */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-base font-bold text-slate-900">
                        {v.display_name}
                      </span>
                      <GlassBadge variant={badge.variant} size="sm">
                        {badge.label}
                      </GlassBadge>
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(v.created_at).toLocaleString("ja-JP", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  {/* Photos grid - 4 photos side by side */}
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {PHOTO_LABELS.map(({ key, label }) => (
                      <div key={key}>
                        <p className="text-[10px] font-semibold text-slate-400 mb-1 text-center">
                          {label}
                        </p>
                        <div className="aspect-[3/4] rounded-xl overflow-hidden bg-slate-100 border border-slate-200/50">
                          {v[key] ? (
                            <img
                              src={v[key]!}
                              alt={label}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">
                              未提出
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* ID document */}
                  <div className="mb-4">
                    <p className="text-[10px] font-semibold text-slate-400 mb-1">
                      身分証明書
                    </p>
                    <div className="w-48 aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 border border-slate-200/50 relative">
                      {v.id_document ? (
                        <>
                          <img
                            src={v.id_document}
                            alt="身分証明書"
                            className="w-full h-full object-cover"
                            style={{ filter: "blur(4px)" }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <button
                              onClick={(e) => {
                                const img = e.currentTarget.parentElement?.querySelector("img");
                                if (img) {
                                  img.style.filter = img.style.filter ? "" : "blur(4px)";
                                }
                              }}
                              className="px-3 py-1.5 rounded-lg bg-black/50 text-white text-[10px] font-semibold backdrop-blur-sm hover:bg-black/70 transition-colors"
                            >
                              表示切替
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">
                          未提出
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Rejection reason display */}
                  {v.rejection_reason && v.status === "rejected" && (
                    <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100">
                      <p className="text-xs text-red-600">
                        <span className="font-semibold">却下理由:</span> {v.rejection_reason}
                      </p>
                    </div>
                  )}

                  {/* Reject reason input */}
                  {isRejecting && (
                    <div className="mb-4">
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="却下理由を入力してください（任意）..."
                        className="w-full min-h-[60px] p-3 rounded-xl border border-slate-200 bg-white/50 text-sm text-slate-700 resize-vertical outline-none focus:border-slate-400 transition-colors"
                      />
                      <div className="flex gap-2 mt-2">
                        <GlassButton
                          variant="primary"
                          size="sm"
                          onClick={() => handleReject(v)}
                          disabled={isActionLoading}
                        >
                          {isActionLoading ? "処理中..." : "却下を確定"}
                        </GlassButton>
                        <GlassButton
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setRejectingId(null);
                            setRejectReason("");
                          }}
                        >
                          キャンセル
                        </GlassButton>
                      </div>
                    </div>
                  )}

                  {/* Action buttons (only for pending) */}
                  {v.status === "pending" && !isRejecting && (
                    <div className="flex gap-2">
                      <GlassButton
                        variant="primary"
                        size="sm"
                        onClick={() => handleApprove(v)}
                        disabled={isActionLoading}
                        className="!bg-emerald-500/10 !text-emerald-600 !border-emerald-200 hover:!bg-emerald-500/20"
                      >
                        {isActionLoading ? "処理中..." : "承認"}
                      </GlassButton>
                      <GlassButton
                        variant="ghost"
                        size="sm"
                        onClick={() => setRejectingId(v.id)}
                        disabled={isActionLoading}
                        className="!text-red-500 !border-red-200 hover:!bg-red-500/10"
                      >
                        却下
                      </GlassButton>
                    </div>
                  )}
                </GlassCard>
              </FadeInView>
            );
          })}
        </div>
      )}
    </div>
  );
}
