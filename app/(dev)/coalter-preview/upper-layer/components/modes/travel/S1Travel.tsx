"use client";

/**
 * S1 Travel Mode (UI spec §4.3.2 Travel 列、= 通常)
 */

import S1Approaching from "../../states/S1Approaching";

export default function S1Travel() {
  return <S1Approaching modeLabel="Travel" />;
}
