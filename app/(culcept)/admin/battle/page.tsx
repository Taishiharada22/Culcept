"use client";

import { useEffect, useState } from "react";
import { GlassButton, GlassCard } from "@/components/ui/glassmorphism-design";

type ContestItem = {
    id: string;
    title: string;
    theme: string;
    status: string;
    moderation_state: string;
    featured_rank: number | null;
    voting_ends_at: string;
    failedFinalizeCount: number;
};

type ReportItem = {
    id: string;
    contest_id: string;
    entry_id: string;
    reporter_user_id: string;
    reason: string;
    status: string;
    created_at: string;
};

type Metrics = {
    refreshTotal: number;
    refreshFailureRate: number;
    finalizeSuccessRate: number;
    voteCompletionRate: number;
    resultViewRate: number;
};

export default function AdminBattlePage() {
    const [contests, setContests] = useState<ContestItem[]>([]);
    const [reports, setReports] = useState<ReportItem[]>([]);
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const [voteContestId, setVoteContestId] = useState("");
    const [voteEntryId, setVoteEntryId] = useState("");
    const [voteUserId, setVoteUserId] = useState("");
    const [voteReason, setVoteReason] = useState("");
    const [message, setMessage] = useState<string | null>(null);

    async function loadAll() {
        const [contestsRes, reportsRes, metricsRes] = await Promise.all([
            fetch("/api/battle/ops/contests", { cache: "no-store" }),
            fetch("/api/battle/ops/reports", { cache: "no-store" }),
            fetch("/api/admin/battle/metrics", { cache: "no-store" }),
        ]);
        const contestsData = await contestsRes.json().catch(() => ({}));
        const reportsData = await reportsRes.json().catch(() => ({}));
        const metricsData = await metricsRes.json().catch(() => ({}));
        setContests(contestsData.contests ?? []);
        setReports(reportsData.reports ?? []);
        setMetrics(metricsData.metrics ?? null);
    }

    useEffect(() => {
        let cancelled = false;
        async function bootstrap() {
            const [contestsRes, reportsRes, metricsRes] = await Promise.all([
                fetch("/api/battle/ops/contests", { cache: "no-store" }),
                fetch("/api/battle/ops/reports", { cache: "no-store" }),
                fetch("/api/admin/battle/metrics", { cache: "no-store" }),
            ]);
            const contestsData = await contestsRes.json().catch(() => ({}));
            const reportsData = await reportsRes.json().catch(() => ({}));
            const metricsData = await metricsRes.json().catch(() => ({}));
            if (cancelled) return;
            setContests(contestsData.contests ?? []);
            setReports(reportsData.reports ?? []);
            setMetrics(metricsData.metrics ?? null);
        }
        void bootstrap();
        return () => {
            cancelled = true;
        };
    }, []);

    async function actOnContest(contestId: string, action: string) {
        const res = await fetch(`/api/battle/ops/contests/${contestId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
        });
        const data = await res.json().catch(() => ({}));
        setMessage(String(data?.error ?? `${action} completed`));
        await loadAll();
    }

    async function actOnReport(reportId: string, status: string, entryAction?: string) {
        const res = await fetch("/api/battle/ops/reports", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reportId, status, entryAction }),
        });
        const data = await res.json().catch(() => ({}));
        setMessage(String(data?.error ?? `${status} completed`));
        await loadAll();
    }

    async function updateVotes(action: "invalidate" | "restore") {
        const res = await fetch("/api/battle/ops/votes", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action,
                contestId: voteContestId,
                entryId: voteEntryId || null,
                voterUserId: voteUserId || null,
                reason: voteReason || null,
            }),
        });
        const data = await res.json().catch(() => ({}));
        setMessage(String(data?.error ?? `${action} completed`));
        await loadAll();
    }

    return (
        <div className="space-y-6 p-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-500">Admin</div>
                    <h1 className="text-3xl font-bold text-slate-900">Battle Ops</h1>
                </div>
                <GlassButton href="/admin" variant="secondary">Admin Home</GlassButton>
            </div>

            {message ? (
                <GlassCard>
                    <div className="text-sm text-slate-700">{message}</div>
                </GlassCard>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <GlassCard><div className="text-xs uppercase tracking-[0.24em] text-slate-400">Refresh Count</div><div className="mt-2 text-2xl font-bold">{metrics?.refreshTotal ?? 0}</div></GlassCard>
                <GlassCard><div className="text-xs uppercase tracking-[0.24em] text-slate-400">Realtime Failure</div><div className="mt-2 text-2xl font-bold">{metrics?.refreshFailureRate ?? 0}%</div></GlassCard>
                <GlassCard><div className="text-xs uppercase tracking-[0.24em] text-slate-400">Finalize Success</div><div className="mt-2 text-2xl font-bold">{metrics?.finalizeSuccessRate ?? 0}%</div></GlassCard>
                <GlassCard><div className="text-xs uppercase tracking-[0.24em] text-slate-400">Vote Completion</div><div className="mt-2 text-2xl font-bold">{metrics?.voteCompletionRate ?? 0}%</div></GlassCard>
                <GlassCard><div className="text-xs uppercase tracking-[0.24em] text-slate-400">Result View</div><div className="mt-2 text-2xl font-bold">{metrics?.resultViewRate ?? 0}%</div></GlassCard>
            </div>

            <GlassCard>
                <div className="space-y-3">
                    <h2 className="text-xl font-bold text-slate-900">Vote Control</h2>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <input value={voteContestId} onChange={(event) => setVoteContestId(event.target.value)} placeholder="contestId" className="rounded-2xl border border-slate-200 px-4 py-3" />
                        <input value={voteEntryId} onChange={(event) => setVoteEntryId(event.target.value)} placeholder="entryId (optional)" className="rounded-2xl border border-slate-200 px-4 py-3" />
                        <input value={voteUserId} onChange={(event) => setVoteUserId(event.target.value)} placeholder="voterUserId (optional)" className="rounded-2xl border border-slate-200 px-4 py-3" />
                        <input value={voteReason} onChange={(event) => setVoteReason(event.target.value)} placeholder="reason" className="rounded-2xl border border-slate-200 px-4 py-3" />
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <GlassButton onClick={() => updateVotes("invalidate")} variant="danger">票を無効化</GlassButton>
                        <GlassButton onClick={() => updateVotes("restore")} variant="secondary">票を復元</GlassButton>
                    </div>
                </div>
            </GlassCard>

            <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
                <GlassCard>
                    <div className="space-y-4">
                        <h2 className="text-xl font-bold text-slate-900">Contests</h2>
                        {contests.map((contest) => (
                            <div key={contest.id} className="rounded-3xl border border-white/80 bg-white/80 px-5 py-4">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                        <div className="text-lg font-bold text-slate-900">{contest.theme}</div>
                                        <div className="text-sm text-slate-500">{contest.title}</div>
                                        <div className="mt-2 text-xs text-slate-400">
                                            status {contest.status} / moderation {contest.moderation_state} / failed finalize {contest.failedFinalizeCount}
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <GlassButton size="sm" variant="secondary" onClick={() => actOnContest(contest.id, "force_end")}>強制終了</GlassButton>
                                        <GlassButton size="sm" variant="secondary" onClick={() => actOnContest(contest.id, "refinalize")}>再確定</GlassButton>
                                        <GlassButton size="sm" variant="danger" onClick={() => actOnContest(contest.id, "hide")}>非表示</GlassButton>
                                        <GlassButton size="sm" variant="secondary" onClick={() => actOnContest(contest.id, "restore")}>復帰</GlassButton>
                                        <GlassButton size="sm" variant="secondary" onClick={() => actOnContest(contest.id, "pin_featured")}>特集ピン</GlassButton>
                                        <GlassButton size="sm" variant="ghost" onClick={() => actOnContest(contest.id, "unpin_featured")}>ピン解除</GlassButton>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </GlassCard>

                <GlassCard>
                    <div className="space-y-4">
                        <h2 className="text-xl font-bold text-slate-900">Reports</h2>
                        {reports.map((report) => (
                            <div key={report.id} className="rounded-3xl border border-white/80 bg-white/80 px-5 py-4">
                                <div className="text-sm font-semibold text-slate-900">{report.reason}</div>
                                <div className="mt-1 text-xs text-slate-400">
                                    status {report.status} / contest {report.contest_id.slice(0, 8)} / entry {report.entry_id.slice(0, 8)}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <GlassButton size="sm" variant="secondary" onClick={() => actOnReport(report.id, "resolved", "flag")}>解決 + flag</GlassButton>
                                    <GlassButton size="sm" variant="secondary" onClick={() => actOnReport(report.id, "resolved", "hide")}>解決 + hide</GlassButton>
                                    <GlassButton size="sm" variant="danger" onClick={() => actOnReport(report.id, "resolved", "disqualify")}>解決 + disqualify</GlassButton>
                                    <GlassButton size="sm" variant="ghost" onClick={() => actOnReport(report.id, "dismissed", "restore")}>dismiss</GlassButton>
                                </div>
                            </div>
                        ))}
                    </div>
                </GlassCard>
            </div>
        </div>
    );
}
