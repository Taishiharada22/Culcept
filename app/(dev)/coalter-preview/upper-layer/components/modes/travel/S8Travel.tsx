"use client";

/**
 * S8 Travel Mode (UI spec §4.3.9 Travel 列、= 通常)
 */

import S8Cooldown from "../../states/S8Cooldown";

export default function S8Travel() {
  return <S8Cooldown modeLabel="Travel" />;
}
