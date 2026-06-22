"use client";

/**
 * app/(culcept)/plan/components/PlaceFitArcReadout.tsx
 *   — 評価OS / Stage 1-B: place 単位で Stage 0 観測を読み、FitArcReadout に渡す connected wrapper（dormant）
 *
 * ★flag OFF / production → null（DOM 不変）。★localStorage shadow の観測だけを読む（DB/API なし）。
 * ★placeKey は placeDescriptor を hash 化したもので照合（生 GPS/住所/場所名原文は使わない・保存しない）。
 * ★PostVisitCheckCard が保存したら refreshSignal を bump して再読込（答え合わせ → アークの連動）。
 * ★ranking/推薦に一切影響しない（表示専用）。
 */
import * as React from "react";
import { FitArcReadout } from "./FitArcReadout";
import { isFitArcReadoutEnabled } from "@/lib/plan/postVisit/fitArcReadout";
import { loadPostVisitObservations } from "@/lib/plan/postVisit/postVisitStore";
import { opaquePlaceKey } from "@/lib/plan/candidateLens/candidateLensPreferenceStore";
import type { PostVisitObservation } from "@/lib/plan/postVisit/postVisitObservation";

export interface PlaceFitArcReadoutProps {
  /** 場所の記述子（PostVisitCheckCard と同一文字列＝同一 placeKey で照合）。内部で hash 化。 */
  readonly placeDescriptor: string;
  /** PostVisitCheckCard 保存時に bump → 再読込（答え合わせ後に readout 更新）。 */
  readonly refreshSignal?: number;
  readonly size?: number;
  /** ヘッダ表示（③比較ではセクション側で枠組みを出すため false にできる・default true）。 */
  readonly showHeader?: boolean;
}

export function PlaceFitArcReadout({ placeDescriptor, refreshSignal = 0, size = 88, showHeader = true }: PlaceFitArcReadoutProps) {
  const [observations, setObservations] = React.useState<PostVisitObservation[]>([]);

  // client-only に読む（SSR は []＝flag ON でも初期は insufficient と一致＝hydration mismatch なし）
  React.useEffect(() => {
    if (!isFitArcReadoutEnabled()) return;
    const placeKey = opaquePlaceKey(placeDescriptor) ?? "p_unknown";
    setObservations(loadPostVisitObservations().filter((o) => o.placeKey === placeKey));
  }, [placeDescriptor, refreshSignal]);

  if (!isFitArcReadoutEnabled()) return null; // ★flag OFF / production → DOM 不変
  return <FitArcReadout observations={observations} size={size} showHeader={showHeader} />;
}
