"use client";

/**
 * CEO 本人確認レビューページ
 * /ceo/verifications
 *
 * 既存の /api/admin/rendezvous/verifications を利用して
 * 審査一覧の表示・承認・却下・凍結を行う。
 * 書類画像は Supabase Storage の signed URL で閲覧する。
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

/* ── Types ── */

type DocType = "drivers_license" | "passport" | "my_number_card";

interface Verification {
  user_id: string;
  display_name: string;
  document_type: DocType;
  id_document_path: string | null;
  selfie_path: string | null;
  verification_status: string;
  review_status: string;
  verification_submitted_at: string | null;
  verification_reviewed_at: string | null;
  verification_reviewer_note: string | null;
  verification_level: number;
  frozen_at: string | null;
  frozen_reason: string | null;
  manual_review_required: boolean;
  birth_date: string | null;
}

type PartnerDocType = "single_status" | "income" | "education" | "employment";

interface PartnerDocument {
  user_id: string;
  display_name: string | null;
  verification_level: number;
  document_type: PartnerDocType;
  status: string;
}

type SectionTab = "identity" | "partner_documents";
type FilterTab = "pending" | "approved" | "rejected" | "frozen";

/* ── Constants ── */

const DOC_TYPE_LABELS: Record<DocType, string> = {
  drivers_license: "運転免許証",
  passport: "パスポート",
  my_number_card: "マイナンバーカード",
};

const PARTNER_DOC_TYPE_LABELS: Record<PartnerDocType, string> = {
  single_status: "独身証明書",
  income: "収入証明書",
  education: "学歴証明書",
  employment: "勤務先証明",
};

const SECTION_TABS: { key: SectionTab; label: string }[] = [
  { key: "identity", label: "本人確認" },
  { key: "partner_documents", label: "パートナー書類" },
];

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "pending", label: "確認待ち" },
  { key: "approved", label: "承認済み" },
  { key: "rejected", label: "却下" },
  { key: "frozen", label: "凍結中" },
];

const PARTNER_FILTER_TABS: { key: "pending" | "approved" | "rejected"; label: string }[] = [
  { key: "pending", label: "確認待ち" },
  { key: "approved", label: "承認済み" },
  { key: "rejected", label: "却下" },
];

const LEVEL_LABELS: Record<number, string> = {
  0: "L0 未確認",
  1: "L1 メール",
  2: "L2 写真",
  3: "L3 身分証",
  4: "L4 追加証明",
};

/* ── Helper ── */

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ── Main Component ── */

export default function CeoVerificationsPage() {
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [section, setSection] = useState<SectionTab>("identity");
  const [filter, setFilter] = useState<FilterTab>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<
    Record<string, { doc: string | null; selfie: string | null }>
  >({});
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [noteInputId, setNoteInputId] = useState<string | null>(null);
  const [noteAction, setNoteAction] = useState<
    "reject" | "freeze" | null
  >(null);
  const [noteText, setNoteText] = useState("");
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  // Partner documents state
  const [partnerDocs, setPartnerDocs] = useState<PartnerDocument[]>([]);
  const [partnerFilter, setPartnerFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [partnerLoading, setPartnerLoading] = useState(false);
  const [partnerError, setPartnerError] = useState<string | null>(null);
  const [partnerExpandedKey, setPartnerExpandedKey] = useState<string | null>(null);
  const [partnerSignedUrls, setPartnerSignedUrls] = useState<Record<string, string | null>>({});
  const [partnerActionLoadingKey, setPartnerActionLoadingKey] = useState<string | null>(null);
  const [partnerRemovingKeys, setPartnerRemovingKeys] = useState<Set<string>>(new Set());

  /* ── Fetch verifications ── */

  const fetchVerifications = useCallback(async () => {
    setFetchError(null);
    try {
      const res = await fetch(
        `/api/admin/rendezvous/verifications?status=all`,
      );
      if (!res.ok) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        console.error("[Verifications] API error:", res.status, errText);
        setFetchError(`API エラー: ${res.status}`);
        return;
      }
      const data = await res.json();
      console.log("[Verifications] Fetched:", data.verifications?.length ?? 0, "records", data.ok ? "" : `error: ${data.error}`);
      if (data.ok) {
        setVerifications(data.verifications ?? []);
      } else {
        setFetchError(data.error ?? "データ取得に失敗しました");
      }
    } catch (err) {
      console.error("[Verifications] Fetch error:", err);
      setFetchError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVerifications();
  }, [fetchVerifications]);

  /* ── Fetch partner documents ── */

  const fetchPartnerDocs = useCallback(async () => {
    setPartnerError(null);
    setPartnerLoading(true);
    try {
      const res = await fetch(
        `/api/admin/rendezvous/verifications?section=partner_documents&status=all`,
      );
      if (!res.ok) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        console.error("[Verifications] Partner docs API error:", res.status, errText);
        setPartnerError(`API エラー: ${res.status}`);
        return;
      }
      const data = await res.json();
      if (data.ok) {
        setPartnerDocs(data.partner_documents ?? []);
      } else {
        setPartnerError(data.error ?? "データ取得に失敗しました");
      }
    } catch (err) {
      console.error("[Verifications] Partner docs fetch error:", err);
      setPartnerError("通信エラーが発生しました");
    } finally {
      setPartnerLoading(false);
    }
  }, []);

  useEffect(() => {
    if (section === "partner_documents") {
      fetchPartnerDocs();
    }
  }, [section, fetchPartnerDocs]);

  /* ── Signed URL fetching ── */

  const fetchSignedUrl = useCallback(
    async (userId: string, docPath: string | null, selfiePath: string | null) => {
      if (signedUrls[userId]) return; // already fetched

      const results: { doc: string | null; selfie: string | null } = {
        doc: null,
        selfie: null,
      };

      try {
        if (docPath) {
          const res = await fetch(
            `/api/ceo/verification-signed-url?path=${encodeURIComponent(docPath)}`,
          );
          const data = await res.json();
          if (data.ok) results.doc = data.url;
        }
        if (selfiePath) {
          const res = await fetch(
            `/api/ceo/verification-signed-url?path=${encodeURIComponent(selfiePath)}`,
          );
          const data = await res.json();
          if (data.ok) results.selfie = data.url;
        }
      } catch {
        /* silent */
      }

      setSignedUrls((prev) => ({ ...prev, [userId]: results }));
    },
    [signedUrls],
  );

  /* ── Expand / collapse ── */

  const toggleExpand = (v: Verification) => {
    if (expandedId === v.user_id) {
      setExpandedId(null);
    } else {
      setExpandedId(v.user_id);
      fetchSignedUrl(v.user_id, v.id_document_path, v.selfie_path);
    }
  };

  /* ── Partner document: expand + signed URL ── */

  const fetchPartnerDocSignedUrl = useCallback(
    async (userId: string, docType: string) => {
      const cacheKey = `${userId}:${docType}`;
      if (partnerSignedUrls[cacheKey] !== undefined) return;

      // Storage pattern: {userId}/partner_{docType}_{timestamp}.jpg
      // List files matching the prefix and use the latest one
      try {
        const listRes = await fetch(
          `/api/ceo/verification-list-files?prefix=${encodeURIComponent(`${userId}/partner_${docType}_`)}`,
        );
        const listData = await listRes.json();
        const files: string[] = listData.ok ? (listData.files ?? []) : [];

        if (files.length > 0) {
          // Use the latest file (sorted by created_at ascending, so last = latest)
          const latestPath = files[files.length - 1];
          const urlRes = await fetch(
            `/api/ceo/verification-signed-url?path=${encodeURIComponent(latestPath)}`,
          );
          const urlData = await urlRes.json();
          setPartnerSignedUrls((prev) => ({
            ...prev,
            [cacheKey]: urlData.ok ? urlData.url : null,
          }));
        } else {
          setPartnerSignedUrls((prev) => ({ ...prev, [cacheKey]: null }));
        }
      } catch {
        setPartnerSignedUrls((prev) => ({ ...prev, [cacheKey]: null }));
      }
    },
    [partnerSignedUrls],
  );

  const togglePartnerExpand = (doc: PartnerDocument) => {
    const key = `${doc.user_id}:${doc.document_type}`;
    if (partnerExpandedKey === key) {
      setPartnerExpandedKey(null);
    } else {
      setPartnerExpandedKey(key);
      fetchPartnerDocSignedUrl(doc.user_id, doc.document_type);
    }
  };

  /* ── Partner document: approve / reject ── */

  const handlePartnerDocAction = async (
    userId: string,
    documentType: string,
    action: "approve_document" | "reject_document",
  ) => {
    const key = `${userId}:${documentType}`;
    setPartnerActionLoadingKey(key);
    try {
      const res = await fetch("/api/admin/rendezvous/verifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action, documentType }),
      });
      if (res.ok) {
        setPartnerRemovingKeys((prev) => new Set(prev).add(key));
        setTimeout(() => {
          fetchPartnerDocs();
          setPartnerRemovingKeys((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
          setPartnerExpandedKey(null);
        }, 400);
      }
    } catch {
      /* silent */
    } finally {
      setPartnerActionLoadingKey(null);
    }
  };

  /* ── Actions ── */

  const handleAction = async (
    userId: string,
    action: "approve" | "reject" | "freeze" | "unfreeze",
    note?: string,
  ) => {
    setActionLoadingId(userId);
    try {
      const res = await fetch("/api/admin/rendezvous/verifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action, note }),
      });
      if (res.ok) {
        setRemovingIds((prev) => new Set(prev).add(userId));
        setTimeout(() => {
          fetchVerifications();
          setRemovingIds((prev) => {
            const next = new Set(prev);
            next.delete(userId);
            return next;
          });
          setExpandedId(null);
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

  const openNoteInput = (id: string, action: "reject" | "freeze") => {
    setNoteInputId(id);
    setNoteAction(action);
    setNoteText("");
  };

  /* ── Filtering ── */

  const filtered = verifications.filter((v) => {
    if (filter === "frozen") return !!v.frozen_at;
    if (filter === "pending") return v.review_status === "pending";
    if (filter === "approved") return v.review_status === "approved";
    if (filter === "rejected") return v.review_status === "rejected";
    return true;
  });

  const pendingCount = verifications.filter(
    (v) => v.review_status === "pending",
  ).length;

  const filteredPartnerDocs = partnerDocs.filter(
    (d) => d.status === partnerFilter,
  );

  const partnerPendingCount = partnerDocs.filter(
    (d) => d.status === "pending",
  ).length;

  /* ── Render ── */

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-gray-400">
        読み込み中...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 pb-28 sm:p-6">
      {/* Header */}
      <div>
        <Link
          href="/ceo"
          className="text-xs text-gray-400 transition hover:text-gray-600"
        >
          &larr; CEO Dashboard
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight">
            本人確認レビュー
          </h1>
          {(pendingCount + partnerPendingCount) > 0 && (
            <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-amber-500 px-2 text-xs font-bold text-white">
              {pendingCount + partnerPendingCount}
            </span>
          )}
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-1 rounded-xl border border-gray-200 bg-white/60 p-1 backdrop-blur">
        {SECTION_TABS.map((tab) => {
          const active = section === tab.key;
          const badge =
            tab.key === "identity" ? pendingCount : partnerPendingCount;
          return (
            <button
              key={tab.key}
              onClick={() => setSection(tab.key)}
              className={`relative rounded-lg px-4 py-2 text-sm font-semibold transition ${
                active
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {tab.label}
              {badge > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filter Tabs — shown for identity section */}
      {section === "identity" && (
        <div className="flex gap-2">
          {FILTER_TABS.map((tab) => {
            const active = filter === tab.key;
            const count =
              tab.key === "pending"
                ? pendingCount
                : tab.key === "frozen"
                  ? verifications.filter((v) => !!v.frozen_at).length
                  : verifications.filter((v) => v.review_status === tab.key)
                      .length;
            return (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 bg-white/60 text-gray-500 hover:bg-white/80"
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className="ml-1.5 text-[10px] opacity-60">
                    ({count})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Filter Tabs — shown for partner_documents section */}
      {section === "partner_documents" && (
        <div className="flex gap-2">
          {PARTNER_FILTER_TABS.map((tab) => {
            const active = partnerFilter === tab.key;
            const count = partnerDocs.filter((d) => d.status === tab.key).length;
            return (
              <button
                key={tab.key}
                onClick={() => setPartnerFilter(tab.key)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 bg-white/60 text-gray-500 hover:bg-white/80"
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className="ml-1.5 text-[10px] opacity-60">
                    ({count})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Partner Documents Section ── */}
      {section === "partner_documents" && (
        <>
          {partnerError && (
            <div className="rounded-xl border border-red-200 bg-red-50/80 p-4 text-center text-sm text-red-600 backdrop-blur">
              {partnerError}
              <button
                onClick={() => fetchPartnerDocs()}
                className="ml-2 underline"
              >
                再試行
              </button>
            </div>
          )}

          {partnerLoading ? (
            <div className="flex min-h-[30vh] items-center justify-center text-sm text-gray-400">
              読み込み中...
            </div>
          ) : filteredPartnerDocs.length === 0 && !partnerError ? (
            <div className="rounded-xl border border-gray-200 bg-white/50 p-10 text-center text-sm text-gray-400 backdrop-blur">
              該当するパートナー書類はありません
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPartnerDocs.map((doc) => {
                const key = `${doc.user_id}:${doc.document_type}`;
                const isRemoving = partnerRemovingKeys.has(key);
                const isExpanded = partnerExpandedKey === key;
                const isActionLoading = partnerActionLoadingKey === key;
                const signedUrl = partnerSignedUrls[key];

                return (
                  <div
                    key={key}
                    className={`rounded-2xl border border-gray-200 bg-white/70 backdrop-blur transition-all duration-300 ${
                      isRemoving ? "translate-x-16 opacity-0" : ""
                    }`}
                  >
                    {/* Summary row */}
                    <button
                      onClick={() => togglePartnerExpand(doc)}
                      className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-500">
                          {(doc.display_name ?? "?")[0]}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-800">
                            {doc.display_name ?? "不明"}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-gray-400">
                            <span>
                              {PARTNER_DOC_TYPE_LABELS[doc.document_type] ?? doc.document_type}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                            doc.verification_level >= 3
                              ? "bg-emerald-50 text-emerald-600"
                              : "bg-indigo-50 text-indigo-500"
                          }`}
                        >
                          {LEVEL_LABELS[doc.verification_level] ??
                            `L${doc.verification_level}`}
                        </span>

                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                            doc.status === "approved"
                              ? "bg-emerald-50 text-emerald-600"
                              : doc.status === "rejected"
                                ? "bg-red-50 text-red-500"
                                : "bg-amber-50 text-amber-600"
                          }`}
                        >
                          {doc.status === "approved"
                            ? "承認済み"
                            : doc.status === "rejected"
                              ? "却下"
                              : "審査中"}
                        </span>

                        <span
                          className={`text-gray-300 transition-transform ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        >
                          &#9662;
                        </span>
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 px-5 pb-5 pt-4">
                        {/* Document image */}
                        <div className="mb-4">
                          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                            {PARTNER_DOC_TYPE_LABELS[doc.document_type] ?? doc.document_type}
                          </div>
                          <div className="relative aspect-[4/3] max-w-sm overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                            {signedUrl ? (
                              <img
                                src={signedUrl}
                                alt={PARTNER_DOC_TYPE_LABELS[doc.document_type]}
                                className="h-full w-full object-cover"
                              />
                            ) : signedUrl === undefined ? (
                              <div className="flex h-full items-center justify-center text-xs text-gray-400">
                                読み込み中...
                              </div>
                            ) : (
                              <div className="flex h-full items-center justify-center text-xs text-amber-400">
                                ファイル未検出
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Meta info */}
                        <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl bg-gray-50 px-4 py-3 text-xs">
                          <div>
                            <span className="text-gray-400">書類種別: </span>
                            <span className="font-medium text-gray-700">
                              {PARTNER_DOC_TYPE_LABELS[doc.document_type] ?? doc.document_type}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400">ステータス: </span>
                            <span className="font-medium text-gray-700">
                              {doc.status}
                            </span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        {doc.status === "pending" && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() =>
                                handlePartnerDocAction(
                                  doc.user_id,
                                  doc.document_type,
                                  "approve_document",
                                )
                              }
                              disabled={isActionLoading}
                              className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-40"
                            >
                              {isActionLoading ? "処理中..." : "承認"}
                            </button>
                            <button
                              onClick={() =>
                                handlePartnerDocAction(
                                  doc.user_id,
                                  doc.document_type,
                                  "reject_document",
                                )
                              }
                              disabled={isActionLoading}
                              className="rounded-lg bg-red-100 px-4 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-200 disabled:opacity-40"
                            >
                              {isActionLoading ? "処理中..." : "却下"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Identity Section ── */}

      {/* Error */}
      {section === "identity" && fetchError && (
        <div className="rounded-xl border border-red-200 bg-red-50/80 p-4 text-center text-sm text-red-600 backdrop-blur">
          {fetchError}
          <button
            onClick={() => { setLoading(true); fetchVerifications(); }}
            className="ml-2 underline"
          >
            再試行
          </button>
        </div>
      )}

      {/* List */}
      {section === "identity" && filtered.length === 0 && !fetchError ? (
        <div className="rounded-xl border border-gray-200 bg-white/50 p-10 text-center text-sm text-gray-400 backdrop-blur">
          該当する確認申請はありません
          {verifications.length === 0 && (
            <p className="mt-2 text-xs text-gray-300">
              全フィルタでデータ0件。本人確認の提出がまだないか、APIエラーの可能性があります。
            </p>
          )}
        </div>
      ) : section === "identity" ? (
        <div className="space-y-3">
          {filtered.map((v) => {
            const isRemoving = removingIds.has(v.user_id);
            const isExpanded = expandedId === v.user_id;
            const isActionLoading = actionLoadingId === v.user_id;
            const showNoteInput = noteInputId === v.user_id;
            const urls = signedUrls[v.user_id];

            return (
              <div
                key={v.user_id}
                className={`rounded-2xl border border-gray-200 bg-white/70 backdrop-blur transition-all duration-300 ${
                  isRemoving ? "translate-x-16 opacity-0" : ""
                }`}
              >
                {/* Summary row (clickable) */}
                <button
                  onClick={() => toggleExpand(v)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-500">
                      {(v.display_name ?? "?")[0]}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-800">
                        {v.display_name ?? "不明"}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-400">
                        <span>
                          {DOC_TYPE_LABELS[v.document_type] ?? v.document_type ?? "-"}
                        </span>
                        <span>|</span>
                        <span>{formatDate(v.verification_submitted_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Level badge */}
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                        v.verification_level >= 3
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-indigo-50 text-indigo-500"
                      }`}
                    >
                      {LEVEL_LABELS[v.verification_level] ??
                        `L${v.verification_level}`}
                    </span>

                    {/* Status badge */}
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                        v.review_status === "approved"
                          ? "bg-emerald-50 text-emerald-600"
                          : v.review_status === "rejected"
                            ? "bg-red-50 text-red-500"
                            : "bg-amber-50 text-amber-600"
                      }`}
                    >
                      {v.review_status === "approved"
                        ? "承認済み"
                        : v.review_status === "rejected"
                          ? "却下"
                          : "審査中"}
                    </span>

                    {v.frozen_at && (
                      <span className="rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-500">
                        凍結中
                      </span>
                    )}

                    {/* Chevron */}
                    <span
                      className={`text-gray-300 transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    >
                      &#9662;
                    </span>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-5 pb-5 pt-4">
                    {/* Document + Selfie images */}
                    <div className="mb-4 grid grid-cols-2 gap-4">
                      {/* Document */}
                      <div>
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                          書類画像
                        </div>
                        <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                          {urls?.doc ? (
                            <img
                              src={urls.doc}
                              alt="本人確認書類"
                              className="h-full w-full object-cover"
                            />
                          ) : v.id_document_path && !urls ? (
                            <div className="flex h-full items-center justify-center text-xs text-gray-400">
                              読み込み中...
                            </div>
                          ) : v.id_document_path && urls && !urls.doc ? (
                            <div className="flex h-full items-center justify-center text-xs text-amber-400">
                              ファイル未検出
                            </div>
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-gray-300">
                              画像なし
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Selfie */}
                      <div>
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                          セルフィー
                        </div>
                        <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                          {urls?.selfie ? (
                            <img
                              src={urls.selfie}
                              alt="セルフィー"
                              className="h-full w-full object-cover"
                            />
                          ) : v.selfie_path && !urls ? (
                            <div className="flex h-full items-center justify-center text-xs text-gray-400">
                              読み込み中...
                            </div>
                          ) : v.selfie_path && urls && !urls.selfie ? (
                            <div className="flex h-full items-center justify-center text-xs text-amber-400">
                              ファイル未検出
                            </div>
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-gray-300">
                              画像なし
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Meta info */}
                    <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl bg-gray-50 px-4 py-3 text-xs">
                      <div>
                        <span className="text-gray-400">確認ステータス: </span>
                        <span className="font-medium text-gray-700">
                          {v.verification_status}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">審査ステータス: </span>
                        <span className="font-medium text-gray-700">
                          {v.review_status}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">提出日: </span>
                        <span className="font-medium text-gray-700">
                          {formatDate(v.verification_submitted_at)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">審査日: </span>
                        <span className="font-medium text-gray-700">
                          {formatDate(v.verification_reviewed_at)}
                        </span>
                      </div>
                      {v.verification_reviewer_note && (
                        <div className="col-span-2">
                          <span className="text-gray-400">審査メモ: </span>
                          <span className="font-medium text-gray-700">
                            {v.verification_reviewer_note}
                          </span>
                        </div>
                      )}
                      {v.frozen_at && v.frozen_reason && (
                        <div className="col-span-2">
                          <span className="text-red-400">凍結理由: </span>
                          <span className="font-medium text-red-600">
                            {v.frozen_reason}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Note input */}
                    {showNoteInput && (
                      <div className="mb-4">
                        <textarea
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          placeholder={
                            noteAction === "freeze"
                              ? "凍結理由を入力してください（必須）..."
                              : "却下の理由を入力してください..."
                          }
                          className="w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-indigo-300"
                          rows={3}
                        />
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() =>
                              handleAction(
                                v.user_id,
                                noteAction!,
                                noteText || undefined,
                              )
                            }
                            disabled={
                              isActionLoading ||
                              (noteAction === "freeze" && !noteText.trim())
                            }
                            className={`rounded-lg px-4 py-2 text-xs font-semibold text-white transition disabled:opacity-40 ${
                              noteAction === "freeze"
                                ? "bg-purple-500 hover:bg-purple-600"
                                : "bg-red-500 hover:bg-red-600"
                            }`}
                          >
                            {isActionLoading
                              ? "処理中..."
                              : noteAction === "freeze"
                                ? "凍結実行"
                                : "却下実行"}
                          </button>
                          <button
                            onClick={() => {
                              setNoteInputId(null);
                              setNoteAction(null);
                              setNoteText("");
                            }}
                            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-500 transition hover:bg-gray-50"
                          >
                            キャンセル
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    {!showNoteInput && (
                      <div className="flex flex-wrap gap-2">
                        {v.review_status === "pending" && (
                          <>
                            <button
                              onClick={() =>
                                handleAction(v.user_id, "approve")
                              }
                              disabled={isActionLoading}
                              className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-40"
                            >
                              {isActionLoading ? "処理中..." : "承認"}
                            </button>
                            <button
                              onClick={() =>
                                openNoteInput(v.user_id, "reject")
                              }
                              disabled={isActionLoading}
                              className="rounded-lg bg-red-100 px-4 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-200 disabled:opacity-40"
                            >
                              却下
                            </button>
                          </>
                        )}

                        {v.frozen_at ? (
                          <button
                            onClick={() =>
                              handleAction(v.user_id, "unfreeze")
                            }
                            disabled={isActionLoading}
                            className="rounded-lg border border-indigo-200 bg-white px-4 py-2 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-40"
                          >
                            凍結解除
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              openNoteInput(v.user_id, "freeze")
                            }
                            disabled={isActionLoading}
                            className="rounded-lg bg-purple-100 px-4 py-2 text-xs font-semibold text-purple-600 transition hover:bg-purple-200 disabled:opacity-40"
                          >
                            凍結
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
