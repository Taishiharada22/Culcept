"use client";

/**
 * Travel Mode の上部レイヤー外枠 (L1-f)
 *
 * 正本: Core UX v1.1 §2 / UI spec §4 Travel 列 / §5 各 S Travel 差分 / §6 モード切替
 *
 * 通常モードと UI 構造を共有。本 component は state picker を受けて
 * 該当する Travel 版 state component を mount する。
 *
 * v1.1 §2.3 / §11.5 整合:
 *   - Travel mode 単独起動の preview ではなく、通常 → Travel 昇格 mock として動作
 *   - 起動条件は明示 signal (手動切替 mock or 複数日外出検出) に限定
 *   - 昇格閾値は §9.3.2 保留論点 (実装 logic は Stage 2 modeReducer L2-h)
 *
 * 実機 logic は Stage 2 modeReducer (L2-h) で実装。本 Phase は preview 視覚化のみ。
 */

import S0Travel from "./travel/S0Travel";
import S1Travel from "./travel/S1Travel";
import S2Travel from "./travel/S2Travel";
import S3Travel from "./travel/S3Travel";
import S4Travel from "./travel/S4Travel";
import S5Travel from "./travel/S5Travel";
import S6Travel from "./travel/S6Travel";
import S7Travel from "./travel/S7Travel";
import S8Travel from "./travel/S8Travel";

export type TravelStateKey =
  | "S0" | "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8";

export default function TravelMode({ state }: { state: TravelStateKey }) {
  switch (state) {
    case "S0": return <S0Travel />;
    case "S1": return <S1Travel />;
    case "S2": return <S2Travel />;
    case "S3": return <S3Travel />;
    case "S4": return <S4Travel />;
    case "S5": return <S5Travel />;
    case "S6": return <S6Travel />;
    case "S7": return <S7Travel />;
    case "S8": return <S8Travel />;
  }
}
