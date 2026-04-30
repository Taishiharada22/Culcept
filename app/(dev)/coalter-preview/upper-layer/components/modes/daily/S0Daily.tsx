"use client";

/**
 * S0 Daily Mode (UI spec §4.3.1 Daily 列、= 通常)
 * v1.1 §2.3: Daily 単独起動ではなく、通常 → Daily 昇格 mock の形。
 */

import S0Observing from "../../states/S0Observing";

export default function S0Daily() {
  return <S0Observing modeLabel="Daily" />;
}
