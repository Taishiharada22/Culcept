"use client";

/**
 * SourceListModal — 「教えた予定」一覧 + 「忘れさせる」削除 (W1-X1)
 *
 * 設計書: docs/alter-plan-w1x1-mini-design.md §3
 *
 * 機能:
 *   - 既存 source 一覧 + 関連 anchor 数 / sourceType を表示
 *   - 「忘れさせる」→ 2 段確認（件数提示）→ DELETE → onSuccess callback
 *   - deleting / error state を内蔵
 *
 * 範囲外:
 *   - 個別 anchor の削除（source 単位のみ）
 *   - 編集 UI
 */

import { useMemo, useState } from "react";

import {
  GlassBadge,
  GlassButton,
  GlassCard,
  GlassModal,
} from "@/components/ui/glassmorphism-design";
import { deleteAnchorSource } from "@/lib/plan/anchor-fetch";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { ExternalAnchorSource } from "@/lib/plan/external-anchor-source";

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
}: {
  isOpen: boolean;
  onClose: () => void;
  sources: ExternalAnchorSource[];
  anchors: ExternalAnchor[];
  onSuccess: () => void;
}) {
  const [state, setState] = useState<DeleteState>({ kind: "idle" });

  // source.id → 関連 anchor 数 / 代表 title
  const sourceMeta = useMemo(() => {
    const map = new Map<
      string,
      { count: number; titles: string[] }
    >();
    for (const a of anchors) {
      const m = map.get(a.sourceId);
      if (m) {
        m.count += 1;
        if (m.titles.length < 3 && !m.titles.includes(a.title)) m.titles.push(a.title);
      } else {
        map.set(a.sourceId, { count: 1, titles: [a.title] });
      }
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
                const meta = sourceMeta.get(s.id) ?? { count: 0, titles: [] };
                const isConfirming =
                  state.kind === "confirming" && state.sourceId === s.id;
                const isDeleting = state.kind === "deleting" && state.sourceId === s.id;
                const errorMsg =
                  state.kind === "error" && state.sourceId === s.id ? state.message : null;
                const titleText =
                  meta.titles.length === 0
                    ? "(関連予定なし)"
                    : meta.titles.join(" / ") +
                      (meta.count > meta.titles.length ? ` 他${meta.count - meta.titles.length} 件` : "");
                return (
                  <li key={s.id}>
                    <GlassCard className="p-3">
                      <header className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium text-slate-900">
                          {titleText}
                        </p>
                        <GlassBadge variant="default" size="sm">
                          {meta.count} 件
                        </GlassBadge>
                      </header>
                      <p className="mt-1 text-xs text-slate-500">
                        {SOURCE_TYPE_LABELS[s.sourceType]} ·{" "}
                        {s.capturedAt.slice(0, 10)} に登録
                        {s.notes && ` · ${s.notes}`}
                      </p>

                      {!isConfirming && !isDeleting && (
                        <div className="mt-2 flex justify-end">
                          <GlassButton
                            size="sm"
                            variant="secondary"
                            onClick={() => setState({ kind: "confirming", sourceId: s.id })}
                          >
                            忘れさせる
                          </GlassButton>
                        </div>
                      )}

                      {isConfirming && (
                        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
                          <p className="text-sm text-rose-900">
                            この予定とそれに紐づく <strong>{meta.count} 件</strong> の予定を、
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
