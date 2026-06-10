"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  isPrgReadinessConsoleEnabled,
  buildPrgReadinessReportFromStores,
} from "@/lib/plan/mobility/prgReadinessConsole";
import type { PrgReadinessReport } from "@/lib/plan/mobility/prgReadinessEvaluator";
import {
  loadPhaseBReadinessProgressFromStores,
  type PhaseBReadinessProgress,
} from "@/lib/plan/mobility/phaseBReadinessProgress";
import { PrgReadinessReportView, PhaseBGateView } from "./PrgReadinessPanel";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface KpiPoint {
  date: string;
  label: string;
  signups: number;
  observations: number;
  dau: number;
  rendezvous: number;
}

interface FeatureItem {
  feature: string;
  totalEvents: number;
  uniqueUsers: number;
}

interface SkillRun {
  id: string;
  skill_name: string;
  target_type: string | null;
  status: "running" | "success" | "error";
  duration_ms: number | null;
  summary: string | null;
  executed_at: string;
}

interface SkillSummary {
  totalCount: number;
  successCount: number;
  successRate: number;
  avgDurationMs: number;
  failureCount: number;
  /** 自動クローズ（ゾンビ回収）件数。API の SkillSummaryResult が常に返す（UI は ?. + ?? 0 で防御的に読む）。 */
  autoCloseCount: number;
  failedSkills: string[];
  bySkill: { skill_name: string; count: number; successCount: number; avgMs: number }[];
}

interface LastRunInfo {
  executedAt: string;
  status: string;
  durationMs: number | null;
  summary: string | null;
}

interface Alert {
  level: "error" | "warn" | "info";
  source: string;
  message: string;
  detail?: string;
}

interface DashboardData {
  ok: boolean;
  timestamp: string;
  range: number;
  overallStatus: "healthy" | "warning" | "critical";
  actionCount: number;
  overview: {
    health: "healthy" | "degraded";
    services: Record<string, unknown>;
    responseMs: number | null;
  };
  metrics: {
    totalUsers: number;
    todaySignups: number;
    totalObservations: number;
    rendezvousProfiles: number;
  };
  engagement: {
    observationsPerUser: number;
    engagementRate: number;
  };
  deltas: {
    signups: number | null;
    observations: number | null;
    rendezvous: number | null;
  };
  retention: { dau: number; wau: number; mau: number };
  kpiTrends: KpiPoint[];
  featurePopularity: FeatureItem[];
  skills: {
    summary: SkillSummary;
    prevSummary: SkillSummary;
    recentRuns: SkillRun[];
    lastRunBySkill: Record<string, LastRunInfo>;
    runningCount: number;
    staleCount: number;
    skillRange: number;
  };
  alerts: Alert[];
}

type LoadState = "loading" | "loaded" | "error";

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const QUICK_ACTIONS = [
  { href: "/stargazer", label: "Stargazer", icon: "✦" },
  { href: "/genome-card", label: "Genome Card", icon: "🧬" },
  { href: "/rendezvous", label: "Rendezvous", icon: "∞" },
  { href: "/origin", label: "Origin", icon: "🌏" },
  { href: "/calendar", label: "Calendar", icon: "📅" },
  { href: "/my-style", label: "Style DNA", icon: "◆" },
  { href: "/body-color/avatar", label: "Phenotype", icon: "🎨" },
  { href: "/sns/profile", label: "Presence", icon: "🪞" },
];

const CHART_COLORS = {
  dau: "#6366f1",
  observations: "#10b981",
  signups: "#f59e0b",
  rendezvous: "#ec4899",
};

const AUTO_REFRESH_OPTIONS = [
  { label: "OFF", ms: 0 },
  { label: "30秒", ms: 30_000 },
  { label: "1分", ms: 60_000 },
  { label: "5分", ms: 300_000 },
];

// ═══════════════════════════════════════════════════════════════
// LocalStorage persistence
// ═══════════════════════════════════════════════════════════════

const LS_PREFIX = "ceo-dash-v1";

function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(`${LS_PREFIX}:${key}`, JSON.stringify(value));
  } catch { /* quota exceeded — ignore */ }
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "たった今";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}時間前`;
  return `${Math.floor(diff / 86_400_000)}日前`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export default function CeoDashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [range, setRange] = useState<7 | 30>(7);
  const [skillRange, setSkillRange] = useState<0 | 7 | 30>(0);
  const [featureMode, setFeatureMode] = useState<"events" | "users">("events");
  const [autoRefreshMs, setAutoRefreshMs] = useState(() => lsGet<number>("autoRefresh", 60_000));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => lsGet("collapsed", {}));
  const [countdown, setCountdown] = useState(0);
  // ★PRG Readiness operator 表示（dev/operator 専用・flag OFF→未計算/未描画・client localStorage 由来）。
  const [prgReport, setPrgReport] = useState<PrgReadinessReport | null>(null);
  // ★B-0: Phase B data gate 進捗（同 flag 配下・read-only・Phase B 本体ではない）。
  const [phaseBProgress, setPhaseBProgress] = useState<PhaseBReadinessProgress | null>(null);
  useEffect(() => {
    if (!isPrgReadinessConsoleEnabled()) return;
    setPrgReport(buildPrgReadinessReportFromStores());
    setPhaseBProgress(loadPhaseBReadinessProgressFromStores());
  }, []);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFetchRef = useRef(Date.now());
  // Alter Feedback + Gemini昇格判断
  const [feedbackData, setFeedbackData] = useState<any>(null);
  // 本人確認 Verification summary
  const [verificationSummary, setVerificationSummary] = useState<{
    pending: number; todayNew: number; approved: number; rejected: number; frozen: number;
  } | null>(null);

  // Persist collapsed state
  const toggle = (key: string) => {
    setCollapsed((p) => {
      const next = { ...p, [key]: !p[key] };
      lsSet("collapsed", next);
      return next;
    });
  };

  // Persist auto-refresh
  const updateAutoRefresh = (ms: number) => {
    setAutoRefreshMs(ms);
    lsSet("autoRefresh", ms);
  };

  const hasDataRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (hasDataRef.current) setIsRefreshing(true);
    else setState("loading");
    try {
      const res = await fetch(`/api/ceo/dashboard?range=${range}&skillRange=${skillRange}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json());
      setState("loaded");
      hasDataRef.current = true;
      lastFetchRef.current = Date.now();
      // Feedback data fetch (non-blocking)
      fetch(`/api/ceo/feedback?range=${range}`, { cache: "no-store" })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setFeedbackData(d); })
        .catch(() => {});
      // Verification summary fetch (non-blocking)
      fetch("/api/ceo/verification-summary", { cache: "no-store" })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setVerificationSummary(d); })
        .catch(() => {});
    } catch {
      setState("error");
    } finally {
      setIsRefreshing(false);
    }
  }, [range, skillRange]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, skillRange]);

  // Auto-refresh timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoRefreshMs > 0) {
      timerRef.current = setInterval(fetchData, autoRefreshMs);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefreshMs, fetchData]);

  // Countdown timer (updates every second)
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (autoRefreshMs > 0) {
      countdownRef.current = setInterval(() => {
        const elapsed = Date.now() - lastFetchRef.current;
        const remaining = Math.max(0, Math.ceil((autoRefreshMs - elapsed) / 1000));
        setCountdown(remaining);
      }, 1000);
    } else {
      setCountdown(0);
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [autoRefreshMs]);

  // Keyboard: R = refresh
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "r" && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLInputElement)) {
        fetchData();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fetchData]);

  const loading = state === "loading" && !data;

  // ── Derived status ──
  const status = data?.overallStatus ?? "healthy";
  const actionCount = data?.actionCount ?? 0;
  const nonInfoAlerts = data?.alerts?.filter((a) => a.level !== "info") ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-3 p-4 pb-28 text-gray-900 antialiased sm:p-6">

      {/* ════════════════════════════════════════════════════════
          Header — Apple: 大きなタイトル + 静かなキャプション + 点ステータスのカプセル。
          色面で叫ばない（critical でも点とバッジだけが赤くなる）。
          ════════════════════════════════════════════════════════ */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-1 pt-1">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-gray-900">ダッシュボード</h1>
          <p className="mt-1 text-[12px] leading-relaxed text-gray-500">
            {data ? `${formatTime(data.timestamp)} 更新` : "読み込み中…"}
            {data && <> · <span className="tabular-nums">{data.metrics.totalUsers}</span>ユーザー · DAU <span className="tabular-nums">{data.retention.dau}</span></>}
            {data && <> · バッチ <span className="tabular-nums">{data.skills.summary.successCount}/{data.skills.summary.totalCount}</span>{data.skills.runningCount > 0 && <>（実行中<span className="tabular-nums">{data.skills.runningCount}</span>）</>}</>}
            {verificationSummary && verificationSummary.pending > 0 && (
              <> · <span className="font-medium text-amber-600">審査待ち <span className="tabular-nums">{verificationSummary.pending}</span></span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white/80 px-3.5 py-1.5 shadow-sm ring-1 ring-black/5 backdrop-blur-xl">
          <span className={`h-2 w-2 rounded-full ${
            status === "critical" ? "bg-red-500" : status === "warning" ? "bg-amber-400" : "bg-emerald-500"
          }`} />
          <span className="text-[13px] font-medium text-gray-900">
            {status === "critical" ? "要対応" : status === "warning" ? "注意あり" : "正常稼働"}
          </span>
          {actionCount > 0 && (
            <span className={`rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums text-white ${
              status === "critical" ? "bg-red-500" : "bg-amber-500"
            }`}>
              {actionCount}
            </span>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          Controls — 期間 · 更新 · 自動更新 · カウントダウン
          ════════════════════════════════════════════════════════ */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        <RangeToggle value={range} onChange={setRange} />
        <button
          onClick={fetchData}
          disabled={state === "loading"}
          className="rounded-full bg-white/80 px-3.5 py-1 text-[12px] font-medium text-gray-700 shadow-sm ring-1 ring-black/5 backdrop-blur transition hover:text-gray-900 disabled:opacity-40"
        >
          {state === "loading" && !data ? "更新中…" : "更新"}
        </button>
        <div className="inline-flex items-center rounded-full bg-black/5 p-0.5">
          <span className="px-2 text-[11px] text-gray-400">自動更新</span>
          {AUTO_REFRESH_OPTIONS.map((opt) => (
            <button
              key={opt.ms}
              onClick={() => updateAutoRefresh(opt.ms)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                autoRefreshMs === opt.ms ? "bg-white text-gray-900 shadow-sm ring-1 ring-black/5" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {/* Countdown + refresh indicator */}
        <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
          {isRefreshing && (
            <span className="inline-block h-2 w-2 animate-spin rounded-full border border-gray-400 border-t-transparent" />
          )}
          {autoRefreshMs > 0 && !isRefreshing && countdown > 0 && (
            <span className="tabular-nums">次の更新 {countdown}秒</span>
          )}
          <span className="hidden text-[10px] text-gray-300 sm:inline" title="キーボードショートカット">R=更新</span>
        </span>
      </div>

      {/* ── Error State ── */}
      {state === "error" && !data && (
        <Card>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <p className="text-[13px] font-medium text-gray-900">データ取得に失敗しました</p>
          </div>
          <button onClick={fetchData} className="mt-2 text-[13px] font-medium text-blue-600 transition hover:text-blue-700">
            再試行
          </button>
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════
          グループ1: 今日の対応 — エラー・審査・通知
          ════════════════════════════════════════════════════════ */}
      <GroupLabel title="今日の対応" />
      {nonInfoAlerts.length > 0 && (
        <CollapsibleSection id="alerts" title={`要対応 (${nonInfoAlerts.length}件)`} collapsed={collapsed} toggle={toggle} defaultOpen>
          <div className="overflow-hidden rounded-2xl bg-white/80 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_30px_rgba(0,0,0,0.06)] ring-1 ring-black/5 backdrop-blur-xl divide-y divide-black/5">
            {nonInfoAlerts.map((a, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-start gap-2.5">
                  {/* Apple: 行は白のまま・重みは点の色だけで伝える */}
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.level === "error" ? "bg-red-500" : "bg-amber-400"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-gray-900">{a.message}</p>
                    {a.detail && (
                      <p className="mt-0.5 truncate text-[12px] text-gray-500">{a.detail}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-[10px] font-medium text-gray-400">
                    {a.source}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* ════════════════════════════════════════════════════════
          本人確認 — パッと見で状況把握
          ════════════════════════════════════════════════════════ */}
      {verificationSummary && (
        <Link href="/ceo/verifications" className="block">
          <Card className="p-0 transition-shadow hover:shadow-[0_2px_4px_rgba(0,0,0,0.04),0_12px_40px_rgba(0,0,0,0.10)]">
            <div className="flex items-center justify-between px-5 pt-4">
              <h3 className="text-[15px] font-semibold tracking-tight text-gray-900">本人確認</h3>
              <div className="flex items-center gap-2">
                {verificationSummary.pending > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    要レビュー <span className="tabular-nums">{verificationSummary.pending}</span>件
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    全件対応済み
                  </span>
                )}
                <span className="text-[15px] leading-none text-gray-300" aria-hidden>›</span>
              </div>
            </div>
            {/* Apple stat row: 色面でなく数字で語る（意味がある時だけ数字に色） */}
            <div className="mt-2 grid grid-cols-4 divide-x divide-black/5">
              {([
                { label: "待ち", value: verificationSummary.pending, color: verificationSummary.pending > 0 ? "text-amber-600" : "text-gray-300" },
                { label: "承認", value: verificationSummary.approved, color: "text-gray-900" },
                { label: "却下", value: verificationSummary.rejected, color: verificationSummary.rejected > 0 ? "text-red-600" : "text-gray-300" },
                { label: "凍結", value: verificationSummary.frozen, color: verificationSummary.frozen > 0 ? "text-blue-600" : "text-gray-300" },
              ] as const).map((s) => (
                <div key={s.label} className="px-4 py-3 text-center">
                  <div className={`text-[24px] font-light leading-tight tracking-tight tabular-nums ${s.color}`}>{s.value}</div>
                  <div className="mt-0.5 text-[11px] text-gray-500">{s.label}</div>
                </div>
              ))}
            </div>
            {verificationSummary.todayNew > 0 && (
              <p className="border-t border-black/5 px-5 py-2.5 text-[12px] text-gray-500">
                本日 <span className="tabular-nums">+{verificationSummary.todayNew}</span>件 新規提出
              </p>
            )}
          </Card>
        </Link>
      )}

      {/* ════════════════════════════════════════════════════════
          運営通知 — 全ユーザーへの一括通知送信
          ════════════════════════════════════════════════════════ */}
      <Link href="/ceo/notifications" className="block">
        <div className="rounded-2xl bg-white/80 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_30px_rgba(0,0,0,0.06)] ring-1 ring-black/5 backdrop-blur-xl transition-shadow hover:shadow-[0_2px_4px_rgba(0,0,0,0.04),0_12px_40px_rgba(0,0,0,0.10)]">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold tracking-tight text-gray-900">運営通知</h3>
            <span className="flex items-center gap-1.5 text-[12px] text-gray-400">全ユーザーに通知を送信 <span className="text-[15px] leading-none text-gray-300" aria-hidden>›</span></span>
          </div>
        </div>
      </Link>

      {/* ════════════════════════════════════════════════════════
          グループ2: ユーザーと成長 — 概況・トレンド・機能利用
          ════════════════════════════════════════════════════════ */}
      <GroupLabel title="ユーザーと成長" />
      <CollapsibleSection id="overview" title="ユーザー概況" collapsed={collapsed} toggle={toggle} defaultOpen>
        {/* Apple stat board: 1 枚のカードを hairline で分割し、大きく軽い数字を並べる */}
        <Card className="p-0">
          <div className="grid grid-cols-2 divide-x divide-black/5 max-sm:[&>*:nth-child(n+3)]:border-t max-sm:[&>*]:border-black/5 sm:grid-cols-4">
            <MetricCard label="総ユーザー" value={data?.metrics.totalUsers} loading={loading} />
            <MetricCard
              label="今日の新規"
              value={data?.metrics.todaySignups}
              delta={data?.deltas.signups}
              loading={loading}
            />
            <MetricCard
              label="エンゲージメント率"
              value={data ? `${data.engagement.engagementRate}%` : undefined}
              loading={loading}
              sub="DAU / 総ユーザー"
            />
            <MetricCard
              label="人あたり観測数"
              value={data?.engagement.observationsPerUser}
              loading={loading}
              sub="総観測 / 総ユーザー"
            />
          </div>
          <div className="grid grid-cols-2 divide-x divide-black/5 border-t border-black/5 max-sm:[&>*:nth-child(n+3)]:border-t max-sm:[&>*]:border-black/5 sm:grid-cols-4">
            <MetricCard label="DAU" value={data?.retention.dau} loading={loading} sub="Stargazer基準" />
            <MetricCard label="WAU" value={data?.retention.wau} loading={loading} sub="Stargazer基準" />
            <MetricCard label="MAU" value={data?.retention.mau} loading={loading} sub="Stargazer基準" />
            <MetricCard
              label="システム"
              value={data?.overview.health === "healthy" ? "正常" : "要確認"}
              color={data?.overview.health === "healthy" ? "green" : "red"}
              loading={loading}
              sub={data?.overview.responseMs != null ? `応答 ${data.overview.responseMs}ms` : undefined}
            />
          </div>
        </Card>
      </CollapsibleSection>

      {/* ════════════════════════════════════════════════════════
          成長トレンド — 時系列推移
          ════════════════════════════════════════════════════════ */}
      <CollapsibleSection id="trends" title={`成長トレンド（${range}日）`} collapsed={collapsed} toggle={toggle} defaultOpen>
        {loading ? (
          <Skeleton h="h-56" />
        ) : data?.kpiTrends && data.kpiTrends.length > 0 ? (
          <>
            <Card>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.kpiTrends} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="dau" stroke={CHART_COLORS.dau} name="DAU" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="observations" stroke={CHART_COLORS.observations} name="観測数" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="signups" stroke={CHART_COLORS.signups} name="新規登録" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="rendezvous" stroke={CHART_COLORS.rendezvous} name="Rendezvous" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <DeltaBadge label="新規登録" value={data.deltas.signups} />
              <DeltaBadge label="観測" value={data.deltas.observations} />
              <DeltaBadge label="Rendezvous" value={data.deltas.rendezvous} />
            </div>
          </>
        ) : (
          <EmptyState message="トレンドデータなし" />
        )}
      </CollapsibleSection>

      {/* ════════════════════════════════════════════════════════
          機能利用 — どの機能が使われているか（ユーザー群に同居）
          ════════════════════════════════════════════════════════ */}
      <CollapsibleSection id="features" title={`機能利用（${range}日）`} collapsed={collapsed} toggle={toggle}>
        <div className="mb-2 flex gap-1">
          <MiniToggle label="イベント数" active={featureMode === "events"} onClick={() => setFeatureMode("events")} />
          <MiniToggle label="ユーザー数" active={featureMode === "users"} onClick={() => setFeatureMode("users")} />
        </div>
        {loading ? (
          <Skeleton h="h-48" />
        ) : data?.featurePopularity && data.featurePopularity.length > 0 ? (
          <Card>
            <ResponsiveContainer width="100%" height={Math.max(160, Math.min(data.featurePopularity.length, 10) * 28)}>
              <BarChart
                data={data.featurePopularity.slice(0, 10)}
                layout="vertical"
                margin={{ top: 4, right: 8, left: 4, bottom: 0 }}
              >
                <CartesianGrid stroke="#f0f0f0" vertical={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="feature" type="category" tick={{ fontSize: 10 }} width={110} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey={featureMode === "events" ? "totalEvents" : "uniqueUsers"}
                  fill={featureMode === "events" ? "#6366f1" : "#10b981"}
                  radius={[0, 4, 4, 0]}
                  name={featureMode === "events" ? "イベント数" : "ユニークユーザー"}
                />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        ) : (
          <EmptyState message="機能利用データなし" />
        )}
      </CollapsibleSection>

      {/* ════════════════════════════════════════════════════════
          グループ3: システム稼働 — バッチ・Alter/Gemini
          ════════════════════════════════════════════════════════ */}
      <GroupLabel title="システム稼働" />
      {/* Skill Monitor — cron/バッチの稼働状況 */}
      <CollapsibleSection id="skills" title="バッチ稼働監視" collapsed={collapsed} toggle={toggle} defaultOpen>
        {/* Time range toggle */}
        <div className="mb-3 flex gap-1">
          {([0, 7, 30] as const).map((v) => (
            <button
              key={v}
              onClick={() => setSkillRange(v)}
              className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition ${
                skillRange === v ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {v === 0 ? "今日" : `${v}日`}
            </button>
          ))}
        </div>

        <SkillMonitorCards data={data} loading={loading} skillRange={skillRange} />

        {/* ジョブ別 最終実行状況 テーブル */}
        {data?.skills.lastRunBySkill && Object.keys(data.skills.lastRunBySkill).length > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-xs font-medium text-gray-500">ジョブ別 最終実行</p>
            <div className="space-y-1">
              {Object.entries(data.skills.lastRunBySkill)
                .sort(([, a], [, b]) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime())
                .map(([name, info]) => (
                  <div
                    key={name}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs backdrop-blur ${
                      info.status === "error"
                        ? "border-red-200 bg-red-50/50"
                        : info.status === "running"
                          ? "border-amber-200 bg-amber-50/50"
                          : "border-black/5 bg-white/50"
                    }`}
                  >
                    <StatusDot status={info.status} />
                    <span className={`min-w-0 flex-1 truncate font-medium ${
                      info.status === "error" ? "text-red-700" : ""
                    }`}>
                      {name}
                    </span>
                    {info.durationMs != null && (
                      <span className="text-gray-400">{(info.durationMs / 1000).toFixed(1)}s</span>
                    )}
                    <span className="whitespace-nowrap text-gray-400">
                      {relativeTime(info.executedAt)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Skill別パフォーマンス棒グラフ */}
        {data?.skills.summary.bySkill && data.skills.summary.bySkill.length > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-xs font-medium text-gray-500">ジョブ別成功率</p>
            <Card>
              <ResponsiveContainer width="100%" height={Math.max(100, data.skills.summary.bySkill.length * 36)}>
                <BarChart
                  data={data.skills.summary.bySkill.map((s) => ({
                    ...s,
                    label: `${s.skill_name} (n=${s.count})`,
                    successRate: s.count > 0 ? Math.round((s.successCount / s.count) * 100) : 0,
                  }))}
                  layout="vertical"
                  margin={{ top: 4, right: 8, left: 4, bottom: 0 }}
                >
                  <CartesianGrid stroke="#f0f0f0" vertical={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <YAxis dataKey="label" type="category" tick={{ fontSize: 9 }} width={180} />
                  <Tooltip
                    contentStyle={{ fontSize: 12 }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any, _name: any, props: any) => {
                      const p = props?.payload;
                      return [`${value}% (${p?.successCount ?? 0}/${p?.count ?? 0})`, "成功率"];
                    }}
                  />
                  <Bar dataKey="successRate" fill="#10b981" radius={[0, 4, 4, 0]} name="成功率 (%)" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

        {/* 実行ログ（直近） */}
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-gray-500">実行ログ（直近）</p>
          {loading ? (
            <SkeletonList count={3} />
          ) : data?.skills.recentRuns && data.skills.recentRuns.length > 0 ? (
            <div className="space-y-1">
              {data.skills.recentRuns.slice(0, 15).map((r) => (
                <div
                  key={r.id}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs backdrop-blur ${
                    r.status === "error"
                      ? "border-red-200 bg-red-50/60"
                      : r.status === "running"
                        ? "border-amber-200 bg-amber-50/50"
                        : "border-black/5 bg-white/50"
                  }`}
                >
                  <StatusDot status={r.status} />
                  <span className={`min-w-0 flex-1 truncate font-medium ${
                    r.status === "error" ? "text-red-700" : ""
                  }`}>
                    {r.skill_name}
                  </span>
                  {r.duration_ms != null && (
                    <span className="text-gray-400">{(r.duration_ms / 1000).toFixed(1)}s</span>
                  )}
                  <span className="whitespace-nowrap text-gray-300">
                    {relativeTime(r.executed_at)}
                  </span>
                  {r.summary && (
                    <span className={`hidden max-w-[240px] truncate sm:inline ${
                      r.status === "error" ? "font-medium text-red-500" : "text-gray-400"
                    }`}>
                      {r.summary}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="実行ログなし" />
          )}
        </div>
      </CollapsibleSection>

      {/* ════════════════════════════════════════════════════════
          Alter フィードバック + Gemini 昇格判断
          ════════════════════════════════════════════════════════ */}
      <CollapsibleSection id="feedback" title="Alter フィードバック" collapsed={collapsed} toggle={toggle} defaultOpen>
        {feedbackData ? (
          <div className="space-y-4">
            {/* サマリーカード */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniCard label="回答数" value={feedbackData.summary.total_responses} />
              <MiniCard label="FB数" value={feedbackData.summary.total_feedback} sub={feedbackData.summary.feedback_rate != null ? `(${(feedbackData.summary.feedback_rate * 100).toFixed(1)}%)` : ""} />
              <MiniCard label="👍率" value={feedbackData.summary.positive_rate != null ? `${(feedbackData.summary.positive_rate * 100).toFixed(0)}%` : "—"} color={feedbackData.summary.positive_rate >= 0.8 ? "text-emerald-600" : feedbackData.summary.positive_rate >= 0.6 ? "text-amber-600" : "text-red-600"} />
              <MiniCard label="👎率" value={feedbackData.summary.negative_rate != null ? `${(feedbackData.summary.negative_rate * 100).toFixed(0)}%` : "—"} color={feedbackData.summary.negative_rate <= 0.15 ? "text-emerald-600" : feedbackData.summary.negative_rate <= 0.25 ? "text-amber-600" : "text-red-600"} />
            </div>

            {/* Gemini昇格判断パネル */}
            {feedbackData.promotion && (
              <Card className={
                feedbackData.promotion.recommendation === "stop" ? "border-red-200 bg-red-50/60" :
                feedbackData.promotion.recommendation === "promote" ? "border-emerald-200 bg-emerald-50/60" :
                "border-amber-200 bg-amber-50/60"
              }>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-xs font-bold">Gemini協調 Phase {feedbackData.promotion.current_phase}</h3>
                    {(feedbackData.promotion.checks?.sample_size?.value ?? 0) < 50 && (
                      <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[8px] font-semibold text-gray-500">
                        参考値（n={feedbackData.promotion.checks?.sample_size?.value ?? 0}）
                      </span>
                    )}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    (feedbackData.promotion.checks?.sample_size?.value ?? 0) < 10
                      ? "bg-gray-400 text-white"
                      : feedbackData.promotion.recommendation === "stop" ? "bg-red-500 text-white"
                      : feedbackData.promotion.recommendation === "promote" ? "bg-emerald-500 text-white"
                      : "bg-amber-500 text-white"
                  }`}>
                    {(feedbackData.promotion.checks?.sample_size?.value ?? 0) < 10
                      ? "データ不足"
                      : feedbackData.promotion.recommendation === "stop" ? "停止推奨"
                      : feedbackData.promotion.recommendation === "promote" ? "昇格可能" : "保留"}
                  </span>
                </div>
                {(() => {
                  // ★データ不足（n<10）は「未達」でなく「蓄積中」: 赤い未達リストを畳み、灰色で静かに（presentation のみ）。
                  const insufficient = (feedbackData.promotion.checks?.sample_size?.value ?? 0) < 10;
                  const rows = (
                    <div className="space-y-1">
                      {Object.entries(feedbackData.promotion.checks).map(([key, check]: [string, any]) => (
                        <div key={key} className="flex items-center justify-between text-[11px]">
                          <span className="text-gray-600">{key.replace(/_/g, " ")}</span>
                          <span className={`font-mono ${check.pass ? "text-emerald-600" : insufficient ? "text-gray-400" : "text-red-500"}`}>
                            {check.value != null ? (typeof check.value === "number" && check.value < 1 && check.value > 0 ? `${(check.value * 100).toFixed(1)}%` : String(check.value)) : "—"}
                            {check.pass ? " ✓" : ` (要 ${typeof check.threshold === "number" && check.threshold < 1 && check.threshold > 0 ? `${(check.threshold * 100).toFixed(0)}%` : check.threshold})`}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                  return insufficient ? (
                    <details>
                      <summary className="cursor-pointer list-none text-[12px] text-gray-500">
                        まだ判定データがありません（蓄積中） <span className="font-medium text-blue-600">判定基準を見る</span>
                      </summary>
                      <div className="mt-1">{rows}</div>
                    </details>
                  ) : (
                    rows
                  );
                })()}
                {feedbackData.promotion.reading_stats && (
                  <div className="mt-2 pt-2 border-t border-black/5 text-[10px] text-gray-500">
                    読解: {feedbackData.promotion.reading_stats.success_count}成功 / {feedbackData.promotion.reading_stats.fail_count}失敗
                    {feedbackData.promotion.reading_stats.latency_p50 != null && ` · p50=${feedbackData.promotion.reading_stats.latency_p50}ms`}
                    {feedbackData.promotion.reading_stats.latency_p95 != null && ` · p95=${feedbackData.promotion.reading_stats.latency_p95}ms`}
                  </div>
                )}
              </Card>
            )}

            {/* 機能別サマリー */}
            {Object.keys(feedbackData.by_feature).length > 0 && (
              <Card>
                <h3 className="text-xs font-bold mb-2">機能別</h3>
                <div className="space-y-1">
                  {Object.entries(feedbackData.by_feature).map(([feature, stats]: [string, any]) => (
                    <div key={feature} className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-600">{feature}</span>
                      <span className="font-mono">
                        👍{stats.positive} 👎{stats.negative} ({stats.total}件)
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* 危険シグナル */}
            {Object.keys(feedbackData.danger_signals).length > 0 && (
              <Card className="border-red-200 bg-red-50/40">
                <h3 className="text-xs font-bold mb-1 text-red-700">危険シグナル</h3>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(feedbackData.danger_signals).map(([kw, count]: [string, any]) => (
                    <span key={kw} className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                      {kw} ({count})
                    </span>
                  ))}
                </div>
              </Card>
            )}

            {/* 自由記載一覧 */}
            {feedbackData.recent_texts.length > 0 && (
              <Card>
                <h3 className="text-xs font-bold mb-2">自由記載（新着）</h3>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {feedbackData.recent_texts.map((t: any) => (
                    <div key={t.id} className="rounded-lg border border-black/5 bg-white/40 px-3 py-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-gray-400">{t.rating === "positive" ? "👍" : "👎"} {t.feature}</span>
                        <span className="text-[9px] text-gray-400">{new Date(t.created_at).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <p className="text-[12px] text-gray-700">{t.text}</p>
                      <p className="text-[9px] text-gray-300 mt-1">user: {t.user_id?.slice(0, 8)}… · session: {t.session_id?.slice(0, 12)}…</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        ) : (
          <Skeleton />
        )}
      </CollapsibleSection>

      {/* ════════════════════════════════════════════════════════
          PRG 観測ステータス（dev/operator 専用・flag OFF→非描画・read-only）
          ════════════════════════════════════════════════════════ */}
      {isPrgReadinessConsoleEnabled() && prgReport && (
        <>
          <GroupLabel title="観測ラボ（dev）" />
          <CollapsibleSection id="prg-readiness" title="PRG 観測ステータス（dev）" collapsed={collapsed} toggle={toggle} defaultOpen>
            <PrgReadinessReportView report={prgReport} />
            {/* ★B-0: Phase B data gate 進捗（read-only・達成/未達のみ・Phase B 本体ではない） */}
            {phaseBProgress && <PhaseBGateView progress={phaseBProgress} />}
          </CollapsibleSection>
        </>
      )}

      {/* ════════════════════════════════════════════════════════
          Quick Actions
          ════════════════════════════════════════════════════════ */}
      <GroupLabel title="ショートカット" />
      <CollapsibleSection id="actions" title="機能ショートカット" collapsed={collapsed} toggle={toggle}>
        <Card className="p-2">
        <div className="grid grid-cols-4 gap-1 sm:grid-cols-8">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="flex flex-col items-center gap-1 rounded-xl p-2.5 transition hover:bg-black/[0.04]"
            >
              <span className="text-base">{a.icon}</span>
              <span className="text-center text-[10px] font-medium leading-tight text-gray-600">{a.label}</span>
            </Link>
          ))}
        </div>
        </Card>
      </CollapsibleSection>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Skill Monitor Cards — 稼働結果・失敗・実行時間・要確認
// ═══════════════════════════════════════════════════════════════

function SkillMonitorCards({
  data,
  loading,
  skillRange,
}: {
  data: DashboardData | null;
  loading: boolean;
  skillRange: 0 | 7 | 30;
}) {
  const s = data?.skills.summary;
  const prev = data?.skills.prevSummary;
  const hasFailures = (s?.failureCount ?? 0) > 0;
  const hasRunning = (data?.skills.runningCount ?? 0) > 0;
  const hasStale = (data?.skills.staleCount ?? 0) > 0;
  const totalCount = s?.totalCount ?? 0;
  const successCount = s?.successCount ?? 0;

  const sampleBadge: string | null =
    totalCount === 0 ? null : totalCount < 5 ? "参考値" : totalCount < 20 ? "サンプル少" : null;
  const prevRate = prev?.totalCount && prev.totalCount > 0 ? prev.successRate : null;
  const rateDelta = prevRate != null && totalCount >= 5 ? (s?.successRate ?? 0) - prevRate : null;
  const rangeLabel = skillRange === 0 ? "本日" : `直近${skillRange}日`;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {/* 1. 稼働結果 */}
      <div className={`rounded-xl border p-3 backdrop-blur ${
        hasFailures
          ? "border-gray-200 bg-white/50"
          : totalCount > 0
            ? "border-emerald-100 bg-emerald-50/30"
            : "border-black/5 bg-white/50"
      }`}>
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">{rangeLabel}の稼働結果</p>
          {sampleBadge && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] font-semibold text-amber-600">
              {sampleBadge}
            </span>
          )}
        </div>
        {loading ? (
          <div className="mt-1 h-6 w-20 animate-pulse rounded bg-gray-100" />
        ) : (
          <>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-gray-900">
              {totalCount > 0 ? `${successCount} / ${totalCount - (data?.skills.runningCount ?? 0)} 成功` : "実行なし"}
            </p>
            <div className="mt-0.5 flex items-center gap-2">
              {totalCount > 0 && (
                <span className="text-xs text-gray-400">{s?.successRate ?? 0}%</span>
              )}
              {rateDelta != null && (
                <span className={`text-[10px] font-medium ${
                  rateDelta > 0 ? "text-emerald-500" : rateDelta < 0 ? "text-red-500" : "text-gray-400"
                }`}>
                  {rateDelta > 0 ? "+" : ""}{rateDelta}pt
                  <span className="ml-0.5 opacity-60">vs前期間</span>
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* 2. 失敗件数 */}
      <div className={`rounded-xl border p-3 backdrop-blur ${
        hasFailures ? "border-red-200 bg-red-50/50" : "border-black/5 bg-white/50"
      }`}>
        <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">失敗</p>
        {loading ? (
          <div className="mt-1 h-6 w-10 animate-pulse rounded bg-gray-100" />
        ) : (
          <>
            <p className={`mt-0.5 text-xl font-bold tabular-nums ${hasFailures ? "text-red-600" : "text-emerald-600"}`}>
              {s?.failureCount ?? 0}
              <span className="text-sm font-medium text-gray-400">件</span>
            </p>
            {hasFailures && s?.failedSkills && s.failedSkills.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {s.failedSkills.slice(0, 3).map((name) => (
                  <p key={name} className="truncate text-[10px] font-medium text-red-500">{name}</p>
                ))}
              </div>
            )}
            {(s?.autoCloseCount ?? 0) > 0 && (
              <p className="mt-1 text-[10px] font-medium text-gray-400">
                +{s?.autoCloseCount}件 自動回収済み
              </p>
            )}
          </>
        )}
      </div>

      {/* 3. 平均実行時間 + 実行中 */}
      <div className={`rounded-xl border p-3 backdrop-blur ${
        hasStale ? "border-amber-200 bg-amber-50/50" : "border-black/5 bg-white/50"
      }`}>
        <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">平均実行時間</p>
        {loading ? (
          <div className="mt-1 h-6 w-14 animate-pulse rounded bg-gray-100" />
        ) : (
          <>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-gray-900">
              {s?.avgDurationMs ? `${(s.avgDurationMs / 1000).toFixed(1)}s` : "—"}
            </p>
            {hasRunning && (
              <p className={`mt-1 text-[10px] font-medium ${hasStale ? "text-amber-600" : "text-blue-500"}`}>
                {hasStale
                  ? `${data?.skills.staleCount}件スタック疑い`
                  : `${data?.skills.runningCount}件実行中`
                }
              </p>
            )}
          </>
        )}
      </div>

      {/* 4. 要確認 */}
      <div className={`rounded-xl border p-3 backdrop-blur ${
        hasFailures || hasStale
          ? "border-red-200 bg-red-50/50"
          : "border-emerald-100 bg-emerald-50/30"
      }`}>
        <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">要確認</p>
        {loading ? (
          <div className="mt-1 h-6 w-14 animate-pulse rounded bg-gray-100" />
        ) : (hasFailures || hasStale) ? (
          <>
            <p className="mt-0.5 text-lg font-bold text-red-600">
              {(s?.failedSkills?.length ?? 0) + (data?.skills.staleCount ?? 0)}件
            </p>
            <div className="mt-1 space-y-0.5">
              {s?.failedSkills?.slice(0, 2).map((name) => (
                <p key={name} className="truncate text-[10px] font-medium text-red-500">{name}</p>
              ))}
              {hasStale && (
                <p className="truncate text-[10px] font-medium text-amber-600">スタック疑い{data?.skills.staleCount}件</p>
              )}
            </div>
          </>
        ) : (
          <p className="mt-0.5 text-lg font-bold text-emerald-600">なし</p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Sub Components
// ═══════════════════════════════════════════════════════════════

function CollapsibleSection({
  id,
  title,
  children,
  collapsed,
  toggle,
  defaultOpen = false,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  collapsed: Record<string, boolean>;
  toggle: (key: string) => void;
  defaultOpen?: boolean;
}) {
  const isCollapsed = collapsed[id] ?? !defaultOpen;
  return (
    <section>
      <button
        onClick={() => toggle(id)}
        className="mb-2 flex w-full items-center justify-between gap-2 px-1 py-1.5 text-left"
      >
        <h2 className="text-[15px] font-semibold tracking-tight text-gray-900">{title}</h2>
        <span
          className={`text-[15px] leading-none text-gray-300 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
          aria-hidden
        >
          ›
        </span>
      </button>
      {!isCollapsed && children}
    </section>
  );
}

/** Apple material: frosted 白カード + hairline ring + 柔らかい影（色付き border は使わない）。 */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white/80 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_30px_rgba(0,0,0,0.06)] ring-1 ring-black/5 backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

/** セクション群の区切り（Apple: 余白 + 静かなキャプションのみ。線・絵文字は使わない）。 */
function GroupLabel({ title }: { title: string }) {
  return (
    <p className="px-1 pt-7 text-[12px] font-semibold tracking-wide text-gray-400 first:pt-0" aria-hidden>
      {title}
    </p>
  );
}

function MetricCard({
  label,
  value,
  color,
  delta,
  loading,
  sub,
}: {
  label: string;
  value?: string | number | null;
  color?: "green" | "amber" | "red";
  delta?: number | null;
  loading?: boolean;
  sub?: string;
}) {
  // Apple stat: 大きく軽い数字がヒーロー。色は意味がある時だけ・通常は黒。chrome は親カードが持つ。
  const colorClass =
    color === "green"
      ? "text-emerald-600"
      : color === "amber"
        ? "text-amber-600"
        : color === "red"
          ? "text-red-600"
          : "text-gray-900";

  return (
    <div className="px-5 py-4">
      <p className="text-[11px] font-medium text-gray-500">{label}</p>
      {loading ? (
        <div className="mt-2 h-7 w-16 animate-pulse rounded-md bg-black/5" />
      ) : (
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className={`text-[28px] font-light leading-tight tracking-tight tabular-nums ${colorClass}`}>
            {value != null ? (typeof value === "number" ? value.toLocaleString() : value) : "—"}
          </span>
          {delta != null && (
            <span className={`text-[11px] font-medium tabular-nums ${delta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {delta >= 0 ? "↑" : "↓"}{Math.abs(delta)}%
            </span>
          )}
        </div>
      )}
      {sub && <p className="mt-0.5 text-[10px] text-gray-400">{sub}</p>}
    </div>
  );
}

function DeltaBadge({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  const positive = value >= 0;
  // Apple: 塗り pill でなく静かな色付きテキスト。
  return (
    <span className={`inline-flex items-baseline gap-1 text-[11px] font-medium tabular-nums ${positive ? "text-emerald-600" : "text-red-600"}`}>
      {label} {positive ? "↑" : "↓"}{Math.abs(value)}%
      <span className="text-[10px] font-normal text-gray-400">vs前期間</span>
    </span>
  );
}

/** iOS segmented control: 灰トラック + 白い選択サム（accent 塗りは使わない）。 */
function RangeToggle({ value, onChange }: { value: 7 | 30; onChange: (v: 7 | 30) => void }) {
  return (
    <div className="inline-flex rounded-full bg-black/5 p-0.5 text-[12px]">
      {([7, 30] as const).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-full px-3 py-1 font-medium transition ${
            value === v ? "bg-white text-gray-900 shadow-sm ring-1 ring-black/5" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {v}日
        </button>
      ))}
    </div>
  );
}

/** segmented item（呼び側が `inline-flex rounded-full bg-black/5 p-0.5` のトラックで包む）。 */
function MiniToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-[12px] font-medium transition ${
        active ? "bg-white text-gray-900 shadow-sm ring-1 ring-black/5" : "text-gray-500 hover:text-gray-700"
      }`}
    >
      {label}
    </button>
  );
}

function StatusDot({ status }: { status: string }) {
  // Apple: 点は静的（pulse させない）。
  const c =
    status === "success"
      ? "bg-emerald-500"
      : status === "error"
        ? "bg-red-500"
        : "bg-amber-400";
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${c}`} />;
}

function MiniCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl bg-white/80 px-4 py-3 ring-1 ring-black/5 backdrop-blur">
      <p className="text-[11px] font-medium text-gray-500">{label}</p>
      <p className={`mt-0.5 text-[22px] font-light leading-tight tracking-tight tabular-nums ${color ?? "text-gray-900"}`}>
        {value}
        {sub && <span className="ml-1 text-[11px] font-normal tracking-normal text-gray-400">{sub}</span>}
      </p>
    </div>
  );
}

function Skeleton({ h = "h-40" }: { h?: string }) {
  return <div className={`${h} w-full animate-pulse rounded-xl bg-gray-100`} />;
}

function SkeletonList({ count }: { count: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100" />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-white/30 py-6 text-center">
      <p className="text-xs text-gray-400">{message}</p>
    </div>
  );
}
