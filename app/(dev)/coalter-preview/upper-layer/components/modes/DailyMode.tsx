"use client";

/**
 * Daily Mode の上部レイヤー外枠 (L1-e)
 *
 * 正本: Core UX v1.1 §2 / UI spec §4 Daily 列 / §6 モード切替
 *
 * 通常モードと UI 構造を共有。本 component は state picker を受けて
 * 該当する Daily 版 state component を mount する。
 *
 * v1.1 §2.3 / §11.5 整合:
 *   - Daily mode 単独起動の preview ではなく、通常 → Daily 昇格 mock として動作
 *   - 起動条件は明示 signal (手動切替 mock or 状態優先昇格 mock) に限定
 *
 * 実機 logic は Stage 2 modeReducer (L2-h) で実装。本 Phase は preview 視覚化のみ。
 */

import S0Daily from "./daily/S0Daily";
import S1Daily from "./daily/S1Daily";
import S2Daily from "./daily/S2Daily";
import S3Daily from "./daily/S3Daily";
import S4Daily from "./daily/S4Daily";
import S5Daily from "./daily/S5Daily";
import S6Daily from "./daily/S6Daily";
import S7Daily from "./daily/S7Daily";
import S8Daily from "./daily/S8Daily";

export type DailyStateKey =
  | "S0" | "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8";

export default function DailyMode({ state }: { state: DailyStateKey }) {
  switch (state) {
    case "S0": return <S0Daily />;
    case "S1": return <S1Daily />;
    case "S2": return <S2Daily />;
    case "S3": return <S3Daily />;
    case "S4": return <S4Daily />;
    case "S5": return <S5Daily />;
    case "S6": return <S6Daily />;
    case "S7": return <S7Daily />;
    case "S8": return <S8Daily />;
  }
}
