"use client";

/**
 * S0 Travel Mode (UI spec §4.3.1 Travel 列、= 通常)
 */

import S0Observing from "../../states/S0Observing";

export default function S0Travel() {
  return <S0Observing modeLabel="Travel" />;
}
