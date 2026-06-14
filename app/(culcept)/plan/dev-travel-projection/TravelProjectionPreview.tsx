/**
 * T11-A — Travel Projection Preview（**read-only presentational・dev preview 専用**）
 *
 * 役割: `PlanIntelligenceProjection` を **表示するだけ** の read-only コンポーネント。
 *   - accepts `PlanIntelligenceProjection` **のみ**（authoritative packet / raw FitResult を受け取らない＝型）。
 *   - **action button / booking / schedule / execute / send / 入力 を一切持たない**（display only）。
 *   - executionAuthority / authoritative / diagnostics prop を持たない。
 *   - interactivity 無し → client component 不要（"use client" なし・server render 可）。
 */

import type { PlanIntelligenceProjection } from "@/lib/shared/travel/plan-intelligence-projection-types";

function Section({ title, testid, children }: { title: string; testid: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white/60 p-3" data-testid={testid}>
      <h2 className="text-[11px] font-bold tracking-wide text-gray-500">{title}</h2>
      <div className="mt-1 text-[13px] text-gray-800">{children}</div>
    </section>
  );
}

export function TravelProjectionPreview({ projection }: { projection: PlanIntelligenceProjection }) {
  const p = projection;
  return (
    <div className="mx-auto max-w-md space-y-3 px-4 py-6" data-testid="travel-projection-preview">
      <header>
        <h1 className="text-lg font-bold text-gray-900">Travel Projection（read-only preview）</h1>
        <p className="mt-1 text-[11px] text-gray-400">表示のみ。予約・確定・送信・実行は行いません。</p>
      </header>

      <Section title="ANSWER" testid="tp-answer">
        <p>{p.answer.text}</p>
        <p className="mt-1 text-[11px] text-gray-400">next: {p.answer.nextAction} / {p.answer.recommendedProposalId ?? "—"}</p>
      </Section>

      <Section title="WHY THIS PLAN" testid="tp-why">
        <p>{p.whyThisPlan}</p>
      </Section>

      <Section title="WHAT COULD FAIL" testid="tp-could-fail">
        {p.whatCouldFail.length === 0 ? (
          <p className="text-gray-400">—</p>
        ) : (
          <ul className="list-disc pl-4">
            {p.whatCouldFail.map((w, i) => (
              <li key={i}>{w.note} <span className="text-[10px] text-gray-400">({w.source})</span></li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="NEEDS CONFIRMATION" testid="tp-needs-confirmation">
        {p.needsConfirmation.length === 0 ? (
          <p className="text-gray-400">—</p>
        ) : (
          <ul className="list-disc pl-4">
            {p.needsConfirmation.map((c, i) => (
              <li key={i}>確認が必要: {c.reason}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="QUESTIONS TO ASK" testid="tp-questions">
        {p.questionsToAsk.length === 0 ? (
          <p className="text-gray-400">—</p>
        ) : (
          <ul className="list-disc pl-4">
            {p.questionsToAsk.map((q, i) => (
              <li key={i}>{q.about}: {q.intent}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="FALLBACK" testid="tp-fallback">
        {p.fallbackNote.length === 0 ? (
          <p className="text-gray-400">—</p>
        ) : (
          <ul className="list-disc pl-4">
            {p.fallbackNote.map((f, i) => (
              <li key={i}>{f.trigger} → {f.fallbackAction}{f.switchToProposalId ? ` (${f.switchToProposalId})` : ""}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="FIT ADVISORY" testid="tp-fit-advisory">
        {p.fitAdvisory.length === 0 ? (
          <p className="text-gray-400">—</p>
        ) : (
          <ul className="list-disc pl-4">
            {p.fitAdvisory.map((s, i) => (
              <li key={i}>
                {s.candidateId}: <strong>{s.grade}</strong> / 確度 {s.confidenceBand}
                {s.riskCodes.length > 0 ? ` / risk: ${s.riskCodes.join(", ")}` : ""}
                <span className="text-[10px] text-gray-400"> (参考・順位付けには使いません)</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="READINESS" testid="tp-readiness">
        <p>状態: {p.readinessWarning.readinessState}{p.readinessWarning.hasOpenConfirmations ? "（未解決の確認あり）" : ""}</p>
      </Section>

      <Section title="VIEWER NOTE" testid="tp-viewer-note">
        <p>{p.viewerNote ?? <span className="text-gray-400">—</span>}</p>
      </Section>
    </div>
  );
}
