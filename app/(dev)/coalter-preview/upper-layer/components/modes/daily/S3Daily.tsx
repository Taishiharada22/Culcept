"use client";

/**
 * S3 Daily Mode (UI spec §4.3.4 Daily 列、= 通常)
 */

import S3Awaiting from "../../states/S3Awaiting";

export default function S3Daily() {
  return <S3Awaiting modeLabel="Daily" />;
}
