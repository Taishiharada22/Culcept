"use client";

import type { CurrentPosition, DraftChapter, ExplorationStep, MemoryChapter } from "./types";
import type { OriginSessionStatus } from "./persistence";

function extractError(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof (payload as { error?: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }
  return fallback;
}

export async function persistOriginSessionState(input: {
  sessionId?: string | null;
  status?: OriginSessionStatus;
  currentStep?: ExplorationStep | null;
  draft?: DraftChapter | null;
  currentPosition?: CurrentPosition | null;
}): Promise<{ sessionId: string | null; status: OriginSessionStatus | null }> {
  const response = await fetch("/api/origin/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(extractError(data, `HTTP ${response.status}`));
  }

  return {
    sessionId:
      data && typeof data === "object" && "sessionId" in data && typeof data.sessionId === "string"
        ? data.sessionId
        : null,
    status:
      data &&
      typeof data === "object" &&
      "status" in data &&
      typeof data.status === "string"
        ? (data.status as OriginSessionStatus)
        : null,
  };
}

export async function completeOriginChapter(input: {
  sessionId?: string | null;
  chapter: MemoryChapter;
  currentPosition?: CurrentPosition | null;
}): Promise<{ sessionId: string; recordId: string }> {
  const response = await fetch("/api/origin/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(extractError(data, `HTTP ${response.status}`));
  }

  if (
    !data ||
    typeof data !== "object" ||
    typeof data.sessionId !== "string" ||
    typeof data.recordId !== "string"
  ) {
    throw new Error("Invalid completion response");
  }

  return {
    sessionId: data.sessionId,
    recordId: data.recordId,
  };
}
