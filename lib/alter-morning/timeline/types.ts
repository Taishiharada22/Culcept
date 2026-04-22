/**
 * TimelineSegment / TimelineRenderData — PR-14 Timeline UI 型予約
 *
 * 位置づけ:
 *   1 日の流れを 1 画面で可視化する Timeline UI の入力型。
 *   PR-13 Map と連動（双方向ハイライト）。commit 13 では型定義のみ。
 *
 * 設計書:
 *   - docs/alter-morning-pr10-14-interface-reservation.md §5
 *
 * 依存:
 *   - endTime は PR-12 end-time staircase が必須化する
 *   - transportBadges は PR-10 TransportMode + 所要時間を参照する
 *
 * 凍結規則:
 *   - 本 file に関数・class を追加してはいけない（PR-14 本体で追加）
 *   - 型定義のみ
 */

import type { TransportMode } from "../transport/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TimelineSegment
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type TimelineSegmentKind = "event" | "travel" | "gap";

export interface TimelineSegmentVisualStyle {
  color: string;
  /** confirmationState で変化（confirmed=1.0 / provisional=0.6 / needs_answer=0.4 想定） */
  opacity: number;
}

export interface TimelineSegment {
  kind: TimelineSegmentKind;
  /** kind="event" | "travel" のときのみ non-null、"gap" では null */
  eventId: string | null;
  /** HH:mm */
  startTime: string;
  /** HH:mm（PR-12 で必須化） */
  endTime: string;
  durationMin: number;
  label: string;
  visualStyle: TimelineSegmentVisualStyle;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TimelineRenderData
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface TimelineTransportBadge {
  fromSegmentIndex: number;
  toSegmentIndex: number;
  mode: TransportMode;
  durationMin: number;
}

export interface TimelineRenderData {
  segments: TimelineSegment[];
  /** 1 日の開始 / 終了時刻（描画範囲） */
  dayWindow: { start: string; end: string };
  /** event 間の連結線 UI（PR-10 transport + PR-9 coordinates 両方必要） */
  transportBadges: TimelineTransportBadge[];
}
