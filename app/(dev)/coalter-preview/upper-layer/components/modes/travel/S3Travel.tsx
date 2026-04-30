"use client";

/**
 * S3 Travel Mode (UI spec §4.3.4 Travel 列、= 通常)
 */

import S3Awaiting from "../../states/S3Awaiting";

export default function S3Travel() {
  return <S3Awaiting modeLabel="Travel" />;
}
