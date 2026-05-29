"use client";

/**
 * P3 W2-2 — IcsImportModal (= .ics / iCal review/approve modal)
 *
 * 設計書: docs/alter-plan-p3-ics-import-readiness.md §0.5 補正 3 + §2 W2
 *
 * 役割 (= GPT 補正 3 「W2 主役は upload ではなく review/approve」):
 *   1. file input (= .ics 受領)
 *   2. parse + map (= browser-side、 icsParser + mapIcsEventsToDrafts)
 *   3. preview list (= 各 draft を card 表示、 per-event check/uncheck、 rigidity toggle)
 *   4. 注意表示 (= recurring / all-day / timezone badge + warning)
 *   5. 簡易重複候補 warning (= icsPreviewBuilder の DuplicateCandidate を表示)
 *   6. 承認 button (= 選択 draft を server action stub に送信)
 *
 * 不変:
 *   - 既存 AddAnchorModal frozen (= ファイル不触)
 *   - browser-side parse (= server action 1 回のみ、 cost cap)
 *   - permanent persistence は W3 (= 本 modal は send まで)
 *   - safe degrade (= parse 失敗 / 0 draft で 「ファイルを確認してください」 表示)
 *
 * 設計参考:
 *   - lib/plan/ics/icsParser.ts / icsToAnchorMapper.ts (= W1)
 *   - lib/plan/ics/icsPreviewBuilder.ts (= W2-1)
 *   - components/ui/glassmorphism-design.tsx (= GlassModal / GlassButton)
 *   - app/(culcept)/plan/components/AddAnchorModal.tsx (= pattern 参考、 不触)
 */

import { useState, useEffect, useRef } from "react";

import {
  GlassButton,
  GlassModal,
} from "@/components/ui/glassmorphism-design";
import { parseIcsString } from "@/lib/plan/ics/icsParser";
import {
  mapIcsEventsToDrafts,
  type IcsAnchorDraft,
} from "@/lib/plan/ics/icsToAnchorMapper";
import {
  buildIcsPreview,
  describeDuplicateReason,
  type DraftWithCandidates,
} from "@/lib/plan/ics/icsPreviewBuilder";
import type { ExternalAnchor, AnchorRigidity } from "@/lib/plan/external-anchor";
import { importIcsAnchorsAction } from "../_actions/importIcsAnchors";
// P3 Phase B B-3: Google Calendar 取り込み trigger (= connect 後の本流 import)
import { importGoogleAnchorsAction } from "../_actions/importGoogleAnchors";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// State 型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type ImportState =
  | { kind: "idle" } // file 未選択
  | { kind: "parsing" }
  | { kind: "parse_error"; error: string }
  | {
      kind: "preview";
      previews: ReadonlyArray<DraftWithCandidates>;
      selectedUids: Set<string>;
      rigidityByUid: Map<string, AnchorRigidity>;
      skipped: ReadonlyArray<{ sourceUid: string; reason: string }>;
      warnings: ReadonlyArray<string>;
    }
  | { kind: "submitting" }
  // P3 Phase B B-3: Google import 進捗 (= ICS submitting と別 copy、 fetch+save の体感数秒に対応)
  | { kind: "importing_google" }
  | { kind: "submitted"; imported: number; skipped: number }
  | { kind: "submit_error"; error: string };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function IcsImportModal({
  isOpen,
  onClose,
  onSuccess,
  existingAnchors,
  onSwitchToManualInput,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** 既存 anchor 一覧 (= 簡易重複候補判定用、 buildIcsPreview に渡す) */
  existingAnchors: ReadonlyArray<ExternalAnchor>;
  /** CEO 補正 (= 2026-05-26): .ics を持たない user が手入力経路へ切替できる導線 */
  onSwitchToManualInput?: () => void;
}) {
  const [state, setState] = useState<ImportState>({ kind: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // P3-A-1-1-f: Google 接続状態 (= status route から取得)
  const [googleStatus, setGoogleStatus] = useState<
    "unknown" | "loading" | "connected" | "disconnected"
  >("unknown");
  const [googleError, setGoogleError] = useState<string | null>(null);

  // reset on close
  useEffect(() => {
    if (!isOpen) {
      setState({ kind: "idle" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      setGoogleError(null);
    }
  }, [isOpen]);

  // mount on open: status fetch
  useEffect(() => {
    if (!isOpen) return;
    let aborted = false;
    setGoogleStatus("loading");
    fetch("/api/calendar/google/status", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    })
      .then((r) => r.json() as Promise<{ connected: boolean }>)
      .then((j) => {
        if (aborted) return;
        setGoogleStatus(j.connected ? "connected" : "disconnected");
      })
      .catch(() => {
        if (aborted) return;
        setGoogleStatus("disconnected");
      });
    return () => {
      aborted = true;
    };
  }, [isOpen]);

  async function handleGoogleToggle() {
    setGoogleError(null);
    if (googleStatus === "connected") {
      // disconnect
      setGoogleStatus("loading");
      try {
        const res = await fetch("/api/calendar/google/disconnect", {
          method: "POST",
          credentials: "same-origin",
        });
        const json = (await res.json()) as { ok: boolean; error?: string };
        if (json.ok) {
          setGoogleStatus("disconnected");
        } else {
          setGoogleStatus("connected"); // revert
          setGoogleError(json.error ?? "解除に失敗しました");
        }
      } catch {
        setGoogleStatus("connected");
        setGoogleError("解除に失敗しました");
      }
      return;
    }
    if (googleStatus === "disconnected" || googleStatus === "unknown") {
      // connect → server route に redirect
      window.location.href = "/api/calendar/google/connect?intent=initial";
    }
  }

  // P3 Phase B B-3: connect 済 Google Calendar を取り込む (= connect→import→reflect 本流 trigger)
  //   - importGoogleAnchorsAction は引数なし (= server 側で OAuth connection を使い自前 fetch)
  //   - ok → ICS と同 submitted 状態 + onSuccess() で plan 全 refetch
  //     (= 二重表示防止: data 層 externalUid dedup [B-2] + UI 層 全 refetch、 client merge なし)
  //   - !ok → submit_error (= modal 維持、 error 表示)
  async function handleGoogleImport() {
    setState({ kind: "importing_google" });
    try {
      const result = await importGoogleAnchorsAction();
      if (result.ok) {
        setState({
          kind: "submitted",
          imported: result.imported,
          skipped: result.skipped,
        });
        onSuccess();
      } else {
        setState({ kind: "submit_error", error: result.error });
      }
    } catch (err) {
      setState({
        kind: "submit_error",
        error: err instanceof Error ? err.message : "取り込みに失敗しました",
      });
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file === undefined) return;

    setState({ kind: "parsing" });

    try {
      const text = await file.text();
      const parseResult = parseIcsString(text);

      if (!parseResult.success) {
        setState({
          kind: "parse_error",
          error: parseResult.error ?? "ファイル解析に失敗しました",
        });
        return;
      }

      const mapping = mapIcsEventsToDrafts(parseResult.events);
      const previews = buildIcsPreview(mapping.drafts, existingAnchors);

      // 初期状態: 全 draft selected、 rigidity default "hard"
      const selectedUids = new Set(previews.map((p) => p.draft.sourceUid));
      const rigidityByUid = new Map<string, AnchorRigidity>();
      for (const p of previews) {
        rigidityByUid.set(p.draft.sourceUid, p.draft.rigidity);
      }

      setState({
        kind: "preview",
        previews,
        selectedUids,
        rigidityByUid,
        skipped: mapping.skipped,
        warnings: parseResult.warnings,
      });
    } catch (err) {
      setState({
        kind: "parse_error",
        error: err instanceof Error ? err.message : "ファイル読み込みに失敗しました",
      });
    }
  }

  function toggleSelect(uid: string) {
    if (state.kind !== "preview") return;
    const next = new Set(state.selectedUids);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    setState({ ...state, selectedUids: next });
  }

  function toggleRigidity(uid: string) {
    if (state.kind !== "preview") return;
    const next = new Map(state.rigidityByUid);
    const current = next.get(uid) ?? "hard";
    next.set(uid, current === "hard" ? "soft" : "hard");
    setState({ ...state, rigidityByUid: next });
  }

  async function handleApprove() {
    if (state.kind !== "preview") return;
    const selected = state.previews
      .filter((p) => state.selectedUids.has(p.draft.sourceUid))
      .map((p) => {
        const overriddenRigidity =
          state.rigidityByUid.get(p.draft.sourceUid) ?? p.draft.rigidity;
        return { ...p.draft, rigidity: overriddenRigidity };
      });

    if (selected.length === 0) return;

    setState({ kind: "submitting" });
    try {
      const result = await importIcsAnchorsAction(selected);
      if (result.ok) {
        setState({
          kind: "submitted",
          imported: result.imported,
          skipped: result.skipped,
        });
        onSuccess();
      } else {
        setState({ kind: "submit_error", error: result.error });
      }
    } catch (err) {
      setState({
        kind: "submit_error",
        error: err instanceof Error ? err.message : "保存に失敗しました",
      });
    }
  }

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="カレンダーから取り込む"
      size="lg"
    >
      <div
        className="space-y-4"
        data-testid="ics-import-modal"
      >
        {state.kind === "idle" && (
          <div className="py-2">
            {/* P3-A-1-1-f: Google カレンダー toggle button (= 主導線) */}
            <div className="px-1 mb-5">
              <p className="text-[11px] text-slate-500 mb-2 text-center">
                Google カレンダーから自動で取り込む
              </p>
              <button
                type="button"
                onClick={handleGoogleToggle}
                disabled={googleStatus === "loading" || googleStatus === "unknown"}
                data-testid="google-connect-toggle"
                aria-pressed={googleStatus === "connected"}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all border ${
                  googleStatus === "connected"
                    ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white border-indigo-500 shadow-md hover:from-indigo-600 hover:to-purple-700"
                    : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50"
                } ${googleStatus === "loading" || googleStatus === "unknown" ? "opacity-60 cursor-wait" : ""}`}
              >
                {/* G icon */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill={googleStatus === "connected" ? "#fff" : "#4285F4"} />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill={googleStatus === "connected" ? "#fff" : "#34A853"} />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09 0-.73.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill={googleStatus === "connected" ? "#fff" : "#FBBC05"} />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill={googleStatus === "connected" ? "#fff" : "#EA4335"} />
                </svg>
                <span>
                  {googleStatus === "loading"
                    ? "処理中…"
                    : googleStatus === "connected"
                      ? "Google カレンダーに接続中"
                      : "Google カレンダーを接続"}
                </span>
              </button>
              {googleStatus === "connected" && (
                <p
                  className="mt-2 text-[10px] text-slate-400 text-center"
                  data-testid="google-connect-toggle-hint"
                >
                  もう一度押すと接続を解除します
                </p>
              )}
              {googleError && (
                <p
                  className="mt-2 text-[11px] text-rose-600 text-center"
                  data-testid="google-connect-error"
                  role="alert"
                >
                  {googleError}
                </p>
              )}

              {/* P3 Phase B B-3: connected 時のみ表示する import trigger (= connect→import 本流) */}
              {googleStatus === "connected" && (
                <button
                  type="button"
                  onClick={handleGoogleImport}
                  data-testid="google-import-trigger"
                  className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all bg-emerald-500 text-white border border-emerald-500 shadow-md hover:bg-emerald-600 hover:border-emerald-600"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 3v12" />
                    <path d="M7 12l5 5 5-5" />
                    <path d="M5 21h14" />
                  </svg>
                  <span>Google の予定を取り込む</span>
                </button>
              )}
            </div>

            {/* divider */}
            <div className="my-4 flex items-center gap-3 text-[10px] text-slate-400">
              <div className="flex-1 h-px bg-slate-200" />
              <span>または</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            {/* .ics fallback (= 既存) */}
            <div className="text-center pt-1">
              <p className="text-[11px] text-slate-500 mb-2">
                <code className="text-[10px] bg-slate-100 px-1 py-0.5 rounded">.ics</code>{" "}
                ファイルから取り込む
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".ics,text/calendar"
                onChange={handleFileChange}
                data-testid="ics-file-input"
                className="block mx-auto text-xs text-slate-500"
              />

              {/* CEO 補正: .ics がない user の代替経路 */}
              {onSwitchToManualInput && (
                <div className="mt-5 pt-4 border-t border-slate-100">
                  <p className="text-xs text-slate-500 mb-2">
                    どちらも使わない場合は…
                  </p>
                  <button
                    type="button"
                    onClick={onSwitchToManualInput}
                    className="text-xs text-indigo-600 hover:text-purple-700 font-medium underline-offset-2 hover:underline"
                    data-testid="ics-switch-to-manual"
                  >
                    手入力で 1 件ずつ追加する →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {state.kind === "parsing" && (
          <div className="text-center py-8 text-sm text-slate-500">
            解析しています…
          </div>
        )}

        {state.kind === "parse_error" && (
          <div className="text-center py-8">
            <p className="text-sm text-red-600">{state.error}</p>
            <GlassButton
              variant="ghost"
              onClick={() => setState({ kind: "idle" })}
              className="mt-4"
            >
              別のファイルを試す
            </GlassButton>
          </div>
        )}

        {state.kind === "preview" && (
          <PreviewView
            previews={state.previews}
            selectedUids={state.selectedUids}
            rigidityByUid={state.rigidityByUid}
            skipped={state.skipped}
            onToggleSelect={toggleSelect}
            onToggleRigidity={toggleRigidity}
            onCancel={() => setState({ kind: "idle" })}
            onApprove={handleApprove}
          />
        )}

        {state.kind === "submitting" && (
          <div className="text-center py-8 text-sm text-slate-500">
            保存しています…
          </div>
        )}

        {/* P3 Phase B B-3: Google import 進捗 (= fetch+save 体感数秒、 専用 copy) */}
        {state.kind === "importing_google" && (
          <div
            className="text-center py-8 text-sm text-slate-500"
            data-testid="google-importing"
          >
            Google カレンダーから取り込んでいます…
          </div>
        )}

        {state.kind === "submitted" && (
          <div className="text-center py-8" data-testid="ics-submitted">
            <p className="text-sm text-slate-700">
              ✅ {state.imported} 件 取り込みました
              {state.skipped > 0 && ` (${state.skipped} 件 skip)`}
            </p>
            <GlassButton
              variant="primary"
              onClick={onClose}
              className="mt-4"
            >
              閉じる
            </GlassButton>
          </div>
        )}

        {state.kind === "submit_error" && (
          <div className="text-center py-8">
            <p className="text-sm text-red-600">{state.error}</p>
            <GlassButton
              variant="ghost"
              onClick={onClose}
              className="mt-4"
            >
              閉じる
            </GlassButton>
          </div>
        )}
      </div>
    </GlassModal>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Preview list 内部 component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function PreviewView({
  previews,
  selectedUids,
  rigidityByUid,
  skipped,
  onToggleSelect,
  onToggleRigidity,
  onCancel,
  onApprove,
}: {
  previews: ReadonlyArray<DraftWithCandidates>;
  selectedUids: Set<string>;
  rigidityByUid: Map<string, AnchorRigidity>;
  skipped: ReadonlyArray<{ sourceUid: string; reason: string }>;
  onToggleSelect: (uid: string) => void;
  onToggleRigidity: (uid: string) => void;
  onCancel: () => void;
  onApprove: () => void;
}) {
  const selectedCount = previews.filter((p) =>
    selectedUids.has(p.draft.sourceUid),
  ).length;

  if (previews.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-slate-600">
          ファイル内に取り込める予定が見つかりませんでした
        </p>
        {skipped.length > 0 && (
          <p className="mt-2 text-xs text-slate-400">
            ({skipped.length} 件 skip: 必須情報が欠けている等)
          </p>
        )}
        <GlassButton
          variant="ghost"
          onClick={onCancel}
          className="mt-4"
        >
          別のファイルを試す
        </GlassButton>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500 mb-2">
        {previews.length} 件の予定を解析しました。 取り込む予定を選択してください。
      </div>

      <div
        className="space-y-2 max-h-96 overflow-y-auto"
        data-testid="ics-preview-list"
      >
        {previews.map((p) => {
          const isSelected = selectedUids.has(p.draft.sourceUid);
          const rigidity =
            rigidityByUid.get(p.draft.sourceUid) ?? p.draft.rigidity;
          return (
            <PreviewCard
              key={p.draft.sourceUid}
              previewItem={p}
              isSelected={isSelected}
              rigidity={rigidity}
              onToggleSelect={() => onToggleSelect(p.draft.sourceUid)}
              onToggleRigidity={() => onToggleRigidity(p.draft.sourceUid)}
            />
          );
        })}
      </div>

      {skipped.length > 0 && (
        <div className="text-xs text-slate-400 pt-2 border-t">
          {skipped.length} 件は必須情報が欠けているため取り込めません
        </div>
      )}

      <div className="flex justify-between items-center pt-3 border-t">
        <span className="text-xs text-slate-500">
          {selectedCount} / {previews.length} 件 選択中
        </span>
        <div className="flex gap-2">
          <GlassButton variant="ghost" onClick={onCancel}>
            キャンセル
          </GlassButton>
          <GlassButton
            variant="primary"
            onClick={onApprove}
            disabled={selectedCount === 0}
            data-testid="ics-approve-btn"
          >
            {selectedCount} 件を取り込む
          </GlassButton>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1 件の draft card
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function PreviewCard({
  previewItem,
  isSelected,
  rigidity,
  onToggleSelect,
  onToggleRigidity,
}: {
  previewItem: DraftWithCandidates;
  isSelected: boolean;
  rigidity: AnchorRigidity;
  onToggleSelect: () => void;
  onToggleRigidity: () => void;
}) {
  const d = previewItem.draft;
  const candidates = previewItem.duplicateCandidates;
  const isRecurring = d.anchorKind === "recurring";
  const isAllDay = d.source.isAllDay;
  const hasNoTimezone = !d.source.tzid && !isAllDay;

  return (
    <div
      className={[
        "rounded-lg border p-3",
        isSelected ? "border-indigo-300 bg-indigo-50/30" : "border-slate-200 bg-white opacity-60",
      ].join(" ")}
      data-testid="ics-preview-card"
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="mt-1"
          data-testid="ics-preview-checkbox"
          aria-label={`${d.title} を取り込む`}
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-slate-900 truncate">
            {d.title}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {d.anchorKind === "one_off" ? d.date : d.validFrom}
            {!isAllDay && d.startTime && ` ${d.startTime}`}
            {!isAllDay && d.endTime && `-${d.endTime}`}
            {d.locationText && ` · ${d.locationText}`}
          </div>

          {/* Badges */}
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {isRecurring && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                繰り返し予定
              </span>
            )}
            {isAllDay && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                終日
              </span>
            )}
            {hasNoTimezone && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                ⚠ 時刻 timezone 不明
              </span>
            )}
            <button
              type="button"
              onClick={onToggleRigidity}
              className={[
                "text-[10px] px-1.5 py-0.5 rounded border cursor-pointer",
                rigidity === "hard"
                  ? "bg-slate-200 text-slate-700 border-slate-300"
                  : "bg-slate-50 text-slate-500 border-slate-200",
              ].join(" ")}
              data-testid="ics-rigidity-toggle"
              aria-label="動かせなさ"
            >
              {rigidity === "hard" ? "動かせない" : "動かせる"}
            </button>
          </div>

          {/* 重複候補 warning */}
          {candidates.length > 0 && (
            <div
              className="mt-1.5 text-[11px] text-amber-700"
              data-testid="ics-duplicate-warning"
            >
              ⚠ {describeDuplicateReason(candidates[0]!.reason)}
              {" — "}
              <span className="text-slate-500">
                既存: 「{candidates[0]!.existingTitle}」
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
