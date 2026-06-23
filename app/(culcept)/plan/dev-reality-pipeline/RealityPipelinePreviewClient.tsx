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
import type { ReflectionPreviewClientDto } from "@/lib/plan/reality/permission/reflection-preview-dto";
import type { LifeOpsPreviewClientDto } from "@/lib/plan/reality/lifeops/lifeops-preview-compute";
import type { RealityOsSurfaceDisplayV0 } from "@/lib/plan/realityPipeline/realityOsSurfacePresenter";
import { RealityOsSurfacePanel } from "@/app/(culcept)/plan/components/realityOs/RealityOsSurfacePanel";

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

/** A-4-c17/c18: action 結果 token（page が allowlist 検証済み）→ 固定辞書文言。 */
export type LifeOpsActionResultToken = "ok" | "ok_done" | "gate_off" | "duplicate_cooldown" | "insert_failed" | "invalid" | "denied";
const LIFEOPS_FB_MESSAGES: Record<LifeOpsActionResultToken, string> = {
  ok: "記録しました（preview 限定・本線には反映されません）",
  ok_done: "完了を記録しました（次回の提案周期に影響します。preview 限定・本線には反映されません）",
  gate_off: "記録は実行されていません（write flag OFF・preview のみ）",
  duplicate_cooldown: "少し前に同じ記録があります（重複防止のため書きませんでした）",
  insert_failed: "記録できませんでした",
  invalid: "この操作は受け付けられませんでした（候補が変わったか、無効な操作です）",
  denied: "操作できません（operator 未ログイン）",
};

export function RealityPipelinePreviewClient({
  envelope,
  meta,
  reflectionPreview,
  lifeOpsPreview,
  feedbackAction,
  lifeOpsActionResult,
  pendingDone,
  realityOsDisplay,
}: {
  envelope: RealityPipelineEnvelope;
  meta?: RealityPipelinePreviewMeta;
  /** A-4-c: reflection preview の **DTO のみ**（A-4-c0 allowlist・実体は渡らない・optional）。 */
  reflectionPreview?: ReflectionPreviewClientDto;
  /** Life Ops preview 統合: briefing/moment の **DTO のみ**（fixture 入力・実体は渡らない・optional）。 */
  lifeOpsPreview?: LifeOpsPreviewClientDto;
  /**
   * A-4-c17: server action（page が渡す・optional）。**ある時だけ** rail の 採用/後で/不要 を form submit に昇格。
   *   完了※ は常に押せない（cadence を動かすため確認 UI 付き別 slice まで disabled）。
   */
  feedbackAction?: (formData: FormData) => Promise<void>;
  /** A-4-c17: 直前 action の結果 token（page allowlist 検証済み・固定辞書で 1 行表示）。 */
  lifeOpsActionResult?: LifeOpsActionResultToken;
  /**
   * A-4-c18: done 確認状態（page が token parse + **現在の rail に実在検証済み**の時だけ渡す）。
   *   これがある時のみ確認 block を表示。stage-2 form だけが confirm field を持つ（rail には無い＝1 クリック write 不能）。
   */
  pendingDone?: { readonly candidateKey: string; readonly label: string };
  /** P3-6: Reality OS surface の **redacted 表示VM のみ**（scenario shift/ラベル・raw 不可・optional）。 */
  realityOsDisplay?: RealityOsSurfaceDisplayV0;
}) {
  const redactionClean = !FORBIDDEN.test(JSON.stringify({ envelope, meta, reflectionPreview, lifeOpsPreview, realityOsDisplay }));
  const rec = envelope.recommended;
  const r = envelope.reasoning;
  const t = envelope.surfacedTrigger;

  return (
    <div className="mx-auto max-w-md px-4 py-6 text-gray-800" data-testid="reality-pipeline-preview">
      <h1 className="text-lg font-bold">Reality Pipeline 観測（operator-only・read-only）</h1>
      <p className="mt-1 text-[11px] text-gray-500">
        envelope の <b>要約のみ</b>を観測。<b>plan を書き換えない・通知しない・apply しない</b>。raw / 個人情報は表示しない。
      </p>

      {realityOsDisplay && <RealityOsSurfacePanel display={realityOsDisplay} />}

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

      {/* A-4-c Reflection Preview（DTO のみ・観測のみ・操作要素を置かない・完了語を使わない） */}
      {reflectionPreview && (
        <section className="mt-3 rounded-xl border border-sky-200 bg-sky-50/40 px-4 py-3" data-testid="reflection-preview">
          <h2 className="text-[12px] font-bold text-sky-800">Reflection Preview（反映プレビュー・観測のみ）</h2>
          <p className="mt-1 text-[10px] text-gray-500">まだ予定には書き込んでいません。保存・確定・通知は行いません。</p>
          <Row k="stage" v={reflectionPreview.stage} />
          <Row k="precondition" v={reflectionPreview.preconditionVerdict ?? "—"} />
          <Row k="候補数（未確定）" v={String(reflectionPreview.reflectedItemCount)} />
          <Row k="blockers / warnings" v={`${reflectionPreview.blockersCount} / ${reflectionPreview.warningsCount}`} />
          {reflectionPreview.items.length > 0 && (
            <ul className="mt-2 list-disc pl-4 text-[11px] text-gray-700" data-testid="reflection-items">
              {reflectionPreview.items.map((it, i) => (
                <li key={i}>
                  {it.startTime}
                  {it.endTime ? `–${it.endTime}` : ""} {it.label}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[10px] text-gray-400">すべて動かせる候補（suggestion）・エンジン推論。未確定。</p>
        </section>
      )}

      {/* Life Ops Preview 統合（fixture 入力・観測のみ・操作要素を置かない・完了語を使わない） */}
      {lifeOpsPreview && (
        <section className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/40 px-4 py-3" data-testid="lifeops-preview">
          <h2 className="text-[12px] font-bold text-emerald-800">Life Ops Preview（fixture 入力・観測のみ）</h2>
          <p className="mt-1 text-[10px] text-gray-500">実データ源には接続していません（fixture）。予定には書き込みません。通知もしません。</p>
          <p className="mt-2 text-[12px] text-gray-800">{lifeOpsPreview.briefing.headline}</p>
          {lifeOpsPreview.briefing.tiers.map((t) => (
            <div key={t.tier} className="mt-2">
              <Row k={t.tierLabel} v={t.line} />
              {t.highlights.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-[11px] text-gray-700">
                  {t.highlights.map((h, i) => (
                    <li key={i}>
                      {h.label} — {h.phrase}（{h.windowHint}）
                      {/* A-4-c16/c17/c18: action rail。feedbackAction がある時だけ form submit に昇格（client handler なし・server action のみ）。
                          完了※は **stage-1**（confirm field を持たない form＝押しても write されず確認状態へ redirect）。 */}
                      {h.actions && h.actions.length > 0 && (feedbackAction && h.candidateKey ? (
                        <form action={feedbackAction} className="ml-2 inline-flex items-center gap-1 align-middle" data-testid="lifeops-action-rail">
                          <input type="hidden" name="candidateKey" value={h.candidateKey} />
                          {h.actions.map((a) =>
                            a.requiresConfirmation ? (
                              <button
                                key={a.action}
                                type="submit"
                                name="action"
                                value={a.action}
                                data-testid="lifeops-action-stage1"
                                data-action={a.action}
                                className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] leading-none text-amber-800"
                              >
                                {a.uiLabel}※
                              </button>
                            ) : (
                              <button
                                key={a.action}
                                type="submit"
                                name="action"
                                value={a.action}
                                data-testid="lifeops-action-button"
                                data-action={a.action}
                                className="rounded-full border border-emerald-300 bg-white px-1.5 py-0.5 text-[9px] leading-none text-emerald-700"
                              >
                                {a.uiLabel}
                              </button>
                            ),
                          )}
                        </form>
                      ) : (
                        <span className="ml-2 inline-flex items-center gap-1 align-middle" data-testid="lifeops-action-rail">
                          {h.actions.map((a) => (
                            <span
                              key={a.action}
                              aria-disabled="true"
                              data-testid="lifeops-action-chip"
                              data-action={a.action}
                              className={`rounded-full border px-1.5 py-0.5 text-[9px] leading-none ${
                                a.requiresConfirmation ? "border-amber-300 bg-amber-50 text-amber-800" : "border-gray-200 bg-gray-50 text-gray-500"
                              }`}
                            >
                              {a.uiLabel}
                              {a.requiresConfirmation ? "※" : ""}
                            </span>
                          ))}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
              {t.overflowLine && <p className="mt-1 text-[10px] text-amber-700">{t.overflowLine}</p>}
            </div>
          ))}
          {lifeOpsPreview.briefing.cautions.length > 0 && (
            <ul className="mt-2 list-disc pl-4 text-[10px] text-gray-500">
              {lifeOpsPreview.briefing.cautions.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
          {lifeOpsPreview.briefing.alsoAvailableLine && <p className="mt-1 text-[10px] text-gray-500">{lifeOpsPreview.briefing.alsoAvailableLine}</p>}
          {/* A-4-c16/c17: rail が 1 つでもあれば、完了の意味と書き込み範囲を 1 回だけ注記（短く・非断定） */}
          {lifeOpsPreview.briefing.tiers.some((t) => t.highlights.some((h) => (h.actions?.length ?? 0) > 0)) && (
            <p className="mt-1 text-[10px] text-amber-700" data-testid="lifeops-action-notice">
              {feedbackAction
                ? "※完了は実際に終わった時だけ（次回の提案周期に影響）。自動では完了になりません。完了は確認をはさみます（1 回押しでは記録されません）。記録は preview 限定です（本線には反映されません）。"
                : "※完了は実際に終わった時だけ（次回の提案周期に影響）。自動では完了になりません。今は表示のみで、押せず・記録もしません。"}
            </p>
          )}
          {/* A-4-c17: 直前 action の結果（token→固定辞書・URL 生値は表示しない） */}
          {lifeOpsActionResult && (
            <p className="mt-1 text-[10px] font-bold text-emerald-700" data-testid="lifeops-action-result">
              {LIFEOPS_FB_MESSAGES[lifeOpsActionResult]}
            </p>
          )}
          {/* A-4-c18: done 明示確認 block（stage-2 form だけが confirm field を持つ・戻る=plain link で write 経路なし） */}
          {pendingDone && feedbackAction && (
            <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2" data-testid="lifeops-done-confirm">
              <p className="text-[11px] font-bold text-amber-800">「{pendingDone.label}」を完了として記録しますか？</p>
              <p className="mt-0.5 text-[10px] text-amber-700">次回の提案周期に影響します。preview 限定です。本線には反映されません。</p>
              <div className="mt-1.5 flex items-center gap-2">
                <form action={feedbackAction} className="inline-flex">
                  <input type="hidden" name="candidateKey" value={pendingDone.candidateKey} />
                  <input type="hidden" name="confirm" value={`done:${pendingDone.candidateKey}`} />
                  <button
                    type="submit"
                    name="action"
                    value="done"
                    data-testid="lifeops-done-confirm-submit"
                    className="rounded-full border border-amber-400 bg-amber-100 px-2 py-0.5 text-[10px] font-bold leading-none text-amber-900"
                  >
                    記録する
                  </button>
                </form>
                <a href="/plan/dev-reality-pipeline" data-testid="lifeops-done-confirm-cancel" className="text-[10px] text-gray-500 underline">
                  戻る
                </a>
              </div>
            </div>
          )}
          <div className="mt-2 border-t border-emerald-100 pt-2">
            <Row k="Moment（今この瞬間・cap 1）" v={lifeOpsPreview.moment.surfaced ? lifeOpsPreview.moment.surfaced.phrase : `沈黙（silenced ${lifeOpsPreview.moment.silencedCount}${lifeOpsPreview.moment.suppression ? `・${lifeOpsPreview.moment.suppression}` : ""}）`} />
            {lifeOpsPreview.moment.surfaced && lifeOpsPreview.moment.surfaced.cautions.length > 0 && (
              <p className="mt-1 text-[10px] text-gray-500">{lifeOpsPreview.moment.surfaced.cautions.join(" / ")}</p>
            )}
            <Row k="重複制御（朝の代表→今は除外）" v={`代表 ${lifeOpsPreview.integrationMeta.briefingRepresentativeCount} 件を除外（${lifeOpsPreview.integrationMeta.momentExcludedCount}）`} />
            {/* A-4-c22: 実データ反映の観測点（counts のみ・key/label 非表示） */}
            <Row
              k="実データ反映（fbCad / realCad / 完了済 deadline 抑制）"
              v={`${lifeOpsPreview.integrationMeta.feedbackCadenceCount} / ${lifeOpsPreview.integrationMeta.realCadenceCount} / ${lifeOpsPreview.integrationMeta.suppressedDeadlineCount}`}
            />
          </div>
        </section>
      )}

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
