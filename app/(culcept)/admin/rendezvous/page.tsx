"use client";

/**
 * Admin Rendezvous Dashboard
 * ファネル可視化 + レポートキュー（ユーザー名付き + BAN機能）+ ストーリー承認
 */

import { useState, useEffect } from "react";
import Link from "next/link";

type Metrics = {
  totalProfiles: number;
  activeProfiles: number;
  encounters7d: number;
  candidates7d: number;
  mutualLikes7d: number;
  chatsOpened7d: number;
  messages30d: number;
  pendingStories: number;
  totalReferrals: number;
};

type Report = {
  id: string;
  reporter_id: string;
  reported_id: string;
  reporter_name: string;
  reported_name: string;
  reason: string;
  details: string;
  status: string;
  created_at: string;
  /** エスカレーション自動判定済みフラグ */
  safety_flag?: boolean;
  /** 対象ユーザーのプロフィール停止状態 */
  is_paused?: boolean;
  /** 過去通報件数 */
  report_count?: number;
};

type ReportStats = {
  resolved7d: number;
  banned7d: number;
};

export default function AdminRendezvousPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [stats, setStats] = useState<ReportStats>({ resolved7d: 0, banned7d: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/rendezvous/metrics").then((r) => r.json()),
      fetch("/api/admin/rendezvous/reports").then((r) => r.json()),
    ])
      .then(([metricsRes, reportsRes]) => {
        if (metricsRes.ok) setMetrics(metricsRes.metrics);
        if (reportsRes.ok) {
          setReports(reportsRes.reports);
          if (reportsRes.stats) setStats(reportsRes.stats);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleReport = async (reportId: string, action: "resolve" | "dismiss" | "ban") => {
    const confirmed =
      action === "ban"
        ? window.confirm("このユーザーをBANしますか？プロフィールが無効化されます。")
        : true;
    if (!confirmed) return;

    await fetch("/api/admin/rendezvous/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId, action }),
    });
    setReports((prev) => prev.filter((r) => r.id !== reportId));
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "rgba(30,30,60,0.4)" }}>
        読み込み中...
      </div>
    );
  }

  return (
    <div style={{ padding: "20px", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <Link href="/admin" style={{ fontSize: 11, color: "rgba(30,30,60,0.4)", textDecoration: "none" }}>
            ← 管理画面
          </Link>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E3C", marginTop: 4 }}>
            Rendezvous Dashboard
          </h1>
        </div>
      </div>

      {/* Funnel Metrics */}
      {metrics && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "rgba(30,30,60,0.6)", marginBottom: 12 }}>
            ファネル（7日間）
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
            <MetricCard label="総プロフィール" value={metrics.totalProfiles} color="#6366F1" />
            <MetricCard label="アクティブ" value={metrics.activeProfiles} color="#22C55E" />
            <MetricCard label="Encounter" value={metrics.encounters7d} color="#8B5CF6" />
            <MetricCard label="候補生成" value={metrics.candidates7d} color="#A855F7" />
            <MetricCard label="相互いいね" value={metrics.mutualLikes7d} color="#EC4899" />
            <MetricCard label="チャット開始" value={metrics.chatsOpened7d} color="#F59E0B" />
            <MetricCard label="メッセージ(30d)" value={metrics.messages30d} color="#14B8A6" />
            <MetricCard label="紹介成立" value={metrics.totalReferrals} color="#6366F1" />
          </div>

          {/* Funnel bars */}
          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 11, fontWeight: 700, color: "rgba(30,30,60,0.4)", marginBottom: 8 }}>
              コンバージョンファネル
            </h3>
            {[
              { label: "Encounter → 候補", from: metrics.encounters7d, to: metrics.candidates7d },
              { label: "候補 → 相互いいね", from: metrics.candidates7d, to: metrics.mutualLikes7d },
              { label: "相互いいね → チャット", from: metrics.mutualLikes7d, to: metrics.chatsOpened7d },
            ].map((step) => {
              const rate = step.from > 0 ? Math.round((step.to / step.from) * 100) : 0;
              return (
                <div key={step.label} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(30,30,60,0.5)", marginBottom: 3 }}>
                    <span>{step.label}</span>
                    <span>{rate}% ({step.to}/{step.from})</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "rgba(99,102,241,0.08)" }}>
                    <div style={{ height: "100%", borderRadius: 3, background: "#6366F1", width: `${Math.min(rate, 100)}%`, transition: "width 0.5s" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending stories */}
      {metrics && metrics.pendingStories > 0 && (
        <div style={{ marginBottom: 28, padding: 16, borderRadius: 14, background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.1)" }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#D97706" }}>
            {metrics.pendingStories}件のストーリーが承認待ちです
          </p>
        </div>
      )}

      {/* Reports Queue */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "rgba(30,30,60,0.6)" }}>
            通報キュー ({reports.length})
          </h2>
          <div style={{ display: "flex", gap: 12, fontSize: 10, color: "rgba(30,30,60,0.4)" }}>
            <span>処理済み(7d): <strong style={{ color: "#22C55E" }}>{stats.resolved7d}</strong></span>
            <span>BAN(7d): <strong style={{ color: "#EF4444" }}>{stats.banned7d}</strong></span>
          </div>
        </div>

        {reports.length === 0 ? (
          <p style={{ fontSize: 12, color: "rgba(30,30,60,0.3)", padding: 20, textAlign: "center" }}>
            未処理の通報はありません
          </p>
        ) : (
          reports.map((report) => (
            <div
              key={report.id}
              style={{
                padding: "14px 16px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.8)",
                border: "1px solid rgba(239,68,68,0.1)",
                marginBottom: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#EF4444" }}>
                  {report.reason}
                </span>
                <span style={{ fontSize: 10, color: "rgba(30,30,60,0.3)" }}>
                  {new Date(report.created_at).toLocaleDateString("ja-JP")}
                </span>
              </div>

              {/* Reporter → Reported */}
              <div style={{ fontSize: 11, color: "rgba(30,30,60,0.5)", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
                <span>
                  <span style={{ fontWeight: 600 }}>{report.reporter_name}</span>
                  <span style={{ margin: "0 6px", color: "rgba(30,30,60,0.2)" }}>→</span>
                  <span style={{ fontWeight: 600, color: "#EF4444" }}>{report.reported_name}</span>
                </span>
                {report.safety_flag && (
                  <span style={{ padding: "1px 6px", borderRadius: 4, background: "#FEE2E2", color: "#DC2626", fontSize: 9, fontWeight: 700 }}>
                    ⚠ SAFETY FLAG
                  </span>
                )}
                {report.is_paused && (
                  <span style={{ padding: "1px 6px", borderRadius: 4, background: "#FEF3C7", color: "#D97706", fontSize: 9, fontWeight: 700 }}>
                    一時停止中
                  </span>
                )}
                {(report.report_count ?? 0) > 1 && (
                  <span style={{ padding: "1px 6px", borderRadius: 4, background: "#F3E8FF", color: "#7C3AED", fontSize: 9, fontWeight: 700 }}>
                    通報{report.report_count}件
                  </span>
                )}
              </div>

              {report.details && (
                <p style={{ fontSize: 11, color: "rgba(30,30,60,0.5)", marginBottom: 8 }}>
                  {report.details}
                </p>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => handleReport(report.id, "resolve")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: "#F59E0B",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  警告
                </button>
                <button
                  onClick={() => handleReport(report.id, "ban")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: "#EF4444",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  BAN
                </button>
                <button
                  onClick={() => handleReport(report.id, "dismiss")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid rgba(30,30,60,0.1)",
                    background: "transparent",
                    fontSize: 11,
                    color: "rgba(30,30,60,0.5)",
                    cursor: "pointer",
                  }}
                >
                  却下
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        padding: "14px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.8)",
        border: `1px solid ${color}15`,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 800, color, fontFamily: "'JetBrains Mono','SF Mono',monospace" }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(30,30,60,0.4)", marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}
