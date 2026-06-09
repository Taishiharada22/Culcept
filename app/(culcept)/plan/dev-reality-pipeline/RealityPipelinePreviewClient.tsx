"use client";
/**
 * P-D Reality Pipeline Preview Client（**route 非依存・presentational・read-only**）
 *
 * 設計: docs/reality-pipeline-dev-preview-design.md
 *
 * 役割: `RealityPipelineEnvelope`（既に redacted・summary-only）を operator が観測するための表示専用 component。
 *   **client には envelope 要約 + counts(meta) のみ渡す**（MemoryItem/WorldState/ChangeSet 実体は渡さない）。
 *
 * 厳守: **apply button を置かない**・raw/PII/title/location/seedRef/personality/full ChangeSet payload を表示しない・
 *   plan を書き換えない・通知しない・fetch しない（presentational のみ）・route に依存しない（fixture で render 可）。
 */
import type { RealityPipelineEnvelope } from "@/lib/plan/reality/orchestration/reality-pipeline";

/** envelope に無い count（page が WorldState/synthesis から渡す・fixture test が渡す）。 */
export interface RealityPipelinePreviewMeta {
  readonly hardConstraintsCount: number;
  readonly availableWindowsCount: number;
  readonly usableContextsCount: number;
  readonly memoryItemCount: number;
}

// **自己 redaction チェック**（envelope に万一 raw が混じれば violation を表示）。
const FORBIDDEN = /seed_?ref|utterance|personality|怠惰|だらしな|title|location|@[a-z]|\b\d{10,}\b/i;

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-gray-100 py-1 text-[12px]" data-testid="row">
      <span className="text-gray-500">{k}</span>
      <span className="text-gray-800">{v}</span>
    </div>
  );
}

export function RealityPipelinePreviewClient({ envelope, meta }: { envelope: RealityPipelineEnvelope; meta?: RealityPipelinePreviewMeta }) {
  const redactionClean = !FORBIDDEN.test(JSON.stringify({ envelope, meta }));
  const rec = envelope.recommended;
  const r = envelope.reasoning;
  const t = envelope.surfacedTrigger;

  return (
    <div className="mx-auto max-w-md px-4 py-6 text-gray-800" data-testid="reality-pipeline-preview">
      <h1 className="text-lg font-bold">Reality Pipeline 観測（operator-only・read-only）</h1>
      <p className="mt-1 text-[11px] text-gray-500">
        envelope の <b>要約のみ</b>を観測。<b>plan を書き換えない・通知しない・apply しない</b>。raw / 個人情報は表示しない。
      </p>

      <section className="mt-3 rounded-xl border border-violet-200 bg-violet-50/40 px-4 py-3">
        <Row k="date" v={envelope.date} />
        <Row k="現実 readiness" v={envelope.worldReadiness} />
        <Row k="おすすめ" v={rec ? `${rec.tier}（active ${rec.activeMinutes}分 / rest ${rec.restMinutes}分 / strain ${rec.strain}）` : "組めない"} />
        {r && (
          <>
            <Row k="fit（time/energy/weather/mobility）" v={`${r.fits.time} / ${r.fits.energy} / ${r.fits.weather} / ${r.fits.mobility}`} />
            <Row k="confidence（記憶の反映）" v={r.confidence + (meta ? `（usableContexts ${meta.usableContextsCount}）` : "")} />
            <Row k="reasoning readiness" v={r.readiness} />
          </>
        )}
        {meta && (
          <>
            <Row k="hardConstraints" v={String(meta.hardConstraintsCount)} />
            <Row k="availableWindows" v={String(meta.availableWindowsCount)} />
            <Row k="MemoryItem" v={String(meta.memoryItemCount)} />
          </>
        )}
        <Row k="trigger（沈黙 default）" v={t ? `${t.kind}: ${t.headline}` : `silent（沈黙 ${envelope.silencedTriggerCount}）`} />
        <Row k="permission" v={`${envelope.permission.verdict}（risk ${envelope.permission.risk}）`} />
        {/* ChangeSet は **summary のみ**（opCount）。full payload も apply button も置かない。 */}
        <Row k="ChangeSet draft（適用しない候補）" v={envelope.changeSetDraft ? `${envelope.changeSetDraft.opCount} 操作候補` : "なし"} />
        <Row k="redaction" v={redactionClean ? "clean ✓" : "violation ✗"} />
      </section>

      {envelope.stopReasons.length > 0 && (
        <section className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-2" data-testid="stop-reasons">
          <div className="text-[11px] font-bold text-amber-700">stop reasons / 欠損</div>
          <ul className="mt-1 list-disc pl-4 text-[11px] text-amber-700">
            {envelope.stopReasons.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-3 text-[10px] text-gray-400">read-only 観測面。apply / plan write / 通知 / PlanClient 接続なし。</p>
    </div>
  );
}
