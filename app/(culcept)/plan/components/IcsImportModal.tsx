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

  // reset on close
  useEffect(() => {
    if (!isOpen) {
      setState({ kind: "idle" });
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [isOpen]);

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
          <div className="text-center py-6">
            {/* CEO 補正 (= 2026-05-26): .ics を持たない user 向けの 経路説明 */}
            <p className="text-sm text-slate-700 mb-1.5 font-medium">
              これは <span className="text-indigo-600">既に他カレンダーに予定がある方</span> 向けです
            </p>
            <p className="text-xs text-slate-500 mb-5">
              Google カレンダー / Apple カレンダー / Outlook 等から書き出した
              <br />
              <code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded">.ics</code> ファイルをまとめて取り込めます
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".ics,text/calendar"
              onChange={handleFileChange}
              data-testid="ics-file-input"
              className="block mx-auto text-sm text-slate-600 mb-1"
            />
            <p className="mt-2 text-[11px] text-slate-400">
              選択後、 内容を確認してから保存できます
            </p>

            {/* CEO 補正: .ics がない user の代替経路 */}
            {onSwitchToManualInput && (
              <div className="mt-6 pt-4 border-t border-slate-100">
                <p className="text-xs text-slate-500 mb-2">
                  .ics ファイルがない場合は…
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
