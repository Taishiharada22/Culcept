"use client";

/**
 * SourceListModal — 「教えた予定」一覧 + 「忘れさせる」削除 + 「教え直す」編集 (W1-X1 → W1-X2 拡張)
 *
 * 設計書: docs/alter-plan-w1x1-mini-design.md / docs/alter-plan-w1x2-edit-anchor-mini-design.md
 *
 * 機能:
 *   - 既存 source 一覧 + 関連 anchor list を inline 展開
 *   - source 単位「忘れさせる」→ 2 段確認（件数提示）→ DELETE (W1-X1 既存)
 *   - 各 anchor に「教え直す」button (W1-X2 新規) → onEditRequest callback
 *   - deleting / error state を内蔵
 *
 * 範囲外:
 *   - 個別 anchor の削除（source 単位のみ）
 *   - anchor kind 変更（編集は EditAnchorModal で kindMutable=false）
 */

import { useEffect, useMemo, useState } from "react";

import {
  GlassBadge,
  GlassButton,
  GlassCard,
  GlassModal,
} from "@/components/ui/glassmorphism-design";
import { registerHomeSwipeModalOpen } from "@/lib/home-swipe-modal-lock";
import { deleteAnchorSource } from "@/lib/plan/anchor-fetch";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { ExternalAnchorSource } from "@/lib/plan/external-anchor-source";
import { displayProposalAwareNotes } from "@/lib/plan/proposal/displayNotes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type DeleteState =
  | { kind: "idle" }
  | { kind: "confirming"; sourceId: string }
  | { kind: "deleting"; sourceId: string }
  | { kind: "error"; sourceId: string; message: string };

const SOURCE_TYPE_LABELS: Record<ExternalAnchorSource["sourceType"], string> = {
  manual: "手動",
  template: "テンプレ",
  pdf: "PDF",
  image: "画像",
  chat: "会話",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function SourceListModal({
  isOpen,
  onClose,
  sources,
  anchors,
  onSuccess,
  onEditRequest,
}: {
  isOpen: boolean;
  onClose: () => void;
  sources: ExternalAnchorSource[];
  anchors: ExternalAnchor[];
  onSuccess: () => void;
  /** W1-X2: 各 anchor の「教え直す」tap で呼ばれる */
  onEditRequest?: (anchor: ExternalAnchor) => void;
}) {
  const [state, setState] = useState<DeleteState>({ kind: "idle" });

  // Phase 1 C3 (2026-05-20): Home swipe lock register (CEO 補正 #3)
  useEffect(() => {
    if (!isOpen) return;
    return registerHomeSwipeModalOpen();
  }, [isOpen]);

  // source.id → 関連 anchor 配列
  const sourceAnchors = useMemo(() => {
    const map = new Map<string, ExternalAnchor[]>();
    for (const a of anchors) {
      const arr = map.get(a.sourceId) ?? [];
      arr.push(a);
      map.set(a.sourceId, arr);
    }
    // 各 source 内で startTime 順
    for (const arr of map.values()) {
      arr.sort((x, y) => x.startTime.localeCompare(y.startTime));
    }
    return map;
  }, [anchors]);

  function reset() {
    setState({ kind: "idle" });
  }

  function closeAndReset() {
    reset();
    onClose();
  }

  async function performDelete(sourceId: string) {
    setState({ kind: "deleting", sourceId });
    const r = await deleteAnchorSource(sourceId);
    if (!r.ok) {
      setState({ kind: "error", sourceId, message: r.error });
      return;
    }
    reset();
    onSuccess();
  }

  return (
    <GlassModal isOpen={isOpen} onClose={closeAndReset} title="教えた予定" size="md">
      <div className="space-y-3">
        {sources.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            まだ Alter に教えた予定はありません。
          </p>
        ) : (
          <ul className="space-y-2">
            {sources
              .slice()
              .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
              .map((s) => {
                const list = sourceAnchors.get(s.id) ?? [];
                const isConfirming =
                  state.kind === "confirming" && state.sourceId === s.id;
                const isDeleting =
                  state.kind === "deleting" && state.sourceId === s.id;
                const errorMsg =
                  state.kind === "error" && state.sourceId === s.id
                    ? state.message
                    : null;
                return (
                  <li key={s.id}>
                    <GlassCard className="p-3">
                      <header className="flex items-baseline justify-between gap-2">
                        {/*
                         * Phase 3-J-6b: s.notes は displayProposalAwareNotes 経由で表示。
                         * proposal accept 由来 notes の "alter-proposal:..." prefix は
                         * 「提案から追加」 label に変換 (= proposalId 完全 hide)。
                         */}
                        <p className="text-xs font-medium text-slate-500">
                          {SOURCE_TYPE_LABELS[s.sourceType]} ·{" "}
                          {s.capturedAt.slice(0, 10)} に登録
                          {(() => {
                            const notesDisplay = displayProposalAwareNotes(s.notes);
                            return notesDisplay ? ` · ${notesDisplay}` : "";
                          })()}
                        </p>
                        <GlassBadge variant="default" size="sm">
                          {list.length} 件
                        </GlassBadge>
                      </header>

                      {/* Anchor 行 inline list (W1-X2) */}
                      {list.length === 0 ? (
                        <p className="mt-2 text-xs text-slate-400">関連予定なし</p>
                      ) : (
                        <ul className="mt-2 space-y-1">
                          {list.map((a) => (
                            <li
                              key={a.id}
                              className="flex items-baseline justify-between gap-2 rounded-md border border-slate-100 bg-white/60 px-2 py-1"
                              data-testid={`plan-source-anchor-${a.id}`}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-slate-900">
                                  {a.title}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {a.startTime.slice(0, 5)}
                                  {a.endTime ? ` – ${a.endTime.slice(0, 5)}` : ""}
                                  {" / "}
                                  {a.anchorKind === "one_off"
                                    ? a.date
                                    : "毎週" /* 詳細は EditAnchorModal で見せる */}
                                </p>
                              </div>
                              {onEditRequest && (
                                <button
                                  type="button"
                                  onClick={() => onEditRequest(a)}
                                  aria-label={`${a.title} を教え直す`}
                                  data-testid={`plan-source-anchor-edit-${a.id}`}
                                  className="shrink-0 rounded-full border border-indigo-200 px-2 py-1 text-xs font-medium text-indigo-600 transition hover:border-indigo-500 hover:bg-indigo-50"
                                >
                                  教え直す
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}

                      {!isConfirming && !isDeleting && (
                        <div className="mt-3 flex justify-end">
                          <GlassButton
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              setState({ kind: "confirming", sourceId: s.id })
                            }
                          >
                            忘れさせる
                          </GlassButton>
                        </div>
                      )}

                      {isConfirming && (
                        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
                          <p className="text-sm text-rose-900">
                            この source とそれに紐づく{" "}
                            <strong>{list.length} 件</strong> の予定を、
                            Alter から忘れさせますか？
                          </p>
                          <div className="mt-2 flex justify-end gap-2">
                            <GlassButton size="sm" variant="secondary" onClick={reset}>
                              やめる
                            </GlassButton>
                            <GlassButton
                              size="sm"
                              variant="primary"
                              onClick={() => void performDelete(s.id)}
                            >
                              はい、忘れさせる
                            </GlassButton>
                          </div>
                        </div>
                      )}

                      {isDeleting && (
                        <p className="mt-2 text-xs text-slate-500">忘れさせています…</p>
                      )}

                      {errorMsg && (
                        <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
                          {errorMsg}
                        </p>
                      )}
                    </GlassCard>
                  </li>
                );
              })}
          </ul>
        )}

        <div className="flex justify-end pt-2">
          <GlassButton variant="secondary" onClick={closeAndReset}>
            閉じる
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}
