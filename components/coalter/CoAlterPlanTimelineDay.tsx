"use client";

/**
 * CoAlter Plan Timeline Day — 同一日の時系列旅程ビュー
 *
 * Phase 1.5.3（Claude 旅行プラン機能取り込み ①）
 *
 * 「2人のプランをカレンダーに流れとして乗せる」の視覚表現。
 * 同じ日の複数アイテムを、時刻昇順で縦型タイムラインとして描画する。
 *
 * 仕様:
 *  - 受け取るのは「同一日の時刻順ソート済み」アイテム（呼び出し側で sortByTimeSlot 済）
 *  - 左列: 時刻マーカー（時刻なしは "—"）
 *  - 中央: 連結線と採用者ドット
 *  - 右列: タイトル + 補足。タップで親の onOpenItem
 *  - アイテム間にギャップラベル（解釈可能なときのみ）
 *  - 2件未満のときも動くが、呼び出し側で timeline にする判定が入る想定（1件だけでは意味薄）
 */

import type { PlanItem } from "@/lib/coalter/planShelf";
import {
  parseTimeSlotMinutes,
  formatGapLabel,
  computeGapHours,
} from "@/lib/coalter/planTimeline";
import { computeRealityWarnings } from "@/lib/coalter/realityCheck";

const C = {
  coalter: "#6366F1",
  pulse: "#EC4899",
  warn: "#F59E0B",
  s1: "#ffffff",
  s2: "#f5f6fa",
  t1: "#1a1a2e",
  t2: "#4a4a68",
  t3: "#8888a0",
  t4: "#c8c8dc",
};

interface Props {
  /** 同一日の時刻昇順ソート済みアイテム */
  items: PlanItem[];
  /** 採用者マーカー（自分=coalter/相手=pulse）用 */
  currentUserId: string | null;
  /** タップで詳細シートを開く */
  onOpenItem: (item: PlanItem) => void;
}

/** 時刻マーカー表示: "19:30" → "19:30", "夜" → "夜", 時刻不明 → "—" */
function renderTimeMarker(timeSlot: string | null): string {
  if (!timeSlot) return "—";
  const trimmed = timeSlot.trim();
  if (!trimmed) return "—";
  // 数値が読めるなら数値優先、そうでなければ元文字列そのまま
  const minutes = parseTimeSlotMinutes(trimmed);
  if (minutes !== null && /\d/.test(trimmed)) {
    // "19:30" 形式なら維持、"19時" 形式も元のまま
    return trimmed.length <= 6 ? trimmed : trimmed.slice(0, 6);
  }
  return trimmed.length <= 4 ? trimmed : trimmed.slice(0, 4);
}

export function CoAlterPlanTimelineDay({
  items,
  currentUserId,
  onOpenItem,
}: Props) {
  if (items.length === 0) return null;

  // 現実性チェック（③）— この日のアイテムに対する警告を事前計算
  const warnings = computeRealityWarnings(items);
  // packed_day 警告は日全体に付くので最上部に1つだけ出す
  const packedWarning = warnings.find((w) => w.kind === "packed_day");

  return (
    <div className="relative">
      {packedWarning && (
        <div
          className="mb-1.5 rounded-lg px-2.5 py-1.5 flex items-center gap-2"
          style={{
            background: `${C.warn}12`,
            border: `1px solid ${C.warn}30`,
          }}
        >
          <span style={{ fontSize: 11 }} aria-hidden>
            ⚠
          </span>
          <span style={{ fontSize: 10, color: C.warn, fontWeight: 500 }}>
            {packedWarning.message}
          </span>
        </div>
      )}
      {items.map((item, idx) => {
        const isMine = currentUserId && item.createdBy === currentUserId;
        const markerColor = isMine ? C.coalter : C.pulse;
        const marker = renderTimeMarker(item.timeSlot);
        const isLast = idx === items.length - 1;
        // 次アイテムとのギャップ
        const next = items[idx + 1];
        const gapHours = next ? computeGapHours(item, next) : null;
        const gapLabel = formatGapLabel(gapHours);
        // tight_gap 警告（自分と次のアイテムを繋ぐエッジに紐付くもの）
        const tightGapWarning =
          next &&
          warnings.find(
            (w) =>
              w.kind === "tight_gap" &&
              w.affectedItemIds.includes(item.id) &&
              w.affectedItemIds.includes(next.id),
          );

        return (
          <div key={item.id}>
            <button
              onClick={() => onOpenItem(item)}
              className="w-full text-left flex items-stretch gap-3 py-1.5"
              aria-label={`${item.title} の詳細を開く`}
            >
              {/* ── 左: 時刻 ── */}
              <div
                className="shrink-0 flex items-start justify-end pt-1"
                style={{ width: 44 }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: C.t3,
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: 500,
                  }}
                >
                  {marker}
                </span>
              </div>

              {/* ── 中央: 連結線 + ドット ── */}
              <div className="shrink-0 relative" style={{ width: 12 }}>
                {/* 上線（最初のアイテムは短く） */}
                {idx > 0 && (
                  <div
                    className="absolute left-1/2 -translate-x-1/2"
                    style={{
                      top: 0,
                      height: 6,
                      width: 1,
                      background: `${C.coalter}30`,
                    }}
                  />
                )}
                {/* ドット */}
                <div
                  className="absolute left-1/2 -translate-x-1/2 rounded-full"
                  style={{
                    top: 6,
                    width: 8,
                    height: 8,
                    background: markerColor,
                    boxShadow: `0 0 0 2px ${markerColor}22`,
                  }}
                  aria-hidden
                />
                {/* 下線（最後以外） */}
                {!isLast && (
                  <div
                    className="absolute left-1/2 -translate-x-1/2"
                    style={{
                      top: 16,
                      bottom: 0,
                      width: 1,
                      background: `${C.coalter}30`,
                    }}
                  />
                )}
              </div>

              {/* ── 右: 内容 ── */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    style={{
                      fontSize: 12,
                      color: C.t1,
                      fontWeight: 500,
                      lineHeight: 1.3,
                    }}
                    className="truncate"
                  >
                    {item.title}
                  </span>
                  <span
                    style={{
                      fontSize: 8,
                      color: markerColor,
                      fontWeight: 500,
                    }}
                  >
                    {isMine ? "あなた" : "相手"}
                  </span>
                </div>
                {item.practicalInfo && (
                  <p
                    className="truncate"
                    style={{ fontSize: 10, color: C.t3, marginTop: 1 }}
                  >
                    {item.practicalInfo}
                  </p>
                )}
              </div>
            </button>

            {/* ── アイテム間ギャップラベル + tight_gap 警告 ── */}
            {!isLast && (gapLabel || tightGapWarning) && (
              <div className="flex items-start gap-3 py-0.5">
                <div className="shrink-0" style={{ width: 44 }} />
                <div
                  className="shrink-0 flex items-center justify-center"
                  style={{ width: 12 }}
                  aria-hidden
                >
                  <div
                    style={{
                      width: 1,
                      height: tightGapWarning ? 24 : 16,
                      background: tightGapWarning
                        ? `${C.warn}50`
                        : `${C.coalter}30`,
                    }}
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  {gapLabel && (
                    <span
                      style={{
                        fontSize: 9,
                        color: tightGapWarning ? C.warn : C.t4,
                        fontStyle: "italic",
                      }}
                    >
                      · {gapLabel}の間
                    </span>
                  )}
                  {tightGapWarning && (
                    <span
                      style={{
                        fontSize: 9,
                        color: C.warn,
                        fontWeight: 500,
                      }}
                    >
                      ⚠ {tightGapWarning.message}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
